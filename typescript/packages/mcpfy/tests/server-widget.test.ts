import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MCPServer } from "../src/server/mcp-server.js";

async function connectedPair(server: MCPServer) {
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.1.0" }, { capabilities: {} });
  await Promise.all([server.nativeServer.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("MCPServer widgets", () => {
  it("registers a widget for all three protocols by default", async () => {
    const server = new MCPServer({ name: "test-server", version: "1.0.0" });
    server.widget(
      { name: "fruit-picker", description: "Pick a fruit", content: { type: "html", html: "<h1>Fruits</h1>" } },
      async () => ({ fruits: ["apple", "banana"] })
    );

    const client = await connectedPair(server);

    // Tool carries pointer metadata for both mcp-apps and apps-sdk.
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(1);
    const meta = tools[0]._meta as Record<string, any>;
    expect(meta.ui.resourceUri).toBe("ui://fruit-picker/mcp-apps.html");
    expect(meta["openai/outputTemplate"]).toBe("ui://fruit-picker/apps-sdk.html");

    // Calling the tool embeds the MCP-UI resource directly in content.
    const result = await client.callTool({ name: "fruit-picker", arguments: {} });
    expect(result.structuredContent).toEqual({ fruits: ["apple", "banana"] });
    const resourceBlock = (result.content as any[]).find((c) => c.type === "resource");
    expect(resourceBlock.resource.uri).toBe("ui://fruit-picker/mcp-ui");
    // @mcp-ui/server's createUIResource() defaults to the MCP Apps mimeType even with
    // no adapter enabled (verified against its bundled source) — not plain "text/html".
    expect(resourceBlock.resource.mimeType).toBe("text/html;profile=mcp-app");
    expect(resourceBlock.resource.text).toBe("<h1>Fruits</h1>");

    // The standalone mcp-apps resource is separately fetchable and has the right mimeType.
    const mcpAppsResource = await client.readResource({ uri: "ui://fruit-picker/mcp-apps.html" });
    expect(mcpAppsResource.contents[0].mimeType).toBe("text/html;profile=mcp-app");
    expect(mcpAppsResource.contents[0].text).toBe("<h1>Fruits</h1>");

    // Same for the standalone apps-sdk resource.
    const appsSdkResource = await client.readResource({ uri: "ui://fruit-picker/apps-sdk.html" });
    expect(appsSdkResource.contents[0].mimeType).toBe("text/html+skybridge");
    expect(appsSdkResource.contents[0].text).toBe("<h1>Fruits</h1>");
  });

  it("only registers the requested protocols", async () => {
    const server = new MCPServer({ name: "test-server", version: "1.0.0" });
    server.widget(
      { name: "mcp-ui-only", content: { type: "html", html: "<p>hi</p>" }, protocols: ["mcp-ui"] },
      async () => ({ ok: true })
    );

    const client = await connectedPair(server);

    const { tools } = await client.listTools();
    expect(tools[0]._meta).toBeUndefined();

    // No standalone resource is registered for mcp-ui-only widgets, so the server
    // never installs a resources/list handler at all — this is expected to fail.
    await expect(client.listResources()).rejects.toThrow();

    const result = await client.callTool({ name: "mcp-ui-only", arguments: {} });
    const resourceBlock = (result.content as any[]).find((c) => c.type === "resource");
    expect(resourceBlock.resource.uri).toBe("ui://mcp-ui-only/mcp-ui");
  });

  it("wraps url content in an iframe for the standalone resources", async () => {
    const server = new MCPServer({ name: "test-server", version: "1.0.0" });
    server.widget(
      { name: "hosted-widget", content: { type: "url", url: "https://example.com/widget" }, protocols: ["mcp-apps"] },
      async () => ({})
    );

    const client = await connectedPair(server);
    const resource = await client.readResource({ uri: "ui://hosted-widget/mcp-apps.html" });
    expect(resource.contents[0].text).toContain('src="https://example.com/widget"');
  });
});
