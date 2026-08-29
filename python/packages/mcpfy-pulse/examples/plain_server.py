"""A minimal server with **no mcpfy-pulse awareness at all** — no import, no
`MCPFY_API_KEY` check, nothing. Stands in for "someone else's server, no source
access" — mode 3 from the README. Telemetry for this one only ever comes from
wrapping it externally:

    mcpfy-proxy -- python examples/plain_server.py
"""

from __future__ import annotations

import anyio
import mcp.types as types
from mcp.server.lowlevel import Server
from mcp.server.stdio import stdio_server

server = Server("plain-example")


@server.list_tools()
async def list_tools() -> list[types.Tool]:
    return [types.Tool(name="ping", description="Reply pong", inputSchema={"type": "object", "properties": {}})]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> dict:
    if name == "ping":
        return {"reply": "pong"}
    raise ValueError(f"Unknown tool: {name}")


async def main() -> None:
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    anyio.run(main)
