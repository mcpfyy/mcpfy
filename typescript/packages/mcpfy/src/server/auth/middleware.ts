import type { IncomingMessage } from "node:http";
import type { AuthConfig, AuthInfo } from "./types.js";

export type AuthCheckResult = { ok: true; auth: AuthInfo } | { ok: false };

function extractBearerToken(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return undefined;
  return token;
}

/** Framework-free bearer-token check — reads `Authorization: Bearer <token>` and dispatches to the configured verifier. */
export async function checkAuth(req: IncomingMessage, config: AuthConfig): Promise<AuthCheckResult> {
  const token = extractBearerToken(req);
  if (!token) return { ok: false };

  if (config.type === "header") {
    const valid = await config.verify(token);
    return valid ? { ok: true, auth: { claims: {} } } : { ok: false };
  }

  const auth = await config.verifyToken(token);
  return auth ? { ok: true, auth } : { ok: false };
}
