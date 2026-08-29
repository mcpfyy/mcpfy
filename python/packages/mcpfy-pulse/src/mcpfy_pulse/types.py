"""Wire types for mcpfy-pulse.

Mirrors typescript/packages/mcpfy-pulse/src/types.ts. `sdk_name` and `install_mode`
are constrained to the values cloudmcp-nest's ingest DTO whitelists
(forbidNonWhitelisted: true) — see ingest-telemetry.dto.ts. There is no
Python-specific sdk_name value available without a backend change, so the Python
SDK reuses "@modelcontextprotocol/sdk" (it *is* the official MCP SDK, just the
Python build) and distinguishes mcp vs. FastMCP in the free-text sdk_version field
instead.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

SdkName = Literal["mcpfy-sdk", "@modelcontextprotocol/sdk", "unknown"]
InstallMode = Literal["sdk-env", "sdk-wrapper", "stdio-proxy"]
Outcome = Literal["ok", "error", "cancelled"]
EventType = Literal["request", "notification"]


@dataclass
class DeclaredToolMeta:
    """One declared tool from a `tools/list` response, reduced to lightweight
    metadata — never the description text or schema itself. Powers capability-gap /
    orphan-tool / description-quality scoring server-side without ever shipping the
    actual text."""

    name: str
    has_description: bool
    description_length: int
    param_count: int
    params_with_description_count: int
    has_output_schema: bool
    read_only_hint: bool | None = None
    destructive_hint: bool | None = None
    idempotent_hint: bool | None = None
    open_world_hint: bool | None = None

    def to_wire_dict(self) -> dict:
        out = {
            "name": self.name,
            "hasDescription": self.has_description,
            "descriptionLength": self.description_length,
            "paramCount": self.param_count,
            "paramsWithDescriptionCount": self.params_with_description_count,
            "hasOutputSchema": self.has_output_schema,
        }
        optional = {
            "readOnlyHint": self.read_only_hint,
            "destructiveHint": self.destructive_hint,
            "idempotentHint": self.idempotent_hint,
            "openWorldHint": self.open_world_hint,
        }
        for key, value in optional.items():
            if value is not None:
                out[key] = value
        return out


@dataclass
class TelemetryOptions:
    """Every field optional; `None` means "not set" (falls through to the env var
    or default in resolve_config), exactly matching the TS `TelemetryOptions`
    interface's `?` optionality."""

    api_key: str | None = None
    endpoint: str | None = None
    server_name: str | None = None
    server_version: str | None = None
    sdk_name: SdkName | None = None
    sdk_version: str | None = None
    install_mode: InstallMode | None = None
    flush_interval_ms: int | None = None
    max_batch_size: int | None = None


@dataclass
class TelemetryEvent:
    """What actually crosses the wire. Method names, byte counts, timing, and
    outcome only — never argument values or result content."""

    method: str
    timestamp: str
    type: EventType = "request"
    tool_name: str | None = None
    prompt_name: str | None = None
    resource_uri: str | None = None
    client_name: str | None = None
    client_version: str | None = None
    protocol_version: str | None = None
    server_name: str | None = None
    server_version: str | None = None
    args_bytes: int | None = None
    result_bytes: int | None = None
    duration_ms: int | None = None
    outcome: Outcome | None = None
    error_code: int | None = None
    result_is_error: bool | None = None
    declared_tools: list[DeclaredToolMeta] | None = field(default=None)
    # Count of `notifications/progress` messages correlated to this request via its
    # `_meta.progressToken`, before it completed. Always set (default 0) on completed
    # request events — never the progress values themselves.
    progress_update_count: int | None = None
    # `type="notification"`, `method="notifications/message"` only. Never the log
    # payload (`params.data`) or the logger name.
    log_level: str | None = None
    # `initialize` only: dotted capability paths each side declared. See classify.py's
    # `_extract_capabilities`. `experimental` capabilities are never included.
    client_capabilities: list[str] | None = None
    server_capabilities: list[str] | None = None

    def to_wire_dict(self) -> dict:
        out: dict = {"type": self.type, "method": self.method, "timestamp": self.timestamp}
        optional = {
            "toolName": self.tool_name,
            "promptName": self.prompt_name,
            "resourceUri": self.resource_uri,
            "clientName": self.client_name,
            "clientVersion": self.client_version,
            "protocolVersion": self.protocol_version,
            "serverName": self.server_name,
            "serverVersion": self.server_version,
            "argsBytes": self.args_bytes,
            "resultBytes": self.result_bytes,
            "durationMs": self.duration_ms,
            "outcome": self.outcome,
            "errorCode": self.error_code,
            "resultIsError": self.result_is_error,
            "progressUpdateCount": self.progress_update_count,
            "logLevel": self.log_level,
            "clientCapabilities": self.client_capabilities,
            "serverCapabilities": self.server_capabilities,
        }
        for key, value in optional.items():
            if value is not None:
                out[key] = value
        if self.declared_tools is not None:
            out["declaredTools"] = [t.to_wire_dict() for t in self.declared_tools]
        return out
