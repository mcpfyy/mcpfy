import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { MCPServer } from "../src/server/mcp-server.js";
import { object } from "../src/shared/response-helpers.js";
import type { AuthInfo } from "../src/server/auth/types.js";
import { parseSseJson } from "./helpers.js";

describe("oauth auth", () => {
  let server: MCPServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("401s with WWW-Authenticate + serves protected-resource metadata + accepts a valid token", async () => {
    const verifyToken = async (token: string): Promise<AuthInfo | null> =>
      token === "valid-jwt" ? { sub: "user-123", scopes: ["read"], claims: { sub: "user-123" } } : null;

    server = new MCPServer({
      name: "oauth-fixture",
      version: "1.0.0",
      auth: { type: "oauth", verifyToken, authorizationServers: ["https://auth.example.com"] },
    });
    server.tool(
      { name: "whoami", schema: z.object({}), outputSchema: z.object({ sub: z.string().optional() }) },
      async (_args, ctx) => object({ sub: ctx.auth?.sub })
    );

    const port = 34000 + Math.floor(Math.random() * 1000);
    await server.listen({ transport: "http", port });
    const base = `http://localhost:${port}`;

    const noAuth = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(noAuth.status).toBe(401);
    expect(noAuth.headers.get("www-authenticate")).toBe(
      `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`
    );

    const metadataRes = await fetch(`${base}/.well-known/oauth-protected-resource`);
    expect(metadataRes.status).toBe(200);
    const metadata = (await metadataRes.json()) as { resource: string; authorization_servers: string[] };
    expect(metadata.resource).toBe(`${base}/mcp`);
    expect(metadata.authorization_servers).toEqual(["https://auth.example.com"]);

    const callRes = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: "Bearer valid-jwt",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "whoami", arguments: {} } }),
    });
    expect(callRes.status).toBe(200);
    const callJson = await parseSseJson<{ result: { structuredContent: { sub?: string } } }>(callRes);
    expect(callJson.result.structuredContent).toEqual({ sub: "user-123" });
  });
});
