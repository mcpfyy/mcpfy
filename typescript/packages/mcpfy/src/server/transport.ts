import type { McpServer as OfficialMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IncomingMessage, ServerResponse } from "node:http";

export interface HttpHandle {
  close(): Promise<void>;
}

export async function startStdio(nativeServer: OfficialMcpServer): Promise<void> {
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const transport = new StdioServerTransport();
  await nativeServer.connect(transport);
}

export async function startHttp(
  nativeServer: OfficialMcpServer,
  options: { port: number; host: string }
): Promise<HttpHandle> {
  const { StreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
  const http = await import("node:http");

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
      await nativeServer.connect(transport);
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
    if (req.url !== "/mcp") {
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
    queue = queue.then(() => handlePost(req, res));
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(options.port, options.host, () => resolve());
  });

  return {
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
