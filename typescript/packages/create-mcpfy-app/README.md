# create-mcpfy-app

The fastest way to start building an MCP server with **mcpfy**.

```bash
npx create-mcpfy-app@latest
```

The CLI asks for name, transport, and auth. A **React widget is included by default**.
Pass `--no-widget` if you only want tools / prompts / resources.

## Quick Start

```bash
npx create-mcpfy-app@latest my-server
```

or

```bash
npm create mcpfy-app my-server
```

```bash
cd my-server
npm run dev
```

No UI:

```bash
npx create-mcpfy-app@latest my-server --no-widget
```

## What's included

**Default (widget):**

```text
└── src/
    ├── server.ts                 # tool({ widget: "weather" }) fetches Open-Meteo
    └── widgets/weather/main.tsx  # React UI; Lookup via callTool
```

`widget: "weather"` is the folder name under `src/widgets/`.

**`--no-widget`:**

```text
└── src/server.ts      # add tool + greeting resource + greet prompt
```

Widget apps get `mcpfy dev` / `mcpfy build` scripts. `react` and `react-dom` come
from the template — you still do **not** install Vite.

---

## CLI options

```bash
npx create-mcpfy-app@latest my-server --stdio
npx create-mcpfy-app@latest my-server --http --port 4000
npx create-mcpfy-app@latest my-server --no-widget
npx create-mcpfy-app@latest my-server -y --no-install
```

| Flag | Meaning |
| --- | --- |
| `--stdio` / `--http` / `--transport` | default transport |
| `--auth none\|header\|oauth` | listener auth |
| `--port N` | HTTP port baked into scripts |
| `--no-widget` | skip React UI (tools/prompts/resources only) |
| `--widget` | force the widget template (default) |
| `--tailwind` | Tailwind CSS for the widget (`@import "tailwindcss"` in `styles.css`) |
| `--pm npm\|pnpm\|yarn` | package manager |
| `--no-install` | skip `install` |
| `-y`, `--yes` | skip prompts (stdio, no auth, **with widget**) |

If no package manager is specified, the CLI uses whichever one launched it.

---

## License

MIT
