import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { MCPServer } from "../src/server/mcp-server.js";
import { MCPClient } from "../src/client/mcp-client.js";
import { markdown, object } from "../src/shared/response-helpers.js";

describe("http transport end-to-end", () => {
  let server: MCPServer | undefined;
  let client: MCPClient | undefined;

  afterEach(async () => {
    await client?.closeAllSessions();
    await server?.close();
    server = undefined;
    client = undefined;
  });

  it("serves tools/resources over a real HTTP server", async () => {
    server = new MCPServer({ name: "http-fixture", version: "1.0.0" });
    server.tool(
      { name: "add", schema: z.object({ a: z.number(), b: z.number() }), outputSchema: z.object({ sum: z.number() }) },
      async ({ a, b }) => object({ sum: a + b })
    );
    server.resource({ name: "greeting", uri: "app://greeting" }, async () => markdown("# Hello from mcpfy!"));

    const info = await server.listen({ transport: "http", port: 0, silent: true });
    expect(info.url).toMatch(/^http:\/\/localhost:\d+\/mcp$/);
    expect(info.port).toBeGreaterThan(0);

    client = new MCPClient({ mcpServers: { fixture: { url: info.url! } } });
    const session = await client.createSession("fixture");

    const tools = await session.listTools();
    expect(tools.map((t) => t.name)).toEqual(["add"]);

    const toolResult = await session.callTool("add", { a: 10, b: 5 });
    expect(toolResult.structuredContent).toEqual({ sum: 15 });

    const resourceResult = await session.readResource("app://greeting");
    expect(resourceResult.contents[0]).toEqual({
      uri: "app://greeting",
      mimeType: "text/markdown",
      text: "# Hello from mcpfy!",
    });
  });

  it("serves MCP at a custom basePath and advertises icon", async () => {
    server = new MCPServer({
      name: "http-fixture",
      version: "1.0.0",
      basePath: "/weather",
      icon: "https://example.com/icon.png",
    });
    server.tool(
      { name: "add", schema: z.object({ a: z.number(), b: z.number() }), outputSchema: z.object({ sum: z.number() }) },
      async ({ a, b }) => object({ sum: a + b })
    );

    expect(server.config.icon).toBe("https://example.com/icon.png");

    const info = await server.listen({ transport: "http", port: 0, silent: true });
    expect(info.url).toMatch(/^http:\/\/localhost:\d+\/weather$/);

    const missed = await fetch(`http://localhost:${info.port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    });
    expect(missed.status).toBe(404);

    client = new MCPClient({ mcpServers: { fixture: { url: info.url! } } });
    const session = await client.createSession("fixture");
    const tools = await session.listTools();
    expect(tools.map((t) => t.name)).toEqual(["add"]);
  });
});
