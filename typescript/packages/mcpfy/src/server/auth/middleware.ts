import type { IncomingMessage } from "node:http";
import type { AuthConfig, AuthInfo, OAuthVerificationContext } from "./types.js";

export type AuthCheckResult =
  | { ok: true; auth: AuthInfo }
  | { ok: false; reason: "missing_token" | "invalid_token" | "insufficient_scope"; requiredScopes?: string[] };

function extractBearerToken(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return undefined;
  return token;
}

/** Framework-free bearer-token check — reads `Authorization: Bearer <token>` and dispatches to the configured verifier. */
export async function checkAuth(
  req: IncomingMessage,
  config: AuthConfig,
  context?: OAuthVerificationContext
): Promise<AuthCheckResult> {
  const token = extractBearerToken(req);
  if (!token) return { ok: false, reason: "missing_token" };

  if (config.type === "header") {
    let valid = false;
    try {
      valid = await config.verify(token);
    } catch {
      // Header verifiers may throw to reject a credential.
    }
    return valid ? { ok: true, auth: { claims: {}, token } } : { ok: false, reason: "invalid_token" };
  }

  if (!context) throw new Error("OAuth verification requires a canonical resource context");
  const auth = await config.verifyToken(token, context);
  if (!auth) return { ok: false, reason: "invalid_token" };

  const granted = new Set(auth.scopes ?? []);
  const missing = context.requiredScopes.filter((scope) => !granted.has(scope));
  if (missing.length > 0) {
    return { ok: false, reason: "insufficient_scope", requiredScopes: context.requiredScopes };
  }

  return {
    ok: true,
    auth: { ...auth, resource: auth.resource ?? context.resource, token: auth.token ?? token },
  };
}
