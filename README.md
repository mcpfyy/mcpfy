<div align="center">

# mcpfy

A lightweight TypeScript SDK for building and consuming **MCP tools, prompts, resources, and widgets** with a clean, declarative API.

Supports **stdio**, **HTTP**, and widgets that work across **MCP-UI**, **MCP Apps**, and **OpenAI Apps SDK**.

```bash
npx create-mcpfy-app@latest my-server
```

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6)](./typescript)
[![npm](https://img.shields.io/npm/v/mcpfy-sdk?label=mcpfy-sdk)](https://www.npmjs.com/package/mcpfy-sdk)

</div>

---

## Why mcpfy?

The official MCP SDK is powerful, but getting your first server running still means writing a fair amount of setup code.

mcpfy keeps everything you need and removes the repetitive parts.

It stays close to the official SDK while providing a much cleaner API for the things you'll use every day.

With mcpfy you get:

- 🚀 Build an MCP server in minutes
- 🛠️ Simple APIs for tools, prompts, resources, and widgets
- 🌐 stdio and HTTP transports built in
- 🎨 One widget API that supports MCP-UI, MCP Apps, and OpenAI Apps SDK
- 📦 Tiny API surface with minimal abstractions
- 🔓 Full access to the underlying official SDK whenever you need it

---

## Quick Start

Create a complete MCP server in one command.

```bash
npx create-mcpfy-app@latest my-server

cd my-server
npm run dev
```

That's it.

You now have a working MCP server with:

- ✅ One tool
- ✅ One prompt
- ✅ One resource
- ✅ TypeScript configured
- ✅ Ready to connect to Claude Desktop, Cursor, Claude Code, Windsurf, or any MCP client

Or create one manually:

```ts
import { MCPServer, text } from "mcpfy-sdk/server";

const server = new MCPServer({
  name: "my-server",
  version: "1.0.0",
});

server.tool(
  {
    name: "hello",
    description: "Say hello",
  },
  async () => text("Hello, World!")
);

await server.listen();
```

Connecting from a client is just as simple:

```ts
import { MCPClient } from "mcpfy-sdk/client";

const client = new MCPClient({
  mcpServers: {
    local: {
      command: "node",
      args: ["server.js"],
    },
  },
});

const session = await client.createSession("local");

console.log(await session.callTool("hello"));
```

---

## What's Included?

### `mcpfy-sdk/server`

Build MCP servers with:

- Tools
- Prompts
- Resources
- Widgets
- stdio transport
- HTTP transport

### `mcpfy-sdk/client`

Connect to local or remote MCP servers using the same API.

### `mcpfy-sdk/widget-bridge`

Build widgets that communicate with:

- MCP-UI
- MCP Apps
- OpenAI Apps SDK

---

## Repository Structure

```text
mcpfy/
└── typescript/
    ├── packages/
    │   ├── mcpfy/
    │   └── create-mcpfy-app/
    └── examples/
        ├── hello-world/
        └── widget-hello-world/
```

| Package | Description |
|----------|-------------|
| `mcpfy-sdk` | The core SDK for building MCP servers, clients, and widgets |
| `create-mcpfy-app` | A project scaffolder that creates a complete MCP server with one command |

---

## Documentation

- 📖 **TypeScript SDK Guide**  
  `typescript/README.md`

- 📦 **Full API Reference**  
  `typescript/packages/mcpfy/README.md`

- 🚀 **Hello World Example**  
  `typescript/examples/hello-world`

- 🎨 **Widget Example**  
  `typescript/examples/widget-hello-world`

---

## Philosophy

mcpfy aims to stay small.

It doesn't try to replace the official SDK.

Instead, it provides a simpler developer experience while staying close enough that everything you learn transfers directly.

No hidden framework.

No magic.

No unnecessary abstractions.

Just a pleasant way to build MCP servers.

---

## Contributing

Contributions, issues, and ideas are always welcome.

See **CONTRIBUTING.md** for details.

---

## License

MIT