# widget-weather

An MCP server with a React widget, using [mcpfy-sdk](https://www.npmjs.com/package/mcpfy-sdk). Same shape as default `create-mcpfy-app` (omit `--no-widget`).

The **tool handler** fetches [Open-Meteo](https://open-meteo.com) on the server. The widget shows that result and looks up a city with `callTool("weather")` through the host (Inspector, ChatGPT, Claude). It does not `fetch` from the iframe. `widget.csp` in `src/server.ts` is commented — uncomment it if the React UI later calls another origin.

| Primitive | Name | Notes |
| --- | --- | --- |
| Tool | `weather` | `widget.dir: "weather"` → `src/widgets/weather/main.tsx` |

No `server.widget()`, HTML file, prompt, or resource. The SDK registers widget HTML for MCP-UI / MCP Apps / Apps SDK from the React folder.

```ts
server.tool(
  {
    name: "weather",
    description: "Look up the current temperature for a city",
    schema: z.object({ city: z.string().default("San Francisco") }),
    outputSchema: z.object({ city: z.string(), temperatureC: z.number() }),
    widget: {
      dir: "weather",
      // If the widget fetch()es another origin (ChatGPT + Claude):
      // csp: { connectDomains: ["https://api.example.com"] },
    },
  },
  async ({ city }) => {
    const geo = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`
    ).then((r) => r.json());
    // ...
  }
);
```

Hooks live in `mcpfy-sdk/widget` (`useToolPayload`, `useCallTool`, …). mcpfy wraps the default-exported component — you do not mount React or detect the host yourself.

## Run

From the `typescript/` workspace root:

```bash
pnpm install
pnpm --filter @mcpfy-examples/widget-weather dev         # starts the server; widgets bundle on listen
pnpm --filter @mcpfy-examples/widget-weather dev:http    # http://localhost:3000/weather
```

HTTP port: `--port N` or `PORT` (default 3000).

Production / ChatGPT (not a step after `dev` — `dev` already runs the server):

```bash
pnpm --filter @mcpfy-examples/widget-weather build       # mcpfy build && tsc
pnpm --filter @mcpfy-examples/widget-weather start
```

## MCP host

Use `mcpfy dev` so widgets bundle. Point `cwd` at this example:

```json
{
  "mcpServers": {
    "widget-weather": {
      "command": "npx",
      "args": ["mcpfy", "dev", "--", "--stdio"],
      "cwd": "/absolute/path/to/examples/widget-weather"
    }
  }
}
```

## MCPClient

stdio (spawns `mcpfy dev`):

```ts
import { MCPClient } from "mcpfy-sdk/client";

const client = new MCPClient({
  mcpServers: {
    weather: { command: "npx", args: ["mcpfy", "dev", "--", "--stdio"] },
  },
});

const session = await client.createSession("weather");
console.log(await session.callTool("weather", { city: "Tokyo" }));
await client.closeAllSessions();
```

HTTP — start `dev:http` first, then:

```ts
const client = new MCPClient({
  mcpServers: { weather: { url: "http://localhost:3000/weather" } },
});
```

## Next steps

- Tools-only (no UI): [`../hello-world`](../hello-world) or `create-mcpfy-app --no-widget`.
- Full API: [mcpfy-sdk](https://www.npmjs.com/package/mcpfy-sdk).
