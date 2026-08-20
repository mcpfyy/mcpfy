# mcpfy — TypeScript

pnpm workspace for the TypeScript SDK. Full API: [`packages/mcpfy/README.md`](./packages/mcpfy/README.md).

## Packages

- [`packages/mcpfy`](./packages/mcpfy) — npm: **`mcpfy-sdk`**
  - `mcpfy-sdk/server` — `MCPServer`, tools / prompts / resources, `tool({ widget })`
  - `mcpfy-sdk/client` — `MCPClient`
  - `mcpfy-sdk/widget` — React hooks (`useCallTool`, `useToolPayload`, …)
  - `mcpfy-sdk/widget-bridge` — low-level host `connect` / `postToolCall` (non-React)
  - `mcpfy` CLI — `mcpfy dev` / `mcpfy build` for widget HTML
- [`packages/create-mcpfy-app`](./packages/create-mcpfy-app) — scaffolder. **React widget by default**; `--no-widget` for tools/prompts/resources only.
- [`packages/mcpfy-pulse`](./packages/mcpfy-pulse) — optional telemetry (`MCPFY_API_KEY`)

## Examples

- [`examples/hello-world`](./examples/hello-world) — same MCP as `create-mcpfy-app --no-widget` (`add`, greeting resource, `greet` prompt).
- [`examples/widget-weather`](./examples/widget-weather) — same MCP as default `create-mcpfy-app` (`widget: "weather"` → `src/widgets/weather`). Tool fetches Open-Meteo; widget uses `callTool`.

## Development

Node.js 20.19+ (or 22.12+) and pnpm 10+.

```bash
pnpm install
pnpm build     # mcpfy-sdk (and workspace builds)
pnpm test      # mcpfy-sdk vitest
```

```bash
pnpm --filter mcpfy-sdk build
pnpm --filter mcpfy-sdk test

pnpm --filter create-mcpfy-app build
# Local scaffold (not npm):
node packages/create-mcpfy-app/dist/bin.js my-app --no-install
node packages/create-mcpfy-app/dist/bin.js my-app --no-widget --no-install
```

### Tests

Real `MCPServer` + `MCPClient` round-trips — no mocked SDK internals. See `packages/mcpfy/tests/` (`stdio-roundtrip.test.ts`, `http-roundtrip.test.ts`, widget bundle tests, and others).

## Quick start

Tools only (`schema` / `outputSchema`):

```ts
import { MCPServer, object } from "mcpfy-sdk/server";
import { z } from "zod";

const server = new MCPServer({ name: "my-server", version: "1.0.0" });

server.tool(
  {
    name: "add",
    description: "Add two numbers",
    schema: z.object({ a: z.number(), b: z.number() }),
    outputSchema: z.object({ sum: z.number() }),
  },
  async ({ a, b }) => object({ sum: a + b })
);

await server.listen(); // stdio; `{ transport: "http" }` for HTTP (--port / PORT / 3000)
```

Widget UI — React folder, not `server.widget()` / raw HTML:

```ts
server.tool(
  {
    name: "weather",
    description: "Look up current weather for a city",
    schema: z.object({ city: z.string().default("San Francisco") }),
    outputSchema: z.object({ city: z.string(), temperatureC: z.number() }),
    widget: "weather", // src/widgets/weather/main.tsx
  },
  async ({ city }) => {
    const geo = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`
    ).then((r) => r.json());
    const place = geo.results[0];
    const forecast = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m`
    ).then((r) => r.json());
    return object({ city: place.name, temperatureC: forecast.current.temperature_2m });
  }
);
```

Run widgets with `mcpfy dev` (or `listen()` after a bundle). UI hooks: `mcpfy-sdk/widget`.

```ts
import { MCPClient } from "mcpfy-sdk/client";

const client = new MCPClient({
  mcpServers: { myServer: { command: "npx", args: ["tsx", "src/server.ts", "--stdio"] } },
});

const session = await client.createSession("myServer");
console.log(await session.callTool("add", { a: 2, b: 3 }));
await client.closeAllSessions();
```

See [`packages/mcpfy/README.md`](./packages/mcpfy/README.md) and the [examples](#examples).
