import type { AuthConfig } from "./types.js";

/** Builds the `GET /.well-known/oauth-protected-resource` body per RFC 9728. */
export function buildProtectedResourceMetadata(
  config: Extract<AuthConfig, { type: "oauth" }>,
  resource = config.resource,
  _mcpPath = "/mcp"
): Record<string, unknown> {
  return {
    resource,
    authorization_servers: config.authorizationServers,
    bearer_methods_supported: ["header"],
    ...(config.scopesSupported?.length ? { scopes_supported: config.scopesSupported } : {}),
    ...(config.resourceName ? { resource_name: config.resourceName } : {}),
  };
}

/** Builds authorization-server discovery metadata for providers that supply it. */
export function buildAuthorizationServerMetadata(
  config: Extract<AuthConfig, { type: "oauth" }>,
): Record<string, unknown> | undefined {
  if (!config.authorizationServerMetadata) return undefined;
  return {
    ...config.authorizationServerMetadata,
    ...(config.scopesSupported?.length
      ? { scopes_supported: config.scopesSupported }
      : {}),
  };
}
