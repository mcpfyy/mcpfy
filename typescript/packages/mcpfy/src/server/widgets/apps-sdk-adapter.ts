import type { McpServer as OfficialMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveWidgetHtml } from "./html.js";
import type { UIResourceDefinition, WidgetCsp } from "./types.js";

/** OpenAI's ChatGPT Apps SDK convention — not part of the MCP spec, no official server package exists. */
export const APPS_SDK_MIME_TYPE = "text/html+skybridge";

export const APPS_SDK_URI = (name: string) => `ui://${name}/apps-sdk.html`;

/** `_meta["openai/*"]` pointer + config, set on the paired tool per the Apps SDK convention. */
export function buildAppsSdkToolMeta(name: string, csp?: WidgetCsp): Record<string, unknown> {
  const meta: Record<string, unknown> = { "openai/outputTemplate": APPS_SDK_URI(name) };
  if (csp) {
    meta["openai/widgetCSP"] = {
      ...(csp.connectDomains ? { connect_domains: csp.connectDomains } : {}),
      ...(csp.resourceDomains ? { resource_domains: csp.resourceDomains } : {}),
    };
  }
  return meta;
}

/** Registers the standalone HTML resource an Apps SDK host (ChatGPT) fetches via resources/read. */
export function registerAppsSdkResource(
  nativeServer: OfficialMcpServer,
  def: Pick<UIResourceDefinition, "name" | "content" | "title" | "description">
): void {
  const uri = APPS_SDK_URI(def.name);
  const html = resolveWidgetHtml(def.content);

  nativeServer.registerResource(
    `${def.name}-apps-sdk`,
    uri,
    { title: def.title, description: def.description, mimeType: APPS_SDK_MIME_TYPE },
    async () => ({ contents: [{ uri, mimeType: APPS_SDK_MIME_TYPE, text: html }] })
  );
}
