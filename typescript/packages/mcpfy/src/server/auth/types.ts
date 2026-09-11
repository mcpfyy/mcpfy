export interface OAuthUser {
  /** Stable user identifier from the verified token. */
  id: string;
  email?: string;
  name?: string;
}

/** What a successful auth check resolves to a request; exposed to handlers as `ctx.auth`. */
export interface AuthInfo {
  /** The token subject (`sub` claim, for OAuth) — the authenticated user/client identifier, if known. */
  sub?: string;
  /** Space-delimited `scope` claim, split into an array. */
  scopes?: string[];
  /** The raw token payload (JWT claims for OAuth; empty for header auth). */
  claims: Record<string, unknown>;
  /** Raw bearer token from `Authorization`, when available — useful for forwarding to upstream APIs. */
  token?: string;
  /** Normalized identity supplied by a provider helper. */
  user?: OAuthUser;
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

export type OAuthTokenVerifier = (
  token: string,
  context: OAuthVerificationContext
) => Promise<AuthInfo | null>;

export type AuthConfig =
  | {
      type: "header";
      /** Return `true` to accept the bearer token, `false`/throw to reject. */
      verify: (token: string) => boolean | Promise<boolean>;
    }
  | {
      type: "oauth";
      /** Return `AuthInfo` to accept the bearer token, `null` to reject. */
      verifyToken: OAuthTokenVerifier;
      /** Authorization server issuer URL(s) advertised in `.well-known/oauth-protected-resource`. */
      authorizationServers: string[];
      /** Canonical public MCP endpoint URL advertised in metadata and used for token audience validation. */
      resource: string;
      /** Scopes every authenticated HTTP request must contain. */
      requiredScopes?: string[];
      /** Scopes advertised in protected-resource metadata. */
      scopesSupported?: string[];
      /** Human-readable resource name advertised to clients. */
      resourceName?: string;
    };
