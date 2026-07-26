import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";
import { MCPServer } from "../src/server/mcp-server.js";
import { text } from "../src/shared/response-helpers.js";

async function connectedPair(server: MCPServer) {
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.1.0" }, { capabilities: {} });
  await Promise.all([server.nativeServer.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("MCPServer prompts", () => {
  it("converts a text() response into a GetPromptResult", async () => {
    const server = new MCPServer({ name: "test-server", version: "1.0.0" });
    server.prompt(
      { name: "greet", description: "Greet someone", schema: z.object({ name: z.string() }) },
      async ({ name }) => text(`Hello, ${name}!`)
    );

    const client = await connectedPair(server);

    const { prompts } = await client.listPrompts();
    expect(prompts).toHaveLength(1);
    expect(prompts[0].name).toBe("greet");
    expect(prompts[0].arguments).toEqual([{ name: "name", required: true }]);

    const result = await client.getPrompt({ name: "greet", arguments: { name: "World" } });
    expect(result.messages).toEqual([{ role: "user", content: { type: "text", text: "Hello, World!" } }]);
  });

  it("passes through a raw GetPromptResult unchanged", async () => {
    const server = new MCPServer({ name: "test-server", version: "1.0.0" });
    server.prompt({ name: "raw", schema: z.object({}) }, async () => ({
      messages: [{ role: "assistant", content: { type: "text", text: "raw message" } }],
    }));

    const client = await connectedPair(server);
    const result = await client.getPrompt({ name: "raw", arguments: {} });
    expect(result.messages).toEqual([{ role: "assistant", content: { type: "text", text: "raw message" } }]);
  });
});
