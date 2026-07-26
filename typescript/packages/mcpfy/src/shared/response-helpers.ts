import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** A tool/prompt/resource handler result carrying plain content, no structured payload. */
export interface ToolContentResult {
  content: CallToolResult["content"];
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

/** A tool handler result additionally carrying a typed structured payload. */
export interface TypedCallToolResult<T extends Record<string, unknown> = Record<string, unknown>> {
  content: CallToolResult["content"];
  isError?: boolean;
  _meta?: Record<string, unknown>;
  structuredContent?: T;
}

/** Plain text content. */
export function text(content: string): ToolContentResult {
  return { content: [{ type: "text", text: content }] };
}

/** Text content tagged as markdown via `_meta.mimeType`. */
export function markdown(content: string): ToolContentResult {
  return {
    content: [{ type: "text", text: content }],
    _meta: { mimeType: "text/markdown" },
  };
}

/** Base64-encoded image content. */
export function image(data: string, mimeType = "image/png"): ToolContentResult {
  return { content: [{ type: "image", data, mimeType }] };
}

/** JSON-serializable structured data, also rendered as pretty-printed text content. */
export function object<T extends Record<string, unknown>>(data: T): TypedCallToolResult<T> {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

/** An error result — sets `isError: true` per the MCP tool-result convention. */
export function error(message: string): TypedCallToolResult<never> {
  return { isError: true, content: [{ type: "text", text: message }] };
}
