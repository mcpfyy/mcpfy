import type { AuthConfig } from "./types.js";

/** Builds the `GET /.well-known/oauth-protected-resource` body per RFC 9728. */
export function buildProtectedResourceMetadata(
  config: Extract<AuthConfig, { type: "oauth" }>,
  _baseUrl?: string,
  _mcpPath = "/mcp"
): Record<string, unknown> {
  return {
    resource: config.resource,
    authorization_servers: config.authorizationServers,
    bearer_methods_supported: ["header"],
    ...(config.scopesSupported?.length ? { scopes_supported: config.scopesSupported } : {}),
    ...(config.resourceName ? { resource_name: config.resourceName } : {}),
  };
}
