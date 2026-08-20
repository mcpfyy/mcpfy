import { createUIResource, type UIResource } from "@mcp-ui/server";
import { mergeWidgetCsp } from "./csp.js";
import type { WidgetContent, WidgetCsp } from "./types.js";

export const DEFAULT_WIDGET_FRAME_SIZE: [string, string] = ["100%", "480px"];

/**
 * Builds an MCP-UI `UIResource` content block — embedded directly in the paired
 * tool's `CallToolResult.content`, per MCP-UI's convention (no separate resources/read
 * round-trip; the widget's HTML travels in the same response as the tool's answer).
 */
export function buildMcpUiContentBlock(
  name: string,
  content: WidgetContent,
  size: [string, string] = DEFAULT_WIDGET_FRAME_SIZE,
  csp?: WidgetCsp
): UIResource {
  const merged = mergeWidgetCsp(csp);
  return createUIResource({
    uri: `ui://${name}/mcp-ui`,
    encoding: "text",
    uiMetadata: {
      "preferred-frame-size": size,
    },
    resourceProps: merged ? { _meta: { csp: merged } } : undefined,
    content:
      content.type === "html"
        ? { type: "rawHtml", htmlString: content.html }
        : { type: "externalUrl", iframeUrl: content.url },
  });
}
