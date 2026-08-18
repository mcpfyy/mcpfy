# Contributing to mcpfy

Thanks for considering a contribution. mcpfy is a thin, deliberately small wrapper around the
official [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) —
not a reimplementation of it. Please keep that in mind when proposing changes: prefer the
minimal fix over a new abstraction, and prefer opening an issue to discuss scope before a large
PR, especially anything that adds public API surface.

## Getting set up

Requires **Node.js 20.19+** (or 22.12+) and **pnpm 10+**.

```bash
git clone https://github.com/mcpfyy/mcpfy.git
cd mcpfy/typescript
pnpm install
pnpm build
pnpm test
```

All four commands should succeed on a fresh clone. If they don't, that's a bug worth an issue.

> `pnpm build` and `pnpm test` run recursively over `packages/*` in dependency order.
> `mcpfy-sdk` imports `mcpfy-pulse`, so building a single package in isolation can fail on
> unresolved workspace imports — build from `typescript/` instead.

## Project layout

See [Repository structure](./README.md#repository-structure) in the root README for the full
layout, and [`typescript/README.md`](./typescript/README.md) for TypeScript-specific commands.

Short version — three published packages under `typescript/packages/`:

- **`mcpfy`** (npm `mcpfy-sdk`) — the SDK: tools, prompts, resources, widgets, transports, auth.
- **`create-mcpfy-app`** — the scaffolder behind `npx create-mcpfy-app`.
- **`mcpfy-pulse`** — opt-in telemetry.

## Running things locally

```bash
# Per-package builds and tests
pnpm --filter mcpfy-sdk build
pnpm --filter mcpfy-sdk test
pnpm --filter mcpfy-sdk test:watch
pnpm --filter mcpfy-pulse test

# Run the scaffolder from source, without publishing or installing
pnpm --filter create-mcpfy-app dev -- my-test-app --no-install

# Run an example server against your local build
pnpm --filter @mcpfy-examples/hello-world start:stdio
pnpm --filter @mcpfy-examples/hello-world start:http
```

## Making changes

1. **Open an issue first** for anything beyond a small fix — especially new public API surface.
2. **Write tests that exercise real behavior.** The convention here is to spin up an actual
   `MCPServer`, connect a real `MCPClient` to it, and assert on the round trip. See
   `typescript/packages/mcpfy/tests/` for the pattern, including two true end-to-end tests: one
   spawns a real stdio child process (`stdio-roundtrip.test.ts`), the other runs a real HTTP
   server (`http-roundtrip.test.ts`). `mcpfy-pulse`'s tests follow the same idea, standing up a
   real HTTP server as the telemetry endpoint and asserting on the bytes that actually arrive.
   Don't mock the SDK internals — if you're mocking everything, the test isn't proving anything.
3. **Keep the diff minimal.** Don't refactor unrelated code alongside a feature or fix.
4. **Breaking changes to public APIs** need to be called out explicitly in the PR description —
   don't silently add backwards-compatibility shims without discussion.

### Telemetry changes need extra care

`mcpfy-pulse` promises it never transmits argument values or resource content — only method
names, byte counts, timing, and outcomes. If you touch what goes into a `TelemetryEvent`, add a
test asserting the new field can't carry user data, and say so in the PR description.

## Before opening a PR

```bash
cd typescript
pnpm build
pnpm test
```

Both must pass; CI runs exactly these on Node 20.19, 22.12, and 24. Also:

- Update the relevant package's README if you changed its public API.
- Update `examples/hello-world` if the change affects how a basic server is written.
- Use a descriptive commit message. The history uses Conventional Commits
  (`fix:`, `feat:`, `docs:`, `test:`, `ci:`) — please match it.

## Reporting bugs / requesting features

Open an issue with a minimal reproduction where possible. For MCP protocol questions unrelated
to mcpfy itself, the [Model Context Protocol spec](https://modelcontextprotocol.io) and the
official [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk)
are the source of truth.

## Code of conduct

By participating, you agree to uphold our [Code of Conduct](./CODE_OF_CONDUCT.md). This is a
small project run in the open — treat it, and the people contributing to it, accordingly.
