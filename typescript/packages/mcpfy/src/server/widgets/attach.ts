import type { McpServer as OfficialMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildMcpAppsToolMeta, registerMcpAppsResource } from "./mcp-apps-adapter.js";
import { buildAppsSdkToolMeta, registerAppsSdkResource } from "./apps-sdk-adapter.js";
import { ALL_PROTOCOLS, type WidgetContent, type WidgetCsp, type WidgetProtocol } from "./types.js";

export interface WidgetProtocolSpec {
  name: string;
  title?: string;
  description?: string;
  getContent: () => WidgetContent;
  protocols?: WidgetProtocol[];
  csp?: WidgetCsp;
  size?: [string, string];
}

export interface AttachedWidgetProtocols {
  protocols: WidgetProtocol[];
  toolMeta: Record<string, unknown>;
}

/**
 * Registers MCP Apps / Apps SDK resources and returns tool `_meta` pointers.
 * MCP-UI is embedded in the tool result at call time via `buildMcpUiContentBlock`.
 */
export function attachWidgetProtocols(
  nativeServer: OfficialMcpServer,
  spec: WidgetProtocolSpec
): AttachedWidgetProtocols {
  const protocols = spec.protocols ?? ALL_PROTOCOLS;
  const toolMeta: Record<string, unknown> = {};

  if (protocols.includes("mcp-apps")) {
    registerMcpAppsResource(nativeServer, spec);
    Object.assign(toolMeta, buildMcpAppsToolMeta(spec.name, spec.csp));
  }
  if (protocols.includes("apps-sdk")) {
    registerAppsSdkResource(nativeServer, spec);
    Object.assign(toolMeta, buildAppsSdkToolMeta(spec.name, spec.csp));
  }

  return { protocols, toolMeta };
}
