# my-mcp-server

A starter MCP server built with [mcpfy-sdk](https://github.com/mcpfyy/mcpfy).

## Setup

```bash
npm install
npm run dev
```

This starts the server over stdio (the default transport), ready for an MCP host to launch it as a child process.

## What's included

- `src/server.ts` — server setup and two plain tools (`add`, `greet`) plus one widget-bound tool (`example-widget`).
- `src/widgets/example/main.tsx` — the interactive widget UI for `example-widget`.

## Next steps

- Add more tools with `server.tool(...)` — see the `mcpfy-server-builder` skill's `references/server.md`.
- To expose this over HTTP instead of stdio, change the `server.listen(...)` call at the bottom of `src/server.ts` to `{ transport: "http", port: 4000 }`.
- If you add or change widgets, run `mcpfy dev` while developing and `mcpfy build` before any production start.
