"""Mirrors typescript/packages/mcpfy-pulse/src/config.ts."""

from __future__ import annotations

import os
from dataclasses import dataclass

from .types import TelemetryOptions

# Path matches the real route on cloudmcp-nest: POST /v1/telemetry/ingest.
DEFAULT_ENDPOINT = "https://api.mcpfy.ai/v1/telemetry/ingest"
DEFAULT_FLUSH_INTERVAL_MS = 5000
DEFAULT_MAX_BATCH_SIZE = 500


@dataclass
class ResolvedConfig:
    api_key: str | None
    endpoint: str
    flush_interval_ms: int
    max_batch_size: int


def resolve_config(options: TelemetryOptions | None = None) -> ResolvedConfig:
    options = options or TelemetryOptions()
    return ResolvedConfig(
        api_key=options.api_key if options.api_key is not None else os.environ.get("MCPFY_API_KEY"),
        endpoint=options.endpoint
        if options.endpoint is not None
        else os.environ.get("MCPFY_TELEMETRY_ENDPOINT", DEFAULT_ENDPOINT),
        flush_interval_ms=options.flush_interval_ms
        if options.flush_interval_ms is not None
        else DEFAULT_FLUSH_INTERVAL_MS,
        max_batch_size=options.max_batch_size if options.max_batch_size is not None else DEFAULT_MAX_BATCH_SIZE,
    )
