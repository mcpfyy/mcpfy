import type { McpServer as OfficialMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { resolveWidgetHtml } from "./html.js";
import { mergeWidgetCsp } from "./csp.js";
import type { WidgetContent, WidgetCsp } from "./types.js";

export const MCP_APPS_URI = (name: string) => `ui://${name}/mcp-apps.html`;

/** `_meta.ui.*` pointer + config, set on the paired tool per SEP-1865 (MCP Apps). */
export function buildMcpAppsToolMeta(name: string, csp?: WidgetCsp): Record<string, unknown> {
  const merged = mergeWidgetCsp(csp);
  return {
    ui: {
      resourceUri: MCP_APPS_URI(name),
      ...(merged ? { csp: merged } : {}),
    },
  };
}

/** Registers the standalone HTML resource an MCP Apps host fetches via resources/read. */
export function registerMcpAppsResource(
  nativeServer: OfficialMcpServer,
  def: {
    name: string;
    title?: string;
    description?: string;
    getContent: () => WidgetContent;
  }
): void {
  const uri = MCP_APPS_URI(def.name);

  nativeServer.registerResource(
    `${def.name}-mcp-apps`,
    uri,
    { title: def.title, description: def.description, mimeType: RESOURCE_MIME_TYPE },
    async () => {
      const html = resolveWidgetHtml(def.getContent());
      return { contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: html }] };
    }
  );
}
