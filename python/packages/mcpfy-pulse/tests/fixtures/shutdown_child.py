"""Spawned as a real subprocess by test_shutdown_flush.py. Simulates a server
process getting killed directly (e.g. by a process manager, `kill`, or a
container orchestrator) rather than via a client's graceful stdin-close — the
one shutdown path the pre-existing anyio.EndOfStream-triggered flush in
streams.py cannot cover on its own, since no EOF ever happens here."""

import anyio
from mcp.shared.message import SessionMessage
from mcp.types import JSONRPCMessage, JSONRPCRequest, JSONRPCResponse

from mcpfy_pulse import TelemetryOptions, with_mcpfy_telemetry


async def main() -> None:
    read_send, read_recv = anyio.create_memory_object_stream(10)
    write_send, write_recv = anyio.create_memory_object_stream(10)

    wrapped_read, wrapped_write = with_mcpfy_telemetry(
        read_recv, write_send, TelemetryOptions(server_name="shutdown-test-server")
    )

    # Simulate a real tools/call round trip so one real event ends up queued.
    await read_send.send(
        SessionMessage(
            JSONRPCMessage(
                JSONRPCRequest(jsonrpc="2.0", id=1, method="tools/call", params={"name": "shutdown-test-tool"})
            )
        )
    )
    await wrapped_read.receive()
    await wrapped_write.send(
        SessionMessage(JSONRPCMessage(JSONRPCResponse(jsonrpc="2.0", id=1, result={"content": []})))
    )

    # Keep the process alive so the test controls exactly when it dies, via a
    # real SIGTERM sent directly to this process.
    await anyio.sleep_forever()


if __name__ == "__main__":
    anyio.run(main)
