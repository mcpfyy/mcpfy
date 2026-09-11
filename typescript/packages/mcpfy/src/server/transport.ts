import type { McpServer as OfficialMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { withMcpfyTelemetry, type MinimalTransport } from "mcpfy-pulse";
import { checkAuth } from "./auth/middleware.js";
import { buildProtectedResourceMetadata } from "./auth/well-known.js";
import type { AuthConfig } from "./auth/types.js";
import { setRequestAuth, setRequestHeaders, extractForwardableAuthHeaders } from "./context.js";

/**
 * The entire telemetry integration for mcpfy-sdk users: set MCPFY_API_KEY and nothing
 * else — no import, no function call. `MCPFY_GATEWAY` is set by MCP-backend itself when
 * it runs a server through its own gateway, which already logs via McpGatewayLogger;
 * skip wrapping there to avoid double-counting. See telemetry-master-plan.md §1.
 */
function maybeWrapWithTelemetry<T extends MinimalTransport>(transport: T): T {
  if (process.env.MCPFY_GATEWAY) return transport;
  if (!process.env.MCPFY_API_KEY) return transport;
  return withMcpfyTelemetry(transport, {
    apiKey: process.env.MCPFY_API_KEY,
    endpoint: process.env.MCPFY_TELEMETRY_ENDPOINT,
    sdkName: "mcpfy-sdk",
    installMode: "sdk-env",
  });
}

export const DEFAULT_MCP_PATH = "/mcp";

/**
 * HTTP pathname the Streamable HTTP endpoint is served at.
 * Empty/`undefined` → `/mcp`. Always starts with `/` and has no trailing slash (except `/`).
 */
export function normalizeMcpPath(path?: string): string {
  if (!path || path.trim() === "") return DEFAULT_MCP_PATH;
  const trimmed = path.trim();
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (withSlash === "/") return "/";
  return withSlash.replace(/\/+$/, "") || DEFAULT_MCP_PATH;
}

function requestPathname(url: string | undefined): string {
  if (!url) return "/";
  try {
    return new URL(url, "http://localhost").pathname;
  } catch {
    return url.split("?")[0] || "/";
  }
}

export interface HttpHandle {
  /** Bound TCP port (resolved after listen — useful when you passed `port: 0`). */
  port: number;
  /** Host the server is listening on. */
  host: string;
  /** Local MCP endpoint, e.g. `http://localhost:3000/mcp`. */
  url: string;
  close(): Promise<void>;
}

export async function startStdio(nativeServer: OfficialMcpServer): Promise<void> {
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const transport = new StdioServerTransport();
  await nativeServer.connect(maybeWrapWithTelemetry(transport));
}

function formatListenUrl(host: string, port: number, mcpPath: string): string {
  const displayHost = host === "0.0.0.0" || host === "::" ? "localhost" : host;
  const needsBrackets = displayHost.includes(":") && !displayHost.startsWith("[");
  const hostPart = needsBrackets ? `[${displayHost}]` : displayHost;
  return `http://${hostPart}:${port}${mcpPath}`;
}

function protectedResourceMetadataPath(mcpPath: string): string {
  return mcpPath === "/" ? "/.well-known/oauth-protected-resource" : `/.well-known/oauth-protected-resource${mcpPath}`;
}

function protectedResourceMetadataUrl(
  auth: Extract<AuthConfig, { type: "oauth" }>
): string {
  const resource = new URL(auth.resource);
  return `${resource.origin}${protectedResourceMetadataPath(resource.pathname)}`;
}

function validateOAuthResource(resource: string): void {
  let url: URL;
  try {
    url = new URL(resource);
  } catch {
    throw new Error("OAuth resource must be an absolute URL");
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("OAuth resource must use HTTPS (HTTP is allowed only for loopback development)");
  }
  if (url.username || url.password || url.hash) {
    throw new Error("OAuth resource must not contain credentials or a fragment");
  }
}

function writeAuthFailure(
  res: ServerResponse,
  auth: AuthConfig,
  result: Extract<Awaited<ReturnType<typeof checkAuth>>, { ok: false }>
): void {
  const status = result.reason === "insufficient_scope" ? 403 : 401;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth.type === "oauth") {
    const params = [
      `resource_metadata="${protectedResourceMetadataUrl(auth)}"`,
      `error="${result.reason === "insufficient_scope" ? "insufficient_scope" : "invalid_token"}"`,
    ];
    if (result.requiredScopes?.length) params.push(`scope="${result.requiredScopes.join(" ")}"`);
    headers["www-authenticate"] = `Bearer ${params.join(", ")}`;
  }
  res
    .writeHead(status, headers)
    .end(JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: status === 403 ? -32003 : -32001,
        message: status === 403 ? "Insufficient scope" : "Unauthorized",
      },
      id: null,
    }));
}

function writeInternalError(res: ServerResponse): void {
  if (res.headersSent) return;
  res.writeHead(500, { "content-type": "application/json" }).end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32603, message: "Internal server error" },
      id: null,
    })
  );
}

export async function startHttp(
  nativeServer: OfficialMcpServer,
  options: { port: number; host: string; auth?: AuthConfig; silent?: boolean; mcpPath?: string }
): Promise<HttpHandle> {
  const { StreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
  const http = await import("node:http");
  const mcpPath = normalizeMcpPath(options.mcpPath);
  if (options.auth?.type === "oauth") validateOAuthResource(options.auth.resource);
  const metadataPaths = new Set([
    "/.well-known/oauth-protected-resource",
    ...(options.auth?.type === "oauth"
      ? [protectedResourceMetadataPath(new URL(options.auth.resource).pathname)]
      : []),
  ]);

  // Stateless mode: the SDK requires a *fresh* transport per POST (a stateless
  // transport throws if reused — "Stateless transport cannot be reused across
  // requests"), and the underlying McpServer can only be bound to one transport
  // at a time. So POSTs are serialized through a queue: each one gets its own
  // transport, connected to the single shared `nativeServer` in turn. This trades
  // away concurrent HTTP throughput for the "one nativeServer, no per-session
  // replay" simplicity — mcpfy's per-session McpServer-replay pattern is the
  // reference to revisit if concurrent HTTP load ever becomes a real requirement.
  //
  // GET requests (the optional standalone SSE stream for server-initiated push,
  // which this minimal SDK doesn't support) are answered with 405 immediately,
  // outside the queue — per spec, clients treat 405 there as "not supported" and
  // carry on, but leaving one open would otherwise block every request behind it.
  let queue: Promise<void> = Promise.resolve();
  async function handlePost(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await readJsonBody(req);
      if (nativeServer.isConnected()) {
        await nativeServer.close();
      }
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      // Wrap only the reference handed to connect() — telemetry hooks onto transport.onmessage/send
      // either way, but handleRequest below must stay on the real instance (it's the only one with
      // handleRequest itself; the wrapper only implements the common Transport seam).
      await nativeServer.connect(maybeWrapWithTelemetry(transport));
      await transport.handleRequest(req, res, body);
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" }).end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32603, message: err instanceof Error ? err.message : "Internal error" },
            id: null,
          })
        );
      }
    }
  }

  const httpServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
    const pathname = requestPathname(req.url);
    if (options.auth?.type === "oauth" && req.method === "GET" && metadataPaths.has(pathname)) {
      res
        .writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "no-store" })
        .end(JSON.stringify(buildProtectedResourceMetadata(options.auth)));
      return;
    }

    if (pathname !== mcpPath) {
      res.writeHead(404).end();
      return;
    }
    if (req.method === "GET" || req.method === "DELETE") {
      res.writeHead(405, { "content-type": "application/json" }).end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Method not allowed: this server does not support server-initiated streams." },
          id: null,
        })
      );
      return;
    }

    if (options.auth) {
      const auth = options.auth;
      queue = queue.catch(() => undefined).then(async () => {
        try {
          const result = await checkAuth(
            req,
            auth,
            auth.type === "oauth"
              ? {
                resource: auth.resource,
                  requiredScopes: auth.requiredScopes ?? [],
                }
              : undefined
          );
          if (!result.ok) {
            writeAuthFailure(res, auth, result);
            return;
          }
          setRequestAuth(nativeServer, result.auth);
          setRequestHeaders(nativeServer, extractForwardableAuthHeaders(req));
          try {
            await handlePost(req, res);
          } finally {
            setRequestAuth(nativeServer, undefined);
            setRequestHeaders(nativeServer, undefined);
          }
        } catch {
          writeInternalError(res);
        }
      });
      return;
    }

    queue = queue.then(async () => {
      setRequestHeaders(nativeServer, extractForwardableAuthHeaders(req));
      try {
        await handlePost(req, res);
      } finally {
        setRequestHeaders(nativeServer, undefined);
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(options.port, options.host, () => resolve());
  });

  const address = httpServer.address() as AddressInfo | null;
  const boundPort = address?.port ?? options.port;
  const url = formatListenUrl(options.host, boundPort, mcpPath);

  if (!options.silent) {
    // eslint-disable-next-line no-console
    console.log(`MCP server listening on ${url}  (port ${boundPort})`);
  }

  return {
    port: boundPort,
    host: options.host,
    url,
    close: () => new Promise<void>((resolve) => httpServer.close(() => resolve())),
  };
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      if (!raw) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}
