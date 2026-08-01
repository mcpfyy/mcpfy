export type { AuthConfig, AuthInfo } from "./types.js";
export { jwksVerifier, type JwksVerifierOptions } from "./jwks-verifier.js";
export { oauthAuth0Provider, oauthWorkOSProvider } from "./presets.js";
export { checkAuth, type AuthCheckResult } from "./middleware.js";
export { buildProtectedResourceMetadata } from "./well-known.js";
