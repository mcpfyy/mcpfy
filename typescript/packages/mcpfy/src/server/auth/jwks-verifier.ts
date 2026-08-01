import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AuthInfo } from "./types.js";

export interface JwksVerifierOptions {
  /** Expected `iss` claim. */
  issuer: string;
  /** The authorization server's JWKS endpoint, e.g. `https://issuer.example.com/.well-known/jwks.json`. */
  jwksUri: string;
  /** Expected `aud` claim, if the authorization server sets one. */
  audience?: string;
}

/**
 * Generic bearer-token verifier for any standard OIDC/JWT authorization server —
 * covers Auth0, Keycloak, WorkOS, Clerk, etc. by just pointing this at that
 * provider's issuer + JWKS URL. Caches the JWKS remotely per `jose`'s own
 * rotation-aware fetch/cache logic.
 */
export function jwksVerifier(options: JwksVerifierOptions): (token: string) => Promise<AuthInfo | null> {
  const jwks = createRemoteJWKSet(new URL(options.jwksUri));

  return async (token: string): Promise<AuthInfo | null> => {
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: options.issuer,
        audience: options.audience,
      });
      const scopeClaim = payload.scope;
      const scopes = typeof scopeClaim === "string" ? scopeClaim.split(" ").filter(Boolean) : undefined;
      return { sub: payload.sub, scopes, claims: payload as Record<string, unknown> };
    } catch {
      return null;
    }
  };
}
