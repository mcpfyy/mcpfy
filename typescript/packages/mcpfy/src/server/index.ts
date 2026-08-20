export { MCPServer, parsePortFromArgv } from "./mcp-server.js";
export type { MCPServerConfig, ListenOptions, ListenResult } from "./mcp-server.js";
export type { ServerIcon } from "./icon.js";
export type { HttpHandle } from "./transport.js";

export type { ToolDefinition, ToolCallback } from "./tools.js";
export type { PromptDefinition, PromptCallback } from "./prompts.js";
export type {
  ResourceDefinition,
  ReadResourceCallback,
  FlatResourceTemplateDefinition,
  ReadResourceTemplateCallback,
} from "./resources.js";
export type { ToolContext, SampleOptions, LogLevel, AskUrlOptions } from "./context.js";
export {
  forwardAuthHeaders,
  extractForwardableAuthHeaders,
  FORWARDABLE_AUTH_HEADER_NAMES,
} from "./context.js";
export type {
  UIResourceDefinition,
  WidgetCallback,
  WidgetContent,
  WidgetCsp,
  WidgetOptions,
  WidgetProtocol,
} from "./widgets/index.js";
export { DEFAULT_WIDGETS_DIR } from "./widgets/index.js";
export { setWidgetHtmlForTest } from "./widgets/index.js";

export { text, markdown, image, object, error } from "../shared/response-helpers.js";
export type { ToolContentResult, TypedCallToolResult } from "../shared/response-helpers.js";

export type { AuthConfig, AuthInfo } from "./auth/types.js";
export { jwksVerifier, type JwksVerifierOptions } from "./auth/jwks-verifier.js";
export { oauthAuth0Provider, oauthWorkOSProvider } from "./auth/presets.js";
export type { RemoteServerConfig } from "./mount-remote.js";
