import type { TelemetryEvent, SdkName, InstallMode } from "../types.js";
import type { ResolvedConfig } from "../config.js";

export interface BatchMeta {
  serverName?: string;
  serverVersion?: string;
  sdkName: SdkName;
  sdkVersion?: string;
  installMode: InstallMode;
}

/**
 * Ring-buffer batcher: queues events, flushes on a timer or when full, and never
 * throws or retries indefinitely — a failed or unreachable ingest endpoint is a
 * silent no-op, by design (telemetry must never affect the server's own behavior,
 * and the endpoint may not exist yet — see telemetry-master-plan.md §4/§7).
 */
export class TelemetryBatcher {
  private queue: TelemetryEvent[] = [];
  private timer: ReturnType<typeof setInterval>;

  constructor(
    private readonly config: ResolvedConfig,
    private readonly meta: BatchMeta
  ) {
    this.timer = setInterval(() => void this.flush(), config.flushIntervalMs);
    this.timer.unref?.(); // telemetry must never be the reason a process stays alive
  }

  push(event: TelemetryEvent): void {
    this.queue.push(event);
    if (this.queue.length >= this.config.maxBatchSize) void this.flush();
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const events = this.queue.splice(0, this.queue.length);
    try {
      const response = await fetch(this.config.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.apiKey ?? ""}`,
        },
        body: JSON.stringify({
          serverName: this.meta.serverName,
          serverVersion: this.meta.serverVersion,
          sdkName: this.meta.sdkName,
          sdkVersion: this.meta.sdkVersion,
          installMode: this.meta.installMode,
          events,
        }),
      });
      // Never throws on a non-2xx (silent drop is still the contract — see class doc),
      // but a warning is the difference between "found the bug in 30 seconds" and
      // "found it three days later": a 404/401/500 here means events are being
      // discarded even though fetch() itself didn't throw.
      if (!response.ok) {
        console.warn(
          `[mcpfy-pulse] telemetry flush failed: ${response.status} ${response.statusText} (${this.config.endpoint}) — ${events.length} event(s) dropped`
        );
      }
    } catch (err) {
      console.warn(
        `[mcpfy-pulse] telemetry flush failed: ${err instanceof Error ? err.message : String(err)} (${this.config.endpoint}) — ${events.length} event(s) dropped`
      );
    }
  }

  async close(): Promise<void> {
    clearInterval(this.timer);
    await this.flush();
  }
}
