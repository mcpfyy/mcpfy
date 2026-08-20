import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  ElicitRequestSchema,
  ResourceUpdatedNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { MCPServer } from "../src/server/mcp-server.js";
import { markdown, object, text } from "../src/shared/response-helpers.js";

async function connectedPair(
  server: MCPServer,
  capabilities: Record<string, unknown> = {}
) {
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.1.0" }, { capabilities });
  await Promise.all([server.nativeServer.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("MCPServer refresh / abort / askUrl", () => {
  it("passes ctx.abort into tool callbacks", async () => {
    const server = new MCPServer({ name: "test-server", version: "1.0.0" });
    let abort: AbortSignal | undefined;
    server.tool({ name: "ping" }, async (_params, ctx) => {
      abort = ctx.abort;
      return text("ok");
    });

    const client = await connectedPair(server);
    await client.callTool({ name: "ping", arguments: {} });
    expect(abort).toBeInstanceOf(AbortSignal);
    expect(abort?.aborted).toBe(false);
  });

  it("refreshResource notifies a subscribed client", async () => {
    const server = new MCPServer({ name: "test-server", version: "1.0.0" });
    server.resource({ name: "greeting", uri: "app://greeting" }, async () => markdown("# hi"));

    const client = await connectedPair(server);
    const uris: string[] = [];
    client.setNotificationHandler(ResourceUpdatedNotificationSchema, (note) => {
      uris.push(note.params.uri);
    });
    await client.subscribeResource({ uri: "app://greeting" });
    await server.refreshResource("app://greeting");
    await new Promise((r) => setTimeout(r, 20));
    expect(uris).toContain("app://greeting");
  });

  it("askUrl sends a URL elicitation request", async () => {
    const server = new MCPServer({ name: "test-server", version: "1.0.0" });
    let seen: Record<string, unknown> | undefined;
    server.tool({ name: "auth" }, async (_params, ctx) => {
      const result = await ctx.askUrl("Authorize GitHub", "https://github.com/login", {
        id: "gh-1",
      });
      return object({ action: result.action });
    });

    const client = await connectedPair(server, { elicitation: { url: {}, form: {} } });
    client.setRequestHandler(ElicitRequestSchema, async (req) => {
      seen = req.params as Record<string, unknown>;
      return { action: "accept" };
    });

    const result = await client.callTool({ name: "auth", arguments: {} });
    expect(result.structuredContent).toEqual({ action: "accept" });
    expect(seen).toMatchObject({
      mode: "url",
      url: "https://github.com/login",
      elicitationId: "gh-1",
    });
  });
});
