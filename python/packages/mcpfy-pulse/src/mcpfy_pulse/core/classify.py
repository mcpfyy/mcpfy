"""Mirrors typescript/packages/mcpfy-pulse/src/core/classify.ts.

Operates on plain dicts (produced from JSONRPCMessage.model_dump(by_alias=True,
exclude_none=True) at the streams.py boundary) rather than pydantic models, so this
stays a near-verbatim, easy-to-diff port of the TS classifier instead of growing
Python-model-specific branches.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from ..types import DeclaredToolMeta, TelemetryEvent

_CAPABILITY_GROUPS = (
    "sampling",
    "elicitation",
    "roots",
    "tasks",
    "logging",
    "prompts",
    "resources",
    "tools",
    "completions",
)


@dataclass
class _PendingEntry:
    method: str
    started_at: float  # time.monotonic() seconds
    args_bytes: int
    extra: dict[str, Any] = field(default_factory=dict)
    progress_token: str | None = None
    progress_count: int = 0


def _byte_length(value: Any) -> int:
    if value is None:
        return 0
    try:
        return len(json.dumps(value).encode("utf-8"))
    except (TypeError, ValueError):
        return 0


def _extract_declared_tools(tools: Any) -> list[DeclaredToolMeta] | None:
    """Reduces a `tools/list` response's `result.tools` array to non-content
    metadata — whether/how-long each description is, how many of its params are
    individually documented, and structured-output/annotation presence. Never reads
    the description text or schema into the event itself."""
    if not isinstance(tools, list):
        return None
    declared: list[DeclaredToolMeta] = []
    for tool in tools:
        if not isinstance(tool, dict) or not isinstance(tool.get("name"), str):
            continue
        description = tool.get("description") if isinstance(tool.get("description"), str) else ""
        properties = (tool.get("inputSchema") or {}).get("properties")
        param_names = list(properties.keys()) if isinstance(properties, dict) else []
        params_with_description_count = sum(
            1
            for p in param_names
            if isinstance(properties[p], dict)
            and isinstance(properties[p].get("description"), str)
            and properties[p]["description"].strip() != ""
        )
        annotations = tool.get("annotations") if isinstance(tool.get("annotations"), dict) else {}
        output_schema = tool.get("outputSchema")

        def _hint(name: str) -> bool | None:
            value = annotations.get(name)
            return value if isinstance(value, bool) else None

        declared.append(
            DeclaredToolMeta(
                name=tool["name"],
                has_description=description.strip() != "",
                description_length=len(description),
                param_count=len(param_names),
                params_with_description_count=params_with_description_count,
                has_output_schema=isinstance(output_schema, dict),
                read_only_hint=_hint("readOnlyHint"),
                destructive_hint=_hint("destructiveHint"),
                idempotent_hint=_hint("idempotentHint"),
                open_world_hint=_hint("openWorldHint"),
            )
        )
    return declared


def _extract_capabilities(capabilities: Any) -> list[str] | None:
    """Flattens a ClientCapabilities/ServerCapabilities dict to a list of dotted
    capability paths that are actually declared — group-presence for capabilities
    with no meaningful sub-flags, `<group>.<subflag>` for the handful that have one
    worth surfacing (resources/prompts/tools listChanged, resources.subscribe).
    `experimental` is deliberately skipped (arbitrary custom capability names, out
    of scope)."""
    if not isinstance(capabilities, dict):
        return None
    out: list[str] = []
    for group in _CAPABILITY_GROUPS:
        if group not in capabilities or capabilities[group] is None:
            continue
        out.append(group)
        value = capabilities[group]
        if isinstance(value, dict):
            if value.get("listChanged") is True:
                out.append(f"{group}.listChanged")
            if group == "resources" and value.get("subscribe") is True:
                out.append(f"{group}.subscribe")
    return out or None


def _extract_label(method: str, params: Any) -> dict[str, Any]:
    params = params if isinstance(params, dict) else {}
    if method == "tools/call":
        return {"tool_name": params.get("name")}
    if method == "prompts/get":
        return {"prompt_name": params.get("name")}
    if method == "resources/read":
        return {"resource_uri": params.get("uri")}
    if method == "initialize":
        # Protocol handshake metadata, not user data — same fields the spec itself
        # exchanges in the clear.
        client_info = params.get("clientInfo") if isinstance(params.get("clientInfo"), dict) else {}
        label: dict[str, Any] = {
            "client_name": client_info.get("name"),
            "client_version": client_info.get("version"),
            "protocol_version": params.get("protocolVersion"),
        }
        client_capabilities = _extract_capabilities(params.get("capabilities"))
        if client_capabilities:
            label["client_capabilities"] = client_capabilities
        return label
    return {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class MessageClassifier:
    """Tracks request/response pairs across the two seams every transport exposes
    (incoming = client-to-server, outgoing = server-to-client) and emits one event
    per completed request. Only method names, byte counts, timing, and outcome are
    captured — argument values and result content are never read beyond their byte
    length. The one exception is `tools/list`, where per-tool description/param
    *presence and length* are captured (never the description text or schema) —
    see `_extract_declared_tools`.

    Also tracks a handful of notification types now: `notifications/cancelled`
    (turns into a completed event with `outcome="cancelled"`, since the original
    request never gets a response), `notifications/progress` (counted per request,
    never the progress values themselves), and `notifications/message` plus the
    three list_changed notifications (emitted as standalone `type="notification"`
    events). Everything else server-initiated (sampling, elicitation, roots) is
    still intentionally not tracked — out of scope for this pass.
    """

    def __init__(self) -> None:
        self._pending: dict[Any, _PendingEntry] = {}
        self._pending_by_token: dict[str, Any] = {}

    def _forget_pending(self, id_: Any, pending: _PendingEntry) -> None:
        self._pending.pop(id_, None)
        if pending.progress_token is not None:
            self._pending_by_token.pop(pending.progress_token, None)

    def on_incoming(self, message: dict | None) -> TelemetryEvent | None:
        """Returns an event only for the one incoming case that completes a
        request without ever seeing a response: a client cancelling its own
        still-pending request. Every other incoming message (ordinary requests,
        `notifications/initialized`, and any other notification) returns `None`,
        matching prior behavior exactly."""
        if not isinstance(message, dict):
            return None
        id_ = message.get("id")
        method = message.get("method")
        params = message.get("params")

        if id_ is None and method == "notifications/cancelled":
            # Never read params.reason — free-text, same "never content" boundary
            # as everything else in this SDK.
            request_id = (params or {}).get("requestId") if isinstance(params, dict) else None
            if request_id is None:
                return None
            pending = self._pending.get(request_id)
            if pending is None:
                return None
            self._forget_pending(request_id, pending)
            return TelemetryEvent(
                type="request",
                method=pending.method,
                args_bytes=pending.args_bytes,
                duration_ms=round((time.monotonic() - pending.started_at) * 1000),
                outcome="cancelled",
                progress_update_count=pending.progress_count,
                timestamp=_now_iso(),
                **pending.extra,
            )

        if id_ is None or not method:
            return None  # only requests carry both an id and a method

        progress_token = (params or {}).get("_meta", {}).get("progressToken") if isinstance(params, dict) else None
        entry = _PendingEntry(
            method=method,
            started_at=time.monotonic(),
            args_bytes=_byte_length(params),
            extra=_extract_label(method, params),
        )
        if isinstance(progress_token, (str, int)):
            entry.progress_token = str(progress_token)
            self._pending_by_token[entry.progress_token] = id_
        self._pending[id_] = entry
        return None

    def on_outgoing(self, message: dict | None) -> TelemetryEvent | None:
        if not isinstance(message, dict):
            return None
        id_ = message.get("id")
        method = message.get("method")
        params = message.get("params")

        if method and id_ is None:
            # An outgoing notification (server -> client) — not a response.
            if method == "notifications/progress":
                token = str((params or {}).get("progressToken")) if isinstance(params, dict) else None
                pending_id = self._pending_by_token.get(token) if token is not None else None
                if pending_id is not None:
                    pending = self._pending.get(pending_id)
                    if pending is not None:
                        pending.progress_count += 1
                return None
            if method == "notifications/message":
                level = (params or {}).get("level") if isinstance(params, dict) else None
                return TelemetryEvent(
                    type="notification",
                    method=method,
                    log_level=level if isinstance(level, str) else None,
                    timestamp=_now_iso(),
                )
            if method in (
                "notifications/tools/list_changed",
                "notifications/resources/list_changed",
                "notifications/prompts/list_changed",
            ):
                return TelemetryEvent(type="notification", method=method, timestamp=_now_iso())
            return None  # other notifications / server-initiated requests — still out of scope

        if method or id_ is None:
            return None

        pending = self._pending.pop(id_, None)
        if pending is None:
            return None
        if pending.progress_token is not None:
            self._pending_by_token.pop(pending.progress_token, None)

        result = message.get("result")
        error = message.get("error")

        event = TelemetryEvent(
            type="request",
            method=pending.method,
            args_bytes=pending.args_bytes,
            result_bytes=_byte_length(error if error is not None else result),
            duration_ms=round((time.monotonic() - pending.started_at) * 1000),
            outcome="error" if error else "ok",
            error_code=(error.get("code") if isinstance(error, dict) else None),
            progress_update_count=pending.progress_count,
            timestamp=_now_iso(),
            **pending.extra,
        )

        if pending.method == "initialize" and not error and isinstance(result, dict):
            server_info = result.get("serverInfo") if isinstance(result.get("serverInfo"), dict) else None
            if server_info:
                event.server_name = server_info.get("name")
                event.server_version = server_info.get("version")
            server_capabilities = _extract_capabilities(result.get("capabilities"))
            if server_capabilities:
                event.server_capabilities = server_capabilities

        if pending.method == "tools/call" and not error and isinstance(result, dict) and result.get("isError") is True:
            event.result_is_error = True

        if pending.method == "tools/list" and not error and isinstance(result, dict):
            declared_tools = _extract_declared_tools(result.get("tools"))
            if declared_tools:
                event.declared_tools = declared_tools

        return event
