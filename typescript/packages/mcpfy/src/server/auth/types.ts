export interface OAuthUser {
  /** Stable user identifier from the verified token. */
  id: string;
  email?: string;
  name?: string;
}

/** What a successful auth check resolves to a request; exposed to handlers as `ctx.auth`. */
export interface AuthInfo<TUser extends OAuthUser = OAuthUser> {
  /** The token subject (`sub` claim, for OAuth) — the authenticated user/client identifier, if known. */
  sub?: string;
  /** Space-delimited `scope` claim, split into an array. */
  scopes?: string[];
  /** The raw token payload (JWT claims for OAuth; empty for header auth). */
  claims: Record<string, unknown>;
  /** Raw bearer token from `Authorization`, when available — useful for forwarding to upstream APIs. */
  token?: string;
  /** Normalized identity supplied by a provider helper. */
  user?: TUser;
  /** Verified application permissions, when the provider exposes them. */
  permissions?: string[];
  /** Token expiry as a Unix timestamp in seconds. */
  expiresAt?: number;
  /** OAuth client identifier, when present in the token. */
  clientId?: string;
  /** Canonical MCP resource this token was verified for. */
  resource?: string;
}

export interface OAuthVerificationContext {
  /** Canonical public URL of the MCP endpoint. */
  resource: string;
  /** Scopes required by the server-wide bearer gate. */
  requiredScopes: string[];
}

/** RFC 8414/OIDC authorization-server metadata exposed for MCP client discovery. */
export interface OAuthAuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  registration_endpoint?: string;
  jwks_uri?: string;
  response_types_supported?: string[];
  grant_types_supported?: string[];
  code_challenge_methods_supported?: string[];
  scopes_supported?: string[];
  [key: string]: unknown;
}

export type OAuthTokenVerifier<TUser extends OAuthUser = OAuthUser> = (
  token: string,
  context: OAuthVerificationContext,
) => Promise<AuthInfo<TUser> | null>;

export type AuthConfig<TUser extends OAuthUser = OAuthUser> =
  | {
      type: "header";
      /** Return `true` to accept the bearer token, `false`/throw to reject. */
      verify: (token: string) => boolean | Promise<boolean>;
    }
  | {
      type: "oauth";
      /** Return `AuthInfo` to accept the bearer token, `null` to reject. */
      verifyToken: OAuthTokenVerifier<TUser>;
      /** Authorization server issuer URL(s) advertised in `.well-known/oauth-protected-resource`. */
      authorizationServers: string[];
      /** Provider metadata mirrored at `/.well-known/oauth-authorization-server` when available. */
      authorizationServerMetadata?: OAuthAuthorizationServerMetadata;
      /** Canonical public MCP endpoint URL advertised in metadata and used for token audience validation. */
      resource: string;
      /** Shared secret used to trust a gateway-signed public request origin. */
      proxySecret?: string;
      /** Scopes every authenticated HTTP request must contain. */
      requiredScopes?: string[];
      /** Scopes advertised in protected-resource metadata. */
      scopesSupported?: string[];
      /** Human-readable resource name advertised to clients. */
      resourceName?: string;
    };
