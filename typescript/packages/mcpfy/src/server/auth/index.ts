export type { AuthConfig, AuthInfo, OAuthUser, OAuthTokenVerifier, OAuthVerificationContext } from "./types.js";
export { jwksVerifier, type JwksVerifierOptions } from "./jwks-verifier.js";
export { oauth } from "./providers.js";
export type {
  Auth0OAuthOptions,
  ClerkOAuthOptions,
  CustomOAuthProviderOptions,
  JwtOAuthProviderOptions,
  OAuthProviderOptions,
  WorkOSOAuthOptions,
} from "./providers.js";
export { checkAuth, type AuthCheckResult } from "./middleware.js";
export { buildProtectedResourceMetadata } from "./well-known.js";
