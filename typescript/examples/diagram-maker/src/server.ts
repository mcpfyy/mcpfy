import { MCPServer, object } from "mcpfy-sdk/server";
import { z } from "zod";

const server = new MCPServer({
  name: "diagram-maker",
  version: "1.0.0",
  description: "Create diagrams from Mermaid definitions.",
});

server.tool(
  {
    name: "create_diagram",
    description: "Create a diagram from a Mermaid definition.",
    schema: z.object({
      diagram: z
        .string()
        .trim()
        .min(1, "Diagram definition cannot be empty.")
        .describe("Mermaid diagram definition"),
    }),
    outputSchema: z.object({
      diagram: z.string(),
    }),
    widget: {
      dir: "diagram",
    },
  },
  async ({ diagram }) => {
    return object({ diagram });
  }
);

const transport = ((globalThis as { process?: { argv?: string[] } }).process?.argv ?? []).includes(
  "--http"
)
  ? "http"
  : "stdio";

await server.listen(
  transport === "http"
    ? { transport: "http" }
    : { transport: "stdio" }
);