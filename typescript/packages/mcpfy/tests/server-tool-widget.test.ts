import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MCPServer } from "../src/server/mcp-server.js";
import { object } from "../src/shared/response-helpers.js";
import { setWidgetHtmlForTest } from "../src/server/widgets/registry.js";

async function connectedPair(server: MCPServer) {
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.1.0" }, { capabilities: {} });
  await Promise.all([server.nativeServer.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("MCPServer tools with widget folders", () => {
  it("registers protocol metadata and embeds MCP-UI HTML from widget.html override", async () => {
    const server = new MCPServer({ name: "test-server", version: "1.0.0" });
    server.tool(
      {
        name: "fruit-picker",
        description: "Pick a fruit",
        widget: { dir: "fruit-picker", html: "<h1>Fruits</h1>" },
      },
      async () => object({ fruits: ["apple", "banana"] })
    );

    const client = await connectedPair(server);

    const { tools } = await client.listTools();
    expect(tools).toHaveLength(1);
    const meta = tools[0]._meta as Record<string, any>;
    expect(meta.ui.resourceUri).toBe("ui://fruit-picker/mcp-apps.html");
    expect(meta["openai/outputTemplate"]).toBe("ui://fruit-picker/apps-sdk.html");

    const result = await client.callTool({ name: "fruit-picker", arguments: {} });
    expect(result.structuredContent).toEqual({ fruits: ["apple", "banana"] });
    const resourceBlock = (result.content as any[]).find((c) => c.type === "resource");
    expect(resourceBlock.resource.uri).toBe("ui://fruit-picker/mcp-ui");
    expect(resourceBlock.resource.text).toBe("<h1>Fruits</h1>");

    const mcpAppsResource = await client.readResource({ uri: "ui://fruit-picker/mcp-apps.html" });
    expect(mcpAppsResource.contents[0].mimeType).toBe("text/html;profile=mcp-app");
    expect(mcpAppsResource.contents[0].text).toBe("<h1>Fruits</h1>");

    const appsSdkResource = await client.readResource({ uri: "ui://fruit-picker/apps-sdk.html" });
    expect(appsSdkResource.contents[0].mimeType).toBe("text/html+skybridge");
    expect(appsSdkResource.contents[0].text).toBe("<h1>Fruits</h1>");
  });

  it("respects widget protocols on tools", async () => {
    const server = new MCPServer({ name: "test-server", version: "1.0.0" });
    server.tool(
      {
        name: "mcp-ui-only",
        widget: { dir: "mcp-ui-only", html: "<p>hi</p>", protocols: ["mcp-ui"] },
      },
      async () => object({ ok: true })
    );

    const client = await connectedPair(server);
    const { tools } = await client.listTools();
    expect(tools[0]._meta).toBeUndefined();
    await expect(client.listResources()).rejects.toThrow();

    const result = await client.callTool({ name: "mcp-ui-only", arguments: {} });
    const resourceBlock = (result.content as any[]).find((c) => c.type === "resource");
    expect(resourceBlock.resource.uri).toBe("ui://mcp-ui-only/mcp-ui");
  });

  it("allows injecting HTML after registration", async () => {
    const server = new MCPServer({ name: "test-server", version: "1.0.0" });
    server.tool(
      { name: "later", widget: { dir: "later", html: "<p>old</p>" } },
      async () => object({ ok: true })
    );
    setWidgetHtmlForTest(server.nativeServer, "later", "<p>new</p>");

    const client = await connectedPair(server);
    const result = await client.callTool({ name: "later", arguments: {} });
    const resourceBlock = (result.content as any[]).find((c) => c.type === "resource");
    expect(resourceBlock.resource.text).toBe("<p>new</p>");
  });

  it("leaves tools without widget unchanged", async () => {
    const server = new MCPServer({ name: "test-server", version: "1.0.0" });
    server.tool({ name: "plain" }, async () => object({ n: 1 }));
    const client = await connectedPair(server);
    const result = await client.callTool({ name: "plain", arguments: {} });
    expect((result.content as any[]).some((c) => c.type === "resource")).toBe(false);
  });

  it("merges MCPFY_URL into widget CSP metadata", async () => {
    const prev = process.env.MCPFY_URL;
    process.env.MCPFY_URL = "https://app.example.com/mcp";
    try {
      const server = new MCPServer({ name: "test-server", version: "1.0.0" });
      server.tool(
        {
          name: "weather",
          widget: {
            dir: "weather",
            html: "<p>w</p>",
            csp: { connectDomains: ["https://api.open-meteo.com"] },
          },
        },
        async () => object({ ok: true })
      );
      const client = await connectedPair(server);
      const { tools } = await client.listTools();
      const meta = tools[0]._meta as Record<string, any>;
      expect(meta.ui.csp.connectDomains).toEqual([
        "https://api.open-meteo.com",
        "https://app.example.com",
      ]);
      expect(meta["openai/widgetCSP"].connect_domains).toEqual([
        "https://api.open-meteo.com",
        "https://app.example.com",
      ]);
      const result = await client.callTool({ name: "weather", arguments: {} });
      const resourceBlock = (result.content as any[]).find((c) => c.type === "resource");
      expect(resourceBlock.resource._meta.csp.connectDomains).toEqual([
        "https://api.open-meteo.com",
        "https://app.example.com",
      ]);
    } finally {
      if (prev === undefined) delete process.env.MCPFY_URL;
      else process.env.MCPFY_URL = prev;
    }
  });
});
