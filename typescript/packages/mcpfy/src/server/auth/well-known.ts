import type { AuthConfig } from "./types.js";

/** Builds the `GET /.well-known/oauth-protected-resource` body per RFC 9728. */
export function buildProtectedResourceMetadata(
  config: Extract<AuthConfig, { type: "oauth" }>,
  baseUrl: string,
  mcpPath = "/mcp"
): Record<string, unknown> {
  return {
    resource: config.resource ?? `${baseUrl}${mcpPath}`,
    authorization_servers: config.authorizationServers,
  };
}
