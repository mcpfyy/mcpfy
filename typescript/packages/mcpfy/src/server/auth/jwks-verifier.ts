import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AuthInfo, OAuthTokenVerifier, OAuthVerificationContext } from "./types.js";

export interface JwksVerifierOptions {
  /** Expected `iss` claim. */
  issuer: string;
  /** The authorization server's JWKS endpoint, e.g. `https://issuer.example.com/.well-known/jwks.json`. */
  jwksUri: string;
  /** Expected `aud` claim, if the authorization server sets one. */
  audience?: string | string[] | ((context: OAuthVerificationContext) => string | string[] | undefined);
  /** Restrict accepted JWS algorithms. By default jose selects algorithms compatible with the JWKS key. */
  algorithms?: string[];
  /** Map verified claims into a provider-friendly user object. Defaults to `{ id: sub }`. */
  mapUser?: (claims: Record<string, unknown>) => AuthInfo["user"];
}

/**
 * Generic bearer-token verifier for any standard OIDC/JWT authorization server —
 * covers Auth0, Keycloak, WorkOS, Clerk, etc. by just pointing this at that
 * provider's issuer + JWKS URL. Caches the JWKS remotely per `jose`'s own
 * rotation-aware fetch/cache logic.
 */
export function jwksVerifier(options: JwksVerifierOptions): OAuthTokenVerifier {
  const jwks = createRemoteJWKSet(new URL(options.jwksUri));

  return async (token: string, context: OAuthVerificationContext): Promise<AuthInfo | null> => {
    try {
      const audience = typeof options.audience === "function" ? options.audience(context) : options.audience;
      const { payload } = await jwtVerify(token, jwks, {
        issuer: options.issuer,
        audience,
        ...(options.algorithms ? { algorithms: options.algorithms } : {}),
      });
      if (!payload.sub || !payload.exp) return null;
      const tokenResource = payload.resource;
      if (tokenResource !== undefined) {
        if (typeof tokenResource !== "string") return null;
        let normalizedTokenResource: string;
        let normalizedExpectedResource: string;
        try {
          normalizedTokenResource = new URL(tokenResource).toString();
          normalizedExpectedResource = new URL(context.resource).toString();
        } catch {
          return null;
        }
        if (normalizedTokenResource !== normalizedExpectedResource) return null;
      } else if (audience === undefined) {
        return null;
      }
      const scopeClaim = payload.scope;
      const scopes = typeof scopeClaim === "string"
        ? scopeClaim.split(/\s+/).filter(Boolean)
        : Array.isArray(scopeClaim)
          ? scopeClaim.filter((value): value is string => typeof value === "string" && value.length > 0)
          : [];
      const claims = payload as Record<string, unknown>;
      const permissions = Array.isArray(payload.permissions)
        ? payload.permissions.filter((value): value is string => typeof value === "string")
        : [];
      const user = options.mapUser?.(claims) ?? {
        id: payload.sub,
        email: typeof payload.email === "string" ? payload.email : undefined,
        name: typeof payload.name === "string" ? payload.name : undefined,
      };
      return {
        sub: payload.sub,
        scopes,
        permissions,
        claims,
        user,
        expiresAt: payload.exp,
        clientId: typeof payload.client_id === "string"
          ? payload.client_id
          : typeof payload.azp === "string"
            ? payload.azp
            : undefined,
        resource: context.resource,
      };
    } catch {
      return null;
    }
  };
}
