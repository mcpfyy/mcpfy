import asyncio
import json
import os
import signal
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

FIXTURES_DIR = Path(__file__).parent / "fixtures"


class _Handler(BaseHTTPRequestHandler):
    received: list[dict] = []

    def log_message(self, format: str, *args) -> None:  # noqa: A002 - stdlib signature
        pass

    def do_POST(self) -> None:
        length = int(self.headers.get("content-length", 0))
        body = json.loads(self.rfile.read(length))
        _Handler.received.append(body)
        self.send_response(202)
        self.end_headers()


@pytest.mark.asyncio
async def test_flushes_queued_event_on_sigterm_bypassing_graceful_eof():
    """Defense-in-depth test for with_mcpfy_telemetry's shutdown-flush signal
    handler (install_shutdown_flush in core/batcher.py): a process killed
    directly by SIGTERM — e.g. by a process manager, `kill`, or a container
    orchestrator — bypasses the client's own graceful stdin-close sequence
    entirely, so the pre-existing anyio.EndOfStream-triggered flush in
    streams.py never gets a chance to run. This is the one gap that flush
    can't cover on its own; the signal handler is the safety net for it."""
    _Handler.received = []
    server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    process: asyncio.subprocess.Process | None = None
    try:
        process = await asyncio.create_subprocess_exec(
            sys.executable,
            str(FIXTURES_DIR / "shutdown_child.py"),
            env={
                **os.environ,
                "MCPFY_API_KEY": "mk_test_shutdown",
                "MCPFY_TELEMETRY_ENDPOINT": f"http://127.0.0.1:{port}/ingest",
            },
        )
        await asyncio.sleep(0.5)  # give it time to queue the event and install the signal handler

        process.send_signal(signal.SIGTERM)
        returncode = await asyncio.wait_for(process.wait(), timeout=10)

        # The handler re-raises the same signal against itself after flushing
        # rather than calling sys.exit(), so the process still dies "for real"
        # (negative returncode == -SIGTERM) — exactly as it would have without
        # this fix, just after the flush instead of before it.
        assert returncode == -signal.SIGTERM.value
        assert len(_Handler.received) == 1
        assert _Handler.received[0]["events"][0]["method"] == "tools/call"
        assert _Handler.received[0]["events"][0]["toolName"] == "shutdown-test-tool"
    finally:
        server.shutdown()
        thread.join(timeout=2)
        if process is not None and process.returncode is None:
            process.kill()
            await process.wait()
