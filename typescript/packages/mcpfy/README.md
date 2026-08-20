# mcpfy

Build MCP servers in minutes, not hours.

**mcpfy** is a lightweight TypeScript SDK for building and consuming **MCP tools, prompts, resources, and interactive widgets** with a clean, declarative API.

It wraps the official `@modelcontextprotocol/sdk` without hiding it, so you get a much simpler developer experience while keeping full access whenever you need it.

Supports both **stdio** and **HTTP** transports for servers and clients, plus interactive widgets.

## Why mcpfy?

- 🚀 Build an MCP server with just a few lines of code
- 🧩 Tools, prompts, resources and widgets from one SDK
- 🌐 HTTP  and Stdio transports built in
- 🎨 One widget API that works across all major MCP UI protocols
- 🔓 Full access to the underlying official SDK whenever you need it
- 📦 Tiny API surface with minimal abstractions

---

## Installation

```bash
npm install mcpfy-sdk zod
```

`zod` is a peer dependency. Any compatible `^3.25.0` or `^4.x` version works.

---

## Quick Start

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
    schema: z.object({ a: z.number(), b: z.number() }),
    outputSchema: z.object({ sum: z.number() }),
  },
  async ({ a, b }) => object({ sum: a + b })
);

await server.listen();
```

That's it. For a React UI, pass `widget: "weather"` (folder `src/widgets/weather`) — see [Widgets](#widgets). Run widget apps with `mcpfy dev` / `mcpfy build`.

Don't want to start from scratch?

```bash
npx create-mcpfy-app@latest
```

A short TUI asks for the project name, transport, and auth. A React widget is
included by default; pass `--no-widget` for the `add` / greeting / `greet` server. Use `-y` to skip questions.

---

# Server API

```ts
import { MCPServer } from "mcpfy-sdk/server";
```

## Create a server

```ts
const server = new MCPServer({
  name: "my-server",
  version: "1.0.0",
});
```

```ts
interface MCPServerConfig {
  name: string;
  version: string;
  description?: string;
  basePath?: string;   // HTTP pathname, default /mcp
  icon?: string | ServerIcon;  // URL, data: URI, or local path (./icon.png)
  widgetsDir?: string; // default src/widgets
  auth?: AuthConfig;   // HTTP only
}
```

`MCPServer` wraps the official SDK while exposing it as `server.nativeServer` whenever you need lower level control.

---

## Tools

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
  async ({ a, b }) => object({
    sum: a + b,
  })
);
```

The callback receives:

```ts
(input, context)
```

You can also define the callback inline using the `cb` property if you prefer.

---

## Prompts

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

Prompt callbacks can return either:

- one of mcpfy's response helpers
- a raw `GetPromptResult`

---

## Static Resources

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

---

## Dynamic Resources

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

Template variables are automatically extracted from the URI.

Tell clients that a resource's content changed (`refreshResource`) or that they should list tools/resources/prompts again:

```ts
await server.refreshResource("app://greeting");
server.refreshResources();
server.refreshTools();
server.refreshPrompts();
```

The server advertises resource subscribe + listChanged. Clients that called `resources/subscribe` re-read the URI after `refreshResource`.

---

## Remote MCP servers

Re-expose another HTTP MCP server's tools (and resources/prompts) on this process. Names become `{alias}__{original}`:

```ts
await server.mountRemote({
  weather: { url: "https://weather.example/mcp" },
  internal: {
    url: "https://internal.example/mcp",
    authToken: process.env.INTERNAL_MCP_TOKEN,
  },
});
```

Call before or after `listen()`. Failed upstreams are skipped; the rest still mount.

---

## Widgets

Pass a React folder on `server.tool()` when the tool should render a UI. Omit `widget` for a normal tool.

```ts
server.tool(
  {
    name: "weather",
    description: "Weather widget",
    schema: z.object({ city: z.string().default("San Francisco") }),
    outputSchema: z.object({ city: z.string(), temperatureC: z.number() }),
    widget: "weather", // folder name under src/widgets → src/widgets/weather/
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
```

Put the UI in `src/widgets/<name>/` with a React entry (`main.tsx`, `main.jsx`, `index.tsx`, or `index.jsx`) that **default-exports** a component. mcpfy wraps it with host providers — you do not mount React or detect MCP-UI / MCP Apps / Apps SDK yourself.

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

Install `react` and `react-dom` in the app. **Do not install Vite** — mcpfy-sdk bundles widgets for you.

```bash
mcpfy dev      # MCP server + inline widget HTML (works in Inspector srcdoc)
mcpfy build    # write dist/widgets/<name>.html
```

`listen()` in development (`MCPFY_WIDGET_DEV=1` or `NODE_ENV=development`) bundles each widget into a single HTML document (classic script, no Vite URLs). In production it reads `dist/widgets`. If that file is missing and you are not in production, the SDK bundles once on listen.

Optional widget settings:

```ts
widget: {
  dir: "weather",
  entry: "main.tsx",
  protocols: ["apps-sdk"], // default: mcp-ui, mcp-apps, apps-sdk
  csp: { connectDomains: ["https://api.example.com"], resourceDomains: ["https://cdn.example.com"] },
}
```

Omit `csp` unless the widget loads remote URLs. mcpfy writes those origins into the widget HTML (`Content-Security-Policy` `connect-src`) and into host metadata: ChatGPT (`openai/widgetCSP`), Claude (MCP Apps `ui.csp`), and MCP-UI (`resource._meta.csp`). ChatGPT and Claude apply a tight policy as soon as you declare one: `connectDomains` for `fetch`, `resourceDomains` for `<img>` / fonts / CSS. Inline SVG and inlined JS/CSS do not need extra resource domains. Avoid `data:` image URLs — hosts that see a widget CSP often omit `data:` from `img-src`.

Set `MCPFY_URL` (or `MCP_URL`) to your public MCP origin (for example `https://your-host/mcp`). That origin is merged into `connectDomains` and `resourceDomains` so the iframe can `fetch` your own server. Do not use `127.0.0.1` for ChatGPT — the iframe cannot reach it.

`MCPServer({ widgetsDir: "src/widgets" })` changes the folder root. A `dir` that looks like a path (`./ui/weather`) is resolved from cwd.

### Widget hooks (`mcpfy-sdk/widget`)

| Export | Purpose |
| --- | --- |
| `HostRuntime` / `ThemeProvider` | Providers (injected by the SDK shell) |
| `useToolPayload` | Tool input / output / pending |
| `useCallTool` | `useCallTool()` returns a `(name, args)` function. `useCallTool("name")` returns `{ call, isPending, data, error }`. Augment `WidgetToolMap` for typed names. |
| `useLinkedTool` | Bound tool name + `call()` |
| `useSendFollowUp` | Send a follow-up prompt to the host chat |
| `useOpenExternal` | Open a URL via the host |
| `useLayoutMode` | `{ mode, request, available }` for inline / pip / fullscreen |
| `useHostContext` | Protocol, layout, locale, platform, `capabilities` (gate follow-up / links / view tools) |
| `useHostTheme` | light / dark |
| `HostImage` | Image tag with host-safe defaults |
| `useWidgetState` | Persist JSON on ChatGPT (`widgetState`) |
| `useViewState` | Local state + host persist + MCP Apps model context |
| `useModelContext` | `{ supported, publish }` — next-turn context without a chat message (MCP Apps) |
| `useViewTool` | Register a tool the **model** can call on this mounted view (MCP Apps). No-op in ChatGPT / MCP-UI. |

ChatGPT / remote Apps SDK iframes cannot reach `127.0.0.1`. Set `MCPFY_URL` to a public origin, and run `mcpfy build` before production.

### Deprecated: `server.widget()` + raw HTML

`server.widget({ content: { type: "html", html } })` still works for this release. Prefer `server.tool({ widget: "folder" })`.

Low-level `mcpfy-sdk/widget-bridge` (`connect`, `postToolCall`, …) remains available if you are not using React.

---

## Start the server

Default (stdio):

```ts
await server.listen();
```

HTTP:

```ts
await server.listen({
  transport: "http",
  port: 3000,
});
```

Most MCP clients expect stdio.

HTTP is ideal for hosted or remote MCP servers.

---

## Tool Context

Every callback receives a context object.

```ts
interface ToolContext {
  sample(prompt: string, options?): Promise<CreateMessageResult>;

  elicit(message: string, schema);

  askUrl(message: string, url: string, options?: { id?: string });

  finishAskUrl(id: string);

  reportProgress(progress, total?, message?);

  log(level, message);

  abort: AbortSignal;

  sessionId?: string;
}
```

`elicit` is a form. `askUrl` opens an external page (OAuth, etc.); verify completion on your server, then `finishAskUrl` if the host needs that signal. Pass `ctx.abort` to `fetch` so a cancelled tool call stops the HTTP request.

---

## Response Helpers

Instead of manually creating MCP responses, return helpers.

```ts
text("Hello")

markdown("# Hello")

image(base64)

object({
  success: true,
})

error("Something went wrong")
```

The same helpers work everywhere:

- tools
- prompts
- resources

---

# Client API

```ts
import { MCPClient } from "mcpfy-sdk/client";
```

```ts
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

await session.listTools();

await session.callTool("add", {
  a: 2,
  b: 3,
});

await session.listPrompts();

await session.getPrompt("greet", {
  name: "World",
});

await session.listResources();

await session.readResource("app://greeting");

await client.closeAllSessions();
```

Use `command` for stdio servers or `url` for HTTP servers.

`client.createAllSessions()` connects to every configured server simultaneously.

---

# Widget runtime (React)

```ts
import { useCallTool, useToolPayload } from "mcpfy-sdk/widget";
```

See [Widgets](#widgets) above. The imperative bridge is still exported:

```ts
import { connect, postToolCall } from "mcpfy-sdk/widget-bridge";
```

```ts
const { protocol, openai, app } =
  await connect({
    name: "weather-widget",
    version: "1.0.0",
  });

if (protocol === "apps-sdk") {
  await openai?.callTool?.("weather", { city: "Tokyo" });
}

if (protocol === "mcp-apps" && app) {
  await app.callServerTool({
    name: "weather",
    arguments: { city: "Tokyo" },
  });
}

if (protocol === "mcp-ui") {
  postToolCall("weather", { city: "Tokyo" });
}
```

The bridge automatically detects where your widget is running.

- **Apps SDK** uses the host injected `window.openai`
- **MCP Apps** wraps the official App SDK
- **MCP-UI** provides helper methods for postMessage communication

You can also import each implementation directly if you don't need auto detection.

---

# Examples

- `examples/hello-world` — same MCP as `create-mcpfy-app --no-widget`
- `examples/widget-weather` — same MCP as default `create-mcpfy-app` (`widget: "weather"`)

---

# License

MIT