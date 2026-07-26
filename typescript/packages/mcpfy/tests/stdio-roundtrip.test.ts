import { fileURLToPath } from "node:url";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MCPClient } from "../src/client/mcp-client.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const tsxBin = path.join(here, "../node_modules/.bin/tsx");
const fixture = path.join(here, "fixtures/stdio-server.ts");

describe("stdio transport end-to-end", () => {
  let client: MCPClient | undefined;

  afterEach(async () => {
    await client?.closeAllSessions();
    client = undefined;
  });

  it("spawns a real server process and round-trips tools/prompts/resources", async () => {
    client = new MCPClient({
      mcpServers: { fixture: { command: tsxBin, args: [fixture] } },
    });

    const session = await client.createSession("fixture");

    const tools = await session.listTools();
    expect(tools.map((t) => t.name)).toEqual(["add"]);

    const toolResult = await session.callTool("add", { a: 2, b: 3 });
    expect(toolResult.structuredContent).toEqual({ sum: 5 });

    const prompts = await session.listPrompts();
    expect(prompts.map((p) => p.name)).toEqual(["greet"]);

    const promptResult = await session.getPrompt("greet", { name: "World" });
    expect(promptResult.messages[0]).toEqual({ role: "user", content: { type: "text", text: "Hello, World!" } });

    const resources = await session.listResources();
    expect(resources.map((r) => r.uri)).toEqual(["app://greeting"]);

    const resourceResult = await session.readResource("app://greeting");
    expect(resourceResult.contents[0]).toEqual({
      uri: "app://greeting",
      mimeType: "text/markdown",
      text: "# Hello from mcpfy!",
    });
  });
});
