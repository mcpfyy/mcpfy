import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("withMcpfyTelemetry — shutdown flush", () => {
  it("flushes a queued event before exiting on SIGTERM, instead of losing it to an unhandled signal", async () => {
    // Regression test for a real bug: a real MCP client's normal shutdown
    // (close stdin, wait, then SIGTERM if the process is still alive) used to
    // kill any sdk-wrapper-instrumented server via an unhandled signal — instant
    // death, no flush — before the 5s timer ever got a chance to send anything.
    // Reproduced against the actual published package with a real client/server
    // session; this spawns a real child process and sends it a real SIGTERM to
    // verify the fix without relying on the 5s timer or a mocked signal.
    const received: any[] = [];
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        received.push(JSON.parse(body));
        res.writeHead(202, { "content-type": "application/json" }).end(JSON.stringify({ queued: 1 }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;

    const child = spawn(process.execPath, ["--import", "tsx", path.join(__dirname, "fixtures", "shutdown-child.ts")], {
      env: {
        ...process.env,
        MCPFY_API_KEY: "mk_test_shutdown_flush",
        MCPFY_TELEMETRY_ENDPOINT: `http://127.0.0.1:${port}/ingest`,
      },
      stdio: ["ignore", "ignore", "inherit"],
    });

    try {
      // Give the child time to register the event and install its signal handlers.
      await new Promise((resolve) => setTimeout(resolve, 500));

      const start = Date.now();
      child.kill("SIGTERM");
      const [exitCode, exitSignal] = await new Promise<[number | null, NodeJS.Signals | null]>((resolve) =>
        child.on("exit", (code, signal) => resolve([code, signal]))
      );
      const elapsedMs = Date.now() - start;

      // The handler re-raises the same signal against itself after flushing rather
      // than calling process.exit(), so the process still dies "for real" (code
      // null, signal SIGTERM) — exactly as it would have without this fix, just
      // after the flush instead of before it.
      expect(exitCode).toBeNull();
      expect(exitSignal).toBe("SIGTERM");
      expect(elapsedMs).toBeLessThan(2000); // well under the 3s flush-timeout cap on a local, healthy connection
      expect(received).toHaveLength(1);
      expect(received[0].events).toHaveLength(1);
      expect(received[0].events[0].method).toBe("tools/call");
      expect(received[0].events[0].toolName).toBe("shutdown-test-tool");
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
      server.close();
    }
  });

  it("flushes a queued event before a natural, signal-free process exit", async () => {
    // Regression test for a second, distinct failure mode found testing against
    // a real official-SDK low-level Server (as opposed to McpServer): on stdin
    // EOF it exits *naturally* — no signal at all, Node just drains an event
    // loop with nothing left to do — which the SIGTERM/SIGINT handler above
    // does nothing to catch. Covered by a `beforeExit` hook instead.
    const received: any[] = [];
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        received.push(JSON.parse(body));
        res.writeHead(202, { "content-type": "application/json" }).end(JSON.stringify({ queued: 1 }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;

    const child = spawn(
      process.execPath,
      ["--import", "tsx", path.join(__dirname, "fixtures", "natural-exit-child.ts")],
      {
        env: {
          ...process.env,
          MCPFY_API_KEY: "mk_test_natural_exit",
          MCPFY_TELEMETRY_ENDPOINT: `http://127.0.0.1:${port}/ingest`,
        },
        stdio: ["ignore", "ignore", "inherit"],
      }
    );

    try {
      const [exitCode, exitSignal] = await new Promise<[number | null, NodeJS.Signals | null]>((resolve) =>
        child.on("exit", (code, signal) => resolve([code, signal]))
      );

      expect(exitCode).toBe(0);
      expect(exitSignal).toBeNull();
      expect(received).toHaveLength(1);
      expect(received[0].events).toHaveLength(1);
      expect(received[0].events[0].method).toBe("tools/call");
      expect(received[0].events[0].toolName).toBe("natural-exit-tool");
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
      server.close();
    }
  });
});
