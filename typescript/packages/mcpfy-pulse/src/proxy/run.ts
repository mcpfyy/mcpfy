import { spawn } from "node:child_process";
import { resolveConfig } from "../config.js";
import { MessageClassifier } from "../core/classify.js";
import { TelemetryBatcher } from "../core/batcher.js";

function tryParse(line: string): any {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

/**
 * Forwards raw chunks to `dest` immediately and unchanged, then independently
 * re-buffers a copy into newline-delimited lines for classification. The pass-through
 * path never waits on parsing — a bug in classification can never corrupt or delay
 * the actual MCP traffic.
 */
function pipeLines(source: NodeJS.ReadableStream, dest: NodeJS.WritableStream, onLine: (line: string) => void): void {
  let buffer = "";
  source.on("data", (chunk: Buffer) => {
    dest.write(chunk);
    buffer += chunk.toString("utf8");
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      onLine(line);
    }
  });
}

/**
 * `mcpfy-proxy -- <command> [args...]`
 *
 * Spawns <command> as a child process and sits in its stdin/stdout pipe. Client-to-server
 * messages (parent stdin -> child stdin) are classified as "incoming"; server-to-client
 * messages (child stdout -> parent stdout) are classified as "outgoing", mirroring
 * onmessage/send in the in-process wrapper. Works for any language — the proxy never
 * parses anything beyond newline-delimited JSON-RPC framing.
 */
export async function runProxy(argv: string[]): Promise<void> {
  const sepIndex = argv.indexOf("--");
  if (sepIndex === -1 || sepIndex === argv.length - 1) {
    process.stderr.write(
      "Usage: mcpfy-proxy -- <command> [args...]\n" +
        "Example: mcpfy-proxy -- npx -y @modelcontextprotocol/server-github\n"
    );
    process.exitCode = 1;
    return;
  }

  const [command, ...args] = argv.slice(sepIndex + 1);
  const config = resolveConfig();
  const classifier = new MessageClassifier();
  const batcher = config.apiKey
    ? new TelemetryBatcher(config, { sdkName: "unknown", installMode: "stdio-proxy" })
    : undefined;

  const child = spawn(command, args, {
    stdio: ["pipe", "pipe", "inherit"],
    env: process.env,
  });

  child.on("error", (err) => {
    process.stderr.write(`mcpfy-proxy: failed to start "${command}": ${err.message}\n`);
    process.exitCode = 1;
  });

  pipeLines(process.stdin, child.stdin!, (line) => {
    const message = tryParse(line);
    if (message) classifier.onIncoming(message);
  });

  pipeLines(child.stdout!, process.stdout, (line) => {
    const message = tryParse(line);
    if (!message) return;
    const event = classifier.onOutgoing(message);
    if (event && batcher) batcher.push(event);
  });

  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));

  await new Promise<void>((resolvePromise) => {
    child.on("exit", (code, signal) => {
      void batcher?.close().finally(() => {
        if (signal) {
          process.kill(process.pid, signal);
        } else {
          process.exitCode = code ?? 0;
        }
        resolvePromise();
      });
    });
  });
}
