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

function deriveBaseUrl(req: IncomingMessage, options: { port: number; host: string }): string {
  const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0] ?? "http";
  const host = req.headers.host ?? `${options.host}:${options.port}`;
  return `${proto}://${host}`;
}

function writeUnauthorized(res: ServerResponse, auth: AuthConfig, req: IncomingMessage, options: { port: number; host: string }): void {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth.type === "oauth") {
    const baseUrl = deriveBaseUrl(req, options);
    headers["www-authenticate"] = `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`;
  }
  res
    .writeHead(401, headers)
    .end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null }));
}

export async function startHttp(
  nativeServer: OfficialMcpServer,
  options: { port: number; host: string; auth?: AuthConfig; silent?: boolean; mcpPath?: string }
): Promise<HttpHandle> {
  const { StreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
  const http = await import("node:http");
  const mcpPath = normalizeMcpPath(options.mcpPath);

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
  // Mutated after listen() so request handlers see the real bound port (e.g. port 0).
  const listenState = { port: options.port, host: options.host };

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
    if (options.auth?.type === "oauth" && req.method === "GET" && req.url === "/.well-known/oauth-protected-resource") {
      const baseUrl = deriveBaseUrl(req, listenState);
      res
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify(buildProtectedResourceMetadata(options.auth, baseUrl, mcpPath)));
      return;
    }

    if (requestPathname(req.url) !== mcpPath) {
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
      queue = queue.then(async () => {
        const result = await checkAuth(req, auth);
        if (!result.ok) {
          writeUnauthorized(res, auth, req, listenState);
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
  listenState.port = boundPort;
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
