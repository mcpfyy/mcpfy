import type { TelemetryOptions } from "./types.js";

// Path matches the real route on cloudmcp-nest: POST /v1/telemetry/ingest.
const DEFAULT_ENDPOINT = "https://api.mcpfy.ai/v1/telemetry/ingest";
const DEFAULT_FLUSH_INTERVAL_MS = 5000;
const DEFAULT_MAX_BATCH_SIZE = 500;

export interface ResolvedConfig {
  apiKey: string | undefined;
  endpoint: string;
  flushIntervalMs: number;
  maxBatchSize: number;
}

export function resolveConfig(options?: TelemetryOptions): ResolvedConfig {
  return {
    apiKey: options?.apiKey ?? process.env.MCPFY_API_KEY,
    endpoint: options?.endpoint ?? process.env.MCPFY_TELEMETRY_ENDPOINT ?? DEFAULT_ENDPOINT,
    flushIntervalMs: options?.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS,
    maxBatchSize: options?.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE,
  };
}
