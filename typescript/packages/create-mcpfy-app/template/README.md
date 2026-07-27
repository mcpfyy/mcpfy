# {{PROJECT_NAME}}

An MCP server built with [mcpfy](https://www.npmjs.com/package/mcpfy-sdk) — exposes one tool
(`add`), one resource (`app://greeting`), and one prompt (`greet`).

## Run

```bash
npm run dev          # runs with the {{DEFAULT_TRANSPORT}} transport (chosen when this project was scaffolded)
npm run dev:stdio    # force stdio transport
npm run dev:http     # force HTTP transport on :3000
```

## Use it in an MCP host

Most hosts (Claude Desktop, Claude Code, Cursor, etc.) launch servers over stdio — point your
host's MCP config at this project with the `--stdio` flag so it works regardless of this
project's default:

```json
{
  "mcpServers": {
    "{{PROJECT_NAME}}": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/src/server.ts", "--stdio"]
    }
  }
}
```

## Next steps

- Add more tools/prompts/resources in `src/server.ts` — see the
  [mcpfy docs](https://www.npmjs.com/package/mcpfy-sdk) for the full API.
- `npm run build && npm start` to run the compiled version.
