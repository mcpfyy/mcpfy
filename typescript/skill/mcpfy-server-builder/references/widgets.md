# Widgets

Widgets give a tool an interactive UI instead of (or alongside) plain text/structured output. Read this file whenever a task involves an MCP App / interactive widget, not just a plain tool result.

## Table of Contents

- [Widgets](#widgets)
  - [Table of Contents](#table-of-contents)
  - [Directory convention](#directory-convention)
  - [Registering a widget on a tool](#registering-a-widget-on-a-tool)
  - [The widget entry file](#the-widget-entry-file)
  - [Widget content shape (when returning content directly, not via a bound tool)](#widget-content-shape-when-returning-content-directly-not-via-a-bound-tool)
  - [Widget size](#widget-size)
  - [CLI](#cli)
  - [React hooks (`mcpfy-sdk/widget`)](#react-hooks-mcpfy-sdkwidget)
  - [Troubleshooting](#troubleshooting)

## Directory convention

```text
my-mcp-server/
└── src/
    ├── server.ts
    └── widgets/
        └── weather/
            └── main.tsx
```

The widget's name is its directory name under `src/widgets` (or under `MCPServerConfig.widgetsDir` if customized — default is `src/widgets`). The entry file is always `main.tsx`.

**The widget's `main.tsx` must exist before the server starts.** Registering `widget: "weather"` without a matching `src/widgets/weather/main.tsx` breaks startup — always create the file first (or in the same change).

## Registering a widget on a tool

```typescript
import { MCPServer, object } from "mcpfy-sdk/server";
import { z } from "zod";

server.tool(
  {
    name: "weather",
    description: "Get the current weather",
    schema: z.object({ city: z.string() }),
    widget: "weather", // must match src/widgets/weather/
  },
  async ({ city }) => object({ city, temperature: 24, condition: "Sunny" })
);
```

## The widget entry file

```tsx
// src/widgets/weather/main.tsx
import React from "react";

export default function Weather() {
  return (
    <div>
      <h1>Weather</h1>
      <p>Weather information will appear here.</p>
    </div>
  );
}
```

The mcpfy widget runtime automatically wraps this standard entry point with `ThemeProvider` and `HostRuntime` — **do not** add another `ThemeProvider`/`HostRuntime` around it here. That manual wrapping is only for an advanced standalone mount outside the standard `main.tsx` pipeline (see "React hooks" below).

## Widget content shape (when returning content directly, not via a bound tool)

Always the structured form, never a bare string:

```typescript
{ type: "html", html: "<div>Hello</div>" }
```

or

```typescript
{ type: "url", url: "https://example.com/widget" }
```

## Widget size

A `[width, height]` tuple of CSS length strings:

```typescript
size: ["800px", "600px"]
```

Not a keyword like `size: "full"`.

## CLI

```bash
mcpfy dev     # widget development workflow; rebuilds on change
mcpfy build   # production build — run before starting a server that has widgets
```

A production server that serves a registered widget expects the built assets to already exist — always run `mcpfy build` as part of the deploy step, not just `mcpfy dev`.

## React hooks (`mcpfy-sdk/widget`)

Install `react` and `react-dom` (peer dependencies) alongside `mcpfy-sdk` for widget code. Common hooks, all used inside the standard `main.tsx` (which already has the runtime):

| Hook / component                        | Purpose                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------- |
| `useToolPayload()`                      | `{ input, output, isPending, error }` for the tool this widget is bound to              |
| `useCallTool()` / `useCallTool("name")` | Call an MCP tool from the widget; named form returns `{ call, isPending, data, error }` |
| `useLinkedTool()`                       | `{ name, call }` for the tool this widget is bound to, for calling it again             |
| `useHostContext()`                      | `{ protocol, layoutMode, locale, platform, capabilities }`                              |
| `useHostProtocol()`                     | `"apps-sdk" \| "mcp-apps" \| "mcp-ui" \| "none"`                                        |
| `useHostTheme()`                        | `"light" \| "dark"`                                                                     |
| `useLayoutMode()`                       | `{ mode, available, request(mode) }`                                                    |
| `useWidgetState()`                      | `{ state, setState }` — host-persisted, survives remounts when supported                |
| `useViewState(initial)`                 | `[state, setState]` combining local state + host persistence + model context            |
| `useModelContext()`                     | `{ supported, publish({ text, structuredContent }) }` — publish state to the model      |
| `useViewTool(definition, handler)`      | Registers a tool the host/model can call while this widget is mounted                   |
| `useSendFollowUp()`                     | Send a follow-up chat message as if the user typed it                                   |
| `useOpenExternal()`                     | Open an external URL through the host                                                   |
| `HostImage`                             | `<img>` replacement defaulting `referrerPolicy` to `no-referrer`                        |

Example:

```tsx
import { useToolPayload, useCallTool } from "mcpfy-sdk/widget";

export default function Weather() {
  const { output, isPending, error } = useToolPayload();
  const getWeather = useCallTool("weather");

  if (isPending) return <p>Loading...</p>;
  if (error) return <p>{error.message}</p>;

  return (
    <div>
      <p>Temperature: {String(output?.temperature ?? "Unknown")}°C</p>
      <button onClick={() => getWeather.call({ city: "Delhi" })}>Refresh</button>
    </div>
  );
}
```

Always check `capabilities` from `useHostContext()` before relying on an optional feature (e.g. `useViewTool`, `useModelContext`) — not every MCP host supports every capability, and unsupported calls become no-ops rather than errors.

## Troubleshooting

- **Widget not found** — confirm `widget: "weather"` matches the directory `src/widgets/weather/` exactly, and that `main.tsx` exists inside it.
- **Fails only in production** — you forgot `mcpfy build`; the production server needs built widget assets, `mcpfy dev` alone isn't enough.
- **Invalid widget content error** — you passed a bare HTML string instead of `{ type: "html", html: "..." }`.
- **Invalid widget size error** — you passed a keyword string instead of a `[width, height]` tuple.
