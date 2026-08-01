import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { MCPServer } from "../src/server/mcp-server.js";
import { MCPClient } from "../src/client/mcp-client.js";
import { jwksVerifier } from "../src/server/auth/jwks-verifier.js";
import { NodeOAuthClientProvider, ensureAuthorized } from "../src/auth/node-oauth-provider.js";
import { object } from "../src/shared/response-helpers.js";
import { startFakeAuthorizationServer, type FakeAuthorizationServer } from "./helpers/fake-authorization-server.js";

describe("client <-> server OAuth round trip", () => {
  let server: MCPServer | undefined;
  let client: MCPClient | undefined;
  let authServer: FakeAuthorizationServer | undefined;
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "mcpfy-oauth-roundtrip-"));
  });

  afterEach(async () => {
    await client?.closeAllSessions();
    await server?.close();
    await authServer?.close();
    rmSync(dataDir, { recursive: true, force: true });
    server = undefined;
    client = undefined;
    authServer = undefined;
  });

  it("discovers, registers, authorizes via PKCE, exchanges tokens, and completes an authenticated tool call", async () => {
    authServer = await startFakeAuthorizationServer();

    server = new MCPServer({
      name: "oauth-roundtrip-fixture",
      version: "1.0.0",
      auth: {
        type: "oauth",
        verifyToken: jwksVerifier({ issuer: authServer.url, jwksUri: `${authServer.url}/.well-known/jwks.json` }),
        authorizationServers: [authServer.url],
      },
    });
    server.tool(
      { name: "whoami", schema: z.object({}), outputSchema: z.object({ sub: z.string().optional() }) },
      async (_args, ctx) => object({ sub: ctx.auth?.sub })
    );

    const port = 34000 + Math.floor(Math.random() * 1000);
    await server.listen({ transport: "http", port });
    const serverUrl = `http://localhost:${port}/mcp`;

    const provider = await NodeOAuthClientProvider.create({
      serverUrl,
      dataDir,
      // Simulates the browser: fetch() follows the fake AS's 302 straight to our loopback callback.
      onAuthorizationUrl: (url) => {
        fetch(url).catch((err) => console.error("simulated browser visit failed:", err));
      },
    });

    await ensureAuthorized(provider, serverUrl);

    const tokens = await provider.tokens();
    expect(tokens?.access_token).toBeTruthy();

    client = new MCPClient({ mcpServers: { fixture: { url: serverUrl, authProvider: provider } } });
    const session = await client.createSession("fixture");
    const result = await session.callTool("whoami", {});
    expect(result.structuredContent).toEqual({ sub: "test-user-123" });
  });
});
