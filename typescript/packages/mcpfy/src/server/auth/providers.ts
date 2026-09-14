import { jwksVerifier } from "./jwks-verifier.js";
import type {
  AuthConfig,
  OAuthAuthorizationServerMetadata,
  OAuthTokenVerifier,
  OAuthUser,
} from "./types.js";
import { canonicalOAuthResource } from "./url.js";

export interface OAuthProviderOptions {
  /** Canonical public MCP endpoint URL. Defaults to MCP_URL (legacy MCPFY URL variables are also read). */
  resource?: string;
  requiredScopes?: string[];
  scopesSupported?: string[];
  resourceName?: string;
  /** Shared secret used to trust MCPfy gateway forwarded-origin headers. Defaults to MCPFY_PROXY_SECRET. */
  proxySecret?: string;
  /** Authorization-server metadata mirrored for MCP clients. Provider helpers fill this automatically. */
  authorizationServerMetadata?: OAuthAuthorizationServerMetadata;
}

export interface JwtOAuthProviderOptions<
  TUser extends OAuthUser = OAuthUser,
> extends OAuthProviderOptions {
  issuer: string;
  jwksUri: string;
  authorizationServers?: string[];
  audience?: string | string[];
  algorithms?: string[];
  mapUser?: (claims: Record<string, unknown>) => TUser;
  mapPermissions?: (claims: Record<string, unknown>) => string[];
}

function stringValue(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function booleanValue(
  record: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function recordValue(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = record[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function normalizedStrings(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter(
      (item): item is string => typeof item === "string" && item.length > 0,
    );
  return typeof value === "string" ? value.split(/[ ,]+/).filter(Boolean) : [];
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function authorizationServerUrl(value: string): string {
  const normalized = httpsUrl(value, "authorization server");
  return value.trim().endsWith("/") ? `${normalized}/` : normalized;
}

function httpsUrl(value: string, label: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${label} is required`);
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(candidate);
  const loopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";
  if (url.protocol !== "https:" && !loopback)
    throw new Error(`${label} must use HTTPS`);
  if (url.username || url.password)
    throw new Error(`${label} must not contain credentials`);
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
  const value =
    options.resource ??
    process.env.MCP_URL ??
    process.env.MCPFY_MCP_URL ??
    process.env.MCPFY_URL;
  if (value)
    return canonicalOAuthResource(
      /^https?:\/\//i.test(value) ? value : `https://${value}`,
    );
  throw new Error("OAuth resource is required; set resource or MCP_URL");
}

function providerConfig<TUser extends OAuthUser = OAuthUser>(
  options: OAuthProviderOptions,
  authorizationServers: string[],
  verifyToken: OAuthTokenVerifier<TUser>,
): Extract<AuthConfig<TUser>, { type: "oauth" }> {
  const resource = resourceFrom(options);
  if (authorizationServers.length === 0)
    throw new Error("authorizationServers must not be empty");
  for (const [name, values] of [
    ["requiredScopes", options.requiredScopes],
    ["scopesSupported", options.scopesSupported],
  ] as const) {
    if (values?.some((value) => !value.trim() || /\s/.test(value))) {
      throw new Error(
        `${name} entries must be non-empty scope tokens without whitespace`,
      );
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
    ...((options.proxySecret ?? process.env.MCPFY_PROXY_SECRET)
      ? { proxySecret: options.proxySecret ?? process.env.MCPFY_PROXY_SECRET }
      : {}),
    ...(options.authorizationServerMetadata
      ? {
          authorizationServerMetadata: {
            ...options.authorizationServerMetadata,
          },
        }
      : {}),
    ...(options.requiredScopes
      ? { requiredScopes: [...options.requiredScopes] }
      : {}),
    ...(options.scopesSupported
      ? { scopesSupported: [...options.scopesSupported] }
      : {}),
    ...(options.resourceName ? { resourceName: options.resourceName } : {}),
  };
}

function authorizationMetadata(
  issuer: string,
  endpoints: {
    authorize: string;
    token: string;
    register?: string;
    jwks?: string;
  },
): OAuthAuthorizationServerMetadata {
  return {
    issuer,
    authorization_endpoint: endpoints.authorize,
    token_endpoint: endpoints.token,
    ...(endpoints.register
      ? { registration_endpoint: endpoints.register }
      : {}),
    ...(endpoints.jwks ? { jwks_uri: endpoints.jwks } : {}),
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
  };
}

/** Configure any standards-based authorization server that issues JWT access tokens. */
function jwtOAuth<TUser extends OAuthUser = OAuthUser>(
  options: JwtOAuthProviderOptions<TUser>,
): Extract<AuthConfig<TUser>, { type: "oauth" }> {
  const issuerBase = httpsUrl(options.issuer, "issuer");
  const issuer = options.issuer.endsWith("/") ? `${issuerBase}/` : issuerBase;
  const jwksUri = httpsUrl(options.jwksUri, "jwksUri");
  // RFC 8414 issuer identifiers are exact URL strings. Preserve a provider's
  // canonical trailing slash (notably Auth0) in protected-resource metadata.
  const authorizationServers = (options.authorizationServers ?? [issuer]).map(
    authorizationServerUrl,
  );
  return providerConfig(
    options,
    authorizationServers,
    jwksVerifier({
      issuer,
      jwksUri,
      audience: options.audience ?? ((context) => context.resource),
      algorithms: options.algorithms,
      mapUser: options.mapUser,
      mapPermissions: options.mapPermissions,
    }),
  );
}

export interface Auth0OAuthOptions extends OAuthProviderOptions {
  /** Auth0 tenant domain, with or without `https://`. */
  domain: string;
  /** Legacy explicit Auth0 API Identifier. Defaults to the canonical MCP resource. */
  audience?: string;
}

export interface Auth0OAuthUser extends OAuthUser {
  nickname?: string;
  picture?: string;
  emailVerified?: boolean;
  updatedAt?: string;
  roles: string[];
}

/** Complete Auth0 resource-server configuration: discovery, JWKS verification, identity, and scopes. */
function auth0OAuth(
  options: Auth0OAuthOptions,
): Extract<AuthConfig<Auth0OAuthUser>, { type: "oauth" }> {
  if (options.audience !== undefined && !options.audience.trim()) {
    throw new Error("Auth0 audience must be non-empty when provided");
  }
  const origin = httpsOrigin(options.domain, "Auth0 domain");
  const issuer = `${origin}/`;
  return jwtOAuth({
    ...options,
    issuer,
    jwksUri: `${origin}/.well-known/jwks.json`,
    authorizationServers: [issuer],
    authorizationServerMetadata: authorizationMetadata(issuer, {
      authorize: `${origin}/authorize`,
      token: `${origin}/oauth/token`,
      register: `${origin}/oidc/register`,
      jwks: `${origin}/.well-known/jwks.json`,
    }),
    ...(options.audience ? { audience: options.audience } : {}),
    mapUser: (claims): Auth0OAuthUser => ({
      id: String(claims.sub),
      email: stringValue(claims, "email"),
      name: stringValue(claims, "name"),
      nickname: stringValue(claims, "nickname"),
      picture: stringValue(claims, "picture"),
      emailVerified: booleanValue(claims, "email_verified"),
      updatedAt: stringValue(claims, "updated_at"),
      roles: normalizedStrings(claims.roles),
    }),
  });
}

export interface ClerkOAuthOptions extends OAuthProviderOptions {
  /** Clerk issuer/domain, with or without `https://`. */
  domain: string;
  /** Expected audience for audience-bearing Clerk OAuth JWTs. */
  audience?: string;
}

export interface ClerkOAuthUser extends OAuthUser {
  username?: string;
  picture?: string;
  emailVerified?: boolean;
  organizationId?: string;
  organizationRole?: string;
  organizationSlug?: string;
  roles: string[];
}

/**
 * Clerk OAuth access-token verification.
 *
 * Clerk OAuth tokens currently are not guaranteed to carry an MCP resource
 * audience. Use a Clerk instance dedicated to this MCP/application so that
 * issuer binding also defines the resource-server trust boundary.
 */
function clerkOAuth(
  options: ClerkOAuthOptions,
): Extract<AuthConfig<ClerkOAuthUser>, { type: "oauth" }> {
  const issuer = httpsOrigin(options.domain, "Clerk domain");
  const metadata = authorizationMetadata(issuer, {
    authorize: `${issuer}/oauth/authorize`,
    token: `${issuer}/oauth/token`,
    register: `${issuer}/oauth/register`,
    jwks: `${issuer}/.well-known/jwks.json`,
  });
  const mapUser = (
    claims: Record<string, unknown>,
    id: string,
  ): ClerkOAuthUser => {
    const organizationRole = stringValue(claims, "org_role");
    return {
      id,
      email: stringValue(claims, "email"),
      name: stringValue(claims, "name"),
      username: stringValue(claims, "username"),
      picture: stringValue(claims, "picture"),
      emailVerified: booleanValue(claims, "email_verified"),
      organizationId: stringValue(claims, "org_id"),
      organizationRole,
      organizationSlug: stringValue(claims, "org_slug"),
      roles: organizationRole ? [organizationRole] : [],
    };
  };

  return providerConfig(
    { ...options, authorizationServerMetadata: metadata },
    [issuer],
    jwksVerifier({
      issuer,
      jwksUri: `${issuer}/.well-known/jwks.json`,
      ...(options.audience
        ? { audience: options.audience }
        : { issuerBoundAccessTokens: true }),
      mapUser: (claims) => mapUser(claims, String(claims.sub)),
      mapPermissions: (claims) => normalizedStrings(claims.org_permissions),
    }),
  );
}

export interface WorkOSOAuthOptions extends OAuthProviderOptions {
  /** WorkOS AuthKit domain, with or without `https://`. */
  authKitDomain: string;
  audience?: string;
}

export interface WorkOSOAuthUser extends OAuthUser {
  emailVerified?: boolean;
  preferredUsername?: string;
  firstName?: string;
  lastName?: string;
  picture?: string;
  roles: string[];
  organizationId?: string;
  sessionId?: string;
}

/** Complete WorkOS AuthKit resource-server configuration. */
function workosOAuth(
  options: WorkOSOAuthOptions,
): Extract<AuthConfig<WorkOSOAuthUser>, { type: "oauth" }> {
  const issuer = httpsOrigin(options.authKitDomain, "WorkOS AuthKit domain");
  return jwtOAuth({
    ...options,
    issuer,
    jwksUri: `${issuer}/oauth2/jwks`,
    authorizationServers: [issuer],
    authorizationServerMetadata: authorizationMetadata(issuer, {
      authorize: `${issuer}/oauth2/authorize`,
      token: `${issuer}/oauth2/token`,
      register: `${issuer}/oauth2/register`,
      jwks: `${issuer}/oauth2/jwks`,
    }),
    mapUser: (claims): WorkOSOAuthUser => ({
      id: String(claims.sub),
      email: stringValue(claims, "email"),
      name: stringValue(claims, "name"),
      emailVerified: booleanValue(claims, "email_verified"),
      preferredUsername: stringValue(claims, "preferred_username"),
      firstName: stringValue(claims, "first_name"),
      lastName: stringValue(claims, "last_name"),
      picture: stringValue(claims, "picture"),
      roles: normalizedStrings(claims.roles),
      organizationId: stringValue(claims, "org_id"),
      sessionId: stringValue(claims, "sid"),
    }),
  });
}

export interface SupabaseOAuthOptions extends OAuthProviderOptions {
  /** Supabase project id. Ignored when `supabaseUrl` is provided. */
  projectId?: string;
  /** Full hosted, custom-domain, self-hosted, or local Supabase URL. */
  supabaseUrl?: string;
  /** Legacy HS256 JWT secret. Omit to verify asymmetric tokens using JWKS. */
  jwtSecret?: string;
  /** Expected access-token audience. Defaults to `authenticated`. */
  audience?: string;
}

export interface SupabaseAmr {
  method: string;
  timestamp?: number;
}
export interface SupabaseOAuthUser extends OAuthUser {
  fullName?: string;
  username?: string;
  avatarUrl?: string;
  role?: string;
  aal?: string;
  amr: SupabaseAmr[];
  sessionId?: string;
}

function supabaseAmr(value: unknown): SupabaseAmr[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): SupabaseAmr[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const method = stringValue(record, "method");
    const timestamp = record.timestamp;
    if (
      !method ||
      (timestamp !== undefined &&
        (typeof timestamp !== "number" || !Number.isFinite(timestamp)))
    )
      return [];
    return [
      { method, ...(typeof timestamp === "number" ? { timestamp } : {}) },
    ];
  });
}

/** Complete Supabase Auth OAuth resource-server configuration. */
function supabaseOAuth(
  options: SupabaseOAuthOptions,
): Extract<AuthConfig<SupabaseOAuthUser>, { type: "oauth" }> {
  if (
    options.projectId !== undefined &&
    !/^[a-z0-9-]+$/i.test(options.projectId)
  ) {
    throw new Error("Supabase projectId is invalid");
  }
  const base = options.supabaseUrl
    ? httpsUrl(options.supabaseUrl, "Supabase URL")
    : options.projectId?.trim()
      ? `https://${options.projectId.trim()}.supabase.co`
      : "";
  if (!base) throw new Error("Supabase projectId or supabaseUrl is required");
  const issuer = `${trimSlash(base)}/auth/v1`;
  const audience = options.audience ?? "authenticated";
  if (!audience.trim()) throw new Error("Supabase audience must be non-empty");
  if (
    options.jwtSecret !== undefined &&
    new TextEncoder().encode(options.jwtSecret).length < 32
  ) {
    throw new Error("Supabase jwtSecret must be at least 32 bytes");
  }
  return providerConfig(
    {
      ...options,
      authorizationServerMetadata: authorizationMetadata(issuer, {
        authorize: `${issuer}/oauth/authorize`,
        token: `${issuer}/oauth/token`,
        register: `${issuer}/oauth/clients/register`,
        jwks: `${issuer}/.well-known/jwks.json`,
      }),
    },
    [issuer],
    jwksVerifier({
      issuer,
      jwksUri: `${issuer}/.well-known/jwks.json`,
      audience,
      ...(options.jwtSecret
        ? {
            key: new TextEncoder().encode(options.jwtSecret),
            algorithms: ["HS256"],
          }
        : { algorithms: ["ES256"] }),
      mapUser: (claims): SupabaseOAuthUser => {
        const metadata = recordValue(claims, "user_metadata") ?? {};
        return {
          id: String(claims.sub ?? claims.user_id),
          email: stringValue(claims, "email"),
          name: stringValue(metadata, "name"),
          fullName: stringValue(metadata, "full_name"),
          username: stringValue(metadata, "username"),
          avatarUrl: stringValue(metadata, "avatar_url"),
          role: stringValue(claims, "role"),
          aal: stringValue(claims, "aal"),
          amr: supabaseAmr(claims.amr),
          sessionId: stringValue(claims, "session_id"),
        };
      },
      mapPermissions: (claims) => {
        const aal = stringValue(claims, "aal");
        return aal ? [`aal:${aal}`] : [];
      },
    }),
  );
}

export interface BetterAuthOAuthOptions extends OAuthProviderOptions {
  /** Full Better Auth issuer URL, including its base path. */
  authUrl: string;
}

export interface BetterAuthOAuthUser extends OAuthUser {
  picture?: string;
  emailVerified?: boolean;
  sessionId?: string;
  isAnonymous?: boolean;
  roles: string[];
}

/** Complete Better Auth OAuth Provider resource-server configuration. */
function betterAuthOAuth(
  options: BetterAuthOAuthOptions,
): Extract<AuthConfig<BetterAuthOAuthUser>, { type: "oauth" }> {
  const issuer = httpsUrl(options.authUrl, "Better Auth URL");
  return jwtOAuth({
    ...options,
    issuer,
    jwksUri: `${issuer}/jwks`,
    authorizationServers: [issuer],
    authorizationServerMetadata: authorizationMetadata(issuer, {
      authorize: `${issuer}/oauth2/authorize`,
      token: `${issuer}/oauth2/token`,
      register: `${issuer}/oauth2/register`,
      jwks: `${issuer}/jwks`,
    }),
    mapUser: (claims): BetterAuthOAuthUser => ({
      id: String(claims.sub),
      email: stringValue(claims, "email"),
      name: stringValue(claims, "name"),
      picture: stringValue(claims, "picture"),
      emailVerified: booleanValue(claims, "email_verified"),
      sessionId: stringValue(claims, "sid"),
      isAnonymous:
        booleanValue(claims, "is_anonymous") ??
        booleanValue(claims, "isAnonymous"),
      roles: normalizedStrings(claims.roles),
    }),
  });
}

export interface KeycloakOAuthOptions extends OAuthProviderOptions {
  /** Keycloak server base URL, including an installation path when used. */
  serverUrl: string;
  /** Realm that issues accepted access tokens. */
  realm: string;
  /** Legacy explicit audience configured by a Keycloak audience mapper. Defaults to the canonical MCP resource. */
  audience?: string;
}

export interface KeycloakOAuthUser extends OAuthUser {
  preferredUsername?: string;
  givenName?: string;
  familyName?: string;
  emailVerified?: boolean;
  roles: string[];
  realmAccess?: Record<string, unknown>;
  resourceAccess?: Record<string, unknown>;
}

/** Complete Keycloak realm resource-server configuration. */
function keycloakOAuth(
  options: KeycloakOAuthOptions,
): Extract<AuthConfig<KeycloakOAuthUser>, { type: "oauth" }> {
  if (!options.realm.trim() || /[/?#]/.test(options.realm)) {
    throw new Error("Keycloak realm is invalid");
  }
  if (options.audience !== undefined && !options.audience.trim()) {
    throw new Error("Keycloak audience must be non-empty when provided");
  }
  const serverUrl = httpsUrl(options.serverUrl, "Keycloak server URL");
  const issuer = `${serverUrl}/realms/${encodeURIComponent(options.realm)}`;
  return jwtOAuth({
    ...options,
    issuer,
    jwksUri: `${issuer}/protocol/openid-connect/certs`,
    authorizationServers: [issuer],
    authorizationServerMetadata: authorizationMetadata(issuer, {
      authorize: `${issuer}/protocol/openid-connect/auth`,
      token: `${issuer}/protocol/openid-connect/token`,
      register: `${issuer}/clients-registrations/openid-connect`,
      jwks: `${issuer}/protocol/openid-connect/certs`,
    }),
    ...(options.audience ? { audience: options.audience } : {}),
    mapUser: (claims): KeycloakOAuthUser => {
      const realmAccess = recordValue(claims, "realm_access");
      const resourceAccess = recordValue(claims, "resource_access");
      return {
        id: String(claims.sub),
        email: stringValue(claims, "email"),
        name: stringValue(claims, "name"),
        preferredUsername: stringValue(claims, "preferred_username"),
        givenName: stringValue(claims, "given_name"),
        familyName: stringValue(claims, "family_name"),
        emailVerified: booleanValue(claims, "email_verified"),
        roles: normalizedStrings(realmAccess?.roles),
        realmAccess,
        resourceAccess,
      };
    },
    mapPermissions: (claims) => {
      const resourceAccess = recordValue(claims, "resource_access");
      if (!resourceAccess) return [];
      return Object.entries(resourceAccess).flatMap(([resource, value]) => {
        if (!value || typeof value !== "object" || Array.isArray(value))
          return [];
        return normalizedStrings((value as Record<string, unknown>).roles).map(
          (role) => `${resource}:${role}`,
        );
      });
    },
  });
}

export interface CustomOAuthProviderOptions<
  TUser extends OAuthUser = OAuthUser,
> extends OAuthProviderOptions {
  authorizationServers: string[];
  verifyToken: OAuthTokenVerifier<TUser>;
}

/**
 * Escape hatch for opaque-token introspection or a custom verification system.
 * The supplied verifier must validate that the token was issued for
 * `context.resource`; signature/issuer validation alone is not sufficient.
 */
function customOAuth<TUser extends OAuthUser = OAuthUser>(
  options: CustomOAuthProviderOptions<TUser>,
): Extract<AuthConfig<TUser>, { type: "oauth" }> {
  if (options.authorizationServers.length === 0)
    throw new Error("authorizationServers must not be empty");
  return providerConfig(
    options,
    options.authorizationServers.map(authorizationServerUrl),
    options.verifyToken,
  );
}

/** OAuth configurations for external authorization servers. */
export const oauth = Object.freeze({
  auth0: auth0OAuth,
  clerk: clerkOAuth,
  workos: workosOAuth,
  supabase: supabaseOAuth,
  betterAuth: betterAuthOAuth,
  keycloak: keycloakOAuth,
  jwt: jwtOAuth,
  custom: customOAuth,
});
