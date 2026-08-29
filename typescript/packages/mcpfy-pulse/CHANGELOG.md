# Changelog

All notable changes to `mcpfy-pulse` (TypeScript) are documented here.

## 0.1.4 - 2026-08-29

### Fixed

- **Data loss in `withMcpfyTelemetry`**: any MCP session shorter than the 5-second flush interval lost all of its telemetry, via two independent paths, both confirmed against real client/server sessions:
  - A real client's normal shutdown (close stdin, wait, then send `SIGTERM` if the process is still alive) killed the process via an unhandled signal — instant termination, no `exit` event, no flush.
  - Some server setups (the low-level `Server` class, as opposed to `McpServer`) simply exit *naturally* on stdin EOF — no signal at all, just Node draining an event loop with nothing left to do.

  Either way, this happened before the periodic timer, the 500-event batch threshold, or an explicit `.close()` call ever got a chance to run — and since most real MCP sessions finish in well under 5 seconds, this affected the common case, not an edge case. `withMcpfyTelemetry` now installs both a `SIGTERM`/`SIGINT` handler and a `beforeExit` hook (`installShutdownFlush` in `core/batcher.ts`) that flush any queued events — bounded by a 3-second timeout so a slow or unreachable ingest endpoint can never hang process shutdown — before letting the process exit exactly as it would have otherwise. The stdio proxy (`mcpfy-proxy`) was never affected: it already forwards signals to its child and flushes after the child exits.

## 0.1.3 - 2026-08-29

### Added

- Track `notifications/cancelled`: a request the client cancels before it completes now emits a `request` event with `outcome: "cancelled"` instead of being silently dropped. The cancellation reason is never captured.
- Track `notifications/progress`: progress notifications are correlated to their request via `_meta.progressToken` and counted. Every completed request event now carries `progressUpdateCount` (default `0`) — a tool-hygiene signal, never the progress values themselves.
- Track `notifications/message` and the three `list_changed` notifications (`tools`, `resources`, `prompts`) as standalone `type: "notification"` events. Only the log level is captured for `notifications/message` — never the log payload or logger name.
- Capture `initialize` capability negotiation: `clientCapabilities` / `serverCapabilities` as flat, dotted capability paths (e.g. `["resources.subscribe", "tools.listChanged"]`). `experimental` capabilities are deliberately excluded.
- Capture two more pieces of non-content `tools/list` metadata per declared tool: `hasOutputSchema` (presence only) and the four `Tool.annotations` hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`), read as declared with no default coercion.
- `TelemetryEvent.type` is now `"request" | "notification"` (previously always `"request"`); `outcome` gains `"cancelled"` alongside `"ok" | "error"`.

### Fixed

- `argsBytes` no longer differs from the Python SDK for a request with an explicit `"params": null` — previously counted as 4 bytes here (`JSON.stringify(null)`) versus 0 in Python, which can't distinguish "no `params` key" from "`params: null`" once parsed into a dict. Both are now 0 bytes in both SDKs.

## 0.1.2

### Added

- Capture `tools/list` metadata (`hasDescription`, `descriptionLength`, `paramCount`, `paramsWithDescriptionCount`) per declared tool, never the description text or schema itself.
- Capture a `tools/call` result's own `isError` flag as `resultIsError`, distinct from the JSON-RPC-level `outcome`.

### Changed

- Clarified README install steps.

## 0.1.1 - initial release

### Added

- `withMcpfyTelemetry(transport, options)`: wraps any MCP `Transport` to capture method/size/duration/outcome telemetry, batched and flushed to the MCPFY ingest endpoint. Never sends argument values or resource content.
- `mcpfy-proxy -- <command>`: a stdio proxy that captures the same telemetry for any command, in any language, without touching its source.
