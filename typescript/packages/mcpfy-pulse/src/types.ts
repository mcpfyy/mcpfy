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
}
