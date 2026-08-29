from mcpfy_pulse.core.classify import MessageClassifier


def test_ignores_notifications_without_id():
    classifier = MessageClassifier()
    classifier.on_incoming({"jsonrpc": "2.0", "method": "notifications/initialized"})
    assert classifier._pending == {}


def test_tools_call_round_trip_produces_event_with_tool_name():
    classifier = MessageClassifier()
    classifier.on_incoming({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "add", "arguments": {"a": 1, "b": 2}}})
    event = classifier.on_outgoing({"jsonrpc": "2.0", "id": 1, "result": {"content": [], "isError": False}})

    assert event is not None
    assert event.method == "tools/call"
    assert event.tool_name == "add"
    assert event.outcome == "ok"
    assert event.args_bytes and event.args_bytes > 0
    assert event.duration_ms is not None and event.duration_ms >= 0


def test_tools_call_result_is_error_flag_captured():
    classifier = MessageClassifier()
    classifier.on_incoming({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "flaky"}})
    event = classifier.on_outgoing({"jsonrpc": "2.0", "id": 2, "result": {"content": [], "isError": True}})

    assert event.outcome == "ok"  # JSON-RPC level succeeded
    assert event.result_is_error is True


def test_jsonrpc_error_sets_outcome_error_and_code():
    classifier = MessageClassifier()
    classifier.on_incoming({"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "missing"}})
    event = classifier.on_outgoing({"jsonrpc": "2.0", "id": 3, "error": {"code": -32601, "message": "Method not found"}})

    assert event.outcome == "error"
    assert event.error_code == -32601


def test_initialize_captures_client_and_server_info():
    classifier = MessageClassifier()
    classifier.on_incoming(
        {
            "jsonrpc": "2.0",
            "id": 4,
            "method": "initialize",
            "params": {"protocolVersion": "2025-06-18", "clientInfo": {"name": "test-client", "version": "1.0.0"}},
        }
    )
    event = classifier.on_outgoing(
        {
            "jsonrpc": "2.0",
            "id": 4,
            "result": {"serverInfo": {"name": "my-server", "version": "0.1.0"}, "protocolVersion": "2025-06-18"},
        }
    )

    assert event.client_name == "test-client"
    assert event.client_version == "1.0.0"
    assert event.protocol_version == "2025-06-18"
    assert event.server_name == "my-server"
    assert event.server_version == "0.1.0"


def test_tools_list_declared_tools_never_captures_description_text():
    classifier = MessageClassifier()
    classifier.on_incoming({"jsonrpc": "2.0", "id": 5, "method": "tools/list", "params": None})
    event = classifier.on_outgoing(
        {
            "jsonrpc": "2.0",
            "id": 5,
            "result": {
                "tools": [
                    {
                        "name": "add",
                        "description": "Add two numbers together",
                        "inputSchema": {
                            "properties": {
                                "a": {"type": "number", "description": "first addend"},
                                "b": {"type": "number"},
                            }
                        },
                    },
                    {"name": "noop", "inputSchema": {"properties": {}}},
                ]
            },
        }
    )

    assert event.declared_tools is not None
    add_meta, noop_meta = event.declared_tools
    assert add_meta.name == "add"
    assert add_meta.has_description is True
    assert add_meta.description_length == len("Add two numbers together")
    assert add_meta.param_count == 2
    assert add_meta.params_with_description_count == 1
    assert noop_meta.has_description is False
    assert noop_meta.param_count == 0

    wire = event.to_wire_dict()
    wire_text = str(wire["declaredTools"])
    assert "Add two numbers together" not in wire_text  # never ships description text
    assert "first addend" not in wire_text


def test_response_without_matching_pending_request_is_ignored():
    classifier = MessageClassifier()
    assert classifier.on_outgoing({"jsonrpc": "2.0", "id": 999, "result": {}}) is None


def test_outgoing_request_from_server_is_not_treated_as_a_response():
    classifier = MessageClassifier()
    # A server-initiated request (e.g. sampling) has both an id and a method -
    # on_outgoing must ignore it (method present => not a response/error).
    assert classifier.on_outgoing({"jsonrpc": "2.0", "id": 1, "method": "sampling/createMessage", "params": {}}) is None


def test_cancelled_notification_turns_matched_pending_request_into_cancelled_event():
    classifier = MessageClassifier()
    classifier.on_incoming(
        {"jsonrpc": "2.0", "id": 7, "method": "tools/call", "params": {"name": "slow-tool"}}
    )

    event = classifier.on_incoming(
        {
            "jsonrpc": "2.0",
            "method": "notifications/cancelled",
            "params": {"requestId": 7, "reason": "user aborted — should never be captured"},
        }
    )

    assert event is not None
    assert event.type == "request"
    assert event.method == "tools/call"
    assert event.tool_name == "slow-tool"
    assert event.outcome == "cancelled"
    assert "user aborted" not in str(event.to_wire_dict())

    # The request is now resolved - a late response for the same id must not double-emit.
    assert classifier.on_outgoing({"jsonrpc": "2.0", "id": 7, "result": {"content": []}}) is None


def test_cancelled_notification_with_no_matching_pending_request_is_a_no_op():
    classifier = MessageClassifier()
    event = classifier.on_incoming(
        {"jsonrpc": "2.0", "method": "notifications/cancelled", "params": {"requestId": 999}}
    )
    assert event is None


def test_progress_notifications_are_counted_and_attached_on_completion():
    classifier = MessageClassifier()
    classifier.on_incoming(
        {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {"name": "long-tool", "_meta": {"progressToken": "tok-1"}},
        }
    )

    assert (
        classifier.on_outgoing(
            {"jsonrpc": "2.0", "method": "notifications/progress", "params": {"progressToken": "tok-1", "progress": 1}}
        )
        is None
    )
    assert (
        classifier.on_outgoing(
            {"jsonrpc": "2.0", "method": "notifications/progress", "params": {"progressToken": "tok-1", "progress": 2}}
        )
        is None
    )

    event = classifier.on_outgoing({"jsonrpc": "2.0", "id": 3, "result": {"content": []}})
    assert event.progress_update_count == 2


def test_progress_update_count_defaults_to_zero_without_a_progress_token():
    classifier = MessageClassifier()
    classifier.on_incoming({"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "quiet-tool"}})
    event = classifier.on_outgoing({"jsonrpc": "2.0", "id": 4, "result": {"content": []}})
    assert event.progress_update_count == 0


def test_log_message_notification_captures_only_the_level():
    classifier = MessageClassifier()
    event = classifier.on_outgoing(
        {
            "jsonrpc": "2.0",
            "method": "notifications/message",
            "params": {"level": "error", "logger": "db", "data": {"secret": "never captured"}},
        }
    )

    assert event is not None
    assert event.type == "notification"
    assert event.method == "notifications/message"
    assert event.log_level == "error"
    wire_text = str(event.to_wire_dict())
    assert "never captured" not in wire_text
    assert "logger" not in wire_text


def test_list_changed_notifications_emit_bare_notification_events():
    classifier = MessageClassifier()
    for method in (
        "notifications/tools/list_changed",
        "notifications/resources/list_changed",
        "notifications/prompts/list_changed",
    ):
        event = classifier.on_outgoing({"jsonrpc": "2.0", "method": method})
        assert event is not None
        assert event.type == "notification"
        assert event.method == method


def test_initialize_extracts_capabilities_as_dotted_paths_skipping_experimental():
    classifier = MessageClassifier()
    classifier.on_incoming(
        {
            "jsonrpc": "2.0",
            "id": 9,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "clientInfo": {"name": "test-client", "version": "1.0.0"},
                "capabilities": {
                    "sampling": {},
                    "roots": {"listChanged": True},
                    "experimental": {"customThing": {}},
                },
            },
        }
    )
    event = classifier.on_outgoing(
        {
            "jsonrpc": "2.0",
            "id": 9,
            "result": {
                "serverInfo": {"name": "my-server", "version": "0.1.0"},
                "capabilities": {
                    "logging": {},
                    "tools": {"listChanged": True},
                    "resources": {"subscribe": True, "listChanged": False},
                },
            },
        }
    )

    assert set(event.client_capabilities) == {"sampling", "roots", "roots.listChanged"}
    assert set(event.server_capabilities) == {"logging", "tools", "tools.listChanged", "resources", "resources.subscribe"}


def test_declared_tools_capture_output_schema_and_annotation_hints_without_content():
    classifier = MessageClassifier()
    classifier.on_incoming({"jsonrpc": "2.0", "id": 5, "method": "tools/list", "params": None})
    event = classifier.on_outgoing(
        {
            "jsonrpc": "2.0",
            "id": 5,
            "result": {
                "tools": [
                    {
                        "name": "delete-file",
                        "description": "Deletes a file",
                        "inputSchema": {"properties": {}},
                        "outputSchema": {"type": "object"},
                        "annotations": {"destructiveHint": True, "readOnlyHint": False},
                    },
                    {"name": "read-file", "inputSchema": {"properties": {}}},
                ]
            },
        }
    )

    destructive, plain = event.declared_tools
    assert destructive.has_output_schema is True
    assert destructive.destructive_hint is True
    assert destructive.read_only_hint is False
    assert plain.has_output_schema is False
    assert plain.destructive_hint is None

    wire_text = str(event.to_wire_dict())
    assert "Deletes a file" not in wire_text
