import { createClerkClient } from "@clerk/backend";
import { jwksVerifier } from "./jwks-verifier.js";
import type { AuthConfig, AuthInfo, OAuthTokenVerifier } from "./types.js";

export interface OAuthProviderOptions {
  /** Canonical public MCP endpoint URL. Defaults to MCP_URL (legacy MCPFY URL variables are also read). */
  resource?: string;
  requiredScopes?: string[];
  scopesSupported?: string[];
  resourceName?: string;
}

export interface JwtOAuthProviderOptions extends OAuthProviderOptions {
  issuer: string;
  jwksUri: string;
  authorizationServers?: string[];
  audience?: string | string[];
  algorithms?: string[];
  mapUser?: (claims: Record<string, unknown>) => AuthInfo["user"];
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function authorizationServerUrl(value: string): string {
  const normalized = httpsUrl(value, "authorization server");
  return value.trim().endsWith("/") ? `${normalized}/` : normalized;
}

function httpsUrl(value: string, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(candidate);
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !loopback) throw new Error(`${label} must use HTTPS`);
  if (url.username || url.password) throw new Error(`${label} must not contain credentials`);
  if (url.hash) throw new Error(`${label} must not contain a fragment`);
  return trimSlash(url.toString());
}

function httpsOrigin(value: string, label: string): string {
  const normalized = httpsUrl(value, label);
  const url = new URL(normalized);
  if (url.pathname !== "/" || url.search) {
    throw new Error(`${label} must be an origin without a path or query`);
  }
  return url.origin;
}

function resourceFrom(options: OAuthProviderOptions): string {
  const value = options.resource
    ?? process.env.MCP_URL
    ?? process.env.MCPFY_MCP_URL
    ?? process.env.MCPFY_URL;
  if (value) return httpsUrl(value, "OAuth resource");
  throw new Error("OAuth resource is required; set resource or MCP_URL");
}

function providerConfig(
  options: OAuthProviderOptions,
  authorizationServers: string[],
  verifyToken: OAuthTokenVerifier
): Extract<AuthConfig, { type: "oauth" }> {
  const resource = resourceFrom(options);
  if (authorizationServers.length === 0) throw new Error("authorizationServers must not be empty");
  for (const [name, values] of [
    ["requiredScopes", options.requiredScopes],
    ["scopesSupported", options.scopesSupported],
  ] as const) {
    if (values?.some((value) => !value.trim() || /\s/.test(value))) {
      throw new Error(`${name} entries must be non-empty scope tokens without whitespace`);
    }
  }
  if (options.resourceName !== undefined && !options.resourceName.trim()) {
    throw new Error("resourceName must be non-empty");
  }
  return {
    type: "oauth",
    authorizationServers,
    verifyToken,
    resource,
    ...(options.requiredScopes ? { requiredScopes: [...options.requiredScopes] } : {}),
    ...(options.scopesSupported ? { scopesSupported: [...options.scopesSupported] } : {}),
    ...(options.resourceName ? { resourceName: options.resourceName } : {}),
  };
}

/** Configure any standards-based authorization server that issues JWT access tokens. */
function jwtOAuth(options: JwtOAuthProviderOptions): Extract<AuthConfig, { type: "oauth" }> {
  const issuerBase = httpsUrl(options.issuer, "issuer");
  const issuer = options.issuer.endsWith("/") ? `${issuerBase}/` : issuerBase;
  const jwksUri = httpsUrl(options.jwksUri, "jwksUri");
  // RFC 8414 issuer identifiers are exact URL strings. Preserve a provider's
  // canonical trailing slash (notably Auth0) in protected-resource metadata.
  const authorizationServers = (options.authorizationServers ?? [issuer]).map(authorizationServerUrl);
  return providerConfig(
    options,
    authorizationServers,
    jwksVerifier({
      issuer,
      jwksUri,
      audience: options.audience ?? ((context) => context.resource),
      algorithms: options.algorithms,
      mapUser: options.mapUser,
    })
  );
}

export interface Auth0OAuthOptions extends OAuthProviderOptions {
  /** Auth0 tenant domain, with or without `https://`. */
  domain: string;
  /** Override when the Auth0 API identifier differs from the MCP resource URL. */
  audience?: string;
}

/** Complete Auth0 resource-server configuration: discovery, JWKS verification, identity, and scopes. */
function auth0OAuth(options: Auth0OAuthOptions): Extract<AuthConfig, { type: "oauth" }> {
  const origin = httpsOrigin(options.domain, "Auth0 domain");
  const issuer = `${origin}/`;
  return jwtOAuth({
    ...options,
    issuer,
    jwksUri: `${origin}/.well-known/jwks.json`,
    authorizationServers: [issuer],
    algorithms: ["RS256"],
  });
}

export interface ClerkOAuthOptions extends OAuthProviderOptions {
  /** Clerk issuer/domain, with or without `https://`. */
  domain: string;
  /** Clerk Backend API secret. Defaults to CLERK_SECRET_KEY. Never expose this to clients. */
  secretKey?: string;
}

/**
 * Clerk OAuth access-token verification.
 *
 * Clerk OAuth tokens currently are not guaranteed to carry an MCP resource
 * audience. Use a Clerk instance dedicated to this MCP/application so that
 * issuer binding also defines the resource-server trust boundary.
 */
function clerkOAuth(options: ClerkOAuthOptions): Extract<AuthConfig, { type: "oauth" }> {
  const issuer = httpsOrigin(options.domain, "Clerk domain");
  const secretKey = options.secretKey ?? process.env.CLERK_SECRET_KEY;
  if (!secretKey?.trim()) throw new Error("Clerk secretKey is required; set secretKey or CLERK_SECRET_KEY");
  const clerk = createClerkClient({ secretKey });
  return providerConfig(
    options,
    [issuer],
    async (token, context) => {
      try {
        // Use Clerk's OAuth-specific verifier instead of its generic request
        // authenticator. This handles both JWT and opaque OAuth access tokens
        // and cannot accidentally treat a Clerk session token as MCP auth.
        const verified = await clerk.idPOAuthAccessToken.verify(token);
        // A successful response from this OAuth-specific endpoint is already
        // token-type proof. Clerk currently omits `type` from some successful
        // JWT verification responses despite the SDK declaration requiring it.
        if (verified.revoked || verified.expired) return null;
        if (!verified.subject) return null;
        return {
          sub: verified.subject,
          scopes: verified.scopes,
          claims: {},
          user: { id: verified.subject },
          clientId: verified.clientId ?? undefined,
          resource: context.resource,
        };
      } catch {
        return null;
      }
    }
  );
}

export interface WorkOSOAuthOptions extends OAuthProviderOptions {
  /** WorkOS AuthKit domain, with or without `https://`. */
  authKitDomain: string;
  audience?: string;
}

/** Complete WorkOS AuthKit resource-server configuration. */
function workosOAuth(options: WorkOSOAuthOptions): Extract<AuthConfig, { type: "oauth" }> {
  const issuer = httpsOrigin(options.authKitDomain, "WorkOS AuthKit domain");
  return jwtOAuth({
    ...options,
    issuer,
    jwksUri: `${issuer}/oauth2/jwks`,
    authorizationServers: [issuer],
    algorithms: ["RS256"],
  });
}

export interface CustomOAuthProviderOptions extends OAuthProviderOptions {
  authorizationServers: string[];
  verifyToken: OAuthTokenVerifier;
}

/**
 * Escape hatch for opaque-token introspection or a custom verification system.
 * The supplied verifier must validate that the token was issued for
 * `context.resource`; signature/issuer validation alone is not sufficient.
 */
function customOAuth(options: CustomOAuthProviderOptions): Extract<AuthConfig, { type: "oauth" }> {
  if (options.authorizationServers.length === 0) throw new Error("authorizationServers must not be empty");
  return providerConfig(
    options,
    options.authorizationServers.map(authorizationServerUrl),
    options.verifyToken
  );
}

/** OAuth configurations for external authorization servers. */
export const oauth = Object.freeze({
  auth0: auth0OAuth,
  clerk: clerkOAuth,
  workos: workosOAuth,
  jwt: jwtOAuth,
  custom: customOAuth,
});
