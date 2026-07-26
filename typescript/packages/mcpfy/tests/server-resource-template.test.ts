import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MCPServer } from "../src/server/mcp-server.js";
import { object } from "../src/shared/response-helpers.js";

async function connectedPair(server: MCPServer) {
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.1.0" }, { capabilities: {} });
  await Promise.all([server.nativeServer.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("MCPServer resource templates", () => {
  it("extracts template variables and passes them to the read callback", async () => {
    const server = new MCPServer({ name: "test-server", version: "1.0.0" });
    server.resourceTemplate(
      { name: "user-profile", uriTemplate: "user://{userId}/profile", mimeType: "application/json" },
      async (uri, params) => object({ userId: params.userId, uri: uri.toString() })
    );

    const client = await connectedPair(server);

    const result = await client.readResource({ uri: "user://42/profile" });
    expect(result.contents).toHaveLength(1);
    const content = result.contents[0] as { text: string; mimeType?: string };
    expect(JSON.parse(content.text)).toEqual({ userId: "42", uri: "user://42/profile" });
  });
});
