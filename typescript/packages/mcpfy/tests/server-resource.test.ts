import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MCPServer } from "../src/server/mcp-server.js";
import { markdown } from "../src/shared/response-helpers.js";

async function connectedPair(server: MCPServer) {
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.1.0" }, { capabilities: {} });
  await Promise.all([server.nativeServer.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("MCPServer static resources", () => {
  it("lists and reads a markdown resource with the inferred mimeType", async () => {
    const server = new MCPServer({ name: "test-server", version: "1.0.0" });
    server.resource({ name: "greeting", uri: "app://greeting", title: "Greeting" }, async () =>
      markdown("# Hello from mcpfy!")
    );

    const client = await connectedPair(server);

    const { resources } = await client.listResources();
    expect(resources).toHaveLength(1);
    expect(resources[0].uri).toBe("app://greeting");

    const result = await client.readResource({ uri: "app://greeting" });
    expect(result.contents).toEqual([
      { uri: "app://greeting", mimeType: "text/markdown", text: "# Hello from mcpfy!" },
    ]);
  });
});
