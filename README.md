<div align="center">

<img src="./assets/mcpfy-sdk.png" alt="mcpfy" width="100%" />

# mcpfy

**Build MCP servers and clients with a simple, TypeScript-first API.**

⚡ Deploy in minutes | 🔐 OAuth built in | ☁️ Remote MCP ready | 🤖 Works with Claude, OpenAI & any other MCP client

A lightweight SDK for building **MCP tools, prompts, resources, and interactive widgets**.

Supports **HTTP**, **stdio**, and React widgets that work across **MCP-UI, MCP Apps, and OpenAI Apps SDK**.

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

The official Model Context Protocol SDK provides the building blocks for MCP servers and clients, but building a complete application can still involve repetitive setup.

**mcpfy keeps the official MCP SDK underneath a smaller, declarative API**, making it easier to build and consume MCP servers without hiding the underlying protocol.

* 🚀 **Build MCP servers quickly** with a small, familiar API
* 🛠️ **Tools, prompts, and resources** with typed Zod schemas
* 🎨 **Interactive React widgets** connected directly to MCP tools
* 🌐 **HTTP and stdio transports** for remote and local MCP servers
* 🔗 **Remote MCP mounting** for composing multiple MCP servers
* 🤖 **MCP UI compatibility** across MCP-UI, MCP Apps, and OpenAI Apps SDK
* 🔓 **Access the official SDK** whenever you need lower-level control
* 🧩 **MCP client included** for consuming local and remote servers

---

## Quick Start

### Create a new project

The fastest way to get started is with `create-mcpfy-app`:

```bash
npx create-mcpfy-app@latest my-server
cd my-server
npm run dev
```

The default project includes a **weather widget** under:

```text
src/widgets/weather
```

For a tools-only project without a widget:

```bash
npx create-mcpfy-app@latest my-server --no-widget
```

Use `-y` to skip the interactive setup.

### Create a server manually

Prefer to start from scratch? Install the SDK:

```bash
npm install mcpfy-sdk zod
```

Then create an MCP server:

```ts
import { MCPServer, object } from "mcpfy-sdk/server";
import { z } from "zod";

const server = new MCPServer({
  name: "my-server",
  version: "1.0.0",
});

server.tool(
  {
    name: "add",
    description: "Add two numbers",
    schema: z.object({
      a: z.number(),
      b: z.number(),
    }),
    outputSchema: z.object({
      sum: z.number(),
    }),
  },
  async ({ a, b }) => object({ sum: a + b })
);

await server.listen();
```

By default, `listen()` starts the server using **stdio**.

For HTTP:

```ts
await server.listen({
  transport: "http",
  port: 3000,
});
```

---

## Build Interactive Widgets

mcpfy lets you connect a React widget directly to an MCP tool.

Define the tool:

```ts
server.tool(
  {
    name: "weather",
    description: "Look up current weather for a city",
    schema: z.object({
      city: z.string().default("San Francisco"),
    }),
    outputSchema: z.object({
      city: z.string(),
      temperatureC: z.number(),
    }),
    widget: "weather",
  },
  async ({ city }) => {
    const geo = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`
    ).then((r) => r.json());

    const place = geo.results[0];

    const forecast = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m`
    ).then((r) => r.json());

    return object({
      city: place.name,
      temperatureC: forecast.current.temperature_2m,
    });
  }
);
```

Create the corresponding React widget at:

```text
src/widgets/weather/main.tsx
```

and default-export your component:

```tsx
import { useCallTool, useToolPayload } from "mcpfy-sdk/widget";

export default function Weather() {
  const { output } = useToolPayload();
  const callTool = useCallTool();

  return (
    <button onClick={() => callTool("weather", { city: "Tokyo" })}>
      {String(output?.city ?? "Lookup")}
    </button>
  );
}
```

Run the widget application during development:

```bash
mcpfy dev
```

Build widgets for production:

```bash
mcpfy build
```

mcpfy handles the widget bundling and host integration, so you **do not need to set up Vite yourself**.

Widgets can target:

* **MCP-UI**
* **MCP Apps**
* **OpenAI Apps SDK**

For advanced widget configuration, CSP settings, host context, and available React hooks, see the [Widget documentation](./typescript/packages/mcpfy/README.md#widgets).

---

## MCP Client

mcpfy also provides a client for consuming MCP servers from TypeScript.

```ts
import { MCPClient } from "mcpfy-sdk/client";

const client = new MCPClient({
  mcpServers: {
    local: {
      command: "npx",
      args: ["tsx", "src/server.ts", "--stdio"],
    },

    remote: {
      url: "https://example.com/mcp",
    },
  },
});

const session = await client.createSession("local");

console.log(
  await session.callTool("add", {
    a: 2,
    b: 3,
  })
);

await client.closeAllSessions();
```

Use:

* `command` for **stdio** servers
* `url` for **HTTP** servers

Sessions can also list and interact with tools, prompts, and resources:

```ts
await session.listTools();

await session.listPrompts();

await session.getPrompt("greet", {
  name: "World",
});

await session.listResources();

await session.readResource("app://greeting");
```

To connect to all configured servers:

```ts
await client.createAllSessions();
```

---

## Core Concepts

### Tools

Define MCP tools with typed input and output schemas:

```ts
server.tool(
  {
    name: "add",
    description: "Add two numbers",
    schema: z.object({
      a: z.number(),
      b: z.number(),
    }),
    outputSchema: z.object({
      sum: z.number(),
    }),
  },
  async ({ a, b }) => object({ sum: a + b })
);
```

Tool callbacks receive the input and a context object:

```ts
(input, context)
```

The context provides capabilities such as progress reporting, logging, cancellation, elicitation, URL flows, and session information.

### Prompts

Expose reusable prompt templates:

```ts
server.prompt(
  {
    name: "greet",
    schema: z.object({
      name: z.string(),
    }),
  },
  async ({ name }) => text(`Hello ${name}!`)
);
```

### Resources

Create static resources:

```ts
server.resource(
  {
    name: "greeting",
    uri: "app://greeting",
    title: "Greeting",
  },
  async () => markdown("# Hello!")
);
```

Or dynamic resource templates:

```ts
server.resourceTemplate(
  {
    name: "user-profile",
    uriTemplate: "user://{userId}/profile",
  },
  async (uri, params) =>
    object({
      userId: params.userId,
    })
);
```

### Remote MCP Servers

Mount another HTTP MCP server into your application:

```ts
await server.mountRemote({
  weather: {
    url: "https://weather.example/mcp",
  },

  internal: {
    url: "https://internal.example/mcp",
    authToken: process.env.INTERNAL_MCP_TOKEN,
  },
});
```

This makes it possible to compose capabilities from multiple MCP servers.

---

## Response Helpers

mcpfy includes helpers for common MCP responses:

```ts
text("Hello")

markdown("# Hello")

image(base64)

object({
  success: true,
})

error("Something went wrong")
```

The helpers can be used with:

* Tools
* Prompts
* Resources

They keep response handling concise without manually constructing MCP response objects.

---

## How It Works

mcpfy is designed as a lightweight layer over the official Model Context Protocol TypeScript SDK.

```text
                 Your Application
                       │
                       ▼
                  mcpfy SDK
              ┌────────┼────────┐
              │        │        │
            Tools    Prompts  Resources
              │
              ▼
         React Widgets
              │
              ▼
         MCP Protocol
           │       │
         stdio    HTTP
```

The SDK provides convenient APIs for common MCP development while keeping the underlying MCP implementation accessible.

When lower-level control is required, the underlying server is available through:

```ts
server.nativeServer
```

---

## Project Structure

The repository contains the TypeScript workspace, packages, and examples:

```text
mcpfy/
├── assets/
├── typescript/
│   ├── packages/
│   │   ├── mcpfy/
│   │   ├── create-mcpfy-app/
│   │   └── mcpfy-pulse/
│   ├── examples/
|   |   ├── diagram-maker/
│   │   ├── hello-world/
│   │   └── widget-weather/
│   └── README.md
├── CONTRIBUTING.md
├── LICENSE
├── ROADMAP.md
└── README.md
```

### Packages

| Package            | Purpose                                                   |
| ------------------ | --------------------------------------------------------- |
| `mcpfy-sdk`        | Core TypeScript SDK for MCP servers, clients, and widgets |
| `create-mcpfy-app` | CLI for scaffolding new mcpfy projects                    |
| `mcpfy-pulse`      | Optional telemetry package                                |

### SDK entry points

```text
mcpfy-sdk/server
mcpfy-sdk/client
mcpfy-sdk/widget
mcpfy-sdk/widget-bridge
```

---

## Documentation

Choose the documentation that matches what you're building:

* 📖 **[TypeScript workspace](./typescript/README.md)** — workspace structure, development, packages, and examples
* 📦 **[SDK API Reference](./typescript/packages/mcpfy/README.md)** — complete SDK API
* 🛠️ **[Tools](./typescript/packages/mcpfy/README.md#tools)** — create and configure MCP tools
* 💬 **[Prompts](./typescript/packages/mcpfy/README.md#prompts)** — define MCP prompts
* 📚 **[Resources](./typescript/packages/mcpfy/README.md#static-resources)** — static and dynamic resources
* 🎨 **[Widgets](./typescript/packages/mcpfy/README.md#widgets)** — React widgets and host integrations
* 🚀 **[Tools-only example](./typescript/examples/hello-world)** — minimal MCP server
* 🌦️ **[Widget example](./typescript/examples/widget-weather)** — MCP server with a React weather widget
* 🗺️ **[Roadmap](./ROADMAP.md)** — planned features and improvements
* 🤝 **[Contributing](./CONTRIBUTING.md)** — development and contribution guidelines

---

## Development

The TypeScript workspace requires:

* **Node.js 20.19+** or **22.12+**
* **pnpm 10+**

Clone the repository:

```bash
git clone https://github.com/mcpfyy/mcpfy.git
cd mcpfy/typescript
```

Install dependencies:

```bash
pnpm install
```

Build the workspace:

```bash
pnpm build
```

Run tests:

```bash
pnpm test
```

Build only the SDK:

```bash
pnpm --filter mcpfy-sdk build
```

Run only the SDK tests:

```bash
pnpm --filter mcpfy-sdk test
```

Build the project scaffolder:

```bash
pnpm --filter create-mcpfy-app build
```

The test suite uses real `MCPServer` + `MCPClient` round trips rather than mocking the SDK internals.

Tests are located in:

```text
typescript/packages/mcpfy/tests/
```

---

## Contributing

Contributions are welcome — whether you're fixing a bug, improving documentation, adding tests, or proposing a feature.

For anything beyond a small fix, **open an issue before starting significant work** so the approach can be discussed.

When contributing:

1. Keep changes focused and avoid unrelated refactors.
2. Add tests for behavior you change or introduce.
3. Prefer real MCP server/client round-trip tests over mocked SDK internals.
4. Update relevant documentation when changing public APIs.
5. Update examples when changing the corresponding scaffold or public behavior.

Before opening a pull request:

```bash
pnpm build
pnpm test
```

For the complete contribution workflow, see **[CONTRIBUTING.md](./CONTRIBUTING.md)**.

---

## Support

Found a bug or want to request a feature?

**[Open an issue on GitHub](https://github.com/mcpfyy/mcpfy/issues).**

For questions about MCP itself, refer to the official sources:

* [Model Context Protocol specification](https://modelcontextprotocol.io)
* [Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

mcpfy is designed as a lightweight wrapper around the official SDK rather than a reimplementation of the MCP protocol.

---

## Roadmap

See **[ROADMAP.md](./ROADMAP.md)** for the current project roadmap.

The roadmap is maintained publicly and evolves based on project development and community feedback.

Have an idea that isn't on the roadmap?

**[Open an issue](https://github.com/mcpfyy/mcpfy/issues)** and share what you'd like to see.

---

## License

mcpfy is distributed under the **[MIT License](./LICENSE)**.

---

<div align="center">

**Built in the open by mcpfy.ai**

</div>
