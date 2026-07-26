<div align="center">

# mcpfy

**A minimal SDK for building and consuming [MCP](https://modelcontextprotocol.io) servers.**

Tools. Prompts. Resources. Widgets. Stdio or HTTP, your choice.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6)](./typescript)
[![npm](https://img.shields.io/npm/v/mcpfy-sdk?label=mcpfy-sdk)](https://www.npmjs.com/package/mcpfy-sdk)

</div>

---

## Why mcpfy

The [Model Context Protocol](https://modelcontextprotocol.io) has a lot of surface area — tools,
prompts, resources, sampling, elicitation, roots, completions, OAuth, apps/widgets, and more.
Most of the time, you don't need most of it. You need a server that exposes a few **tools**,
maybe a **prompt** or a **resource**, and you want to be talking to it in under a minute.

mcpfy is a thin, honest wrapper around the official [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk)
that gets you there — a small, readable codebase you can actually understand end to end, with:

- **Tools, prompts, resources, and widgets** — the core MCP primitives, with a clean declarative
  API, plus interactive UI widgets across all three real-world conventions (MCP-UI, MCP Apps,
  Apps SDK) from one `server.widget()` call
- **Both transports** — stdio (what most MCP hosts expect) and HTTP, switchable with one option
- **Zero ceremony** — `npx create-mcpfy-app@latest` gets you a running server before you've
  written a line of code

## Quickstart

Scaffold a working server — no boilerplate to write:

```bash
npx create-mcpfy-app@latest my-server
cd my-server
npm run dev
```

That's a real MCP server, already talking stdio, with one tool, one prompt, and one resource
wired up. Or build one by hand:

```ts
import { MCPServer, text } from "mcpfy-sdk/server";

const server = new MCPServer({ name: "my-server", version: "1.0.0" });

server.tool(
  { name: "hello", description: "Say hello" },
  async () => text("Hello, World!")
);

await server.listen(); // stdio by default — pass { transport: "http", port: 3000 } for HTTP
```

```ts
import { MCPClient } from "mcpfy-sdk/client";

const client = new MCPClient({
  mcpServers: { myServer: { command: "node", args: ["server.js"] } },
});

const session = await client.createSession("myServer");
console.log(await session.callTool("hello"));
```

## Repository structure

```
mcpfy/
└── typescript/            → TypeScript SDK (npm: mcpfy-sdk, create-mcpfy-app)
    ├── packages/
    │   ├── mcpfy/          → the SDK: mcpfy-sdk/server, mcpfy-sdk/client, mcpfy-sdk/widget-bridge
    │   └── create-mcpfy-app/ → npx create-mcpfy-app@latest scaffolder
    └── examples/
        ├── hello-world/        → minimal runnable example, both transports
        └── widget-hello-world/ → a widget across all three UI-resource protocols
```

See [`typescript/README.md`](./typescript/README.md) for TypeScript-specific setup, development
commands, and testing.

## Packages

| Package | What it is |
|---|---|
| [`mcpfy-sdk`](./typescript/packages/mcpfy) | The SDK — `MCPServer`/`MCPClient`, tool/prompt/resource/widget registration, stdio + HTTP transports |
| [`create-mcpfy-app`](./typescript/packages/create-mcpfy-app) | `npx create-mcpfy-app@latest` — scaffolds a working server in one command |

## Documentation

- [TypeScript SDK guide](./typescript/README.md)
- [`mcpfy-sdk` package README](./typescript/packages/mcpfy/README.md) — full API reference
- [`examples/hello-world`](./typescript/examples/hello-world) — a complete runnable example,
  both transports
- [`examples/widget-hello-world`](./typescript/examples/widget-hello-world) — a widget across
  MCP-UI, MCP Apps, and Apps SDK at once

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE)
