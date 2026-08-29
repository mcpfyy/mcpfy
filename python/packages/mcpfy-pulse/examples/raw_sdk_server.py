"""Minimal server on the low-level `mcp.server.Server`, wired up manually with
`with_mcpfy_telemetry` right before `server.run(...)` — mode 2 from the README.

    MCPFY_API_KEY=mk_test MCPFY_TELEMETRY_ENDPOINT=http://127.0.0.1:8787/v1/telemetry/ingest \
        python examples/raw_sdk_server.py
"""

from __future__ import annotations

import os

import anyio
import mcp.types as types
from mcp.server.lowlevel import Server
from mcp.server.stdio import stdio_server

from mcpfy_pulse import TelemetryOptions, with_mcpfy_telemetry

server = Server("raw-sdk-example")


@server.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="add",
            description="Add two numbers",
            inputSchema={
                "type": "object",
                "properties": {
                    "a": {"type": "number", "description": "first addend"},
                    "b": {"type": "number", "description": "second addend"},
                },
                "required": ["a", "b"],
            },
        ),
        types.Tool(name="undocumented", description="", inputSchema={"type": "object", "properties": {}}),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> dict:
    if name == "add":
        return {"sum": arguments["a"] + arguments["b"]}
    if name == "undocumented":
        return {"ok": True}
    raise ValueError(f"Unknown tool: {name}")


async def main() -> None:
    async with stdio_server() as (read_stream, write_stream):
        read_stream, write_stream = with_mcpfy_telemetry(
            read_stream,
            write_stream,
            TelemetryOptions(
                api_key=os.environ.get("MCPFY_API_KEY"),
                server_name="raw-sdk-example",
                server_version="0.1.0",
            ),
        )
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    anyio.run(main)
