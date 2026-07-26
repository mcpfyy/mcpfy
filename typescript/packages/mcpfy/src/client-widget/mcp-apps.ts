import { App, PostMessageTransport, type AppOptions } from "@modelcontextprotocol/ext-apps";
import type { Implementation } from "@modelcontextprotocol/sdk/types.js";

/**
 * Connects to an MCP Apps (SEP-1865) host from inside a widget's iframe.
 * Thin wrapper around the official `App` class + `PostMessageTransport` —
 * both already implement the full postMessage/JSON-RPC handshake, so there's
 * nothing to hand-roll here.
 */
export async function connectMcpApps(appInfo: Implementation, options?: AppOptions): Promise<App> {
  const app = new App(appInfo, {}, options);
  const transport = new PostMessageTransport(window.parent, window.parent);
  await app.connect(transport);
  return app;
}

export { App, PostMessageTransport };
