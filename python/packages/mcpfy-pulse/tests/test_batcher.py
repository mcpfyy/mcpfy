import httpx
import pytest

from mcpfy_pulse.config import ResolvedConfig
from mcpfy_pulse.core.batcher import BatchMeta, TelemetryBatcher
from mcpfy_pulse.types import TelemetryEvent


def _config(**overrides) -> ResolvedConfig:
    defaults = dict(api_key="mk_live_test", endpoint="https://example.test/v1/telemetry/ingest", flush_interval_ms=60_000, max_batch_size=500)
    defaults.update(overrides)
    return ResolvedConfig(**defaults)


def _event(method="tools/call") -> TelemetryEvent:
    return TelemetryEvent(method=method, timestamp="2026-01-01T00:00:00.000Z", outcome="ok")


@pytest.mark.asyncio
async def test_flush_posts_batch_with_expected_wire_shape():
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(202, json={"queued": 1})

    batcher = TelemetryBatcher(_config(), BatchMeta(sdk_name="@modelcontextprotocol/sdk", install_mode="sdk-wrapper"))
    batcher._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))

    batcher.push(_event())
    await batcher.flush()

    assert len(requests) == 1
    req = requests[0]
    assert req.headers["authorization"] == "Bearer mk_live_test"
    body = httpx.Response(200, content=req.content).json()
    assert body["installMode"] == "sdk-wrapper"
    assert body["sdkName"] == "@modelcontextprotocol/sdk"
    assert len(body["events"]) == 1
    assert body["events"][0]["method"] == "tools/call"

    await batcher.close()


@pytest.mark.asyncio
async def test_flush_is_noop_when_queue_empty():
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(202)

    batcher = TelemetryBatcher(_config(), BatchMeta())
    batcher._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))

    await batcher.flush()
    assert calls == 0
    await batcher.close()


@pytest.mark.asyncio
async def test_non_2xx_response_drops_silently_without_raising():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"message": "Invalid or missing telemetry key"})

    batcher = TelemetryBatcher(_config(), BatchMeta())
    batcher._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))

    batcher.push(_event())
    await batcher.flush()  # must not raise

    await batcher.close()


@pytest.mark.asyncio
async def test_network_error_drops_silently_without_raising():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    batcher = TelemetryBatcher(_config(), BatchMeta())
    batcher._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))

    batcher.push(_event())
    await batcher.flush()  # must not raise

    await batcher.close()


@pytest.mark.asyncio
async def test_push_flushes_immediately_when_batch_is_full():
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(202)

    batcher = TelemetryBatcher(_config(max_batch_size=2), BatchMeta())
    batcher._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))

    batcher.push(_event())
    batcher.push(_event())  # hits max_batch_size -> fire-and-forget flush task
    await batcher.close()  # drains any in-flight/pending flush

    assert len(requests) == 1
