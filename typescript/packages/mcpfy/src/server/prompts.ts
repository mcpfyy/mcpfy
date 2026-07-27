import type { McpServer as OfficialMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GetPromptResult, PromptMessage } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import type { ToolContentResult, TypedCallToolResult } from "../shared/response-helpers.js";
import { buildToolContext, type ToolContext } from "./context.js";
import { getShape } from "./json-schema.js";

export type PromptCallback<TInput = Record<string, any>> = (
  params: TInput,
  ctx: ToolContext
) => Promise<GetPromptResult | TypedCallToolResult<any> | ToolContentResult>;

export interface PromptDefinition<TInput = Record<string, any>> {
  name: string;
  title?: string;
  description?: string;
  /** A `z.object({...})` schema describing the prompt's arguments. */
  schema?: z.ZodObject<any>;
  cb?: PromptCallback<TInput>;
}

function isGetPromptResult(result: unknown): result is GetPromptResult {
  return typeof result === "object" && result !== null && "messages" in result;
}

/** Lets prompt handlers return the same `text()`/`markdown()`/`object()` helpers tools use. */
function toGetPromptResult(result: GetPromptResult | TypedCallToolResult<any> | ToolContentResult): GetPromptResult {
  if (isGetPromptResult(result)) return result;

  const messages: PromptMessage[] = result.content.map((item) => ({ role: "user", content: item }));
  return { messages };
}

export function registerPrompt<TInput = Record<string, any>>(
  nativeServer: OfficialMcpServer,
  def: PromptDefinition<TInput>,
  cb?: PromptCallback<TInput>
): void {
  const callback = cb ?? def.cb;
  if (!callback) {
    throw new Error(`Prompt "${def.name}" is missing a callback — pass it as the second argument to .prompt() or as the "cb" field on the definition.`);
  }

  nativeServer.registerPrompt(
    def.name,
    {
      title: def.title,
      description: def.description ?? "",
      argsSchema: def.schema ? getShape(def.schema) : {},
    },
    async (params: any, extra: any) => {
      const ctx = buildToolContext(nativeServer, extra);
      const result = await callback(params, ctx);
      return toGetPromptResult(result);
    }
  );
}
