# create-mcpfy-app

The fastest way to start building an MCP server with **mcpfy**.

Scaffold a production ready MCP server with a single command. You get a working server with a tool, prompt, and resource already wired up so you can start building immediately instead of setting up boilerplate.

## Quick Start

```bash
npx create-mcpfy-app@latest my-server
```

or

```bash
npm create mcpfy-app my-server
```

If you don't provide a project name, you'll be prompted for one.

You'll also choose the default transport:

```text
Which transport should this server use?
  1) stdio  — what most MCP hosts expect (Claude Desktop, Claude Code, Cursor, ...)
  2) http   — serves over HTTP, useful for remote/hosted servers
Select 1 or 2 (default: 1):
```

Once the project is created:

```bash
cd my-server
npm run dev
```

Your server starts using the transport you selected.

You can always run either transport later:

```bash
npm run dev:stdio
npm run dev:http
```

---

## What's Included

```text
my-server/
├── package.json
├── tsconfig.json
├── .gitignore
├── README.md
└── src/
    └── server.ts
```

Inside `server.ts` you'll find:

- ✅ One example tool
- ✅ One example prompt
- ✅ One example resource
- ✅ A fully configured MCP server
- ✅ TypeScript setup with hot reload

Everything is real code. Nothing is hidden behind generators or custom abstractions.

---

## CLI Options

Skip the transport prompt:

```bash
npx create-mcpfy-app@latest my-server --stdio
```

```bash
npx create-mcpfy-app@latest my-server --http
```

or use the explicit form:

```bash
npx create-mcpfy-app@latest my-server --transport stdio
```

Skip dependency installation:

```bash
npx create-mcpfy-app@latest my-server --no-install
```

Choose a package manager:

```bash
npx create-mcpfy-app@latest my-server --pm pnpm
```

Supported package managers:

- npm
- pnpm
- yarn

If no package manager is specified, the CLI automatically uses whichever one launched it.

---

## Why create-mcpfy-app?

Most MCP starters generate hundreds of lines of code before you've written your first tool.

`create-mcpfy-app` keeps things intentionally small.

You get a clean project that's easy to read, easy to modify, and easy to delete the example code from.

The generated server is just normal mcpfy code, so everything you learn transfers directly into your own application.

No magic.

No generated framework.

No unnecessary dependencies.

Just a working MCP server you can start building on.

---

## Next Steps

Open `src/server.ts` and start adding your own:

- Tools
- Prompts
- Resources

Run your server, connect it to your favourite MCP client, and you're ready to build.

---

## License

MIT