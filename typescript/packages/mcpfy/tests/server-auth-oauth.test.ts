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
    const port = 34000 + Math.floor(Math.random() * 1000);
    const base = `http://localhost:${port}`;

    server = new MCPServer({
      name: "oauth-fixture",
      version: "1.0.0",
      auth: {
        type: "oauth",
        resource: `${base}/mcp`,
        verifyToken,
        authorizationServers: ["https://auth.example.com"],
      },
    });
    server.tool(
      { name: "whoami", schema: z.object({}), outputSchema: z.object({ sub: z.string().optional() }) },
      async (_args, ctx) => object({ sub: ctx.auth?.sub })
    );

    await server.listen({ transport: "http", port });

    const noAuth = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(noAuth.status).toBe(401);
    expect(noAuth.headers.get("www-authenticate")).toBe(
      `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp", error="invalid_token"`
    );

    const metadataRes = await fetch(`${base}/.well-known/oauth-protected-resource`);
    expect(metadataRes.status).toBe(200);
    const metadata = (await metadataRes.json()) as {
      resource: string;
      authorization_servers: string[];
      bearer_methods_supported: string[];
    };
    expect(metadata.resource).toBe(`${base}/mcp`);
    expect(metadata.authorization_servers).toEqual(["https://auth.example.com"]);
    expect(metadata.bearer_methods_supported).toEqual(["header"]);

    const pathMetadataRes = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`);
    expect(pathMetadataRes.status).toBe(200);

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

  it("returns 403 insufficient_scope when a valid token lacks a required scope", async () => {
    const port = 35000 + Math.floor(Math.random() * 1000);
    const base = `http://localhost:${port}`;
    server = new MCPServer({
      name: "scoped-oauth-fixture",
      version: "1.0.0",
      auth: {
        type: "oauth",
        resource: `${base}/mcp`,
        authorizationServers: ["https://auth.example.com"],
        requiredScopes: ["tools:read"],
        scopesSupported: ["tools:read"],
        verifyToken: async () => ({ sub: "user-123", scopes: ["profile"], claims: { sub: "user-123" } }),
      },
    });

    await server.listen({ transport: "http", port });
    const response = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: "Bearer valid-but-under-scoped",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toContain('error="insufficient_scope"');
    expect(response.headers.get("www-authenticate")).toContain('scope="tools:read"');

    const metadata = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`).then((res) => res.json());
    expect(metadata.scopes_supported).toEqual(["tools:read"]);
  });

  it("uses the configured public resource origin in challenges instead of the request Host", async () => {
    let verifiedResource: string | undefined;
    server = new MCPServer({
      name: "canonical-resource-fixture",
      version: "1.0.0",
      auth: {
        type: "oauth",
        resource: "https://public.example.com/mcp",
        authorizationServers: ["https://auth.example.com"],
        verifyToken: async (_token, context) => {
          verifiedResource = context.resource;
          return null;
        },
      },
    });
    const port = 36000 + Math.floor(Math.random() * 1000);
    await server.listen({ transport: "http", port });
    const response = await fetch(`http://localhost:${port}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer attacker-token",
        host: "attacker.example",
        "x-forwarded-proto": "https",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });

    expect(response.headers.get("www-authenticate")).toContain(
      'resource_metadata="https://public.example.com/.well-known/oauth-protected-resource/mcp"'
    );
    expect(verifiedResource).toBe("https://public.example.com/mcp");
  });

  it("rejects a malformed configured resource before accepting requests", async () => {
    server = new MCPServer({
      name: "invalid-resource-fixture",
      version: "1.0.0",
      auth: {
        type: "oauth",
        resource: "not a URL",
        authorizationServers: ["https://auth.example.com"],
        verifyToken: async () => null,
      },
    });
    await expect(server.listen({ transport: "http", port: 0 }))
      .rejects.toThrow("OAuth resource must be an absolute URL");
  });

  it("returns 500 for an unexpected verifier error and continues serving later requests", async () => {
    let shouldThrow = true;
    server = new MCPServer({
      name: "resilient-oauth-fixture",
      version: "1.0.0",
      auth: {
        type: "oauth",
        resource: "https://public.example.com/mcp",
        authorizationServers: ["https://auth.example.com"],
        verifyToken: async () => {
          if (shouldThrow) throw new Error("identity provider unavailable");
          return { sub: "user-123", claims: { sub: "user-123" } };
        },
      },
    });
    const port = 37000 + Math.floor(Math.random() * 1000);
    await server.listen({ transport: "http", port });
    const request = () => fetch(`http://localhost:${port}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: "Bearer token",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });

    expect((await request()).status).toBe(500);
    shouldThrow = false;
    expect((await request()).status).toBe(200);
  });
});
