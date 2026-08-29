import asyncio
import json
import sys
from pathlib import Path

import pytest

from mcpfy_pulse.proxy.run import _make_line_pump, _try_parse

EXAMPLES_DIR = Path(__file__).parent.parent / "examples"


def test_try_parse_valid_json():
    assert _try_parse('{"a": 1}') == {"a": 1}


def test_try_parse_blank_line_returns_none():
    assert _try_parse("   \n") is None


def test_try_parse_invalid_json_returns_none():
    assert _try_parse("not json") is None


def test_line_pump_passes_chunks_through_unchanged_and_splits_lines():
    forwarded = bytearray()
    lines = []
    feed = _make_line_pump(forwarded.extend, lines.append)

    feed(b'{"a": 1}\n{"b"')
    feed(b': 2}\n')

    assert bytes(forwarded) == b'{"a": 1}\n{"b": 2}\n'
    assert lines == ['{"a": 1}', '{"b": 2}']


def test_line_pump_holds_partial_line_until_newline():
    lines = []
    feed = _make_line_pump(lambda _chunk: None, lines.append)

    feed(b"no newline yet")
    assert lines == []
    feed(b"\n")
    assert lines == ["no newline yet"]


@pytest.mark.asyncio
async def test_run_proxy_forwards_traffic_end_to_end():
    """Regression test for a real bug: connect_read_pipe was called with the
    protocol *instance* instead of a factory, which raised inside an unretrieved
    task and silently hung the whole proxy forever. Spawns the actual
    `mcpfy-proxy` console entry point (not an in-process call — it needs a real
    OS pipe on its stdin, which an in-process sys.stdin monkeypatch can't fake)
    wrapping the telemetry-unaware plain_server.py fixture, and checks a real
    initialize round-trip comes back within a sane timeout."""
    server_path = EXAMPLES_DIR / "plain_server.py"
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-m",
        "mcpfy_pulse.bin.mcpfy_proxy",
        "--",
        sys.executable,
        str(server_path),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "test", "version": "1.0"}},
        }
        process.stdin.write((json.dumps(request) + "\n").encode())
        await process.stdin.drain()

        line = await asyncio.wait_for(process.stdout.readline(), timeout=10)
        response = json.loads(line)

        assert response["id"] == 1
        assert response["result"]["serverInfo"]["name"] == "plain-example"
    finally:
        process.kill()
        await process.wait()


@pytest.mark.asyncio
async def test_clean_stdin_eof_does_not_kill_child_before_it_exits_on_its_own():
    """Regression test for a real bug: the stdin pump finishing on a clean EOF
    (e.g. a client closing/half-closing stdin as a normal shutdown signal, or —
    as here — a short-lived parent process exiting) used to be raced against the
    child's own lifetime exactly like a crashed pump, so the proxy would SIGKILL
    the child - and then itself, via the negative-returncode path - before the
    child had a chance to finish responding and exit on its own. The child below
    ignores stdin entirely and only replies after a short delay, so a fix
    regression would show up as the response never arriving and the proxy dying
    from SIGKILL (a negative returncode) instead of exiting 0."""
    child_script = (
        "import sys, time, json\n"
        "time.sleep(0.5)\n"
        "print(json.dumps({'jsonrpc': '2.0', 'id': 1, 'result': {'ok': True}}))\n"
        "sys.stdout.flush()\n"
    )
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-m",
        "mcpfy_pulse.bin.mcpfy_proxy",
        "--",
        sys.executable,
        "-c",
        child_script,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        process.stdin.close()  # EOF immediately, well before the child produces anything

        line = await asyncio.wait_for(process.stdout.readline(), timeout=10)
        response = json.loads(line)
        assert response["result"]["ok"] is True

        returncode = await asyncio.wait_for(process.wait(), timeout=10)
        assert returncode == 0  # a negative returncode would mean the proxy killed itself
    finally:
        if process.returncode is None:
            process.kill()
            await process.wait()
