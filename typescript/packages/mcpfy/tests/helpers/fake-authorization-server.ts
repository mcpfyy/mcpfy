import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { exportJWK, generateKeyPair, SignJWT, type KeyLike } from "jose";

export interface FakeAuthorizationServer {
  url: string;
  close(): Promise<void>;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/**
 * A minimal real authorization server for tests: RFC 8414 metadata, RFC 7591
 * dynamic client registration, a PKCE-validating `/authorize` + `/token`, and
 * a JWKS endpoint serving the key it actually signs tokens with — enough to
 * exercise the SDK's real `auth()` flow and mcpfy's real `jwksVerifier` end to end.
 */
export async function startFakeAuthorizationServer(): Promise<FakeAuthorizationServer> {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const kid = "test-key-1";
  const jwk = { ...(await exportJWK(publicKey)), kid, alg: "RS256", use: "sig" };

  const codes = new Map<string, { codeChallenge: string }>();
  let issuer = "";

  async function signAccessToken(): Promise<string> {
    return new SignJWT({ scope: "read" })
      .setProtectedHeader({ alg: "RS256", kid })
      .setIssuedAt()
      .setIssuer(issuer)
      .setSubject("test-user-123")
      .setExpirationTime("1h")
      .sign(privateKey as KeyLike);
  }

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", issuer || "http://127.0.0.1");

    if (url.pathname === "/.well-known/oauth-authorization-server") {
      res.writeHead(200, { "content-type": "application/json" }).end(
        JSON.stringify({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          registration_endpoint: `${issuer}/register`,
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "refresh_token"],
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["none"],
        })
      );
      return;
    }

    if (url.pathname === "/.well-known/jwks.json") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ keys: [jwk] }));
      return;
    }

    if (url.pathname === "/register" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}");
      res.writeHead(201, { "content-type": "application/json" }).end(
        JSON.stringify({
          client_id: `test-client-${randomBytes(4).toString("hex")}`,
          redirect_uris: body.redirect_uris,
          client_name: body.client_name,
          grant_types: body.grant_types ?? ["authorization_code"],
          response_types: body.response_types ?? ["code"],
          token_endpoint_auth_method: "none",
        })
      );
      return;
    }

    if (url.pathname === "/authorize" && req.method === "GET") {
      const redirectUri = url.searchParams.get("redirect_uri") ?? "";
      const state = url.searchParams.get("state") ?? "";
      const codeChallenge = url.searchParams.get("code_challenge") ?? "";
      const code = `test-auth-code-${randomBytes(8).toString("hex")}`;
      codes.set(code, { codeChallenge });
      const redirect = new URL(redirectUri);
      redirect.searchParams.set("code", code);
      if (state) redirect.searchParams.set("state", state);
      res.writeHead(302, { location: redirect.toString() }).end();
      return;
    }

    if (url.pathname === "/token" && req.method === "POST") {
      const params = new URLSearchParams(await readBody(req));
      const grantType = params.get("grant_type");

      if (grantType === "authorization_code") {
        const code = params.get("code") ?? "";
        const verifier = params.get("code_verifier") ?? "";
        const entry = codes.get(code);
        if (!entry) {
          res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "invalid_grant" }));
          return;
        }
        const challenge = createHash("sha256").update(verifier).digest("base64url");
        if (challenge !== entry.codeChallenge) {
          res
            .writeHead(400, { "content-type": "application/json" })
            .end(JSON.stringify({ error: "invalid_grant", error_description: "PKCE verification failed" }));
          return;
        }
        codes.delete(code);
        res.writeHead(200, { "content-type": "application/json" }).end(
          JSON.stringify({
            access_token: await signAccessToken(),
            token_type: "Bearer",
            expires_in: 3600,
            refresh_token: "test-refresh-token",
          })
        );
        return;
      }

      if (grantType === "refresh_token") {
        res.writeHead(200, { "content-type": "application/json" }).end(
          JSON.stringify({ access_token: await signAccessToken(), token_type: "Bearer", expires_in: 3600 })
        );
        return;
      }

      res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "unsupported_grant_type" }));
      return;
    }

    res.writeHead(404).end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  issuer = `http://127.0.0.1:${port}`;

  return {
    url: issuer,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
