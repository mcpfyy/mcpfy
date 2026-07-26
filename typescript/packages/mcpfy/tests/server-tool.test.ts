import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";
import { MCPServer } from "../src/server/mcp-server.js";
import { object, text } from "../src/shared/response-helpers.js";

async function connectedPair(server: MCPServer) {
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.1.0" }, { capabilities: {} });
  await Promise.all([server.nativeServer.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("MCPServer tools", () => {
  it("registers a tool, lists it, and round-trips content + structuredContent", async () => {
    const server = new MCPServer({ name: "test-server", version: "1.0.0" });
    server.tool(
      {
        name: "add",
        description: "Add two numbers",
        schema: z.object({ a: z.number(), b: z.number() }),
        outputSchema: z.object({ sum: z.number() }),
      },
      async ({ a, b }) => object({ sum: a + b })
    );

    const client = await connectedPair(server);

    const { tools } = await client.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("add");
    expect(tools[0].inputSchema.type).toBe("object");

    const result = await client.callTool({ name: "add", arguments: { a: 2, b: 3 } });
    expect(result.structuredContent).toEqual({ sum: 5 });
    expect(result.content).toEqual([{ type: "text", text: JSON.stringify({ sum: 5 }, null, 2) }]);
  });

  it("supports a schema-less tool called with no arguments", async () => {
    const server = new MCPServer({ name: "test-server", version: "1.0.0" });
    server.tool({ name: "hello", description: "Say hello" }, async () => text("Hello World!"));

    const client = await connectedPair(server);
    const result = await client.callTool({ name: "hello", arguments: {} });
    expect(result.content).toEqual([{ type: "text", text: "Hello World!" }]);
  });

  it("gives the tool callback a working ToolContext.log()", async () => {
    const server = new MCPServer({ name: "test-server", version: "1.0.0" });
    let logged = false;
    server.tool({ name: "logger", schema: z.object({}) }, async (_params, ctx) => {
      await ctx.log("info", "hello from tool");
      logged = true;
      return text("ok");
    });

    const client = await connectedPair(server);
    await client.callTool({ name: "logger", arguments: {} });
    expect(logged).toBe(true);
  });
});
