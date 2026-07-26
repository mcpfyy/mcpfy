import type { McpServer as OfficialMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import type { ToolContentResult, TypedCallToolResult } from "../shared/response-helpers.js";
import { buildToolContext, type ToolContext } from "./context.js";

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
  cb?: ToolCallback<TInput, TOutput>;
}

function toCallToolResult(result: TypedCallToolResult<any> | ToolContentResult): CallToolResult {
  return result as CallToolResult;
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

  nativeServer.registerTool(
    def.name,
    {
      title: def.title,
      description: def.description ?? "",
      // The SDK's registerTool() accepts either a raw Zod shape record or a full
      // Zod schema instance (AnySchema) for inputSchema/outputSchema — a full
      // z.object(...) can be passed straight through, no shape-unwrapping needed.
      // A schema-less tool still needs *some* inputSchema so the SDK invokes our
      // callback as (args, extra) rather than (extra) — an empty raw shape covers that.
      inputSchema: (def.schema ?? {}) as any,
      outputSchema: def.outputSchema as any,
      annotations: def.annotations,
    },
    async (params: any, extra: any) => {
      const ctx = buildToolContext(nativeServer, extra);
      const result = await callback(params, ctx);
      return toCallToolResult(result);
    }
  );
}
