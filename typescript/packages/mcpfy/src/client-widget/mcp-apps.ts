import { App, PostMessageTransport, type AppOptions } from "@modelcontextprotocol/ext-apps";
import type { Implementation } from "@modelcontextprotocol/sdk/types.js";

export interface ConnectMcpAppsExtra {
  capabilities?: { tools?: { listChanged?: boolean } };
  /** Register notification handlers before the initialize handshake. */
  setup?: (app: App) => void;
}

/**
 * Connects to an MCP Apps (SEP-1865) host from inside a widget's iframe.
 * Thin wrapper around the official `App` class + `PostMessageTransport` —
 * both already implement the full postMessage/JSON-RPC handshake, so there's
 * nothing to hand-roll here.
 *
 * Advertises `tools.listChanged` by default so `useViewTool` can register
 * model-callable tools on the mounted view.
 */
export async function connectMcpApps(
  appInfo: Implementation,
  options?: AppOptions,
  extra?: ConnectMcpAppsExtra
): Promise<App> {
  const app = new App(
    appInfo,
    extra?.capabilities ?? { tools: { listChanged: true } },
    options
  );
  extra?.setup?.(app);
  const transport = new PostMessageTransport(window.parent, window.parent);
  await app.connect(transport);
  return app;
}

export { App, PostMessageTransport };
