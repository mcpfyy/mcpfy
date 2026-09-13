# Server

## Table of Contents

- [Server](#server)
  - [Table of Contents](#table-of-contents)
  - [Creating a server](#creating-a-server)
  - [Tools](#tools)
    - [Result helpers — always use these, never a bare object](#result-helpers--always-use-these-never-a-bare-object)
    - [Errors](#errors)
    - [Images](#images)
    - [Organizing many tools](#organizing-many-tools)
  - [Resources](#resources)
  - [Prompts](#prompts)
  - [Context (`ctx`)](#context-ctx)
  - [Starting the server](#starting-the-server)
    - [Port resolution order](#port-resolution-order)
  - [Stopping and refreshing](#stopping-and-refreshing)
  - [Complete example](#complete-example)

## Creating a server

```typescript
import { MCPServer, object } from "mcpfy-sdk/server";

const server = new MCPServer({
  name: "my-server",
  version: "1.0.0",
});
```

`MCPServerConfig`:

```typescript
interface MCPServerConfig {
  name: string;            // required
  version: string;         // required
  description?: string;
  basePath?: string;       // HTTP MCP endpoint path, default "/mcp"
  icon?: string | ServerIcon; // remote URL, data URI, local path, or file: URL
  auth?: AuthConfig;       // see auth.md
  widgetsDir?: string;     // default "src/widgets"
}
```

`MCPServer` wraps the official MCP SDK's server and adds higher-level registration APIs. Use `server.nativeServer` only when something from the official MCP SDK is needed directly — prefer the mcpfy APIs below for everything else.

## Tools

```typescript
import { MCPServer, object } from "mcpfy-sdk/server";
import { z } from "zod";

server.tool(
  {
    name: "add",
    description: "Add two numbers",
    schema: z.object({
      a: z.number(),
      b: z.number(),
    }),
  },
  async ({ a, b }, ctx) => {
    return object({ result: a + b });
  }
);
```

- `name`, `description`, `schema` (a Zod schema — `zod` is a required peer dependency), and an optional widget binding (`widget: "<name>"`, see widgets.md) are the common tool definition fields.
- The callback receives input already validated against `schema`, plus a `ToolContext` as the second argument.
- Input can be omitted from a tool with no arguments — don't invent an empty `schema: z.object({})` unless the client needs an explicit empty-object schema.

### Result helpers — always use these, never a bare object

```typescript
import { text, markdown, object } from "mcpfy-sdk/server";

return text("Hello!");                          // plain text
return markdown("# Hello\n\nThis is Markdown."); // markdown content
return object({ success: true, value: 42 });     // structured JSON result
```

Returning a raw object like `return { result: a + b }` is wrong — it isn't an MCP-compatible result. Wrap it with `object()`.

### Errors

Throw a real `Error` with a meaningful message for failures the tool can't complete; the SDK surfaces it to the client.

```typescript
if (b === 0) {
  throw new Error("Cannot divide by zero");
}
```

### Images

Image content must be base64, not a remote URL:

```typescript
import { image } from "mcpfy-sdk/server";

const response = await fetch("https://example.com/image.png");
const buffer = Buffer.from(await response.arrayBuffer());
const base64 = buffer.toString("base64");
return image(base64, "image/png");
```

### Organizing many tools

Split tools into modules that export a registration function, then call each from `server.ts`:

```typescript
// src/tools/calculator.ts
export function registerCalculator(server: MCPServer) {
  server.tool({ name: "add", /* ... */ }, async ({ a, b }) => object({ result: a + b }));
}

// src/server.ts
import { registerCalculator } from "./tools/calculator.js";
registerCalculator(server);
```

## Resources

Static resource (fixed URI):

```typescript
server.resource(
  {
    name: "server-info",
    uri: "info://server",
    description: "Server information",
    mimeType: "text/plain",
  },
  async () => ({
    contents: [{ uri: "info://server", text: "Server information" }],
  })
);
```

Resource template (parameterized URI family), callback signature is `(uri, params, ctx)`:

```typescript
server.resourceTemplate(
  {
    name: "user-profile",
    uriTemplate: "user://{id}",
    description: "User profile",
    mimeType: "text/plain",
  },
  async (uri, params, ctx) => ({
    contents: [{ uri: uri.href, text: `User: ${params.id}` }],
  })
);
```

A resource callback must supply its `readCallback` either inline as the second argument to `.resource()`/`.resourceTemplate()`, or as the `readCallback` field on the definition — one or the other is required.

## Prompts

Prompt arguments use `schema` (Zod), same as tools — there is no separate `arguments` property.

```typescript
server.prompt(
  {
    name: "greeting",
    description: "Create a greeting",
    schema: z.object({ name: z.string() }),
  },
  async ({ name }) => ({
    messages: [
      { role: "user", content: { type: "text", text: `Greet ${name}` } },
    ],
  })
);
```

## Context (`ctx`)

Tool, resource, and prompt callbacks receive a context object as an extra argument.

```typescript
async ({ value }, ctx) => {
  ctx.log("info", `Processing ${value}`); // level first, then message — always both
  return text(`Processed: ${value}`);
}
```

`ctx.requestHeaders`/`ctx.auth` are used with the auth-header-forwarding helpers — see auth.md.

`ctx` has more than logging — reach for these instead of hand-rolling the equivalent:

| Member | Purpose |
|---|---|
| `ctx.sample(prompt, options?)` | Ask the connected client's LLM to sample a completion |
| `ctx.elicit(message, zodSchema)` | Ask the client to collect structured input from the end user (a form); resolves with `{ ...ElicitResult, data? }` |
| `ctx.askUrl(message, url, options?)` / `ctx.finishAskUrl(id)` | Ask the client to open an external URL (OAuth, checkout) and signal completion afterward |
| `ctx.reportProgress(progress, total?, message?)` | Report progress on a long-running call |
| `ctx.abort` | An `AbortSignal` that fires when the client cancels the call — pass to `fetch(url, { signal: ctx.abort })` |
| `ctx.sessionId` | The transport session this call belongs to, if any |
| `ctx.auth` | The authenticated caller (`AuthInfo`), only set on HTTP requests when `auth` is configured — see auth.md |

## Starting the server

Default transport is `stdio` — `await server.listen()` is equivalent to `await server.listen({ transport: "stdio" })`. Use stdio when an MCP host launches the server itself as a child process.

```typescript
await server.listen({ transport: "stdio" }); // result: { transport: "stdio" }
```

HTTP transport:

```typescript
const result = await server.listen({ transport: "http", port: 4000 });
console.log(result.url); // e.g. "http://localhost:4000/mcp"
```

HTTP `listen()` result shape:

```typescript
{ transport: "http", port: 4000, host: "localhost", url: "http://localhost:4000/mcp" }
```

Other HTTP options:

- `host` — default `localhost`; use `"0.0.0.0"` to listen on all interfaces.
- `basePath` (set on `MCPServer`, not `listen()`) — default `/mcp`.
- `silent: true` — suppress the HTTP startup console message.
- Pass `0` as `port` to let the OS pick a free port; the actual bound port comes back in the result.

### Port resolution order

1. `listen({ port })` option
2. `--port` (or `--port=N`) CLI argument, read via `parsePortFromArgv()` from `mcpfy-sdk/server`
3. `PORT` environment variable
4. `3000` (fallback)

Each level only applies if the one above it isn't set; an explicit `listen()` port always wins.

## Stopping and refreshing

```typescript
await server.close(); // closes HTTP listener, mounted remotes, and the native MCP server

await server.refreshResource("resource://example"); // one resource's content changed
server.refreshResources(); // tell clients the resource list changed
server.refreshTools();     // tell clients the tool list changed
server.refreshPrompts();   // tell clients the prompt list changed
```

## Complete example

```typescript
import { MCPServer, object, text } from "mcpfy-sdk/server";
import { z } from "zod";

const server = new MCPServer({
  name: "calculator",
  version: "1.0.0",
  description: "A calculator MCP server",
});

server.tool(
  { name: "add", description: "Add two numbers", schema: z.object({ a: z.number(), b: z.number() }) },
  async ({ a, b }) => object({ result: a + b })
);

server.tool(
  { name: "greet", description: "Greet a person", schema: z.object({ name: z.string() }) },
  async ({ name }) => text(`Hello, ${name}!`)
);

await server.listen({ transport: "http", port: 4000 });
```
