# Troubleshooting & pre-flight checklist

Run through this before telling the user a change is done. Most mcpfy failures come from a small, repeatable set of mistakes — check for these specifically rather than just reading the code over once.

## Table of Contents

- [Troubleshooting \& pre-flight checklist](#troubleshooting--pre-flight-checklist)
  - [Table of Contents](#table-of-contents)
  - [Checklist](#checklist)
  - [Type-checking gotchas (`mcpfy-sdk@0.3.1`)](#type-checking-gotchas-mcpfy-sdk031)
  - [Symptom → likely cause](#symptom--likely-cause)
  - [Verifying a change actually works](#verifying-a-change-actually-works)

## Checklist

- [ ] Every `server.tool(...)`/`server.prompt(...)` callback returns `text()`, `markdown()`, or `object()` — not a bare object literal, and not a hand-built `{ content: [...] }`.
- [ ] Every schema uses `schema: z.object({...})` — not `inputSchema`. `zod` is installed as a real dependency, not just assumed.
- [ ] Every `ctx.log(...)` call passes the level first: `ctx.log("info", "message")`.
- [ ] Every `widget: "<name>"` tool has a matching `src/widgets/<name>/main.tsx` that exists on disk right now.
- [ ] No widget's standard `main.tsx` manually wraps itself in another `ThemeProvider`/`HostRuntime`.
- [ ] Widget `content` is `{ type: "html", html }` or `{ type: "url", url }` — never a bare string.
- [ ] Widget `size` is a `[width, height]` tuple of strings, not `"full"` or any other keyword.
- [ ] If widgets exist and the server is meant to run in production, `mcpfy build` has actually been run — not just `mcpfy dev`.
- [ ] OAuth uses an `oauth.*` helper where possible, and `MCP_URL` (or `resource`) is the canonical public MCP endpoint. Raw OAuth configs include `authorizationServers`, `verifyToken`, and `resource`.
- [ ] `NodeOAuthClientProvider`/`ensureAuthorized` are imported from `mcpfy-sdk/auth`, not `mcpfy-sdk/client`.
- [ ] Any upstream fetch that needs the caller's auth uses `forwardAuthHeaders`/`extractForwardableAuthHeaders`, not manual header copying.
- [ ] Imports are split correctly: `mcpfy-sdk/server` for server APIs, `mcpfy-sdk/client` for client APIs, `mcpfy-sdk/widget` for React widget hooks.
- [ ] `package.json` has `"type": "module"` — mcpfy is ESM-only.
- [ ] Node.js version satisfies `^20.19.0 || >=22.12.0` (Node 21.x is explicitly unsupported).

## Type-checking gotchas (`mcpfy-sdk@0.3.1`)

These don't break anything at runtime — Zod validates real input/output regardless of what TypeScript infers, and `tsx`/`ts-node` don't type-check. But they *do* fail `tsc --noEmit` / `npm run build`, so catch them before telling the user a build is clean.

- **`Argument of type 'X' is not assignable to parameter of type 'Record<string, unknown>'` when calling `object(someValue)`.**
  Cause: `object()` is typed as `object<T extends Record<string, unknown>>(data: T)`. A plain `interface` (or a `type` without an index signature) doesn't structurally satisfy that constraint, even though it's a perfectly normal object at runtime.
  Fix: spread it into a fresh object literal instead of passing the typed value directly:
  ```typescript
  // Fails to type-check:
  return object(result); // result: RollResult (an interface)

  // Fix:
  return object({ ...result });
  ```

- **`Parameter 'n' implicitly has an 'any' type'` inside a `.map()`/`.filter()`/etc. call on a destructured tool input.**
  Cause: `server.tool<TInput, TOutput>()`'s `TInput` is **not** actually inferred from `def.schema` at the type level — `schema` is typed as the generic `z.ZodTypeAny`, with no link back to `TInput`. Without an explicit generic, `TInput` silently defaults to `Record<string, any>`. That's loose enough that simple top-level destructuring (`({ a, b }) => a + b`) type-checks fine, but it breaks down as soon as a destructured field is passed into another unannotated callback, because TypeScript can no longer trace an inferred type through it.
  Fix — either annotate the inner callback's parameter directly:
  ```typescript
  notations.map((n: string) => rollNotation(n));
  ```
  or supply the real input type explicitly on `server.tool<...>()` so the whole callback gets typed end-to-end:
  ```typescript
  const schema = z.object({ notations: z.array(z.string()).min(1).max(20) });

  server.tool<z.infer<typeof schema>>(
    { name: "roll-multiple", description: "...", schema },
    async ({ notations }) => object({ results: notations.map((n) => rollNotation(n)) })
  );
  ```
  Don't assume the "Typed Tool Calls" pattern in server.md gives full automatic inference in every case — it works for direct destructured use, but nested callbacks need one of the two fixes above.

## Symptom → likely cause

| Symptom | Likely cause |
|---|---|
| Server throws on startup, mentions a widget | `widget: "<name>"` registered but `src/widgets/<name>/main.tsx` is missing |
| Widget works with `mcpfy dev` but not in production | Forgot `mcpfy build` before starting the production server |
| Client gets a malformed/rejected tool result | Callback returned a bare object instead of `text()`/`markdown()`/`object()` |
| Tool input silently ignored or type errors at compile time | Used `inputSchema` instead of `schema` |
| `auth: { type: "jwt", ... }` rejected | Use an `oauth.*` helper (or a complete `type: "oauth"` config); `"jwt"` is not an auth type |
| "OAuth resource is required" | Set `MCP_URL` to the canonical public MCP endpoint or pass `resource` to the OAuth helper |
| "authorizationServers is missing" | Use a provider helper, or add `authorizationServers` to a raw/custom OAuth config |
| `new NodeOAuthClientProvider(...)` throws | Constructor is private — use `NodeOAuthClientProvider.create({...})` |
| Widget content or size rejected | Passed a bare HTML string, or `size: "full"` instead of a tuple |
| HTTP server listening on an unexpected port | Check the resolution order: `listen()` option > `--port` CLI arg > `PORT` env var > `3000` default |
| Client can't tell if a server is stdio or HTTP | Don't set `transport` in `ServerConfig` — it's inferred from `command`/`args` vs `url` |
| `tsc` fails on `object(someValue)` with a `Record<string, unknown>` error, even though the server runs fine | Passing a typed interface/class without an index signature to `object()` — spread it: `object({ ...someValue })` |
| `tsc` fails with `implicitly has an 'any' type` inside `.map()`/`.filter()` on a destructured tool input | `server.tool()`'s `TInput` isn't inferred from `schema` — annotate the inner callback param, or pass `z.infer<typeof schema>` as an explicit generic on `server.tool<...>()` |

## Verifying a change actually works

A type-check or a careful read-through isn't verification. Before reporting a task done:

1. Start the server (`npm run dev` or the project's dev script) and confirm it doesn't throw.
2. For a new/changed tool: call it once, either through a connected MCP client (`MCPSession.callTool`, see client.md) or an MCP inspector if one is available, and check the result shape matches what the tool returns.
3. For a new widget: confirm `mcpfy build` succeeds with no errors, and that the widget renders when its bound tool is invoked.
4. For auth changes: confirm `/.well-known/oauth-protected-resource` is reachable when `auth` is configured, and that an unauthenticated request to a protected endpoint is actually rejected.
