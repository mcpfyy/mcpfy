# Contributing to mcpfy

Thanks for considering a contribution. mcpfy is intentionally small — please keep that in mind
when proposing changes: prefer the minimal fix over a new abstraction, and prefer opening an
issue to discuss scope before large PRs, especially anything that would pull mcpfy toward
mcpfy's larger feature set (Apps/widgets, OAuth, telemetry, etc.) — those are deliberately out
of scope for now.

## Getting set up

```bash
git clone <this-repo>
cd mcpfy/typescript
pnpm install
pnpm build
pnpm test
```

Requires Node.js 20.19+ (or 22.12+) and pnpm 10+.

## Project layout

See the root [README.md](./README.md#repository-structure) for the repo layout, and
[`typescript/README.md`](./typescript/README.md) for TypeScript-specific development commands.

## Making changes

1. **Open an issue first** for anything beyond a small fix — especially new public API surface.
2. **Write tests that exercise real behavior.** This project's convention is: spin up an actual
   `MCPServer` and connect a real `MCPClient` to it, and assert on the round trip. See
   `typescript/packages/mcpfy/tests/` for examples. Don't mock the SDK internals — if you're
   mocking everything, the test isn't proving anything.
3. **Keep the diff minimal.** Don't refactor unrelated code alongside a feature or fix.
4. **Breaking changes to public APIs** need to be called out explicitly in the PR description —
   don't silently add backwards-compatibility shims without discussion.

## Before opening a PR

```bash
pnpm build   # from typescript/
pnpm test
```

Both must pass. Update the relevant package's README if you changed its public API, and update
`examples/hello-world` if the change affects how a basic server is written.

## Reporting bugs / requesting features

Open an issue with a minimal reproduction where possible. For MCP protocol questions unrelated
to mcpfy itself, the [Model Context Protocol spec](https://modelcontextprotocol.io) and the
official [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk)
are the source of truth — mcpfy is a thin wrapper around it, not a reimplementation.

## Code of conduct

Be respectful and constructive. This is a small project run in the open — treat it, and the
people contributing to it, accordingly.
