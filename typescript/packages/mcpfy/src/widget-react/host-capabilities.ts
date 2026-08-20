import type { OpenAiGlobal } from "../client-widget/apps-sdk-types.js";
import type { HostProtocol } from "../client-widget/index.js";

export type LayoutMode = "inline" | "pip" | "fullscreen";

/** Host features the widget should feature-detect before showing actions. */
export interface HostCapabilities {
  /** Call an MCP server tool through the host. */
  callTool: boolean;
  /** Send a user-visible follow-up into the host chat. */
  sendFollowUp: boolean;
  /** Ask the host to open an external URL. */
  openExternal: boolean;
  /** Register tools the model can call on this mounted view (`useViewTool`). MCP Apps only. */
  viewTools: boolean;
  /** Publish structured view state for later model turns (`useModelContext`). MCP Apps only. */
  modelContext: boolean;
  displayModes: LayoutMode[];
}

export interface HostCapabilityInput {
  protocol: HostProtocol;
  openai?: Pick<
    OpenAiGlobal,
    "callTool" | "sendFollowUpMessage" | "openExternal" | "requestDisplayMode"
  >;
  host?: {
    message?: unknown;
    openLinks?: unknown;
    updateModelContext?: unknown;
  };
  availableDisplayModes?: LayoutMode[];
}

export function deriveHostCapabilities(input: HostCapabilityInput): HostCapabilities {
  const { protocol, openai, host, availableDisplayModes } = input;

  if (protocol === "apps-sdk") {
    return {
      callTool: typeof openai?.callTool === "function",
      sendFollowUp: typeof openai?.sendFollowUpMessage === "function",
      openExternal: typeof openai?.openExternal === "function",
      viewTools: false,
      modelContext: false,
      displayModes:
        typeof openai?.requestDisplayMode === "function"
          ? ["inline", "pip", "fullscreen"]
          : ["inline"],
    };
  }

  if (protocol === "mcp-apps") {
    return {
      callTool: true,
      sendFollowUp: host?.message !== undefined,
      openExternal: host?.openLinks !== undefined,
      viewTools: true,
      modelContext: host?.updateModelContext !== undefined,
      displayModes: availableDisplayModes?.length
        ? availableDisplayModes
        : ["inline", "fullscreen", "pip"],
    };
  }

  if (protocol === "mcp-ui") {
    return {
      callTool: true,
      sendFollowUp: true,
      openExternal: true,
      viewTools: false,
      modelContext: false,
      displayModes: ["inline"],
    };
  }

  return {
    callTool: false,
    sendFollowUp: false,
    openExternal: false,
    viewTools: false,
    modelContext: false,
    displayModes: ["inline"],
  };
}
