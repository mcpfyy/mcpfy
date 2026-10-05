# widget-mcpcn

An order-tracking MCP server using [mcpfy-sdk](../../packages/mcpfy) and real
[mcpcn](https://www.mcpcn.dev/) React components. No API keys or external services
are needed: the server returns three local demo orders.

| Tool | Widget | Demo orders |
| --- | --- | --- |
| `track_order` | `src/widgets/order-tracker/` | `MCP-1001` (shipped), `MCP-1002` (processing), `MCP-1003` (delivered) |

Ask an MCP host: **“Track order MCP-1001.”** The widget shows the order with
mcpcn's `StatusBadge` and `ProgressSteps`. Its `QuickReply` buttons and lookup form
call `track_order` through `useCallTool()`. `useToolPayload()` receives the result;
`useHostTheme()` applies the host's light or dark theme. An unknown order displays
the server's error and lets you try again.

## Run locally

From the `typescript/` workspace root, using Node.js 20.19+ or 22.12+ and pnpm 10+:

```bash
pnpm install
pnpm --filter mcpfy-sdk build
pnpm --filter @mcpfy-examples/widget-mcpcn dev:http
```

Connect an MCP host or the MCPfy Inspector to `http://localhost:3000/mcp` and call
`track_order` with `{ "orderId": "MCP-1001" }` (or `{}` for the default order).
The endpoint speaks MCP; it is not a standalone web page. The host renders the
widget returned by the tool. Use `PORT=3001` to change the HTTP port.

For a production build or stdio:

```bash
pnpm --filter @mcpfy-examples/widget-mcpcn typecheck
pnpm --filter @mcpfy-examples/widget-mcpcn build
pnpm --filter @mcpfy-examples/widget-mcpcn start:http
# Or run the built server with stdio:
pnpm --filter @mcpfy-examples/widget-mcpcn start:stdio
```

After building, configure a local MCP host with the example as its working directory:

```json
{
  "mcpServers": {
    "mcpcn-orders": {
      "command": "node",
      "args": ["dist/server.js", "--stdio"],
      "cwd": "/absolute/path/to/mcpfy/typescript/examples/widget-mcpcn"
    }
  }
}
```

For development, use `pnpm dev` from this directory instead; it bundles the widget
and starts the stdio server.

## How mcpcn fits the SDK

mcpcn follows the shadcn model: install component source into your project rather
than import a `mcpcn` npm package. This example includes the official registry
source and its [MIT license](./THIRD_PARTY_LICENSES.md), so running it requires no
registry setup step.

- `src/server.ts` registers `track_order` with `widget: { dir: "order-tracker" }`
  and a Zod output schema. Replace its fixtures with your own server-side API call.
- `src/components/ui/` contains mcpcn's `status-badge`, `progress-steps`, and
  `quick-reply`. The widget composes their exported child components with data
  from the tool result.
- `src/styles/apps-sdk.css` is mcpcn's scoped Apps SDK theme. The widget applies
  `data-apps-sdk-ui` and the SDK's host theme.
- `src/widgets/order-tracker/styles.css` imports Tailwind v4, declares the semantic
  color tokens, and scans `src/`, including the copied components. The SDK already
  runs the Tailwind Vite plugin and inlines the resulting CSS and JS into widget
  HTML for MCP Apps, ChatGPT Apps SDK, and MCP-UI.

`components.json` configures the `@mcpcn` registry for adding more blocks:

```bash
# From this example directory:
pnpm dlx shadcn@latest add @mcpcn/stat-card
```

The shadcn CLI generates `@/` imports. Convert those imports to relative paths,
as in the included components: the SDK's widget bundler does not configure a
Vite `@` alias. Import any additional theme CSS from the widget's `styles.css`.
There is no need to create a separate React root or configure a second Vite build.

Documentation: [mcpcn installation](https://www.mcpcn.dev/docs/installation),
[mcpcn registry](https://www.mcpcn.dev/docs/registry),
[SDK widget API](../../packages/mcpfy/README.md).
