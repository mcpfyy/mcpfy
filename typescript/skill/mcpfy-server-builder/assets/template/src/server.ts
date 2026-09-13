import { MCPServer, object, text } from "mcpfy-sdk/server";
import { z } from "zod";

const server = new MCPServer({
  name: "my-mcp-server",
  version: "1.0.0",
  description: "A starter MCP server built with mcpfy-sdk",
});

// A tool returning structured data with object().
server.tool(
  {
    name: "add",
    description: "Add two numbers",
    schema: z.object({
      a: z.number(),
      b: z.number(),
    }),
  },
  async ({ a, b }) => {
    return object({ result: a + b });
  }
);

// A tool returning plain text with text().
server.tool(
  {
    name: "greet",
    description: "Greet a person by name",
    schema: z.object({
      name: z.string(),
    }),
  },
  async ({ name }) => {
    return text(`Hello, ${name}!`);
  }
);

// A tool bound to an interactive widget. See src/widgets/example/main.tsx.
// Delete this tool (and the widgets/ directory) if the server doesn't need a UI.
server.tool(
  {
    name: "example-widget",
    description: "Return a value shown in an example interactive widget",
    schema: z.object({
      label: z.string().default("World"),
    }),
    widget: "example",
  },
  async ({ label }) => {
    return object({ label });
  }
);

// Default transport is stdio, for MCP hosts that launch this process directly.
// Switch to { transport: "http", port: 4000 } to expose an HTTP endpoint instead.
await server.listen({
  transport: "stdio",
});
