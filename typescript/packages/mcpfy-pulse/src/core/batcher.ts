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

const SHUTDOWN_SIGNALS: NodeJS.Signals[] = ["SIGTERM", "SIGINT"];
const SHUTDOWN_FLUSH_TIMEOUT_MS = 3000;

/**
 * Installs a best-effort "flush before we die" hook for a batcher that has no
 * other lifecycle event to hang a flush off of. `withMcpfyTelemetry` wraps a
 * transport inside the *same process* as the server's own code — unlike the stdio
 * proxy, there's no child process it can wait on and forward signals to. Without
 * this, a real MCP session shorter than the flush interval loses every event, via
 * two independent paths, both confirmed against real client/server sessions:
 *
 * - A real MCP client's normal graceful shutdown (close stdin, wait, escalate to
 *   SIGTERM if the process is still alive) kills the process via an unhandled
 *   signal — instant, no `exit` event, no flush.
 * - Some server setups (e.g. the low-level `Server` class, as opposed to
 *   `McpServer`) simply exit *naturally* on stdin EOF — no signal at all, just
 *   Node draining an event loop with nothing left to do — which an unhandled
 *   signal listener does nothing to catch.
 *
 * Both are covered here: `beforeExit` for the natural-exit case, `SIGTERM`/
 * `SIGINT` for the signal case, sharing one flush bounded by a timeout so a slow
 * or unreachable ingest endpoint can never hang process shutdown either way.
 */
export function installShutdownFlush(batcher: TelemetryBatcher): void {
  let flushed = false;
  const flushOnce = (): Promise<void> => {
    if (flushed) return Promise.resolve();
    flushed = true;
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, SHUTDOWN_FLUSH_TIMEOUT_MS).unref());
    return Promise.race([batcher.close(), timeout]).catch(() => {});
  };

  // Natural exit: nothing else queued on the event loop, no signal involved.
  // Scheduling async work here (the flush) delays the actual exit until it
  // settles, without ever holding the process open when there's truly nothing
  // to flush — `flush()` itself no-ops instantly on an empty queue.
  process.once("beforeExit", () => {
    void flushOnce();
  });

  for (const signal of SHUTDOWN_SIGNALS) {
    const handler = () => {
      // Remove ourselves before re-raising the same signal below, so that re-raise
      // falls through to the default action (or any other listener) instead of
      // looping back into this handler.
      process.removeListener(signal, handler);
      void flushOnce().finally(() => process.kill(process.pid, signal));
    };
    process.on(signal, handler);
  }
}
