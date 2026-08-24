<div align="center">

<img src="./assets/mcpfy-sdk.png" alt="mcpfy" width="100%" />


⚡ Deploy in minutes | 🔐 OAuth built in | ☁️ Remote MCP ready | 🤖 Works with Claude, OpenAI & any other client

A SDK for building **MCP tools, prompts, resources, and widgets**.

Supports **HTTP**, **stdio**, and React widgets that work across **MCP-UI**, **MCP Apps**, and **OpenAI Apps SDK**.

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

mcpfy stays close to that SDK and drops the repetitive parts.

- 🚀 Build an MCP server in minutes
- 🛠️ Tools, prompts, and resources with a small API
- 🎨 Widgets as React folders: `server.tool({ widget: "weather" })` — one UI for MCP-UI, MCP Apps, and Apps SDK
- 🌐 HTTP and stdio built in
- 🔓 Full access to the official SDK when you need it

---

## Quick start

```bash
npx create-mcpfy-app@latest my-server
cd my-server
npm run dev
```

Default scaffold: a **weather widget** (`src/widgets/weather`, linked with `widget: "weather"`). The tool fetches Open-Meteo; the widget looks up cities with `callTool`. Pass `--no-widget` for the tools-only server (`add`, a greeting resource, and a `greet` prompt). `-y` skips the TUI.

Or write a server yourself:

```ts
import { MCPServer, object } from "mcpfy-sdk/server";
import { z } from "zod";

const server = new MCPServer({ name: "my-server", version: "1.0.0" });

server.tool(
  {
    name: "add",
    description: "Add two numbers",
    schema: z.object({ a: z.number(), b: z.number() }),
    outputSchema: z.object({ sum: z.number() }),
  },
  async ({ a, b }) => object({ sum: a + b })
);

// React UI: src/widgets/weather/main.tsx — hooks from mcpfy-sdk/widget
server.tool(
  {
    name: "weather",
    description: "Look up current weather for a city",
    schema: z.object({ city: z.string().default("San Francisco") }),
    outputSchema: z.object({ city: z.string(), temperatureC: z.number() }),
    widget: {
      dir: "weather",
      // If the widget fetch()es another origin (ChatGPT + Claude):
      // csp: { connectDomains: ["https://api.example.com"] },
    },
  },
  async ({ city }) => {
    const geo = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`
    ).then((r) => r.json());
    const place = geo.results[0];
    const forecast = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m`
    ).then((r) => r.json());
    return object({ city: place.name, temperatureC: forecast.current.temperature_2m });
  }
);

await server.listen(); // stdio; { transport: "http" } for HTTP
```

Widgets: `mcpfy dev` / `mcpfy build`. There is no HTML file and no `server.widget()` in new apps.

```ts
import { MCPClient } from "mcpfy-sdk/client";

const client = new MCPClient({
  mcpServers: {
    local: { command: "npx", args: ["tsx", "src/server.ts", "--stdio"] },
  },
});

const session = await client.createSession("local");
console.log(await session.callTool("add", { a: 2, b: 3 }));
await client.closeAllSessions();
```

---

## From the SDK to production

The SDK is the build step. [mcpfy.ai](https://mcpfy.ai) carries the same server through the rest of the pipeline — deploy, publish, iterate, monitor — so you do not assemble a host, a test harness, an analytics stack and a submission pack yourself.

### Build

Scaffold with the SDK, install a skill into your coding agent, or describe the app and let it scaffold. Already writing MCP servers? Existing code drops in unchanged.

<img src="./assets/platform-build.png" alt="Scaffolding a server with create-mcpfy-app, and a tool defined in tools/chart-sales.ts" width="100%" />

### Publish

Marketplace checklists tell you when a server is ready for ChatGPT and Claude, and the submission assets are generated for you.

<img src="./assets/platform-publish.png" alt="Publishing checks — protocol and discovery, tool conformance, security and policy, domain and TLS" width="100%" />

### Iterate

Cloud Inspector runs the server against real clients from a browser. Fire tool calls, read the JSON-RPC, and swap models with no local setup.

<img src="./assets/platform-iterate.png" alt="Cloud Inspector showing a display_weather tool call, its JSON-RPC frames, and eval scores across GPT, Claude and Gemini" width="100%" />

### Monitor

Traffic, tool-call volume, latency and error rates once it is live, with session replay end to end.

<img src="./assets/platform-monitor.png" alt="Analytics dashboard — tool calls over 24h, traffic by country, and a trace list with per-call latency" width="100%" />

---

## Documentation

- 📖 **TypeScript workspace** — [`typescript/README.md`](./typescript/README.md)
- 📦 **API** — [`typescript/packages/mcpfy/README.md`](./typescript/packages/mcpfy/README.md)
- 🚀 **Tools-only example** — [`typescript/examples/hello-world`](./typescript/examples/hello-world) (`--no-widget`)
- 🎨 **Widget example** — [`typescript/examples/widget-weather`](./typescript/examples/widget-weather) (default scaffold)

---

## Roadmap

[`ROADMAP.md`](./ROADMAP.md)

---

## Contributing

mcpfy is built in the open, and contributions are welcome.

Have an idea that would improve the project? Fork the repo and open a pull request. Found a bug or want to request a feature? Open an issue. If you find mcpfy useful, a star helps others discover it.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## License

Distributed under the [MIT License](./LICENSE).
