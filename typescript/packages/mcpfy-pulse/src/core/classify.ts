import type { DeclaredToolMeta, TelemetryEvent } from "../types.js";

interface PendingEntry {
  method: string;
  startedAt: number;
  argsBytes: number;
  extra: Partial<TelemetryEvent>;
}

function byteLength(value: unknown): number {
  if (value === undefined) return 0;
  try {
    return Buffer.byteLength(JSON.stringify(value));
  } catch {
    return 0;
  }
}

/**
 * Reduces a `tools/list` response's `result.tools` array to non-content metadata —
 * whether/how-long each description is, and how many of its params are individually
 * documented. Never reads the description text or schema into the event itself.
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
    declared.push({
      name: tool.name,
      hasDescription: description.trim().length > 0,
      descriptionLength: description.length,
      paramCount: paramNames.length,
      paramsWithDescriptionCount,
    });
  }
  return declared;
}

function extractLabel(method: string, params: any): Partial<TelemetryEvent> {
  switch (method) {
    case "tools/call":
      return { toolName: params?.name };
    case "prompts/get":
      return { promptName: params?.name };
    case "resources/read":
      return { resourceUri: params?.uri };
    case "initialize":
      // Protocol handshake metadata, not user data — same fields the spec itself exchanges in the clear.
      return {
        clientName: params?.clientInfo?.name,
        clientVersion: params?.clientInfo?.version,
        protocolVersion: params?.protocolVersion,
      };
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
 * Server-initiated requests/notifications (sampling, elicitation, logging,
 * progress) are intentionally not tracked yet — out of scope for this pass.
 */
export class MessageClassifier {
  private pending = new Map<string | number, PendingEntry>();

  onIncoming(message: any): void {
    if (!message || typeof message !== "object") return;
    const { id, method, params } = message;
    if (id === undefined || !method) return; // only requests carry both an id and a method
    this.pending.set(id, {
      method,
      startedAt: Date.now(),
      argsBytes: byteLength(params),
      extra: extractLabel(method, params),
    });
  }

  onOutgoing(message: any): TelemetryEvent | undefined {
    if (!message || typeof message !== "object") return undefined;
    const { id, method, result, error } = message;
    if (method || id === undefined) return undefined;

    const pending = this.pending.get(id);
    if (!pending) return undefined;
    this.pending.delete(id);

    const event: TelemetryEvent = {
      type: "request",
      method: pending.method,
      argsBytes: pending.argsBytes,
      resultBytes: byteLength(error ?? result),
      durationMs: Date.now() - pending.startedAt,
      outcome: error ? "error" : "ok",
      errorCode: error?.code,
      timestamp: new Date().toISOString(),
      ...pending.extra,
    };

    if (pending.method === "initialize" && result?.serverInfo) {
      event.serverName = result.serverInfo.name;
      event.serverVersion = result.serverInfo.version;
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
