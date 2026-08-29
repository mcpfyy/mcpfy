"""Minimal FastMCP server, instrumented with one line before `.run()` — mode 1
from the README. Uses `mcp.server.fastmcp.FastMCP` (the officially bundled
FastMCP); `instrument_fastmcp` works identically against the standalone
`fastmcp` package's `FastMCP`.

    MCPFY_API_KEY=mk_test MCPFY_TELEMETRY_ENDPOINT=http://127.0.0.1:8787/v1/telemetry/ingest \
        python examples/fastmcp_server.py
"""

from __future__ import annotations

import os

from mcp.server.fastmcp import FastMCP

from mcpfy_pulse import TelemetryOptions, instrument_fastmcp

mcp = FastMCP("fastmcp-example")


@mcp.tool(description="Add two numbers")
def add(a: float, b: float) -> float:
    return a + b


@mcp.tool()
def undocumented(x: float) -> float:
    return x


instrument_fastmcp(
    mcp,
    TelemetryOptions(
        api_key=os.environ.get("MCPFY_API_KEY"),
        server_name="fastmcp-example",
        server_version="0.1.0",
    ),
)

if __name__ == "__main__":
    mcp.run()
