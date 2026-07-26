# mcpfy hello-world example

A minimal MCP server built with `mcpfy`, exposing one tool (`add`), one resource
(`app://greeting`), and one prompt (`greet`). Demonstrates both transports mcpfy supports.

## Run

```bash
pnpm install    # from the typescript/ workspace root
pnpm --filter @mcpfy-examples/hello-world start:stdio   # stdio transport (default)
pnpm --filter @mcpfy-examples/hello-world start:http    # HTTP transport on :3000
```

## Connect a client

### stdio

```ts
import { MCPClient } from "mcpfy-sdk/client";

const client = new MCPClient({
  mcpServers: {
    hello: { command: "tsx", args: ["src/server.ts"] },
  },
});

const session = await client.createSession("hello");
console.log(await session.listTools());
console.log(await session.callTool("add", { a: 2, b: 3 }));
await client.closeAllSessions();
```

### HTTP

Start the server with `pnpm start:http` in one terminal, then:

```ts
import { MCPClient } from "mcpfy-sdk/client";

const client = new MCPClient({
  mcpServers: {
    hello: { url: "http://localhost:3000/mcp" },
  },
});

const session = await client.createSession("hello");
console.log(await session.readResource("app://greeting"));
console.log(await session.getPrompt("greet", { name: "World" }));
await client.closeAllSessions();
```
