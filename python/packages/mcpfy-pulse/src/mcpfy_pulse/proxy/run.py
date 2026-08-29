"""Mirrors typescript/packages/mcpfy-pulse/src/proxy/run.ts.

`mcpfy-proxy -- <command> [args...]`

Spawns <command> as a child process and sits in its stdin/stdout pipe. Client-to-
server messages (parent stdin -> child stdin) are classified as "incoming";
server-to-client messages (child stdout -> parent stdout) are classified as
"outgoing", mirroring on_incoming/on_outgoing in the in-process streams wrapper.
Works for any language — the proxy never parses anything beyond newline-delimited
JSON-RPC framing.
"""

from __future__ import annotations

import asyncio
import json
import os
import signal
import sys
from typing import Any, Callable

from ..config import resolve_config
from ..core.batcher import BatchMeta, TelemetryBatcher
from ..core.classify import MessageClassifier


def _try_parse(line: str) -> Any:
    trimmed = line.strip()
    if not trimmed:
        return None
    try:
        return json.loads(trimmed)
    except json.JSONDecodeError:
        return None


def _make_line_pump(dest_write: Callable[[bytes], None], on_line: Callable[[str], None]) -> Callable[[bytes], None]:
    """Forwards raw chunks to `dest_write` immediately and unchanged, then
    independently re-buffers a copy into newline-delimited lines for
    classification. The pass-through path never waits on parsing — a bug in
    classification can never corrupt or delay the actual MCP traffic."""
    buffer = bytearray()

    def feed(chunk: bytes) -> None:
        dest_write(chunk)
        buffer.extend(chunk)
        while True:
            newline_index = buffer.find(b"\n")
            if newline_index == -1:
                break
            line = bytes(buffer[:newline_index])
            del buffer[: newline_index + 1]
            on_line(line.decode("utf-8", errors="replace"))

    return feed


async def _pump_parent_stdin_to_child(child_stdin: asyncio.StreamWriter, feed: Callable[[bytes], None]) -> None:
    loop = asyncio.get_running_loop()
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    await loop.connect_read_pipe(lambda: protocol, sys.stdin)
    try:
        while True:
            chunk = await reader.read(65536)
            if not chunk:
                break
            feed(chunk)
    except (BrokenPipeError, ConnectionResetError):
        pass
    finally:
        try:
            child_stdin.close()
        except Exception:
            pass


async def _pump_child_stdout_to_parent(child_stdout: asyncio.StreamReader, feed: Callable[[bytes], None]) -> None:
    stdout_fd = sys.stdout.buffer

    def write(chunk: bytes) -> None:
        stdout_fd.write(chunk)
        stdout_fd.flush()

    while True:
        chunk = await child_stdout.read(65536)
        if not chunk:
            break
        write(chunk)
        feed(chunk)


async def run_proxy(argv: list[str]) -> int:
    if "--" not in argv or argv.index("--") == len(argv) - 1:
        sys.stderr.write(
            "Usage: mcpfy-proxy -- <command> [args...]\n"
            "Example: mcpfy-proxy -- npx -y @modelcontextprotocol/server-github\n"
        )
        return 1

    sep_index = argv.index("--")
    command, *args = argv[sep_index + 1 :]
    config = resolve_config()
    classifier = MessageClassifier()
    batcher = (
        TelemetryBatcher(config, BatchMeta(sdk_name="unknown", install_mode="stdio-proxy")) if config.api_key else None
    )

    try:
        process = await asyncio.create_subprocess_exec(
            command,
            *args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=None,  # inherit
            env=os.environ.copy(),
        )
    except OSError as err:
        sys.stderr.write(f'mcpfy-proxy: failed to start "{command}": {err}\n')
        return 1

    def handle_incoming_line(line: str) -> None:
        event = classifier.on_incoming(_try_parse(line))
        if event is not None and batcher is not None:
            batcher.push(event)

    incoming_feed = _make_line_pump(
        lambda chunk: process.stdin.write(chunk),
        handle_incoming_line,
    )

    def handle_outgoing_line(line: str) -> None:
        message = _try_parse(line)
        if message is None:
            return
        event = classifier.on_outgoing(message)
        if event is not None and batcher is not None:
            batcher.push(event)

    outgoing_feed = _make_line_pump(lambda _chunk: None, handle_outgoing_line)

    stdin_task = asyncio.create_task(_pump_parent_stdin_to_child(process.stdin, incoming_feed))
    stdout_task = asyncio.create_task(_pump_child_stdout_to_parent(process.stdout, outgoing_feed))

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, lambda s=sig: process.send_signal(s))
        except (NotImplementedError, RuntimeError):
            pass  # signal handlers unavailable (e.g. non-main thread, some platforms)

    # Race the *stdout* pump against the child's own lifetime rather than just
    # `await process.wait()` — if the stdout pump dies unexpectedly, the child's
    # output can no longer reach the client and would otherwise hang forever with
    # no visible error (an exception inside a task nobody awaits is silently
    # dropped by asyncio). The stdin pump is deliberately excluded from this race:
    # it finishes on a clean EOF whenever the client closes or half-closes its
    # side of stdin — a normal shutdown signal (some clients close stdin to tell
    # a stdio server to wind down), not a failure — and the child must be left
    # to finish responding and exit on its own rather than being killed for it.
    def _log_if_pump_failed(task: asyncio.Task, label: str) -> None:
        if task.cancelled():
            return
        exc = task.exception()
        if exc is not None:
            sys.stderr.write(f"mcpfy-proxy: {label} pump failed: {exc}\n")

    stdin_task.add_done_callback(lambda t: _log_if_pump_failed(t, "stdin"))

    wait_task = asyncio.create_task(process.wait())
    done, _pending = await asyncio.wait({wait_task, stdout_task}, return_when=asyncio.FIRST_COMPLETED)

    if stdout_task in done:
        _log_if_pump_failed(stdout_task, "stdout")

    if wait_task not in done:
        # The stdout pump died before the child exited on its own — nothing
        # left to forward, so stop waiting on it.
        process.kill()
        await wait_task

    return_code = wait_task.result()
    stdin_task.cancel()
    stdout_task.cancel()
    if batcher is not None:
        await batcher.close()

    if return_code < 0:
        # Child died from a signal (POSIX convention: negative returncode).
        # Re-raise the same signal against ourselves, matching
        # `process.kill(process.pid, signal)` in the TS proxy.
        os.kill(os.getpid(), -return_code)
        return 1
    return return_code
