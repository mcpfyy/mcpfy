import { describe, expect, it } from "vitest";
import { MessageClassifier } from "../src/core/classify.js";

describe("MessageClassifier — existing request/response behavior", () => {
  it("ignores notifications without an id", () => {
    const classifier = new MessageClassifier();
    const event = classifier.onIncoming({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(event).toBeUndefined();
  });

  it("round-trips a tools/call into an event with the tool name", () => {
    const classifier = new MessageClassifier();
    classifier.onIncoming({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "add", arguments: { a: 1, b: 2 } },
    });
    const event = classifier.onOutgoing({ jsonrpc: "2.0", id: 1, result: { content: [], isError: false } });

    expect(event).toBeDefined();
    expect(event!.method).toBe("tools/call");
    expect(event!.toolName).toBe("add");
    expect(event!.outcome).toBe("ok");
    expect(event!.progressUpdateCount).toBe(0);
  });

  it("does not treat a server-initiated request as a response", () => {
    const classifier = new MessageClassifier();
    const event = classifier.onOutgoing({
      jsonrpc: "2.0",
      id: 1,
      method: "sampling/createMessage",
      params: {},
    });
    expect(event).toBeUndefined();
  });

  it("treats an explicit null params the same as an absent params key (argsBytes 0)", () => {
    // Parity with classify.py's _byte_length: once parsed, a Python dict can't tell
    // "no params key" and "params: null" apart, so both must collapse to 0 bytes here
    // too, rather than argsBytes swinging on a client's JSON-serialization choice.
    const classifier = new MessageClassifier();
    classifier.onIncoming({ jsonrpc: "2.0", id: 6, method: "tools/list", params: null });
    const event = classifier.onOutgoing({ jsonrpc: "2.0", id: 6, result: { tools: [] } });
    expect(event!.argsBytes).toBe(0);
  });
});

describe("MessageClassifier — cancellation", () => {
  it("turns a matched notifications/cancelled into a completed event with outcome cancelled", () => {
    const classifier = new MessageClassifier();
    classifier.onIncoming({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "slow-tool" },
    });

    const event = classifier.onIncoming({
      jsonrpc: "2.0",
      method: "notifications/cancelled",
      params: { requestId: 7, reason: "user aborted — should never be captured" },
    });

    expect(event).toBeDefined();
    expect(event!.type).toBe("request");
    expect(event!.method).toBe("tools/call");
    expect(event!.toolName).toBe("slow-tool");
    expect(event!.outcome).toBe("cancelled");
    expect(JSON.stringify(event)).not.toContain("user aborted");

    // The request is now resolved — a late response for the same id must not double-emit.
    const late = classifier.onOutgoing({ jsonrpc: "2.0", id: 7, result: { content: [] } });
    expect(late).toBeUndefined();
  });

  it("is a no-op when the cancelled request was never seen", () => {
    const classifier = new MessageClassifier();
    const event = classifier.onIncoming({
      jsonrpc: "2.0",
      method: "notifications/cancelled",
      params: { requestId: 999 },
    });
    expect(event).toBeUndefined();
  });
});

describe("MessageClassifier — progress", () => {
  it("counts progress notifications correlated by token and attaches the count on completion", () => {
    const classifier = new MessageClassifier();
    classifier.onIncoming({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "long-tool", _meta: { progressToken: "tok-1" } },
    });

    expect(
      classifier.onOutgoing({
        jsonrpc: "2.0",
        method: "notifications/progress",
        params: { progressToken: "tok-1", progress: 1, total: 3 },
      }),
    ).toBeUndefined();
    expect(
      classifier.onOutgoing({
        jsonrpc: "2.0",
        method: "notifications/progress",
        params: { progressToken: "tok-1", progress: 2, total: 3 },
      }),
    ).toBeUndefined();

    const event = classifier.onOutgoing({ jsonrpc: "2.0", id: 3, result: { content: [] } });
    expect(event!.progressUpdateCount).toBe(2);
  });

  it("defaults progressUpdateCount to 0 when no progress token was set", () => {
    const classifier = new MessageClassifier();
    classifier.onIncoming({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "quiet-tool" } });
    const event = classifier.onOutgoing({ jsonrpc: "2.0", id: 4, result: { content: [] } });
    expect(event!.progressUpdateCount).toBe(0);
  });
});

describe("MessageClassifier — log messages and list_changed", () => {
  it("emits a notification event with only the log level, never the log payload", () => {
    const classifier = new MessageClassifier();
    const event = classifier.onOutgoing({
      jsonrpc: "2.0",
      method: "notifications/message",
      params: { level: "error", logger: "db", data: { secret: "never captured" } },
    });

    expect(event).toBeDefined();
    expect(event!.type).toBe("notification");
    expect(event!.method).toBe("notifications/message");
    expect(event!.logLevel).toBe("error");
    expect(JSON.stringify(event)).not.toContain("never captured");
    expect(JSON.stringify(event)).not.toContain("logger");
  });

  it("emits a bare notification event for each list_changed method", () => {
    const classifier = new MessageClassifier();
    for (const method of [
      "notifications/tools/list_changed",
      "notifications/resources/list_changed",
      "notifications/prompts/list_changed",
    ]) {
      const event = classifier.onOutgoing({ jsonrpc: "2.0", method });
      expect(event).toEqual(expect.objectContaining({ type: "notification", method }));
    }
  });
});

describe("MessageClassifier — capability negotiation", () => {
  it("extracts declared client and server capabilities as dotted paths, skipping experimental", () => {
    const classifier = new MessageClassifier();
    classifier.onIncoming({
      jsonrpc: "2.0",
      id: 9,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        clientInfo: { name: "test-client", version: "1.0.0" },
        capabilities: {
          sampling: {},
          roots: { listChanged: true },
          experimental: { customThing: {} },
        },
      },
    });
    const event = classifier.onOutgoing({
      jsonrpc: "2.0",
      id: 9,
      result: {
        serverInfo: { name: "my-server", version: "0.1.0" },
        capabilities: {
          logging: {},
          tools: { listChanged: true },
          resources: { subscribe: true, listChanged: false },
        },
      },
    });

    expect(event!.clientCapabilities).toEqual(expect.arrayContaining(["sampling", "roots", "roots.listChanged"]));
    expect(event!.clientCapabilities).not.toContain("experimental");
    expect(event!.serverCapabilities).toEqual(
      expect.arrayContaining(["logging", "tools", "tools.listChanged", "resources", "resources.subscribe"]),
    );
    expect(event!.serverCapabilities).not.toContain("resources.listChanged");
  });
});

describe("MessageClassifier — declared tool metadata", () => {
  it("captures outputSchema presence and annotation hints without any content", () => {
    const classifier = new MessageClassifier();
    classifier.onIncoming({ jsonrpc: "2.0", id: 5, method: "tools/list", params: null });
    const event = classifier.onOutgoing({
      jsonrpc: "2.0",
      id: 5,
      result: {
        tools: [
          {
            name: "delete-file",
            description: "Deletes a file",
            inputSchema: { properties: {} },
            outputSchema: { type: "object" },
            annotations: { destructiveHint: true, readOnlyHint: false },
          },
          { name: "read-file", inputSchema: { properties: {} } },
        ],
      },
    });

    const [destructive, plain] = event!.declaredTools!;
    expect(destructive.hasOutputSchema).toBe(true);
    expect(destructive.destructiveHint).toBe(true);
    expect(destructive.readOnlyHint).toBe(false);
    expect(plain.hasOutputSchema).toBe(false);
    expect(plain.destructiveHint).toBeUndefined();

    const wireText = JSON.stringify(event);
    expect(wireText).not.toContain("Deletes a file");
  });
});
