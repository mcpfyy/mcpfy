"""Mirrors typescript/packages/mcpfy-pulse/src/core/batcher.ts.

Ring-buffer batcher: queues events, flushes on a timer or when full, and never
raises or retries indefinitely — a failed or unreachable ingest endpoint is a
silent no-op, by design (telemetry must never affect the server's own behavior,
and the endpoint may not exist yet).

Uses `asyncio.create_task` for the flush timer, so this requires the asyncio
backend under anyio — the default for `anyio.run()` and for both FastMCP flavors'
stdio/HTTP runners. trio is not supported.
"""

from __future__ import annotations

import asyncio
import os
import signal
import sys
from dataclasses import dataclass

import httpx

from ..config import ResolvedConfig
from ..types import InstallMode, SdkName, TelemetryEvent


@dataclass
class BatchMeta:
    server_name: str | None = None
    server_version: str | None = None
    sdk_name: SdkName = "unknown"
    sdk_version: str | None = None
    install_mode: InstallMode = "sdk-wrapper"


def _warn(message: str) -> None:
    print(f"[mcpfy-pulse] {message}", file=sys.stderr)


class TelemetryBatcher:
    def __init__(self, config: ResolvedConfig, meta: BatchMeta) -> None:
        self._config = config
        self._meta = meta
        self._queue: list[TelemetryEvent] = []
        self._client = httpx.AsyncClient(timeout=10.0)
        self._closed = False
        self._timer_task: asyncio.Task | None = None
        try:
            self._timer_task = asyncio.create_task(self._timer_loop())
        except RuntimeError:
            # No running event loop yet (e.g. constructed outside an async
            # context) — the timer simply never starts; flush() can still be
            # called manually and close() will no-op cleanly.
            pass

    async def _timer_loop(self) -> None:
        interval = self._config.flush_interval_ms / 1000
        while True:
            await asyncio.sleep(interval)
            await self.flush()

    def push(self, event: TelemetryEvent) -> None:
        self._queue.append(event)
        if len(self._queue) >= self._config.max_batch_size:
            try:
                asyncio.create_task(self.flush())
            except RuntimeError:
                pass

    async def flush(self) -> None:
        if not self._queue:
            return
        events, self._queue = self._queue, []
        body = {"installMode": self._meta.install_mode, "events": [e.to_wire_dict() for e in events]}
        optional_meta = {
            "serverName": self._meta.server_name,
            "serverVersion": self._meta.server_version,
            "sdkName": self._meta.sdk_name,
            "sdkVersion": self._meta.sdk_version,
        }
        for key, value in optional_meta.items():
            if value is not None:
                body[key] = value
        try:
            response = await self._client.post(
                self._config.endpoint,
                headers={
                    "content-type": "application/json",
                    "authorization": f"Bearer {self._config.api_key or ''}",
                },
                json=body,
            )
            # Never raises on a non-2xx (silent drop is still the contract — see
            # module doc), but a warning is the difference between "found the bug
            # in 30 seconds" and "found it three days later": a 404/401/500 here
            # means events are being discarded even though the request itself
            # didn't raise.
            if response.status_code >= 300:
                _warn(
                    f"telemetry flush failed: {response.status_code} {response.reason_phrase} "
                    f"({self._config.endpoint}) — {len(events)} event(s) dropped"
                )
        except httpx.HTTPError as err:
            _warn(f"telemetry flush failed: {err} ({self._config.endpoint}) — {len(events)} event(s) dropped")

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        if self._timer_task is not None:
            self._timer_task.cancel()
        await self.flush()
        await self._client.aclose()


_SHUTDOWN_SIGNALS = (signal.SIGTERM, signal.SIGINT)
_SHUTDOWN_FLUSH_TIMEOUT_S = 3.0


def install_shutdown_flush(batcher: TelemetryBatcher) -> None:
    """Installs a best-effort "flush before we die" hook, mirroring batcher.ts's
    `installShutdownFlush`. `streams.py` already flushes on a clean
    `anyio.EndOfStream` (see `_ClassifyingReceiveStream.receive`), but that races
    against the same client's own shutdown timeline: a real MCP client's normal
    graceful shutdown (close stdin, wait, escalate to SIGTERM if the process is
    still alive) can still deliver that signal before the EndOfStream-triggered
    flush finishes — Python's default reaction to an unhandled SIGTERM/SIGINT is
    immediate termination, same as Node's, with no guarantee any pending
    coroutine gets to complete first. This is a second, independent safety net,
    not a replacement. Bounded by a timeout so a slow or unreachable ingest
    endpoint can never hang process shutdown.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return  # no running loop to attach a handler to - best-effort only

    for sig in _SHUTDOWN_SIGNALS:

        def handler(sig: signal.Signals = sig) -> None:
            # Restore default disposition before re-raising below, so the
            # re-raise actually terminates the process (or falls through to any
            # other handler) instead of looping back into this one.
            loop.remove_signal_handler(sig)

            async def flush_then_reraise() -> None:
                try:
                    await asyncio.wait_for(batcher.close(), timeout=_SHUTDOWN_FLUSH_TIMEOUT_S)
                except Exception:
                    pass
                finally:
                    os.kill(os.getpid(), sig)

            asyncio.create_task(flush_then_reraise())

        try:
            loop.add_signal_handler(sig, handler)
        except (NotImplementedError, RuntimeError):
            pass  # signal handlers unavailable (e.g. non-main thread, some platforms)
