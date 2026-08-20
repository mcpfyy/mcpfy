import type { McpServer as OfficialMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import type { ToolContentResult, TypedCallToolResult } from "../shared/response-helpers.js";
import { buildToolContext, type ToolContext } from "./context.js";
import { attachWidgetProtocols } from "./widgets/attach.js";
import { buildMcpUiContentBlock } from "./widgets/mcp-ui-adapter.js";
import { registerToolWidget, widgetContentGetter } from "./widgets/registry.js";
import type { WidgetCsp, WidgetOptions } from "./widgets/types.js";

export type ToolCallback<
  TInput = Record<string, any>,
  TOutput extends Record<string, unknown> = Record<string, unknown>,
> = (
  params: TInput,
  ctx: ToolContext
) => Promise<TypedCallToolResult<TOutput> | ToolContentResult>;

export interface ToolDefinition<
  TInput = Record<string, any>,
  TOutput extends Record<string, unknown> = Record<string, unknown>,
> {
  name: string;
  title?: string;
  description?: string;
  /** A `z.object({...})` schema describing the tool's input parameters. */
  schema?: z.ZodTypeAny;
  /** A `z.object({...})` schema constraining `structuredContent` in the tool's result. */
  outputSchema?: z.ZodTypeAny;
  annotations?: ToolAnnotations;
  /**
   * React widget folder (under `widgetsDir`, default `src/widgets`) or `{ dir, entry, protocols, csp }`.
   * Omit for a normal tool with no UI.
   */
  widget?: string | WidgetOptions;
  cb?: ToolCallback<TInput, TOutput>;
}

function toCallToolResult(result: TypedCallToolResult<any> | ToolContentResult): CallToolResult {
  return result as CallToolResult;
}

function withMcpUiResource(
  result: CallToolResult,
  toolName: string,
  getContent: () => { type: "html"; html: string } | { type: "url"; url: string },
  size?: [string, string],
  csp?: WidgetCsp
): CallToolResult {
  const content = [...(result.content ?? [])];
  content.push(buildMcpUiContentBlock(toolName, getContent(), size, csp));
  return { ...result, content };
}

export function registerTool<
  TInput = Record<string, any>,
  TOutput extends Record<string, unknown> = Record<string, unknown>,
>(
  nativeServer: OfficialMcpServer,
  def: ToolDefinition<TInput, TOutput>,
  cb?: ToolCallback<TInput, TOutput>
): void {
  const callback = cb ?? def.cb;
  if (!callback) {
    throw new Error(`Tool "${def.name}" has no callback — pass one as the second argument to .tool() or as def.cb.`);
  }

  let toolMeta: Record<string, unknown> | undefined;
  let appendMcpUi: ((result: CallToolResult) => CallToolResult) | undefined;

  if (def.widget) {
    const record = registerToolWidget(nativeServer, def.name, def.widget);
    const getContent = widgetContentGetter(record);
    const attached = attachWidgetProtocols(nativeServer, {
      name: def.name,
      title: def.title,
      description: def.description,
      getContent,
      protocols: record.protocols,
      csp: record.csp,
      size: record.size,
    });
    toolMeta = Object.keys(attached.toolMeta).length > 0 ? attached.toolMeta : undefined;
    if (attached.protocols.includes("mcp-ui")) {
      appendMcpUi = (result) => withMcpUiResource(result, def.name, getContent, record.size, record.csp);
    }
  }

  nativeServer.registerTool(
    def.name,
    {
      title: def.title,
      description: def.description ?? "",
      inputSchema: (def.schema ?? {}) as any,
      outputSchema: def.outputSchema as any,
      annotations: def.annotations,
      _meta: toolMeta,
    },
    async (params: any, extra: any) => {
      const ctx = buildToolContext(nativeServer, extra);
      const result = toCallToolResult(await callback(params, ctx));
      return appendMcpUi ? appendMcpUi(result) : result;
    }
  );
}
