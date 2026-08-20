import { MCPServer, markdown, object, text{{AUTH_IMPORT}} } from "mcpfy-sdk/server";
import { z } from "zod";

const server = new MCPServer({
  name: "{{PROJECT_NAME}}",
  version: "1.0.0",
  description: "An MCP server built with mcpfy.",
  // HTTP only. MCP endpoint path; defaults to /mcp (this example: http://localhost:3000/hello)
  basePath: "/hello",
  // Shown to MCP clients. Remote URL, data: URI, or a local file path (e.g. "./src/icon.svg" or "file:///abs/path/icon.png")
  icon: "https://mcpfy.ai/images/mcpfy-fav-icon-min.png",{{AUTH_CONFIG}}
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

// Optional MCP extras — not required for tools. Skip these if you only want tools.
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
