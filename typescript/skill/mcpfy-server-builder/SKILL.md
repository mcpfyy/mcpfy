---
name: mcpfy-server-builder
description: Scaffold, build, extend, or debug an MCP (Model Context Protocol) server using the mcpfy-sdk TypeScript package. Use this whenever the user wants to create a new MCP server, add tools/resources/prompts/widgets to an mcpfy project, connect to an MCP server with the mcpfy client, set up OAuth/JWT authentication for an mcpfy server, or build an MCP App widget with mcpfy-sdk/widget. Trigger when the user wants to create, modify, debug, or integrate an MCP server, tool, resource, prompt, widget, or client using mcpfy-sdk.
---

# Build MCP servers with mcpfy

`mcpfy-sdk` is a lightweight TypeScript SDK, built on the official Model Context Protocol SDK, for building MCP servers, MCP clients, and interactive MCP App widgets. This skill scaffolds a working project and implements it correctly against mcpfy's actual API — not guessed or remembered APIs from other MCP frameworks (they differ in import paths, response shapes, and registration signatures).

Treat the reference files in this skill as the source of truth over prior training knowledge of "MCP SDKs" in general — mcpfy has its own conventions (e.g. `object()`/`text()`/`markdown()` result helpers, `schema` instead of `inputSchema`, `widget: "<name>"` tool binding).

## Workflow

1. **Scaffold the project.**
   - Fastest path: `npx create-mcpfy-app@latest` and follow its prompts.
   - If that command isn't available (offline, sandboxed, or the user wants to see exactly what's created), copy the bundled starter in `assets/template/` instead — it's a minimal, working stdio server with example tools and a widget. See "Using the bundled template" below.
2. **Install dependencies.** `mcpfy-sdk` plus `zod` (a required peer dependency whenever a tool/prompt schema is used). Add `react` and `react-dom` only if the project will have widgets.
3. **Read only the reference files the task needs:**
   - [Server](references/server.md) — `MCPServer`, `server.tool()`/`.resource()`/`.resourceTemplate()`/`.prompt()`, result helpers, `ctx`, `listen()`/`close()`, refresh notifications.
   - [Widgets](references/widgets.md) — widget directory convention, binding a widget to a tool, widget content/size shapes, the `mcpfy dev`/`mcpfy build` CLI, and the `mcpfy-sdk/widget` React hooks.
   - [Authentication](references/auth.md) — `oauth.*` provider configurations or `type: "header"` protection for an HTTP server, and client-side OAuth (`mcpfy-sdk/auth`'s `NodeOAuthClientProvider`, `ensureAuthorized`).
   - [Client](references/client.md) — connecting to MCP servers (this one's or someone else's) with `MCPClient`/`MCPSession` over stdio or HTTP.
   - [Troubleshooting](references/troubleshooting.md) — the specific mistakes that break an mcpfy project; check this before telling the user something is done.
4. **Implement.** Write real, runnable TypeScript against the APIs in these references. Prefer small, focused tools (see Core invariants).
5. **Run it.**
   - stdio server: `npm run dev` (or `tsx src/server.ts`) — this is the default transport, meant for an MCP host to launch as a child process.
   - HTTP server: same command, but call `server.listen({ transport: "http", port })`; the endpoint is `http://localhost:<port><basePath>` (default `basePath` is `/mcp`).
   - If widgets are registered: run `mcpfy dev` while developing, and `mcpfy build` before any production start — a widget with no built assets fails at startup.
6. **Verify.** At minimum, confirm the server starts without throwing and that each new tool's schema and result helper match what's documented — don't just eyeball the code. If an MCP client/inspector is available, actually call the new tool once.

## Core invariants

Follow these regardless of which reference file the current task touches — violating them is the single biggest source of broken mcpfy servers:

- Import server APIs from `mcpfy-sdk/server`, client APIs from `mcpfy-sdk/client`, and React widget APIs from `mcpfy-sdk/widget`. There is no useful default export from the bare `mcpfy-sdk` package for these.
- A tool/prompt callback must return one of the SDK's result helpers — `text()`, `markdown()`, or `object()` — never a bare object literal. `object()` is for structured data; don't hand-roll `{ content: [...] }`.
- Define input with `schema: z.object({...})` (Zod), not `inputSchema`. Validation happens before the callback runs.
- `server.listen()` defaults to `transport: "stdio"`. Don't add `transport: "http"` unless the user needs an HTTP endpoint.
- A tool that binds a widget (`widget: "weather"`) requires `src/widgets/weather/main.tsx` to exist *before* the server starts, or startup fails. Keep the widget name identical between the tool registration and the directory name.
- The standard widget entry (`src/widgets/<name>/main.tsx`) is auto-wrapped with `ThemeProvider` and `HostRuntime` by the mcpfy build/runtime pipeline — do not add another `ThemeProvider`/`HostRuntime` there. Only hand-build that wrapping in a manual/standalone mount outside the standard pipeline.
- Widget content is always the structured form — `{ type: "html", html: "..." }` or `{ type: "url", url: "..." }` — never a bare HTML string. Widget `size` is a `[width, height]` tuple of CSS length strings (e.g. `["800px", "600px"]`), never a keyword like `"full"`.
- Configure OAuth with an `oauth.*` helper when possible; it supplies the `type`, verifier, authorization-server metadata, and resource binding together. A raw `type: "oauth"` config requires `authorizationServers`, `verifyToken`, and `resource`; `type: "header"` is the simple bearer-token alternative.
- `ctx.log(level, message)` takes the level first, always two arguments.

## Guardrails

- Don't invent SDK exports, config fields, or callback signatures beyond what's in `references/`. If something the user wants isn't documented there, say so plainly rather than guessing at an API that resembles a different MCP framework.
- Don't silently reach for another MCP framework's conventions (`inputSchema`, `mcp.tool(...)`, bare object returns) just because they're common elsewhere — mcpfy's shapes are different and mixing them produces code that fails at runtime, not just at review time.
- Don't claim a server "works" from a type-check or a source read alone when transport, auth, or widget behavior changed — actually run it (step 6).
- Don't register a widget-bound tool without also creating the widget's `main.tsx`, and don't ship a production start without running `mcpfy build` first if any widgets are registered.
- Don't forward arbitrary inbound HTTP headers upstream; use `forwardAuthHeaders`/`extractForwardableAuthHeaders` when a tool needs to make an authenticated upstream request (see [Authentication](references/auth.md)).

## Using the bundled template

`assets/template/` is a complete, minimal mcpfy project based on the canonical `create-mcpfy-app` scaffold. It includes `package.json`, `tsconfig.json`, `.env.example`, `README.md`, `src/server.ts`, and an example widget at `src/widgets/example/main.tsx` using `useToolPayload`. Copy it into the user's target directory as a starting point, then customize it for the user's server:

```bash
cp -r assets/template/* /path/to/my-mcp-server/
cd /path/to/my-mcp-server
npm install
npm run dev
```

This provides the same baseline structure and configuration as the official mcpfy scaffold, so the generated project stays aligned with the SDK. Spend the effort instead on the tools, resources, widgets, and behavior that make the server useful to the user.
