"""Mirrors typescript/packages/mcpfy-pulse/src/wrap-transport.ts.

The TS SDK wraps a `Transport`'s `onmessage`/`send` seam. The Python `mcp` SDK has
no such object — every transport (stdio, SSE, StreamableHTTP) is an async context
manager yielding a raw `(read_stream, write_stream)` pair of anyio memory object
streams, handed straight to `Server.run(read_stream, write_stream, init_options)`.
That's the one seam every transport funnels through, so this wraps *that* instead.

Usage (add these lines yourself — nothing here edits your files for you):

    from mcp.server.stdio import stdio_server
    from mcpfy_pulse import with_mcpfy_telemetry, TelemetryOptions

    async with stdio_server() as (read_stream, write_stream):
        read_stream, write_stream = with_mcpfy_telemetry(
            read_stream, write_stream, TelemetryOptions(api_key=os.environ.get("MCPFY_API_KEY"))
        )
        await server.run(read_stream, write_stream, server.create_initialization_options())
"""

from __future__ import annotations

import asyncio
from typing import Any, Awaitable, Callable

import anyio
from anyio.abc import ObjectReceiveStream, ObjectSendStream

from .config import resolve_config
from .core.batcher import BatchMeta, TelemetryBatcher, install_shutdown_flush
from .core.classify import MessageClassifier
from .types import TelemetryOptions


def _message_to_dict(item: Any) -> dict | None:
    """A SessionMessage wraps a pydantic JSONRPCMessage RootModel; the read side
    can also carry a raw parse-error Exception. Reduce both to the plain dict (or
    None) the classifier expects — same "generic object" treatment classify.ts
    gets from a JS Transport."""
    if isinstance(item, Exception):
        return None
    message = getattr(item, "message", None)
    if message is None:
        return None
    try:
        return message.model_dump(by_alias=True, exclude_none=True, mode="json")
    except Exception:
        return None


class _ClassifyingReceiveStream(ObjectReceiveStream):
    def __init__(
        self,
        inner: ObjectReceiveStream,
        classifier: MessageClassifier,
        batcher: TelemetryBatcher,
        close_batcher: Callable[[], Awaitable[None]],
        close_batcher_nowait: Callable[[], None],
    ):
        self._inner = inner
        self._classifier = classifier
        self._batcher = batcher
        self._close_batcher = close_batcher
        self._close_batcher_nowait = close_batcher_nowait

    async def receive(self) -> Any:
        try:
            item = await self._inner.receive()
        except anyio.EndOfStream:
            # Graceful end of the session (client closed stdin, HTTP request
            # finished, ...) — safe, and important, to await the final flush
            # here: this is the one place we're guaranteed to still be running
            # inside the server's event loop before it shuts down. A
            # fire-and-forget task scheduled this late can get cancelled by
            # asyncio.run()'s own teardown before the flush's HTTP POST
            # completes.
            await self._close_batcher()
            raise
        except BaseException:
            # Cancellation or a hard I/O error — do not await more work here,
            # that could interfere with in-flight cancellation semantics.
            # Best-effort only.
            self._close_batcher_nowait()
            raise
        event = self._classifier.on_incoming(_message_to_dict(item))
        if event is not None:
            self._batcher.push(event)
        return item

    async def aclose(self) -> None:
        await self._close_batcher()
        await self._inner.aclose()


class _ClassifyingSendStream(ObjectSendStream):
    def __init__(self, inner: ObjectSendStream, classifier: MessageClassifier, batcher: TelemetryBatcher):
        self._inner = inner
        self._classifier = classifier
        self._batcher = batcher

    async def send(self, item: Any) -> None:
        event = self._classifier.on_outgoing(_message_to_dict(item))
        if event is not None:
            self._batcher.push(event)
        await self._inner.send(item)

    async def aclose(self) -> None:
        await self._inner.aclose()


def with_mcpfy_telemetry(
    read_stream: ObjectReceiveStream,
    write_stream: ObjectSendStream,
    options: TelemetryOptions | None = None,
) -> tuple[ObjectReceiveStream, ObjectSendStream]:
    """Wraps a `(read_stream, write_stream)` pair to capture telemetry, then
    delegates everything through to the real streams unchanged. If no API key is
    configured (via `options.api_key` or the MCPFY_API_KEY env var), this is a
    complete no-op — the original streams are returned untouched."""
    config = resolve_config(options)
    if not config.api_key:
        return read_stream, write_stream

    classifier = MessageClassifier()
    batcher = TelemetryBatcher(
        config,
        BatchMeta(
            server_name=options.server_name if options else None,
            server_version=options.server_version if options else None,
            sdk_name=(options.sdk_name if options and options.sdk_name else "@modelcontextprotocol/sdk"),
            sdk_version=options.sdk_version if options else None,
            install_mode=(options.install_mode if options and options.install_mode else "sdk-wrapper"),
        ),
    )
    install_shutdown_flush(batcher)

    closed = False

    async def close_batcher() -> None:
        nonlocal closed
        if closed:
            return
        closed = True
        await batcher.close()

    def close_batcher_nowait() -> None:
        nonlocal closed
        if closed:
            return
        closed = True
        try:
            asyncio.create_task(batcher.close())
        except RuntimeError:
            pass

    wrapped_read = _ClassifyingReceiveStream(read_stream, classifier, batcher, close_batcher, close_batcher_nowait)
    wrapped_write = _ClassifyingSendStream(write_stream, classifier, batcher)
    return wrapped_read, wrapped_write
