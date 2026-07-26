# mcpfy — TypeScript

The TypeScript implementation of [mcpfy](../README.md) — a pnpm workspace monorepo.

## Packages

- [`packages/mcpfy`](./packages/mcpfy) — the SDK (npm: `mcpfy-sdk`), with `mcpfy-sdk/server`,
  `mcpfy-sdk/client`, and `mcpfy-sdk/widget-bridge` subpath exports. See its
  [README](./packages/mcpfy/README.md) for the full API.
- [`packages/create-mcpfy-app`](./packages/create-mcpfy-app) — `npx create-mcpfy-app@latest`,
  the one-command scaffolder.

## Examples

- [`examples/hello-world`](./examples/hello-world) — a ~40-line server exposing one tool, one
  prompt, and one resource, runnable over stdio or HTTP.
- [`examples/widget-hello-world`](./examples/widget-hello-world) — a widget registered for
  MCP-UI, MCP Apps, and Apps SDK at once.

## Development

Requires Node.js 20.19+ (or 22.12+) and pnpm 10+.

```bash
pnpm install
pnpm build     # builds packages/mcpfy
pnpm test      # runs packages/mcpfy's test suite (vitest)
```

Per-package commands:

```bash
pnpm --filter mcpfy-sdk build
pnpm --filter mcpfy-sdk test
pnpm --filter mcpfy-sdk test:watch

pnpm --filter create-mcpfy-app build
pnpm --filter create-mcpfy-app dev -- my-test-app --no-install   # run the CLI from source
```

### Testing conventions

Tests spin up a real `MCPServer` and connect a real `MCPClient`/SDK `Client` to it, then assert
on the round trip — no mocking the SDK internals. See `packages/mcpfy/tests/` for the pattern,
including two true end-to-end tests: one spawns a real stdio child process
(`stdio-roundtrip.test.ts`), the other runs a real HTTP server (`http-roundtrip.test.ts`).

## Quick start

```ts
import { MCPServer, text } from "mcpfy-sdk/server";

const server = new MCPServer({ name: "my-server", version: "1.0.0" });

server.tool({ name: "hello", description: "Say hello" }, async () => text("Hello, World!"));

await server.listen(); // stdio by default; pass { transport: "http", port: 3000 } for HTTP
```

```ts
import { MCPClient } from "mcpfy-sdk/client";

const client = new MCPClient({
  mcpServers: { myServer: { command: "node", args: ["server.js"] } },
});

const session = await client.createSession("myServer");
console.log(await session.callTool("hello"));
```

See [`packages/mcpfy/README.md`](./packages/mcpfy/README.md) for the full API and
[`examples/hello-world`](./examples/hello-world) for a complete runnable example.
