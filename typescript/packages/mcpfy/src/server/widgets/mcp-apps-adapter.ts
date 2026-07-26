import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer as OfficialMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveWidgetHtml } from "./html.js";
import type { UIResourceDefinition, WidgetCsp } from "./types.js";

export const MCP_APPS_URI = (name: string) => `ui://${name}/mcp-apps.html`;

/** `_meta.ui.*` pointer + config, set on the paired tool per SEP-1865 (MCP Apps). */
export function buildMcpAppsToolMeta(name: string, csp?: WidgetCsp): Record<string, unknown> {
  return {
    ui: {
      resourceUri: MCP_APPS_URI(name),
      ...(csp ? { csp } : {}),
    },
  };
}

/** Registers the standalone HTML resource an MCP Apps host fetches via resources/read. */
export function registerMcpAppsResource(
  nativeServer: OfficialMcpServer,
  def: Pick<UIResourceDefinition, "name" | "content" | "title" | "description">
): void {
  const uri = MCP_APPS_URI(def.name);
  const html = resolveWidgetHtml(def.content);

  nativeServer.registerResource(
    `${def.name}-mcp-apps`,
    uri,
    { title: def.title, description: def.description, mimeType: RESOURCE_MIME_TYPE },
    async () => ({ contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: html }] })
  );
}
