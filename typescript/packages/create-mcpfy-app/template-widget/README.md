# {{PROJECT_NAME}}

An MCP server with a **weather widget**. `server.tool({ widget: { dir: "weather" } })` points at
`src/widgets/weather/` (React). mcpfy-sdk bundles it — no `server.widget()`, no HTML file,
no prompt/resource required.

The `weather` tool fetches temperature from [Open-Meteo](https://open-meteo.com) on the server.
Lookup in the widget calls that tool through the host (`callTool`) — the iframe does not `fetch` the API.

If `main.tsx` later `fetch`es another origin, uncomment `widget.csp.connectDomains` in `src/server.ts`. ChatGPT and Claude apply it; Inspector often does not.

## Run

Local (starts the MCP server; widgets are bundled on listen — no separate build first):

```bash
npm run dev          # default transport: {{DEFAULT_TRANSPORT}}
npm run dev:stdio
npm run dev:http     # HTTP on port {{DEFAULT_PORT}}
```

Production / ChatGPT (iframes cannot use a one-off `dev` bundle the same way):

```bash
npm run build        # mcpfy build && tsc
npm start
```

## Use it in an MCP host

```json
{
  "mcpServers": {
    "{{PROJECT_NAME}}": {
      "command": "npx",
      "args": ["mcpfy", "dev", "--", "--stdio"],
      "cwd": "/absolute/path/to/this-project"
    }
  }
}
```

## Next steps

- UI: `src/widgets/weather/main.tsx` (`mcpfy-sdk/widget` hooks)
- Tools without UI: omit `widget` on `server.tool()`
- [mcpfy docs](https://www.npmjs.com/package/mcpfy-sdk)
