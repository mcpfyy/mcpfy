# mcpfy

A minimal TypeScript SDK for building and consuming MCP (Model Context Protocol) **tools,
prompts, resources, and UI widgets** — wrapping the official [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk)
with a small, declarative API. Both stdio and HTTP transports, on the server and the client.
Widgets are supported across all three real-world UI-resource conventions — MCP-UI, MCP Apps
(SEP-1865), and Apps SDK (ChatGPT) — from one `server.widget()` call.

No bundled Inspector, no CLI, no OAuth, no telemetry. See the [repo README](../../../README.md)
for the project's overall scope.

## Install

```bash
npm install mcpfy-sdk zod
```

`zod` is a peer dependency — you provide your own version (`^3.25.0` or `^4.0.0`).

## Quickstart

```ts
import { MCPServer, text } from "mcpfy-sdk/server";

const server = new MCPServer({ name: "my-server", version: "1.0.0" });

server.tool({ name: "hello", description: "Say hello" }, async () => text("Hello, World!"));

await server.listen(); // stdio by default
```

Prefer not writing this by hand? `npx create-mcpfy-app@latest` scaffolds it for you.

## Server API (`mcpfy-sdk/server`)

### `new MCPServer(config)`

```ts
interface MCPServerConfig {
  name: string;
  version: string;
  description?: string;
}
```

Wraps the official SDK's `McpServer`. The instance is available as `server.nativeServer` for
any advanced/escape-hatch use the declarative API doesn't cover.

### `.tool(definition, callback?)`

```ts
server.tool(
  {
    name: "add",
    description: "Add two numbers",
    schema: z.object({ a: z.number(), b: z.number() }), // input, a z.object(...)
    outputSchema: z.object({ sum: z.number() }),          // optional — constrains structuredContent
  },
  async ({ a, b }, ctx) => object({ sum: a + b })
);
```

The callback's second argument is a [`ToolContext`](#toolcontext) (see below). You can pass the
callback either as the definition's `cb` field or as the second argument — whichever reads
better at the call site.

### `.prompt(definition, callback?)`

```ts
server.prompt(
  { name: "greet", schema: z.object({ name: z.string() }) },
  async ({ name }) => text(`Hello, ${name}!`)
);
```

A prompt callback can return either a raw `{ messages: [...] }` (`GetPromptResult`) or one of
the response helpers below — `text()`/`markdown()`/`object()` results get converted into a
single user message automatically.

### `.resource(definition, callback?)` — static URI

```ts
server.resource(
  { name: "greeting", uri: "app://greeting", title: "Greeting" },
  async () => markdown("# Hello!")
);
```

### `.resourceTemplate(definition, callback?)` — dynamic URI

```ts
server.resourceTemplate(
  { name: "user-profile", uriTemplate: "user://{userId}/profile" },
  async (uri, params) => object({ userId: params.userId })
);
```

`uriTemplate` uses the SDK's own URI-template matching (`user://{userId}/profile` style).
`params` is the extracted variables as strings.

### `.widget(definition, callback?)` — interactive UI resources

```ts
server.widget(
  {
    name: "counter",
    description: "A counter widget",
    content: { type: "html", html: "<html>...</html>" }, // or { type: "url", url: "..." }
    protocols: ["mcp-ui", "mcp-apps", "apps-sdk"],          // optional — defaults to all three
  },
  async () => object({ count: 0 })
);
```

Registers one tool (paired with the widget) plus whichever standalone resources each requested
protocol needs, with correct mimeTypes and `_meta` pointers for each:

| Protocol | Delivery | mimeType |
|---|---|---|
| `mcp-ui` | embedded directly in the tool's `CallToolResult.content` | `text/html;profile=mcp-app` (via `@mcp-ui/server`'s own default) |
| `mcp-apps` | standalone resource, `_meta.ui.resourceUri` pointer on the tool | `text/html;profile=mcp-app` |
| `apps-sdk` | standalone resource, `_meta["openai/outputTemplate"]` pointer on the tool | `text/html+skybridge` |

**`content` must be pre-built, self-contained HTML** (or a URL to iframe) — mcpfy does not
compile, bundle, or hot-reload anything. Author your widget however you like (React+Vite, plain
HTML, whatever) and hand `.widget()` the finished output. See
[`examples/widget-hello-world`](../../examples/widget-hello-world) for a complete example,
including a widget that talks back to the host — see `mcpfy-sdk/widget-bridge` below for that half.

### `.listen(options?)`

```ts
await server.listen();                                   // stdio (default)
await server.listen({ transport: "http", port: 3000 });  // HTTP, POST /mcp
```

Stdio is the default because it's what most MCP hosts (Claude Desktop, Claude Code, Cursor,
etc.) expect when they spawn a server as a child process. HTTP requests to `/mcp` are handled
in **stateless mode** — each request gets its own transport, serialized through an internal
queue. See the source comments in [`src/server/transport.ts`](./src/server/transport.ts) for
the reasoning.

### `ToolContext`

The second argument passed to every tool/prompt/resource callback:

```ts
interface ToolContext {
  sample(prompt: string, options?: SampleOptions): Promise<CreateMessageResult>;
  elicit<T extends z.ZodObject<any>>(message: string, schema: T): Promise<ElicitResult & { data?: z.infer<T> }>;
  reportProgress(progress: number, total?: number, message?: string): Promise<void>;
  log(level: "debug" | "info" | "notice" | "warning" | "error", message: string): Promise<void>;
  sessionId?: string;
}
```

### Response helpers (`mcpfy-sdk/server`)

```ts
text(content: string)              // plain text content
markdown(content: string)          // text content tagged mimeType: text/markdown
image(data: string, mimeType?)     // base64 image content, default image/png
object(data: Record<string, any>)  // JSON text + structuredContent
error(message: string)             // isError: true result
```

These work as return values from tool, prompt, and resource callbacks alike.

## Client API (`mcpfy-sdk/client`)

```ts
import { MCPClient } from "mcpfy-sdk/client";

const client = new MCPClient({
  mcpServers: {
    // stdio server:
    local: { command: "node", args: ["server.js"] },
    // or an HTTP server:
    remote: { url: "https://example.com/mcp" },
  },
});

const session = await client.createSession("local");
await session.listTools();
await session.callTool("add", { a: 2, b: 3 });
await session.listPrompts();
await session.getPrompt("greet", { name: "World" });
await session.listResources();
await session.readResource("app://greeting");
await client.closeAllSessions();
```

`command` in a server config selects the stdio connector; `url` selects the HTTP (Streamable
HTTP) connector. `client.createAllSessions()` connects to every configured server at once.

## Widget bridge (`mcpfy-sdk/widget-bridge`)

A small **browser-only** bundle you import from inside a widget's own HTML/JS — not from your
server code — so the widget can talk back to whichever host it's running in.

```ts
import { connect, postToolCall } from "mcpfy-sdk/widget-bridge";

const { protocol, openai, app } = await connect({ name: "counter-widget", version: "1.0.0" });

if (protocol === "apps-sdk") {
  await openai.callTool("increment-counter", {});
} else if (protocol === "mcp-apps") {
  await app.callServerTool({ name: "increment-counter", arguments: {} });
} else if (protocol === "mcp-ui") {
  postToolCall("increment-counter", {}); // fire-and-forget, MCP-UI has no request/response handshake
}
```

- **Apps SDK**: `connect()` just reads the host-injected `window.openai` — there's no handshake,
  nothing to connect.
- **MCP Apps**: wraps the *official* `App` class from `@modelcontextprotocol/ext-apps` (the spec
  owners' own postMessage/JSON-RPC implementation — mcpfy doesn't reimplement this).
- **MCP-UI**: `postToolCall`/`postPrompt`/`postLink`/`postIntent`/`postNotify` send the one-way
  `postMessage` "UI actions" MCP-UI hosts expect — there's no connect handshake for this one.

Import the pieces directly (`connectMcpApps`, `App`, `PostMessageTransport` from the MCP Apps
side; `postToolCall` etc. for MCP-UI) if you'd rather not use the auto-detecting `connect()`.

## Examples

- [`examples/hello-world`](../../examples/hello-world) — one tool, one prompt, one resource,
  matching client snippets for both transports.
- [`examples/widget-hello-world`](../../examples/widget-hello-world) — a widget registered for
  all three UI-resource protocols at once.

## License

MIT — see the [repo LICENSE](../../../LICENSE).
