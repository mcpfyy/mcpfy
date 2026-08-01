import { MCPServer, markdown, object, text{{AUTH_IMPORT}} } from "mcpfy-sdk/server";
import { z } from "zod";

const server = new MCPServer({
  name: "{{PROJECT_NAME}}",
  version: "1.0.0",
  description: "An MCP server built with mcpfy.",{{AUTH_CONFIG}}
});

server.tool(
  {
    name: "add",
    description: "Add two numbers",
    schema: z.object({ a: z.number(), b: z.number() }),
    outputSchema: z.object({ sum: z.number() }),
  },
  async ({ a, b }) => object({ sum: a + b })
);

server.resource({ name: "greeting", uri: "app://greeting", title: "Greeting" }, async () =>
  markdown("# Hello from mcpfy!")
);

server.prompt(
  { name: "greet", description: "Generate a greeting", schema: z.object({ name: z.string() }) },
  async ({ name }) => text(`Hello, ${name}!`)
);

// Defaults to the transport chosen at scaffold time ({{DEFAULT_TRANSPORT}}); pass --http or
// --stdio to override for a single run without touching this file.
// HTTP port priority: --port N → PORT env → 3000 (npm scripts pass --port {{DEFAULT_PORT}}).
const transport = process.argv.includes("--http")
  ? "http"
  : process.argv.includes("--stdio")
    ? "stdio"
    : "{{DEFAULT_TRANSPORT}}";

await server.listen(transport === "http" ? { transport: "http" } : { transport: "stdio" });
