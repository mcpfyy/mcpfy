import { getOpenAiGlobal, type OpenAiGlobal } from "./apps-sdk-types.js";
import { connectMcpApps, App } from "./mcp-apps.js";
import * as mcpUiActions from "./mcp-ui-actions.js";

export { connectMcpApps, App, PostMessageTransport } from "./mcp-apps.js";
export { postToolCall, postPrompt, postLink, postIntent, postNotify } from "./mcp-ui-actions.js";
export { getOpenAiGlobal, type OpenAiGlobal } from "./apps-sdk-types.js";
export type { MpcUiActionResult, MpcUiActionType } from "./mcp-ui-actions.js";

export type HostProtocol = "apps-sdk" | "mcp-apps" | "mcp-ui" | "none";

/**
 * Detects which host protocol this widget is currently running under, without
 * performing any connection — synchronous, safe to call immediately on load.
 * `window.openai` is host-injected by ChatGPT; anything else running inside an
 * iframe is assumed to speak either MCP Apps or plain MCP-UI (call `connect()`
 * to find out which — MCP Apps requires an explicit handshake, MCP-UI doesn't).
 */
export function detectHostProtocol(): Exclude<HostProtocol, "mcp-apps" | "mcp-ui"> | "iframe" {
  if (typeof window === "undefined") return "none";
  if (getOpenAiGlobal()) return "apps-sdk";
  if (window !== window.parent) return "iframe";
  return "none";
}

export interface ConnectResult {
  protocol: HostProtocol;
  openai?: OpenAiGlobal;
  app?: App;
}

/**
 * Best-effort unified connect: returns immediately for Apps SDK (nothing to
 * connect — `window.openai` is already there), attempts the MCP Apps handshake
 * with a short timeout for iframe hosts, and falls back to `"mcp-ui"` (which has
 * no handshake — use the `post*` action helpers directly) if that times out.
 */
export async function connect(appInfo: { name: string; version: string }, handshakeTimeoutMs = 1500): Promise<ConnectResult> {
  const openai = getOpenAiGlobal();
  if (openai) return { protocol: "apps-sdk", openai };

  if (typeof window === "undefined" || window === window.parent) {
    return { protocol: "none" };
  }

  try {
    const app = await Promise.race([
      connectMcpApps(appInfo),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), handshakeTimeoutMs)),
    ]);
    return { protocol: "mcp-apps", app };
  } catch {
    return { protocol: "mcp-ui" };
  }
}

export { mcpUiActions };
