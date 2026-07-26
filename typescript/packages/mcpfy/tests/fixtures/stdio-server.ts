import { z } from "zod";
import { MCPServer } from "../../src/server/mcp-server.js";
import { markdown, object, text } from "../../src/shared/response-helpers.js";

const server = new MCPServer({ name: "fixture-server", version: "1.0.0" });

server.tool(
  { name: "add", schema: z.object({ a: z.number(), b: z.number() }), outputSchema: z.object({ sum: z.number() }) },
  async ({ a, b }) => object({ sum: a + b })
);

server.resource({ name: "greeting", uri: "app://greeting" }, async () => markdown("# Hello from mcpfy!"));

server.prompt({ name: "greet", schema: z.object({ name: z.string() }) }, async ({ name }) =>
  text(`Hello, ${name}!`)
);

await server.listen();
