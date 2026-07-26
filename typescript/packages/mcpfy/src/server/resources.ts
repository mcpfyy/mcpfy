import { ResourceTemplate, type McpServer as OfficialMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import type { ToolContentResult, TypedCallToolResult } from "../shared/response-helpers.js";
import { buildToolContext, type ToolContext } from "./context.js";

type ResourceResult = ReadResourceResult | TypedCallToolResult<any> | ToolContentResult;

function isReadResourceResult(result: unknown): result is ReadResourceResult {
  return typeof result === "object" && result !== null && "contents" in result;
}

/** Lets resource handlers return the same `text()`/`markdown()`/`object()` helpers tools use. */
function toReadResourceResult(uri: string, result: ResourceResult, mimeTypeHint?: string): ReadResourceResult {
  if (isReadResourceResult(result)) return result;

  const contents = result.content.map((item) => {
    const mimeType = mimeTypeHint ?? (result._meta?.mimeType as string | undefined) ?? inferMimeType(item);
    if (item.type === "text") {
      return { uri, mimeType, text: item.text };
    }
    if (item.type === "image" || item.type === "audio") {
      return { uri, mimeType: item.mimeType, blob: item.data };
    }
    return { uri, mimeType: mimeType ?? "text/plain", text: JSON.stringify(item) };
  });

  return { contents };
}

function inferMimeType(item: { type: string; mimeType?: string }): string {
  if (item.mimeType) return item.mimeType;
  return "text/plain";
}

// ---------------------------------------------------------------------------
// Static resources
// ---------------------------------------------------------------------------

export type ReadResourceCallback = (ctx: ToolContext) => Promise<ResourceResult>;

export interface ResourceDefinition {
  name: string;
  uri: string;
  title?: string;
  description?: string;
  mimeType?: string;
  readCallback?: ReadResourceCallback;
}

export function registerResource(
  nativeServer: OfficialMcpServer,
  def: ResourceDefinition,
  cb?: ReadResourceCallback
): void {
  const callback = cb ?? def.readCallback;
  if (!callback) {
    throw new Error(`Resource "${def.name}" has no read callback.`);
  }

  nativeServer.registerResource(
    def.name,
    def.uri,
    { title: def.title, description: def.description, mimeType: def.mimeType },
    async (uri: URL, extra: any) => {
      const ctx = buildToolContext(nativeServer, extra);
      const result = await callback(ctx);
      return toReadResourceResult(uri.toString(), result, def.mimeType);
    }
  );
}

// ---------------------------------------------------------------------------
// Resource templates (dynamic URIs)
// ---------------------------------------------------------------------------

export type ReadResourceTemplateCallback<TParams extends Record<string, any> = Record<string, any>> = (
  uri: URL,
  params: TParams,
  ctx: ToolContext
) => Promise<ResourceResult>;

export interface FlatResourceTemplateDefinition<TParams extends Record<string, any> = Record<string, any>> {
  name: string;
  /** e.g. "user://{userId}/profile" — matched via the SDK's own URI-template engine. */
  uriTemplate: string;
  title?: string;
  description?: string;
  mimeType?: string;
  /** Type-hint only in v1 — not used for runtime validation of template variables. */
  schema?: z.ZodTypeAny;
  readCallback?: ReadResourceTemplateCallback<TParams>;
}

export function registerResourceTemplate<TParams extends Record<string, any> = Record<string, any>>(
  nativeServer: OfficialMcpServer,
  def: FlatResourceTemplateDefinition<TParams>,
  cb?: ReadResourceTemplateCallback<TParams>
): void {
  const callback = cb ?? def.readCallback;
  if (!callback) {
    throw new Error(`Resource template "${def.name}" has no read callback.`);
  }

  const template = new ResourceTemplate(def.uriTemplate, { list: undefined });

  nativeServer.registerResource(
    def.name,
    template,
    { title: def.title, description: def.description, mimeType: def.mimeType },
    async (uri: URL, variables: Record<string, string | string[]>, extra: any) => {
      const ctx = buildToolContext(nativeServer, extra);
      const result = await callback(uri, variables as TParams, ctx);
      return toReadResourceResult(uri.toString(), result, def.mimeType);
    }
  );
}
