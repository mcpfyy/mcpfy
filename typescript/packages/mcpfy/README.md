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

That's it.

Your server is now ready to connect to Claude Desktop, Cursor, Claude Code, Windsurf, or any other MCP client.

Don't want to start from scratch?

```bash
npx create-mcpfy-app@latest
```

scaffolds a complete project with an example tool, prompt, resource and development setup.

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

---

## Widgets

Create interactive UI with a single API.

```ts
server.widget(
  {
    name: "counter",
    description: "Counter widget",
    content: {
      type: "html",
      html: "<html>...</html>",
    },
  },
  async () => ({
    count: 0,
  })
);
```

or host the UI elsewhere:

```ts
content: {
  type: "url",
  url: "https://example.com/widget"
}
```

By default, widgets work across all supported UI protocols:

- MCP-UI
- MCP Apps (SEP-1865)
- OpenAI Apps SDK

Need only specific protocols?

```ts
protocols: ["apps-sdk"]
```

or

```ts
protocols: ["mcp-ui", "mcp-apps"]
```

mcpfy automatically registers the required resources, MIME types and metadata for each protocol.

No protocol-specific boilerplate required.

> mcpfy doesn't build or bundle your frontend. Bring your own HTML, React, Vue, Svelte, or anything else.

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

  reportProgress(progress, total?, message?);

  log(level, message);

  sessionId?: string;
}
```

This gives access to sampling, elicitation, progress reporting, structured logging and session information.

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
      command: "node",
      args: ["server.js"],
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

# Widget Bridge

```ts
import { connect, postToolCall } from "mcpfy-sdk/widget-bridge";
```

```ts
const { protocol, openai, app } =
  await connect({
    name: "counter-widget",
    version: "1.0.0",
  });

if (protocol === "apps-sdk") {
  await openai?.callTool?.("increment-counter", {});
}

if (protocol === "mcp-apps" && app) {
  await app.callServerTool({
    name: "increment-counter",
    arguments: {},
  });
}

if (protocol === "mcp-ui") {
  postToolCall("increment-counter", {});
}
```

The bridge automatically detects where your widget is running.

- **Apps SDK** uses the host injected `window.openai`
- **MCP Apps** wraps the official App SDK
- **MCP-UI** provides helper methods for postMessage communication

You can also import each implementation directly if you don't need auto detection.

---

# Examples

- `examples/hello-world`  
  Basic server with one tool, prompt and resource.

- `examples/widget-hello-world`  
  Interactive widget working across every supported UI protocol.

---

# License

MIT