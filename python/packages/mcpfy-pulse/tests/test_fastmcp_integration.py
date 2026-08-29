import pytest

from mcpfy_pulse.integrations.fastmcp import instrument_fastmcp
from mcpfy_pulse.types import TelemetryOptions


class _FakeApp:
    """Stand-in for anything exposing the `_mcp_server.run(...)` seam both
    FastMCP flavors share, without needing a live server."""

    def __init__(self):
        self._mcp_server = _FakeLowLevelServer()


class _FakeLowLevelServer:
    async def run(self, read_stream, write_stream, *args, **kwargs):
        return ("ran", read_stream, write_stream)


def _is_patched(mcp_server) -> bool:
    # `.run` is a class-level method, so two attribute accesses never share
    # identity even when unpatched (each access re-binds a fresh method
    # object) — the `_mcpfy_pulse_patched` marker (and the swapped __name__)
    # are the reliable signals that instrument_fastmcp actually ran.
    return getattr(mcp_server, "_mcpfy_pulse_patched", False) is True and mcp_server.run.__name__ == "patched_run"


def test_noop_when_api_key_unset(monkeypatch):
    monkeypatch.delenv("MCPFY_API_KEY", raising=False)
    app = _FakeApp()

    result = instrument_fastmcp(app)

    assert result is app
    assert _is_patched(app._mcp_server) is False


def test_patches_mcp_server_run_and_wraps_streams():
    app = _FakeApp()

    instrument_fastmcp(app, TelemetryOptions(api_key="mk_test", endpoint="https://127.0.0.1:1/unreachable", flush_interval_ms=60_000))

    assert _is_patched(app._mcp_server) is True


def test_double_instrumentation_is_idempotent():
    app = _FakeApp()
    instrument_fastmcp(app, TelemetryOptions(api_key="mk_test", flush_interval_ms=60_000))
    once_patched = app._mcp_server.run  # a plain function stored on the instance now, stable identity
    instrument_fastmcp(app, TelemetryOptions(api_key="mk_test", flush_interval_ms=60_000))
    assert app._mcp_server.run is once_patched


def test_raises_typeerror_for_unrecognized_object():
    with pytest.raises(TypeError):
        instrument_fastmcp(object(), TelemetryOptions(api_key="mk_test"))


def test_works_against_official_bundled_fastmcp():
    mcp_module = pytest.importorskip("mcp.server.fastmcp")
    app = mcp_module.FastMCP("test-server")

    instrument_fastmcp(app, TelemetryOptions(api_key="mk_test", flush_interval_ms=60_000))

    assert _is_patched(app._mcp_server) is True


def test_works_against_standalone_fastmcp_package():
    fastmcp_module = pytest.importorskip("fastmcp")
    app = fastmcp_module.FastMCP("test-server")

    instrument_fastmcp(app, TelemetryOptions(api_key="mk_test", flush_interval_ms=60_000))

    assert _is_patched(app._mcp_server) is True
