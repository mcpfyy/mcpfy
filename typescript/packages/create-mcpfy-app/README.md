# create-mcpfy-app

Scaffold a working [mcpfy](https://www.npmjs.com/package/mcpfy-sdk) MCP server — one tool, one
prompt, one resource, already wired up — with a single command.

## Usage

```bash
npx create-mcpfy-app@latest my-server
# or
npm create mcpfy-app my-server
```

If you don't pass a project name, you'll be prompted for one. You'll then be asked which
**transport** to default to:

```
Which transport should this server use?
  1) stdio  — what most MCP hosts expect (Claude Desktop, Claude Code, Cursor, ...)
  2) http   — serves over HTTP, useful for remote/hosted servers
Select 1 or 2 (default: 1):
```

Then:

```bash
cd my-server
npm run dev   # starts with whichever transport you picked
```

The generated project always has `dev:stdio` and `dev:http` scripts too, regardless of your
default choice, so you can run either transport on demand without editing anything.

## Options

```bash
npx create-mcpfy-app@latest my-server --stdio             # skip the prompt, default to stdio
npx create-mcpfy-app@latest my-server --http              # skip the prompt, default to http
npx create-mcpfy-app@latest my-server --transport stdio   # equivalent, explicit form
npx create-mcpfy-app@latest my-server --no-install         # skip the automatic package install
npx create-mcpfy-app@latest my-server --pm pnpm            # force a specific package manager
```

By default, the package manager that launched the CLI (npm/pnpm/yarn) is auto-detected and used
to install dependencies after scaffolding.

## What you get

```
my-server/
├── package.json
├── tsconfig.json
├── .gitignore
├── README.md
└── src/
    └── server.ts   # one tool (add), one resource (app://greeting), one prompt (greet)
```

`src/server.ts` is a complete, runnable [`mcpfy`](https://www.npmjs.com/package/mcpfy-sdk) server —
open it, add your own `.tool()`/`.prompt()`/`.resource()` calls, and you're building. No
generated abstractions to learn beyond the SDK itself.

## Why this exists

mcpfy's whole pitch is "small enough to read end to end" — but nobody wants to hand-copy
boilerplate to get started. This scaffolder is intentionally minimal too: it has **zero runtime
dependencies** beyond Node.js itself (no Ink, no `commander`, no template-fetching over the
network) — it just copies a bundled template and runs your package manager's install.

## License

MIT — see the [repo LICENSE](../../../LICENSE).
