export type { AuthConfig, AuthInfo, OAuthAuthorizationServerMetadata, OAuthUser, OAuthTokenVerifier, OAuthVerificationContext } from "./types.js";
export { jwksVerifier, type JwksVerifierOptions } from "./jwks-verifier.js";
export { oauth } from "./providers.js";
export type {
  Auth0OAuthUser,
  BetterAuthOAuthUser,
  ClerkOAuthUser,
  KeycloakOAuthUser,
  SupabaseAmr,
  SupabaseOAuthUser,
  WorkOSOAuthUser,
} from "./providers.js";
export type {
  Auth0OAuthOptions,
  BetterAuthOAuthOptions,
  ClerkOAuthOptions,
  CustomOAuthProviderOptions,
  JwtOAuthProviderOptions,
  OAuthProviderOptions,
  KeycloakOAuthOptions,
  SupabaseOAuthOptions,
  WorkOSOAuthOptions,
} from "./providers.js";
export { checkAuth, type AuthCheckResult } from "./middleware.js";
export { buildAuthorizationServerMetadata, buildProtectedResourceMetadata } from "./well-known.js";
