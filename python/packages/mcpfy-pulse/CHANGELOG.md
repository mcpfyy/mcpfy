# Changelog

All notable changes to `mcpfy-pulse` (Python) are documented here.

## 0.1.2 - 2026-08-29

### Added

- Track `notifications/cancelled`: a request the client cancels before it completes now emits a `request` event with `outcome="cancelled"` instead of being silently dropped. The cancellation reason is never captured.
- Track `notifications/progress`: progress notifications are correlated to their request via `_meta.progressToken` and counted. Every completed request event now carries `progress_update_count` (default `0`) — a tool-hygiene signal, never the progress values themselves.
- Track `notifications/message` and the three `list_changed` notifications (`tools`, `resources`, `prompts`) as standalone `type="notification"` events. Only the log level is captured for `notifications/message` — never the log payload or logger name.
- Capture `initialize` capability negotiation: `client_capabilities` / `server_capabilities` as flat, dotted capability paths (e.g. `["resources.subscribe", "tools.listChanged"]`). `experimental` capabilities are deliberately excluded.
- Capture two more pieces of non-content `tools/list` metadata per declared tool: `has_output_schema` (presence only) and the four `Tool.annotations` hints (`read_only_hint`, `destructive_hint`, `idempotent_hint`, `open_world_hint`), read as declared with no default coercion.
- `TelemetryEvent.type` is now `Literal["request", "notification"]` (previously always `"request"`); `outcome` gains `"cancelled"` alongside `"ok" | "error"`.

### Fixed

- `mcpfy-proxy` (the stdio proxy) no longer kills the wrapped server — then itself — when the client closes or half-closes stdin before the server has finished responding. Closing stdin is a normal shutdown signal some clients send; it used to be raced against the child process's own lifetime exactly like a crashed pump, so the proxy would `SIGKILL` the child and then immediately self-`SIGKILL` via the negative-returncode path, discarding any responses still in flight.
- `with_mcpfy_telemetry` now also flushes on a direct `SIGTERM`/`SIGINT` (e.g. a process manager or `kill` terminating the server process outright, bypassing a client's graceful stdin-close). The existing `anyio.EndOfStream`-triggered flush already covers the normal case — a client closing stdin gracefully — correctly; this closes the one gap it couldn't: a signal delivered before that flush has a chance to run.

## 0.1.1 - initial release

### Added

- `with_mcpfy_telemetry(read_stream, write_stream, options)`: wraps any MCP read/write stream pair to capture method/size/duration/outcome telemetry, batched and flushed to the MCPFY ingest endpoint. Never sends argument values or resource content.
- `instrument_fastmcp(app, options)`: instruments a FastMCP app (official `mcp.server.fastmcp.FastMCP` or the standalone `fastmcp` package) in place, covering every transport it runs.
- `mcpfy-proxy -- <command>`: a stdio proxy that captures the same telemetry for any command, in any language, without touching its source.
- `tools/list` declared-tool metadata (`has_description`, `description_length`, `param_count`, `params_with_description_count`), and a `tools/call` result's own `is_error` flag as `result_is_error`.

Note: this is the first version of the Python package tracked in this repository's git history — the `0.1.1` entry documents its baseline feature set as of the `0.1.2` cut, not a separately dated historical release.
