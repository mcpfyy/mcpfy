import { resolveConfig } from "./config.js";
import { MessageClassifier } from "./core/classify.js";
import { TelemetryBatcher } from "./core/batcher.js";
import type { MinimalTransport, TelemetryOptions } from "./types.js";

/**
 * Wraps a Transport's `onmessage`/`send` seam to capture telemetry, then delegates
 * everything through to the real transport unchanged. If no API key is configured
 * (via `options.apiKey` or the MCPFY_API_KEY env var), this is a complete no-op —
 * the original transport is returned untouched.
 *
 * Usage (add these lines yourself — nothing here edits your files for you):
 *
 *   import { withMcpfyTelemetry } from "mcpfy-pulse";
 *   const transport = new StdioServerTransport();
 *   await server.connect(withMcpfyTelemetry(transport, { apiKey: process.env.MCPFY_API_KEY }));
 */
export function withMcpfyTelemetry<T extends MinimalTransport>(transport: T, options?: TelemetryOptions): T {
  const config = resolveConfig(options);
  if (!config.apiKey) return transport;

  const classifier = new MessageClassifier();
  const batcher = new TelemetryBatcher(config, {
    serverName: options?.serverName,
    serverVersion: options?.serverVersion,
    sdkName: options?.sdkName ?? "@modelcontextprotocol/sdk",
    sdkVersion: options?.sdkVersion,
    installMode: options?.installMode ?? "sdk-wrapper",
  });

  const wrapped: MinimalTransport = {
    start: () => transport.start(),
    close: () => {
      void batcher.close();
      return transport.close();
    },
    send: (message: any, sendOptions?: any) => {
      const event = classifier.onOutgoing(message);
      if (event) batcher.push(event);
      return transport.send(message, sendOptions);
    },
    get sessionId() {
      return transport.sessionId;
    },
    get onclose() {
      return transport.onclose;
    },
    set onclose(fn) {
      transport.onclose = fn;
    },
    get onerror() {
      return transport.onerror;
    },
    set onerror(fn) {
      transport.onerror = fn;
    },
    get onmessage() {
      return transport.onmessage;
    },
    set onmessage(handler) {
      transport.onmessage = (message: any, extra?: any) => {
        classifier.onIncoming(message);
        handler?.(message, extra);
      };
    },
  };

  return wrapped as T;
}
