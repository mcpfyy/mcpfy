<div align="center">

<pre>
 ███╗   ███╗ ██████╗██████╗ ███████╗██╗   ██╗    ██████╗ ██╗   ██╗██╗     ███████╗███████╗
 ████╗ ████║██╔════╝██╔══██╗██╔════╝╚██╗ ██╔╝    ██╔══██╗██║   ██║██║     ██╔════╝██╔════╝
 ██╔████╔██║██║     ██████╔╝█████╗   ╚████╔╝     ██████╔╝██║   ██║██║     ███████╗█████╗
 ██║╚██╔╝██║██║     ██╔═══╝ ██╔══╝    ╚██╔╝      ██╔═══╝ ██║   ██║██║     ╚════██║██╔══╝
 ██║ ╚═╝ ██║╚██████╗██║     ██║        ██║       ██║     ╚██████╔╝███████╗███████║███████╗
 ╚═╝     ╚═╝ ╚═════╝╚═╝     ╚═╝        ╚═╝       ╚═╝      ╚═════╝ ╚══════╝╚══════╝╚══════╝
</pre>

📊 Tool-level telemetry | 🩺 Server health score | 🧠 Tool intelligence | 🎯 Result quality scoring | 🔌 Works with any MCP server

A drop-in telemetry SDK that captures tool-level usage and performance to give you a real-time health signal for your MCP server - works with the official `mcp` SDK, FastMCP, or any other MCP server.

```bash
pip install mcpfy-pulse
```

</div>

There are three ways to use this. Pick the one that matches your situation - none of
them edit your files for you.

Every mode needs an API key. Create one from your [MCPFY dashboard](https://mcpfy.ai/dashboard/telemetry)
(**Dashboard → Telemetry**), then set it as `MCPFY_API_KEY` as shown below.

## 1. You're using FastMCP

Works for both `mcp.server.fastmcp.FastMCP` (bundled in the official `mcp` package) and
the standalone [`fastmcp`](https://pypi.org/project/fastmcp/) package - same call either
way, since both expose the same underlying server object.

**1. Install the package:**

```bash
pip install mcpfy-pulse
```

**2. Set your API key** (e.g. in your `.env` file):

```bash
MCPFY_API_KEY=mk_live_xxx
```

**3. Instrument your app**, right before you call `.run()`:

```python
import os
from mcp.server.fastmcp import FastMCP  # or: from fastmcp import FastMCP
from mcpfy_pulse import instrument_fastmcp, TelemetryOptions

mcp = FastMCP("my-server")

instrument_fastmcp(mcp, TelemetryOptions(api_key=os.environ.get("MCPFY_API_KEY")))

mcp.run()  # telemetry now flows for stdio, SSE, and streamable-HTTP alike
```

`instrument_fastmcp` monkey-patches the one call every FastMCP transport funnels
through internally (`self._mcp_server.run(...)`), so it doesn't matter which
transport you pick. If `api_key` is unset, it's a complete no-op — `mcp` is
returned untouched, so it's safe to leave this in place across environments.

## 2. You built your own server on the raw `mcp` SDK

For anyone who wrote their own server directly on `mcp.server.Server` (or anything
else that hands a `Server.run()` call a pair of read/write streams) and has the
source in front of them. Three steps:

**1. Install the package:**

```bash
pip install mcpfy-pulse
```

**2. Set your API key** (e.g. in your `.env` file):

```bash
MCPFY_API_KEY=mk_live_xxx
```

**3. Wrap your streams**, right before you run them — this works for any transport
(stdio, SSE, StreamableHTTP, ...), not just the stdio example below:

```python
import os
from mcp.server.stdio import stdio_server
from mcpfy_pulse import with_mcpfy_telemetry, TelemetryOptions

async def main():
    async with stdio_server() as (read_stream, write_stream):
        read_stream, write_stream = with_mcpfy_telemetry(
            read_stream, write_stream,
            TelemetryOptions(api_key=os.environ.get("MCPFY_API_KEY")),
        )
        await server.run(read_stream, write_stream, server.create_initialization_options())
```

`with_mcpfy_telemetry` wraps the read/write stream pair — the two points every
JSON-RPC message passes through regardless of which transport is underneath. If
`api_key` is unset, it returns the original streams unchanged, so it's safe to
leave this in place across environments.

> Requires the asyncio backend under anyio (the default for `anyio.run()` and for
> both FastMCP flavors' own runners). trio is not currently supported.

## 3. You're running someone else's server locally (no source access)

No install step needed if your client can run `uvx` — it fetches `mcpfy-proxy`
automatically the first time it runs. Edit your MCP client's config
(`claude_desktop_config.json`, Cursor's `mcp.json`, etc.) to route the command
through the proxy:

```jsonc
// before:
"github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"] }

// after:
"github": {
  "command": "uvx",
  "args": ["--from", "mcpfy-pulse", "mcpfy-proxy", "--", "npx", "-y", "@modelcontextprotocol/server-github"],
  "env": { "MCPFY_API_KEY": "mk_live_xxx" }
}
```

(Or `pip install mcpfy-pulse` yourself and use the plain `mcpfy-proxy` command if
you'd rather not rely on `uvx`.)

`mcpfy-proxy` becomes the process your client spawns. It spawns the real command as
its own child, sits in that child's stdin/stdout, and forwards every byte unchanged
while classifying JSON-RPC messages on the side. Works for any language - Python,
Node, Go, Rust, anything - since it only ever reads newline-delimited JSON off a
pipe.

## What gets sent

Method names, byte counts, timing, and outcome only — **never** argument values or
result content. The one exception is `tools/list`, where each declared tool's
description/param *presence and length* is captured (never the text itself) to power
description-quality scoring. See `src/mcpfy_pulse/types.py` for the exact event shape.
