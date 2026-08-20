import type { McpServer as OfficialMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildToolContext } from "../context.js";
import { attachWidgetProtocols } from "./attach.js";
import { buildMcpUiContentBlock } from "./mcp-ui-adapter.js";
import { ALL_PROTOCOLS, type UIResourceDefinition, type WidgetCallback } from "./types.js";

export type {
  UIResourceDefinition,
  WidgetCallback,
  WidgetContent,
  WidgetCsp,
  WidgetOptions,
  WidgetProtocol,
} from "./types.js";
export { DEFAULT_WIDGETS_DIR } from "./types.js";
export { setWidgetHtmlForTest } from "./registry.js";

export function registerWidget<TInput = Record<string, any>>(
  nativeServer: OfficialMcpServer,
  def: UIResourceDefinition<TInput>,
  cb?: WidgetCallback<TInput>
): void {
  const callback = cb ?? def.cb;
  if (!callback) {
    throw new Error(`Widget "${def.name}" has no callback — pass one as the second argument to .widget() or as def.cb.`);
  }

  const { protocols, toolMeta } = attachWidgetProtocols(nativeServer, {
    name: def.name,
    title: def.title,
    description: def.description,
    getContent: () => def.content,
    protocols: def.protocols ?? ALL_PROTOCOLS,
    csp: def.csp,
    size: def.size,
  });

  nativeServer.registerTool(
    def.name,
    {
      title: def.title,
      description: def.description ?? "",
      inputSchema: (def.schema ?? {}) as any,
      _meta: Object.keys(toolMeta).length > 0 ? toolMeta : undefined,
    },
    async (params: any, extra: any) => {
      const ctx = buildToolContext(nativeServer, extra);
      const data = await callback(params, ctx);
      const content: any[] = [{ type: "text", text: JSON.stringify(data, null, 2) }];
      if (protocols.includes("mcp-ui")) {
        content.push(buildMcpUiContentBlock(def.name, def.content, def.size, def.csp));
      }
      return { content, structuredContent: data };
    }
  );
}
