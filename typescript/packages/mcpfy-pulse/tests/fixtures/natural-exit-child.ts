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

const wrapped = withMcpfyTelemetry(fakeTransport, { serverName: "natural-exit-test-server" });
wrapped.onmessage = () => {};

// Simulate a real tools/call round trip, then fall off the end of the script
// with nothing else scheduled — exactly the low-level Server class's behavior
// on stdin EOF: no signal is ever sent, the event loop just drains naturally.
onmessageHandler?.({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "natural-exit-tool" } });
await wrapped.send({ jsonrpc: "2.0", id: 1, result: { content: [] } });
