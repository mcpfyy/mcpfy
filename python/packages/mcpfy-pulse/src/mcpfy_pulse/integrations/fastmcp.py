"""No TS equivalent — FastMCP has no analog in the Node ecosystem this package
ships for. Both `mcp.server.fastmcp.FastMCP` (bundled in the official `mcp`
package) and the standalone `fastmcp` PyPI package fully own their transport
lifecycle: `mcp.run()` internally opens `stdio_server()`/SSE/StreamableHTTP and
calls `self._mcp_server.run(read_stream, write_stream, ...)` without exposing a
seam the caller can wrap. Confirmed (by reading both packages' source) that both
expose the identical private attribute `_mcp_server` — an
`mcp.server.lowlevel.server.Server` instance — and that *every* transport in both
packages funnels through `_mcp_server.run(...)`. So instead of wrapping streams
ourselves, we monkey-patch the instance-bound `.run` method on that one object:
call this once, before `mcp.run()`.
"""

from __future__ import annotations

import importlib.metadata
from typing import Any

from ..config import resolve_config
from ..streams import with_mcpfy_telemetry
from ..types import TelemetryOptions


def _detect_sdk_version(app: Any) -> str | None:
    """Best-effort, never raises. Distinguishes the standalone `fastmcp` package
    from the official `mcp`-bundled FastMCP in the free-text sdk_version field,
    since the wire-level sdk_name enum has no Python-specific value (see types.py)."""
    module = type(app).__module__ or ""
    try:
        if module.startswith("fastmcp."):
            return f"fastmcp {importlib.metadata.version('fastmcp')}"
        return f"mcp {importlib.metadata.version('mcp')}"
    except Exception:
        return None


def instrument_fastmcp(app: Any, options: TelemetryOptions | None = None) -> Any:
    """Instruments a FastMCP app in place so every transport it runs (stdio, SSE,
    streamable-HTTP) gets telemetry automatically. Works with both
    `mcp.server.fastmcp.FastMCP` and the standalone `fastmcp.FastMCP`. If no API
    key is configured (via `options.api_key` or the MCPFY_API_KEY env var), this
    is a complete no-op — `app` is returned untouched.

    Usage (add this line yourself — nothing here edits your files for you):

        from mcp.server.fastmcp import FastMCP  # or: from fastmcp import FastMCP
        from mcpfy_pulse import instrument_fastmcp, TelemetryOptions

        mcp = FastMCP("my-server")
        instrument_fastmcp(mcp, TelemetryOptions(api_key=os.environ.get("MCPFY_API_KEY")))
        mcp.run()
    """
    config = resolve_config(options)
    if not config.api_key:
        return app

    mcp_server = getattr(app, "_mcp_server", None)
    if mcp_server is None or not callable(getattr(mcp_server, "run", None)):
        raise TypeError(
            "instrument_fastmcp() expects a FastMCP instance from mcp.server.fastmcp "
            "or the standalone fastmcp package (no usable `_mcp_server.run` found on "
            f"{type(app)!r})"
        )

    if getattr(mcp_server, "_mcpfy_pulse_patched", False):
        return app  # idempotent - don't double-wrap a server instrumented twice

    original_run = mcp_server.run
    resolved_options = TelemetryOptions(
        api_key=options.api_key if options else None,
        endpoint=options.endpoint if options else None,
        server_name=options.server_name if options else None,
        server_version=options.server_version if options else None,
        sdk_name=options.sdk_name if options else None,
        sdk_version=(options.sdk_version if options and options.sdk_version else _detect_sdk_version(app)),
        install_mode=options.install_mode if options else None,
        flush_interval_ms=options.flush_interval_ms if options else None,
        max_batch_size=options.max_batch_size if options else None,
    )

    async def patched_run(read_stream: Any, write_stream: Any, *args: Any, **kwargs: Any) -> Any:
        read_stream, write_stream = with_mcpfy_telemetry(read_stream, write_stream, resolved_options)
        return await original_run(read_stream, write_stream, *args, **kwargs)

    mcp_server.run = patched_run
    mcp_server._mcpfy_pulse_patched = True
    return app
