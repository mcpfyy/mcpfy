import { MCPServer, markdown, object, text } from "mcpfy-sdk/server";
import { z } from "zod";

const server = new MCPServer({
  name: "hello-world",
  version: "1.0.0",
  description: "Minimal mcpfy example: a tool, a prompt, and a resource.",
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

const useHttp = process.argv.includes("--http");
// Port resolution (HTTP): options.port → --port N → PORT env → 3000
await server.listen(useHttp ? { transport: "http" } : { transport: "stdio" });
