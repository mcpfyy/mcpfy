# mcpfy-pulse

Telemetry for MCP servers. Captures method names, payload sizes, durations, and outcomes
for every JSON-RPC request an MCP server handles — never argument values, never resource
content. See [`telemetry-master-plan.md`](../../../../telemetry-master-plan.md) for the
full design.

There are exactly three ways to use this. Pick the one that matches your situation — none
of them edit your files for you.

## 1. You're using `mcpfy-sdk`

Nothing to install or import. Set one environment variable:

```bash
MCPFY_API_KEY=mk_live_xxx node dist/server.js
```

`mcpfy-sdk` checks for `MCPFY_API_KEY` internally and wraps its own transport
automatically. Unset the variable and nothing changes — no code path is even touched.

## 2. You have a raw `@modelcontextprotocol/sdk` server (source available)

```ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { withMcpfyTelemetry } from "mcpfy-pulse";

const transport = new StdioServerTransport();
await server.connect(
  withMcpfyTelemetry(transport, { apiKey: process.env.MCPFY_API_KEY })
);
```

`withMcpfyTelemetry` wraps the `Transport`'s `onmessage`/`send` seam — the two points
every JSON-RPC message passes through regardless of which SDK built the server. If
`apiKey` is unset, it returns the original transport unchanged.

## 3. You're running someone else's server locally (no source access)

Edit your MCP client's config (`claude_desktop_config.json`, Cursor's `mcp.json`, etc.)
to route the command through the proxy:

```jsonc
// before:
"github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"] }

// after:
"github": {
  "command": "npx",
  "args": ["-y", "mcpfy-proxy", "--", "npx", "-y", "@modelcontextprotocol/server-github"],
  "env": { "MCPFY_API_KEY": "mk_live_xxx" }
}
```

`mcpfy-proxy` becomes the process your client spawns. It spawns the real command as its
own child, sits in that child's stdin/stdout, and forwards every byte unchanged while
classifying JSON-RPC messages on the side. Works for any language — Python, Go, Rust,
anything — since it only ever reads newline-delimited JSON off a pipe.

## What gets sent

One event per completed request:

```json
{
  "method": "tools/call",
  "toolName": "create_pull_request",
  "argsBytes": 312,
  "resultBytes": 1024,
  "durationMs": 1840,
  "outcome": "ok",
  "timestamp": "2026-08-06T10:23:15.000Z"
}
```

Batched and POSTed every 5 seconds (or every 500 events, whichever comes first) to
`MCPFY_TELEMETRY_ENDPOINT` (defaults to the MCPFY ingest URL). If the request fails —
including "the endpoint doesn't exist yet," which is currently true, see the master
plan §4/§7 — the batch is silently dropped. Telemetry never throws, never retries
indefinitely, and never delays or blocks the actual MCP traffic it's observing.

## Environment variables

| Variable | Purpose |
|---|---|
| `MCPFY_API_KEY` | Required for any telemetry to be sent. Unset = no-op everywhere. |
| `MCPFY_TELEMETRY_ENDPOINT` | Override the ingest URL (e.g. for local testing). |
| `MCPFY_GATEWAY` | Set internally by MCP-backend for gateway-routed servers, which already log through `McpGatewayLogger` — `mcpfy-sdk` skips wrapping when this is set, to avoid double-counting. Not something you set yourself. |
