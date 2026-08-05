<div align="center">

<pre>
 ███╗   ███╗ ██████╗██████╗ ███████╗██╗   ██╗
 ████╗ ████║██╔════╝██╔══██╗██╔════╝╚██╗ ██╔╝
 ██╔████╔██║██║     ██████╔╝█████╗   ╚████╔╝
 ██║╚██╔╝██║██║     ██╔═══╝ ██╔══╝    ╚██╔╝
 ██║ ╚═╝ ██║╚██████╗██║     ██║        ██║
 ╚═╝     ╚═╝ ╚═════╝╚═╝     ╚═╝        ╚═╝
</pre>


A SDK for building **MCP tools, prompts, resources, and widgets**.

Supports **HTTP**, **stdio**, and widgets that work across **MCP-UI**, **MCP Apps**, and **OpenAI Apps SDK**.

```bash
npx create-mcpfy-app@latest my-server
```

[![npm](https://img.shields.io/npm/v/mcpfy-sdk?label=npm)](https://www.npmjs.com/package/mcpfy-sdk)
[![Made by mcpfy.ai](https://img.shields.io/badge/made%20by-mcpfy.ai-blueviolet)](https://mcpfy.ai)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6)](./typescript)

</div>

---

## Why mcpfy?

The official MCP SDK is powerful, but getting your first server running still means writing a fair amount of setup code.

mcpfy keeps everything you need and removes the repetitive parts.

It stays close to the official SDK while providing a much cleaner setup for the things you'll use every day.

With mcpfy you get:

- 🚀 Build an MCP server in minutes
- 🛠️ Simple APIs for tools, prompts, resources, and widgets
- 🌐 HTTP & stdio transports built in
- 🎨 One widget API that supports MCP-UI, MCP Apps, and OpenAI Apps SDK
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

## Contributing

mcpfy is built in the open, and contributions are welcome.

Have an idea that would improve the project? Fork the repo and open a pull request. Found a bug or want to request a feature? Open an issue with the "enhancement" tag. If you find mcpfy useful, a star helps others discover it.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## License

Distributed under the [MIT License](./LICENSE).