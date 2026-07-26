/**
 * One-way postMessage "UI actions" for MCP-UI hosts — matches the wire format
 * `@mcp-ui/server`'s `postUIActionResult`/`uiActionResult*` helpers produce
 * (verified against `@mcp-ui/server`'s type definitions). Hand-written rather
 * than imported so this bundle doesn't pull in `@mcp-ui/server`'s Node-oriented
 * resource-building code just to send a postMessage.
 *
 * Unlike MCP Apps, these are fire-and-forget notifications, not a request/response
 * JSON-RPC protocol — there's no connect() handshake to perform first.
 */

export type MpcUiActionType = "tool" | "prompt" | "link" | "intent" | "notify";

export interface MpcUiActionResult {
  type: MpcUiActionType;
  payload: Record<string, unknown>;
  messageId?: string;
}

function post(result: MpcUiActionResult): void {
  window.parent.postMessage(result, "*");
}

export function postToolCall(toolName: string, params: Record<string, unknown> = {}): void {
  post({ type: "tool", payload: { toolName, params } });
}

export function postPrompt(prompt: string): void {
  post({ type: "prompt", payload: { prompt } });
}

export function postLink(url: string): void {
  post({ type: "link", payload: { url } });
}

export function postIntent(intent: string, params: Record<string, unknown> = {}): void {
  post({ type: "intent", payload: { intent, params } });
}

export function postNotify(message: string): void {
  post({ type: "notify", payload: { message } });
}
