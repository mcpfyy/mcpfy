import anyio
import pytest
from mcp.shared.message import SessionMessage
from mcp.types import JSONRPCMessage, JSONRPCNotification, JSONRPCRequest, JSONRPCResponse

from mcpfy_pulse.streams import with_mcpfy_telemetry
from mcpfy_pulse.types import TelemetryOptions


def _request_message(id_: int, method: str = "tools/list") -> SessionMessage:
    return SessionMessage(JSONRPCMessage(JSONRPCRequest(jsonrpc="2.0", id=id_, method=method, params=None)))


def _response_message(id_: int) -> SessionMessage:
    return SessionMessage(JSONRPCMessage(JSONRPCResponse(jsonrpc="2.0", id=id_, result={"tools": []})))


def _cancelled_notification(request_id: int) -> SessionMessage:
    return SessionMessage(
        JSONRPCMessage(
            JSONRPCNotification(
                jsonrpc="2.0", method="notifications/cancelled", params={"requestId": request_id}
            )
        )
    )


@pytest.mark.asyncio
async def test_no_api_key_returns_original_streams_unchanged(monkeypatch):
    monkeypatch.delenv("MCPFY_API_KEY", raising=False)
    read_send, read_recv = anyio.create_memory_object_stream(10)
    write_send, write_recv = anyio.create_memory_object_stream(10)

    wrapped_read, wrapped_write = with_mcpfy_telemetry(read_recv, write_send)

    assert wrapped_read is read_recv
    assert wrapped_write is write_send

    read_send.close()
    write_recv.close()
    read_recv.close()
    write_send.close()


@pytest.mark.asyncio
async def test_wrapped_read_stream_passes_messages_through_unchanged():
    read_send, read_recv = anyio.create_memory_object_stream(10)
    write_send, write_recv = anyio.create_memory_object_stream(10)

    wrapped_read, wrapped_write = with_mcpfy_telemetry(
        read_recv,
        write_send,
        TelemetryOptions(api_key="mk_test", endpoint="https://127.0.0.1:1/unreachable", flush_interval_ms=60_000),
    )
    assert wrapped_read is not read_recv

    original = _request_message(1)
    await read_send.send(original)
    received = await wrapped_read.receive()
    assert received is original  # unchanged, just observed on the way through

    await wrapped_read.aclose()
    read_send.close()
    write_recv.close()
    write_send.close()


@pytest.mark.asyncio
async def test_wrapped_write_stream_passes_messages_through_unchanged():
    read_send, read_recv = anyio.create_memory_object_stream(10)
    write_send, write_recv = anyio.create_memory_object_stream(10)

    wrapped_read, wrapped_write = with_mcpfy_telemetry(
        read_recv,
        write_send,
        TelemetryOptions(api_key="mk_test", endpoint="https://127.0.0.1:1/unreachable", flush_interval_ms=60_000),
    )
    assert wrapped_write is not write_send

    original = _response_message(1)
    await wrapped_write.send(original)
    received = await write_recv.receive()
    assert received is original

    await wrapped_read.aclose()
    read_send.close()
    write_recv.close()
    read_recv.close()


@pytest.mark.asyncio
async def test_wrapped_read_stream_supports_async_iteration_and_context_manager():
    read_send, read_recv = anyio.create_memory_object_stream(10)
    write_send, write_recv = anyio.create_memory_object_stream(10)

    wrapped_read, wrapped_write = with_mcpfy_telemetry(
        read_recv,
        write_send,
        TelemetryOptions(api_key="mk_test", endpoint="https://127.0.0.1:1/unreachable", flush_interval_ms=60_000),
    )

    await read_send.send(_request_message(1))
    read_send.close()

    seen = [message async for message in wrapped_read]
    assert len(seen) == 1

    async with wrapped_write:
        pass

    write_recv.close()


@pytest.mark.asyncio
async def test_cancelled_notification_on_read_side_pushes_event_to_batcher():
    """A cancellation notification arrives on the *incoming* (read) side, but there's
    no response to push it via on the outgoing side — this is the one case where the
    read wrapper itself must reach the batcher directly (the required fix in
    streams.py: _ClassifyingReceiveStream now holds a batcher reference)."""
    read_send, read_recv = anyio.create_memory_object_stream(10)
    write_send, write_recv = anyio.create_memory_object_stream(10)

    wrapped_read, wrapped_write = with_mcpfy_telemetry(
        read_recv,
        write_send,
        TelemetryOptions(api_key="mk_test", endpoint="https://127.0.0.1:1/unreachable", flush_interval_ms=60_000),
    )

    await read_send.send(_request_message(1, method="tools/call"))
    await wrapped_read.receive()  # populates the classifier's pending map

    await read_send.send(_cancelled_notification(1))
    await wrapped_read.receive()

    queue = wrapped_read._batcher._queue  # white-box, same style as classify.py's _pending checks
    assert len(queue) == 1
    assert queue[0].outcome == "cancelled"
    assert queue[0].method == "tools/call"

    await wrapped_read.aclose()
    read_send.close()
    write_recv.close()
    write_send.close()
