import type { AuthConfig } from "./types.js";

/** Builds the `GET /.well-known/oauth-protected-resource` body per RFC 9728. */
export function buildProtectedResourceMetadata(
  config: Extract<AuthConfig, { type: "oauth" }>,
  baseUrl: string
): Record<string, unknown> {
  return {
    resource: config.resource ?? `${baseUrl}/mcp`,
    authorization_servers: config.authorizationServers,
  };
}
