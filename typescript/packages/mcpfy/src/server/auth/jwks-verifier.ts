import { createRemoteJWKSet, errors, jwtVerify } from "jose";
import type {
  AuthInfo,
  OAuthTokenVerifier,
  OAuthUser,
  OAuthVerificationContext,
} from "./types.js";
import { canonicalOAuthResource } from "./url.js";

export interface JwksVerifierOptions<TUser extends OAuthUser = OAuthUser> {
  /** Expected `iss` claim. */
  issuer: string;
  /** The authorization server's JWKS endpoint, e.g. `https://issuer.example.com/.well-known/jwks.json`. */
  jwksUri: string;
  /** Expected `aud` claim, if the authorization server sets one. */
  audience?:
    | string
    | string[]
    | ((context: OAuthVerificationContext) => string | string[] | undefined);
  /** Accept issuer-bound access tokens that omit both `aud` and `resource`. */
  issuerBoundAccessTokens?: boolean;
  /** Restrict accepted JWS algorithms. By default jose selects algorithms compatible with the JWKS key. */
  algorithms?: string[];
  /** Symmetric verification key for providers that still issue HS256 tokens. */
  key?: Uint8Array;
  /** Map verified claims into a provider-friendly user object. Defaults to `{ id: sub }`. */
  mapUser?: (claims: Record<string, unknown>) => TUser;
  /** Map verified claims into normalized application permissions. Defaults to the `permissions` claim. */
  mapPermissions?: (claims: Record<string, unknown>) => string[];
}

/**
 * Generic bearer-token verifier for any standard OIDC/JWT authorization server —
 * covers Auth0, Keycloak, WorkOS, Clerk, etc. by just pointing this at that
 * provider's issuer + JWKS URL. Caches the JWKS remotely per `jose`'s own
 * rotation-aware fetch/cache logic.
 */
export function jwksVerifier<TUser extends OAuthUser = OAuthUser>(
  options: JwksVerifierOptions<TUser>,
): OAuthTokenVerifier<TUser> {
  const key = options.key ?? createRemoteJWKSet(new URL(options.jwksUri));

  return async (
    token: string,
    context: OAuthVerificationContext,
  ): Promise<AuthInfo<TUser> | null> => {
    try {
      const audience =
        typeof options.audience === "function"
          ? options.audience(context)
          : options.audience;
      const { payload } = await jwtVerify(token, key, {
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
          normalizedTokenResource = canonicalOAuthResource(tokenResource);
          normalizedExpectedResource = canonicalOAuthResource(context.resource);
        } catch {
          return null;
        }
        if (normalizedTokenResource !== normalizedExpectedResource) return null;
      } else if (
        audience === undefined &&
        options.issuerBoundAccessTokens !== true
      ) {
        const tokenAudiences =
          typeof payload.aud === "string"
            ? [payload.aud]
            : Array.isArray(payload.aud)
              ? payload.aud.filter(
                  (value): value is string => typeof value === "string",
                )
              : [];
        if (
          !tokenAudiences.some((value) => {
            try {
              return (
                canonicalOAuthResource(value) ===
                canonicalOAuthResource(context.resource)
              );
            } catch {
              return false;
            }
          })
        )
          return null;
      }
      const scopeClaim = payload.scope;
      const scopes =
        typeof scopeClaim === "string"
          ? scopeClaim.split(/\s+/).filter(Boolean)
          : Array.isArray(scopeClaim)
            ? scopeClaim.filter(
                (value): value is string =>
                  typeof value === "string" && value.length > 0,
              )
            : [];
      const claims = payload as Record<string, unknown>;
      const permissions =
        options.mapPermissions?.(claims) ??
        (Array.isArray(payload.permissions)
          ? payload.permissions.filter(
              (value): value is string => typeof value === "string",
            )
          : []);
      const user =
        options.mapUser?.(claims) ??
        ({
          id: payload.sub,
          email: typeof payload.email === "string" ? payload.email : undefined,
          name: typeof payload.name === "string" ? payload.name : undefined,
        } as TUser);
      return {
        sub: payload.sub,
        scopes,
        permissions,
        claims,
        user,
        expiresAt: payload.exp,
        clientId:
          typeof payload.client_id === "string"
            ? payload.client_id
            : typeof payload.azp === "string"
              ? payload.azp
              : undefined,
        resource: context.resource,
      };
    } catch (error) {
      if (isCredentialFailure(error)) return null;
      throw error;
    }
  };
}

function isCredentialFailure(error: unknown): boolean {
  return (
    error instanceof errors.JWTClaimValidationFailed ||
    error instanceof errors.JWTExpired ||
    error instanceof errors.JOSEAlgNotAllowed ||
    error instanceof errors.JOSENotSupported ||
    error instanceof errors.JWSInvalid ||
    error instanceof errors.JWTInvalid ||
    error instanceof errors.JWSSignatureVerificationFailed ||
    error instanceof errors.JWKSNoMatchingKey
  );
}
