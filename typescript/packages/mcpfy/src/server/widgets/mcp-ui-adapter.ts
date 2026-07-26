import { createUIResource, type UIResource } from "@mcp-ui/server";
import type { WidgetContent } from "./types.js";

/**
 * Builds an MCP-UI `UIResource` content block — embedded directly in the paired
 * tool's `CallToolResult.content`, per MCP-UI's convention (no separate resources/read
 * round-trip; the widget's HTML travels in the same response as the tool's answer).
 */
export function buildMcpUiContentBlock(name: string, content: WidgetContent): UIResource {
  return createUIResource({
    uri: `ui://${name}/mcp-ui`,
    encoding: "text",
    content:
      content.type === "html"
        ? { type: "rawHtml", htmlString: content.html }
        : { type: "externalUrl", iframeUrl: content.url },
  });
}
