/**
 * Structural stand-in for the MCP SDK's `Transport` interface. Kept local (rather than
 * depending on @modelcontextprotocol/sdk) so this package stays dependency-free — any
 * real Transport (stdio, StreamableHTTP, or a third-party SDK's own transport) already
 * satisfies this shape.
 */
export interface MinimalTransport {
  start(): Promise<void>;
  close(): Promise<void>;
  send(message: any, options?: any): Promise<void>;
  onmessage?: (message: any, extra?: any) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  sessionId?: string;
}

export type SdkName = "mcpfy-sdk" | "@modelcontextprotocol/sdk" | "unknown";
export type InstallMode = "sdk-env" | "sdk-wrapper" | "stdio-proxy";

/**
 * One declared tool from a `tools/list` response, reduced to lightweight metadata —
 * never the description text or schema itself, same "never content" treatment as
 * everything else this package captures. Powers capability-gap / orphan-tool /
 * description-quality scoring server-side without ever shipping the actual text.
 */
export interface DeclaredToolMeta {
  name: string;
  hasDescription: boolean;
  descriptionLength: number;
  paramCount: number;
  paramsWithDescriptionCount: number;
}

export interface TelemetryOptions {
  /** Defaults to the MCPFY_API_KEY env var. Unset (in either form) = no-op, nothing is sent. */
  apiKey?: string;
  /** Defaults to MCPFY_TELEMETRY_ENDPOINT env var, then the MCPFY ingest URL. */
  endpoint?: string;
  serverName?: string;
  serverVersion?: string;
  sdkName?: SdkName;
  sdkVersion?: string;
  installMode?: InstallMode;
  flushIntervalMs?: number;
  maxBatchSize?: number;
}

/**
 * What actually crosses the wire. Method names, byte counts, timing, and outcome only —
 * never argument values or result content. See telemetry-master-plan.md §2-3.
 */
export interface TelemetryEvent {
  type: "request";
  method: string;
  toolName?: string;
  promptName?: string;
  resourceUri?: string;
  clientName?: string;
  clientVersion?: string;
  protocolVersion?: string;
  serverName?: string;
  serverVersion?: string;
  argsBytes?: number;
  resultBytes?: number;
  durationMs?: number;
  outcome?: "ok" | "error";
  errorCode?: number;
  timestamp: string;
  /**
   * `tools/call` only: the result's own `isError` flag (MCP's CallToolResult.isError) —
   * a tool that ran fine at the JSON-RPC level (outcome:"ok") but reports its own
   * business-logic failure in-band. One boolean read off the result envelope, same
   * "protocol metadata, not content" treatment as clientInfo on `initialize` — never the
   * result content itself.
   */
  resultIsError?: boolean;
  /**
   * `tools/list` only: the declared tool catalog, reduced to non-content metadata.
   * See `DeclaredToolMeta`.
   */
  declaredTools?: DeclaredToolMeta[];
}
