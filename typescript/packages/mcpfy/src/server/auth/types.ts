/** What a successful auth check resolves to a request; exposed to tool/prompt/resource handlers as `ctx.auth`. */
export interface AuthInfo {
  /** The token subject (`sub` claim, for OAuth) — the authenticated user/client identifier, if known. */
  sub?: string;
  /** Space-delimited `scope` claim, split into an array. */
  scopes?: string[];
  /** The raw token payload (JWT claims for OAuth; empty for header auth). */
  claims: Record<string, unknown>;
  /** Raw bearer token from `Authorization`, when available — useful for forwarding to upstream APIs. */
  token?: string;
}

export type AuthConfig =
  | {
      type: "header";
      /** Return `true` to accept the bearer token, `false`/throw to reject. */
      verify: (token: string) => boolean | Promise<boolean>;
    }
  | {
      type: "oauth";
      /** Return `AuthInfo` to accept the bearer token, `null` to reject. */
      verifyToken: (token: string) => Promise<AuthInfo | null>;
      /** Authorization server issuer URL(s) advertised in `.well-known/oauth-protected-resource`. */
      authorizationServers: string[];
      /** Override the resource identifier advertised in the metadata document; defaults to this server's own `/mcp` URL. */
      resource?: string;
    };
