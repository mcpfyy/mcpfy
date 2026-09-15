# {{PROJECT_NAME}}

An MCP server built with [mcpfy](https://www.npmjs.com/package/mcpfy-sdk) — exposes one tool
(`add`), one resource (`app://greeting`), and one prompt (`greet`).

## Run

```bash
npm run dev          # runs with the {{DEFAULT_TRANSPORT}} transport (chosen when this project was scaffolded)
npm run dev:stdio    # force stdio transport
npm run dev:http     # force HTTP on port {{DEFAULT_PORT}}
npm run dev:http -- --port 8080   # override port for one run
PORT=8080 npm run dev:http        # or via env
```

On HTTP start the SDK prints the local MCP URL, e.g. `MCP server listening on http://localhost:{{DEFAULT_PORT}}/hello  (port {{DEFAULT_PORT}})`.

{{AUTH_SETUP}}

## Use it in an MCP host

{{HOST_CONNECTION}}

## Next steps

- Add more tools/prompts/resources in `src/server.ts` — see the
  [mcpfy docs](https://www.npmjs.com/package/mcpfy-sdk) for the full API.
- `npm run build && npm start` to run the compiled version.
