import { MCPServer, markdown, object, text } from "mcpfy-sdk/server";
import { z } from "zod";

const server = new MCPServer({
  name: "hello-world",
  version: "1.0.0",
  description: "Minimal mcpfy example: a tool, a prompt, and a resource.",
  // HTTP only. MCP endpoint path; defaults to /mcp (this example: http://localhost:3000/hello)
  basePath: "/hello",
  // Shown to MCP clients. Remote URL, data: URI, or a local file path (e.g. "./src/icon.svg" or "file:///abs/path/icon.png")
  icon: "https://mcpfy.ai/images/mcpfy-fav-icon-min.png",
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

const transport = process.argv.includes("--http") ? "http" : "stdio";
// HTTP port: --port N → PORT env → 3000
await server.listen(transport === "http" ? { transport: "http" } : { transport: "stdio" });
