import type { DeclaredToolMeta, TelemetryEvent } from "../types.js";

interface PendingEntry {
  method: string;
  startedAt: number;
  argsBytes: number;
  extra: Partial<TelemetryEvent>;
  progressToken?: string;
  progressCount: number;
}

function byteLength(value: unknown): number {
  // `undefined` (no `params` key at all) and `null` (an explicit `"params": null`)
  // both mean "no meaningful params" — collapsed to the same 0 here so argsBytes
  // doesn't swing on a client's JSON-serialization choice. Matches classify.py's
  // `_byte_length`, which can't tell the two apart once parsed into a dict anyway.
  if (value === undefined || value === null) return 0;
  try {
    return Buffer.byteLength(JSON.stringify(value));
  } catch {
    return 0;
  }
}

/**
 * Reduces a `tools/list` response's `result.tools` array to non-content metadata —
 * whether/how-long each description is, and how many of its params are individually
 * documented, plus structured-output/annotation presence. Never reads the description
 * text or schema into the event itself.
 */
function extractDeclaredTools(tools: unknown): DeclaredToolMeta[] | undefined {
  if (!Array.isArray(tools)) return undefined;
  const declared: DeclaredToolMeta[] = [];
  for (const tool of tools) {
    if (!tool || typeof tool.name !== "string") continue;
    const description = typeof tool.description === "string" ? tool.description : "";
    const properties = tool.inputSchema?.properties;
    const paramNames = properties && typeof properties === "object" ? Object.keys(properties) : [];
    const paramsWithDescriptionCount = paramNames.filter(
      (p) => typeof properties[p]?.description === "string" && properties[p].description.trim().length > 0,
    ).length;
    const annotations = tool.annotations && typeof tool.annotations === "object" ? tool.annotations : undefined;
    declared.push({
      name: tool.name,
      hasDescription: description.trim().length > 0,
      descriptionLength: description.length,
      paramCount: paramNames.length,
      paramsWithDescriptionCount,
      hasOutputSchema: tool.outputSchema != null && typeof tool.outputSchema === "object",
      readOnlyHint: typeof annotations?.readOnlyHint === "boolean" ? annotations.readOnlyHint : undefined,
      destructiveHint: typeof annotations?.destructiveHint === "boolean" ? annotations.destructiveHint : undefined,
      idempotentHint: typeof annotations?.idempotentHint === "boolean" ? annotations.idempotentHint : undefined,
      openWorldHint: typeof annotations?.openWorldHint === "boolean" ? annotations.openWorldHint : undefined,
    });
  }
  return declared;
}

/**
 * Flattens a `ClientCapabilities`/`ServerCapabilities` object to a list of dotted
 * capability paths that are actually declared — group-presence for capabilities with
 * no meaningful sub-flags, `<group>.<subflag>` for the handful that have one worth
 * surfacing (resources/prompts/tools listChanged, resources.subscribe). `experimental`
 * is deliberately skipped (arbitrary custom capability names, out of scope).
 */
function extractCapabilities(capabilities: unknown): string[] | undefined {
  if (!capabilities || typeof capabilities !== "object") return undefined;
  const caps = capabilities as Record<string, any>;
  const out: string[] = [];
  const GROUPS = ["sampling", "elicitation", "roots", "tasks", "logging", "prompts", "resources", "tools", "completions"];
  for (const group of GROUPS) {
    const value = caps[group];
    if (value === undefined || value === null) continue;
    out.push(group);
    if (typeof value === "object") {
      if (value.listChanged === true) out.push(`${group}.listChanged`);
      if (group === "resources" && value.subscribe === true) out.push(`${group}.subscribe`);
    }
  }
  return out.length > 0 ? out : undefined;
}

function extractLabel(method: string, params: any): Partial<TelemetryEvent> {
  switch (method) {
    case "tools/call":
      return { toolName: params?.name };
    case "prompts/get":
      return { promptName: params?.name };
    case "resources/read":
      return { resourceUri: params?.uri };
    case "initialize": {
      // Protocol handshake metadata, not user data — same fields the spec itself exchanges in the clear.
      const label: Partial<TelemetryEvent> = {
        clientName: params?.clientInfo?.name,
        clientVersion: params?.clientInfo?.version,
        protocolVersion: params?.protocolVersion,
      };
      const clientCapabilities = extractCapabilities(params?.capabilities);
      if (clientCapabilities) label.clientCapabilities = clientCapabilities;
      return label;
    }
    default:
      return {};
  }
}

/**
 * Tracks request/response pairs across the two seams every Transport exposes
 * (onmessage = incoming, send = outgoing) and emits one event per completed
 * request. Only method names, byte counts, timing, and outcome are captured —
 * argument values and result content are never read beyond their byte length.
 * The one exception is `tools/list`, where per-tool description/param *presence
 * and length* are captured (never the description text or schema) — see
 * `extractDeclaredTools`.
 *
 * Also tracks a handful of notification types now: `notifications/cancelled` (turns
 * into a completed event with `outcome:"cancelled"`, since the original request never
 * gets a response), `notifications/progress` (counted per request, never the progress
 * values themselves), and `notifications/message` plus the three list_changed
 * notifications (emitted as standalone `type:"notification"` events). Everything else server-initiated
 * (sampling, elicitation, roots) is still intentionally not tracked — out of scope for
 * this pass.
 */
export class MessageClassifier {
  private pending = new Map<string | number, PendingEntry>();
  private pendingByToken = new Map<string, string | number>();

  private forgetPending(id: string | number, pending: PendingEntry): void {
    this.pending.delete(id);
    if (pending.progressToken !== undefined) this.pendingByToken.delete(pending.progressToken);
  }

  /**
   * Returns an event only for the one incoming case that completes a request without
   * ever seeing a response: a client cancelling its own still-pending request. Every
   * other incoming message (ordinary requests, `notifications/initialized`, and any
   * other notification) returns `undefined`, matching prior behavior exactly.
   */
  onIncoming(message: any): TelemetryEvent | undefined {
    if (!message || typeof message !== "object") return undefined;
    const { id, method, params } = message;

    if (id === undefined && method === "notifications/cancelled") {
      // Never read params.reason — free-text, same "never content" boundary as everything else.
      const requestId = params?.requestId;
      if (requestId === undefined) return undefined;
      const pending = this.pending.get(requestId);
      if (!pending) return undefined;
      this.forgetPending(requestId, pending);
      return {
        type: "request",
        method: pending.method,
        argsBytes: pending.argsBytes,
        durationMs: Date.now() - pending.startedAt,
        outcome: "cancelled",
        progressUpdateCount: pending.progressCount,
        timestamp: new Date().toISOString(),
        ...pending.extra,
      };
    }

    if (id === undefined || !method) return undefined; // only requests carry both an id and a method

    const progressToken = params?._meta?.progressToken;
    const entry: PendingEntry = {
      method,
      startedAt: Date.now(),
      argsBytes: byteLength(params),
      extra: extractLabel(method, params),
      progressCount: 0,
    };
    if (typeof progressToken === "string" || typeof progressToken === "number") {
      entry.progressToken = String(progressToken);
      this.pendingByToken.set(entry.progressToken, id);
    }
    this.pending.set(id, entry);
    return undefined;
  }

  onOutgoing(message: any): TelemetryEvent | undefined {
    if (!message || typeof message !== "object") return undefined;
    const { id, method, params, result, error } = message;

    if (method && id === undefined) {
      // An outgoing notification (server -> client) — not a response.
      if (method === "notifications/progress") {
        const pendingId = this.pendingByToken.get(String(params?.progressToken));
        if (pendingId !== undefined) {
          const pending = this.pending.get(pendingId);
          if (pending) pending.progressCount += 1;
        }
        return undefined;
      }
      if (method === "notifications/message") {
        return {
          type: "notification",
          method,
          logLevel: typeof params?.level === "string" ? params.level : undefined,
          timestamp: new Date().toISOString(),
        };
      }
      if (
        method === "notifications/tools/list_changed" ||
        method === "notifications/resources/list_changed" ||
        method === "notifications/prompts/list_changed"
      ) {
        return { type: "notification", method, timestamp: new Date().toISOString() };
      }
      return undefined; // other notifications / server-initiated requests — still out of scope
    }

    if (method || id === undefined) return undefined;

    const pending = this.pending.get(id);
    if (!pending) return undefined;
    this.forgetPending(id, pending);

    const event: TelemetryEvent = {
      type: "request",
      method: pending.method,
      argsBytes: pending.argsBytes,
      resultBytes: byteLength(error ?? result),
      durationMs: Date.now() - pending.startedAt,
      outcome: error ? "error" : "ok",
      errorCode: error?.code,
      progressUpdateCount: pending.progressCount,
      timestamp: new Date().toISOString(),
      ...pending.extra,
    };

    if (pending.method === "initialize" && !error) {
      if (result?.serverInfo) {
        event.serverName = result.serverInfo.name;
        event.serverVersion = result.serverInfo.version;
      }
      const serverCapabilities = extractCapabilities(result?.capabilities);
      if (serverCapabilities) event.serverCapabilities = serverCapabilities;
    }

    if (pending.method === "tools/call" && !error && result?.isError === true) {
      event.resultIsError = true;
    }

    if (pending.method === "tools/list" && !error) {
      const declaredTools = extractDeclaredTools(result?.tools);
      if (declaredTools) event.declaredTools = declaredTools;
    }

    return event;
  }
}
