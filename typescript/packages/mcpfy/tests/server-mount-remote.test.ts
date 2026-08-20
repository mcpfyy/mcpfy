import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { MCPServer } from "../src/server/mcp-server.js";
import { MCPClient } from "../src/client/mcp-client.js";
import { object } from "../src/shared/response-helpers.js";

describe("MCPServer.mountRemote", () => {
  let upstream: MCPServer | undefined;
  let gateway: MCPServer | undefined;
  let client: MCPClient | undefined;

  afterEach(async () => {
    await client?.closeAllSessions();
    await gateway?.close();
    await upstream?.close();
    client = undefined;
    gateway = undefined;
    upstream = undefined;
  });

  it("re-exposes an upstream HTTP tool under an alias prefix", async () => {
    upstream = new MCPServer({ name: "weather", version: "1.0.0" });
    upstream.tool(
      {
        name: "forecast",
        schema: z.object({ city: z.string() }),
        outputSchema: z.object({ city: z.string(), temp: z.number() }),
      },
      async ({ city }) => object({ city, temp: 21 })
    );
    const up = await upstream.listen({ transport: "http", port: 0, silent: true });

    gateway = new MCPServer({ name: "gateway", version: "1.0.0" });
    await gateway.mountRemote({ weather: { url: up.url! } });
    const gw = await gateway.listen({ transport: "http", port: 0, silent: true });

    client = new MCPClient({ mcpServers: { gw: { url: gw.url! } } });
    const session = await client.createSession("gw");
    const tools = await session.listTools();
    expect(tools.map((t) => t.name)).toContain("weather__forecast");

    const result = await session.callTool("weather__forecast", { city: "Paris" });
    expect(result.structuredContent).toEqual({ city: "Paris", temp: 21 });
  });
});
