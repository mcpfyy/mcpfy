# Diagram-maker

An MCP server with a React widget that renders [Mermaid](https://mermaid.js.org/) diagrams using [mcpfy-sdk](https://www.npmjs.com/package/mcpfy-sdk).

The **tool handler** accepts a Mermaid diagram definition and returns it as structured output. The widget receives that output with `useToolPayload()` and renders the diagram with Mermaid.

| Primitive | Name             | Notes                                              |
| --------- | ---------------- | --------------------------------------------------- |
| Tool      | `create_diagram` | `widget.dir: "diagram"` → `src/widgets/diagram/main.tsx` |

No `server.widget()`, HTML file, prompt, or resource. The SDK registers the widget HTML from the React folder.

```ts
server.tool(
  {
    name: "create_diagram",
    description: "Create a diagram from a Mermaid definition.",
    schema: z.object({
      diagram: z.string().describe("Mermaid diagram definition"),
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
```

The widget uses `useToolPayload()` from `mcpfy-sdk/widget` to receive the tool output and `mermaid.render()` to render the Mermaid definition as an SVG diagram.

## Run

From the `typescript/` workspace root:

```bash
pnpm install
pnpm --filter @mcpfy-examples/diagram-maker dev
```
This starts the MCP server in development mode and bundles the widget.

For HTTP transport:
```bash
pnpm --filter @mcpfy-examples/diagram-maker dev:http
```

HTTP port: `--port N` or `PORT` (default `3000`).

For a production build:

```bash
pnpm --filter @mcpfy-examples/diagram-maker build
pnpm --filter @mcpfy-examples/diagram-maker start
```

## MCP host

Use `mcpfy dev` so the widget is bundled. Point `cwd` at this example:

```json
{
  "mcpServers": {
    "diagram-maker": {
      "command": "npx",
      "args": ["mcpfy", "dev", "--", "--stdio"],
      "cwd": "/absolute/path/to/examples/diagram-maker"
    }
  }
}
```

## Example

Pass a Mermaid definition to the `create_diagram` tool:

```text
graph TD
    A[Client] --> B[MCP Server]
    B --> C[Diagram Widget]
```

The tool returns the Mermaid definition, and the React widget renders it as a diagram in the host UI.

## Next steps

- Full API: [mcpfy-sdk](https://www.npmjs.com/package/mcpfy-sdk).