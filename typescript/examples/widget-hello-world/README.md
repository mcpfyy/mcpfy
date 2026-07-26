# widget-hello-world

A single widget (a counter) registered for all three UI-resource protocols mcpfy
supports — MCP-UI, MCP Apps (SEP-1865), and Apps SDK (ChatGPT) — at once, via one
`server.widget()` call. See [`src/server.ts`](./src/server.ts) and
[`src/widget.html`](./src/widget.html).

## Run

```bash
pnpm --filter @mcpfy-examples/widget-hello-world start:stdio
```

## What actually gets registered

- **Tool** `counter` — `_meta.ui.resourceUri` (MCP Apps) and `_meta["openai/outputTemplate"]`
  (Apps SDK) both point at standalone resources; calling it also embeds the widget's HTML
  directly in the response content (MCP-UI's convention — no separate fetch needed).
- **Resource** `ui://counter/mcp-apps.html` — `text/html;profile=mcp-app`, fetched separately
  by MCP Apps hosts.
- **Resource** `ui://counter/apps-sdk.html` — `text/html+skybridge`, fetched separately by
  ChatGPT.
- **Tool** `increment-counter` — what the widget calls back into to bump the count.

## Verifying this without a real host

There's no real ChatGPT/Claude Desktop/MCP-Apps-compatible host in this repo to render the
widget in — that half is inherently untestable outside an actual host. What *is* fully
testable (and what `packages/mcpfy/tests/server-widget.test.ts` verifies) is that the server
produces the right shape for each protocol. You can check it by hand with `mcpfy-sdk/client`:

```ts
import { MCPClient } from "mcpfy-sdk/client";

const client = new MCPClient({ mcpServers: { app: { command: "tsx", args: ["src/server.ts"] } } });
const session = await client.createSession("app");

console.log(await session.listTools()); // note the _meta.ui / _meta["openai/*"] pointers
console.log(await session.callTool("counter")); // note the embedded MCP-UI resource block
console.log(await session.readResource("ui://counter/mcp-apps.html"));
console.log(await session.readResource("ui://counter/apps-sdk.html"));
```

## `src/widget.html`

Deliberately self-contained (no bundler, no import of `mcpfy-sdk/widget-bridge`) so it works
dropped into any host verbatim — it hand-rolls the same detection logic
`mcpfy-sdk/widget-bridge`'s `connect()`/`postToolCall()` do, so you can see exactly what those
helpers save you from writing yourself. A real widget built with your own bundler would
import them directly instead.
