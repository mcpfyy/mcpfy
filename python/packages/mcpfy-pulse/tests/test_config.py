import pytest

from mcpfy_pulse.config import DEFAULT_ENDPOINT, DEFAULT_FLUSH_INTERVAL_MS, DEFAULT_MAX_BATCH_SIZE, resolve_config
from mcpfy_pulse.types import TelemetryOptions


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    monkeypatch.delenv("MCPFY_API_KEY", raising=False)
    monkeypatch.delenv("MCPFY_TELEMETRY_ENDPOINT", raising=False)


def test_defaults_with_no_options_and_no_env():
    config = resolve_config()
    assert config.api_key is None
    assert config.endpoint == DEFAULT_ENDPOINT
    assert config.flush_interval_ms == DEFAULT_FLUSH_INTERVAL_MS
    assert config.max_batch_size == DEFAULT_MAX_BATCH_SIZE


def test_env_vars_are_used_when_options_unset(monkeypatch):
    monkeypatch.setenv("MCPFY_API_KEY", "mk_live_from_env")
    monkeypatch.setenv("MCPFY_TELEMETRY_ENDPOINT", "https://example.test/ingest")
    config = resolve_config()
    assert config.api_key == "mk_live_from_env"
    assert config.endpoint == "https://example.test/ingest"


def test_explicit_options_take_precedence_over_env(monkeypatch):
    monkeypatch.setenv("MCPFY_API_KEY", "mk_live_from_env")
    config = resolve_config(TelemetryOptions(api_key="mk_live_explicit"))
    assert config.api_key == "mk_live_explicit"


def test_explicit_flush_and_batch_overrides():
    config = resolve_config(TelemetryOptions(flush_interval_ms=1000, max_batch_size=10))
    assert config.flush_interval_ms == 1000
    assert config.max_batch_size == 10
