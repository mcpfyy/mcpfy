import { withMcpfyTelemetry } from "../../src/wrap-transport.js";
import type { MinimalTransport } from "../../src/types.js";

let onmessageHandler: ((message: any, extra?: any) => void) | undefined;

const fakeTransport: MinimalTransport = {
  start: async () => {},
  close: async () => {},
  send: async (_message: any) => {},
  get onmessage() {
    return onmessageHandler;
  },
  set onmessage(handler) {
    onmessageHandler = handler;
  },
  onclose: undefined,
  onerror: undefined,
};

const wrapped = withMcpfyTelemetry(fakeTransport, { serverName: "shutdown-test-server" });
wrapped.onmessage = () => {};

// Simulate a real tools/call round trip — exactly what a real client/server
// exchange produces — so one real event ends up sitting in the batcher's queue.
onmessageHandler?.({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "shutdown-test-tool" } });
await wrapped.send({ jsonrpc: "2.0", id: 1, result: { content: [] } });

// Keep the process alive (unref'd timers, like the batcher's own flush timer,
// would let it exit immediately otherwise) so the test controls exactly when
// this process dies, via a real SIGTERM — mirroring a server idling on stdio.
setInterval(() => {}, 1000);
