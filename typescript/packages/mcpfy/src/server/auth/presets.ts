import { jwksVerifier } from "./jwks-verifier.js";
import type { AuthInfo } from "./types.js";

/** Thin wrapper around `jwksVerifier` pre-filled with Auth0's standard endpoint pattern. */
export function oauthAuth0Provider(options: {
  /** Your Auth0 tenant domain, e.g. `"your-tenant.us.auth0.com"`. */
  domain: string;
  /** The API identifier configured in Auth0 (the `aud` claim). */
  audience?: string;
}): (token: string) => Promise<AuthInfo | null> {
  return jwksVerifier({
    issuer: `https://${options.domain}/`,
    jwksUri: `https://${options.domain}/.well-known/jwks.json`,
    audience: options.audience,
  });
}

/**
 * Thin wrapper around `jwksVerifier` pre-filled with WorkOS's AuthKit endpoint
 * pattern. WorkOS's exact issuer/JWKS URLs are tied to your AuthKit domain —
 * verify against your WorkOS dashboard if this doesn't match.
 */
export function oauthWorkOSProvider(options: {
  /** Your WorkOS AuthKit domain, e.g. `"your-app.authkit.app"`. */
  authKitDomain: string;
  audience?: string;
}): (token: string) => Promise<AuthInfo | null> {
  return jwksVerifier({
    issuer: `https://${options.authKitDomain}`,
    jwksUri: `https://${options.authKitDomain}/oauth2/jwks`,
    audience: options.audience,
  });
}
