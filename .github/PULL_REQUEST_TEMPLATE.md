## What this changes

<!-- What the PR does, and why. If it fixes an issue, add "Fixes #123". -->

## Why

<!-- The problem being solved. For anything beyond a small fix, link the issue where the
     scope was discussed. -->

## How it was verified

<!-- What you actually ran, and what it printed. Not just "tests pass". -->

```
cd typescript
pnpm build
pnpm test
```

## Checklist

- [ ] `pnpm build` and `pnpm test` pass from `typescript/`
- [ ] Tests exercise real behavior (a real server/client round trip), not mocked internals
- [ ] The relevant package README is updated if the public API changed
- [ ] `examples/hello-world` is updated if this changes how a basic server is written
- [ ] Breaking changes to public APIs are called out below

## Breaking changes

<!-- None, or describe them and the migration path. -->

## Telemetry

<!-- Only if you touched mcpfy-pulse. mcpfy-pulse promises it never transmits argument values
     or resource content. If you changed what goes into a TelemetryEvent, say what the new
     field carries and link the test proving it can't carry user data. -->

N/A
