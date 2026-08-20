# hello-world

A tools-only MCP server with [mcpfy-sdk](https://www.npmjs.com/package/mcpfy-sdk). Same shape as `create-mcpfy-app --no-widget`.

| Primitive | Name | Notes |
| --- | --- | --- |
| Tool | `add` | `schema` `{ a, b }` → `outputSchema` `{ sum }` |
| Resource | `app://greeting` | Markdown via `server.resource()` — data, not UI |
| Prompt | `greet` | Template via `server.prompt()` |

```ts
server.tool(
  {
    name: "add",
    description: "Add two numbers",
    schema: z.object({ a: z.number(), b: z.number() }),
    outputSchema: z.object({ sum: z.number() }),
  },
  async ({ a, b }) => object({ sum: a + b })
);
```

## Run

From the `typescript/` workspace root:

```bash
pnpm install
pnpm --filter @mcpfy-examples/hello-world start:stdio   # default
pnpm --filter @mcpfy-examples/hello-world start:http    # http://localhost:3000/hello
```

HTTP port: `--port N` or `PORT` (default 3000).

## MCP host

```json
{
  "mcpServers": {
    "hello-world": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/examples/hello-world/src/server.ts", "--stdio"]
    }
  }
}
```

## MCPClient

stdio (spawns the server):

```ts
import { MCPClient } from "mcpfy-sdk/client";

const client = new MCPClient({
  mcpServers: {
    hello: { command: "npx", args: ["tsx", "src/server.ts", "--stdio"] },
  },
});

const session = await client.createSession("hello");
console.log(await session.callTool("add", { a: 2, b: 3 })); // structuredContent: { sum: 5 }
await client.closeAllSessions();
```

HTTP — start `start:http` first, then:

```ts
const client = new MCPClient({
  mcpServers: { hello: { url: "http://localhost:3000/hello" } },
});
```

## Next steps

- For a React UI, see [`../widget-weather`](../widget-weather) or `create-mcpfy-app` (widget is the default).
- Full API: [mcpfy-sdk](https://www.npmjs.com/package/mcpfy-sdk).
