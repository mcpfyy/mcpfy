import { afterEach, describe, expect, it } from "vitest";
import { oauth } from "../src/server/auth/providers.js";
import { MCPServer } from "../src/server/mcp-server.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("OAuth provider helpers", () => {
  it("builds a complete Auth0 configuration from one familiar domain field", () => {
    const auth = oauth.auth0({
      domain: "tenant.us.auth0.com",
      resource: "https://tools.example.com/mcp",
      requiredScopes: ["tools:read"],
    });

    expect(auth.type).toBe("oauth");
    expect(auth.authorizationServers).toEqual(["https://tenant.us.auth0.com/"]);
    expect(auth.resource).toBe("https://tools.example.com/mcp");
    expect(auth.requiredScopes).toEqual(["tools:read"]);
    expect(auth.authorizationServerMetadata).toMatchObject({
      issuer: "https://tenant.us.auth0.com/",
      authorization_endpoint: "https://tenant.us.auth0.com/authorize",
      registration_endpoint: "https://tenant.us.auth0.com/oidc/register",
    });
    expect(typeof auth.verifyToken).toBe("function");
  });

  it("derives Clerk and WorkOS metadata from provider-native domain fields", () => {
    expect(
      oauth.clerk({
        domain: "app.clerk.accounts.dev",
        resource: "https://tools.example.com/mcp",
      }).authorizationServers,
    ).toEqual(["https://app.clerk.accounts.dev"]);
    expect(
      oauth.workos({
        authKitDomain: "app.authkit.app",
        resource: "https://tools.example.com/mcp",
      }).authorizationServers,
    ).toEqual(["https://app.authkit.app"]);
  });

  it("derives Supabase, Better Auth, and Keycloak issuer metadata", () => {
    expect(
      oauth.supabase({
        projectId: "example-project",
        resource: "https://tools.example.com/mcp",
      }).authorizationServers,
    ).toEqual(["https://example-project.supabase.co/auth/v1"]);
    expect(
      oauth.betterAuth({
        authUrl: "https://example.com/platform/api/auth/",
        resource: "https://tools.example.com/mcp",
      }).authorizationServers,
    ).toEqual(["https://example.com/platform/api/auth"]);
    expect(
      oauth.keycloak({
        serverUrl: "https://identity.example.com/auth",
        realm: "production",
        resource: "https://tools.example.com/mcp",
      }).authorizationServers,
    ).toEqual(["https://identity.example.com/auth/realms/production"]);
  });

  it("validates lean provider-specific options", () => {
    expect(() =>
      oauth.supabase({
        resource: "https://tools.example.com/mcp",
      }),
    ).toThrow("projectId or supabaseUrl");
    expect(() =>
      oauth.supabase({
        projectId: "example-project",
        jwtSecret: "short",
        resource: "https://tools.example.com/mcp",
      }),
    ).toThrow("at least 32 bytes");
    expect(() =>
      oauth.keycloak({
        serverUrl: "https://identity.example.com",
        realm: "invalid/realm",
        resource: "https://tools.example.com/mcp",
      }),
    ).toThrow("realm is invalid");
    expect(() =>
      oauth.auth0({
        domain: "tenant.us.auth0.com",
        audience: " ",
        resource: "https://tools.example.com/mcp",
      }),
    ).toThrow("audience must be non-empty");
    expect(() =>
      oauth.keycloak({
        serverUrl: "https://identity.example.com",
        realm: "production",
        audience: " ",
        resource: "https://tools.example.com/mcp",
      }),
    ).toThrow("audience must be non-empty");
  });

  it("rejects an insecure remote authorization server", () => {
    expect(() =>
      oauth.custom({
        authorizationServers: ["http://auth.example.com"],
        resource: "https://tools.example.com/mcp",
        verifyToken: async () => null,
      }),
    ).toThrow("must use HTTPS");
  });

  it("rejects paths and queries in provider domain fields", () => {
    expect(() =>
      oauth.auth0({
        domain: "tenant.us.auth0.com/oauth",
        resource: "https://tools.example.com/mcp",
      }),
    ).toThrow("must be an origin");
    expect(() =>
      oauth.workos({
        authKitDomain: "app.authkit.app?tenant=other",
        resource: "https://tools.example.com/mcp",
      }),
    ).toThrow("must be an origin");
    expect(() =>
      oauth.clerk({
        domain: "app.clerk.accounts.dev/path",
        resource: "https://tools.example.com/mcp",
      }),
    ).toThrow("must be an origin");
  });

  it("always requires a canonical resource", () => {
    delete process.env.MCPFY_MCP_URL;
    delete process.env.MCPFY_URL;
    delete process.env.MCP_URL;
    expect(() => oauth.auth0({ domain: "tenant.us.auth0.com" })).toThrow(
      "OAuth resource is required",
    );
  });

  it("configures Clerk JWKS verification", () => {
    const auth = oauth.clerk({
      domain: "app.clerk.accounts.dev",
      resource: "https://tools.example.com/mcp",
    });
    expect(auth.authorizationServerMetadata).toMatchObject({
      issuer: "https://app.clerk.accounts.dev",
      registration_endpoint: "https://app.clerk.accounts.dev/oauth/register",
    });
    expect(typeof auth.verifyToken).toBe("function");
  });

  it("infers provider-specific users in tool callbacks", () => {
    const server = new MCPServer({
      name: "typed-auth",
      version: "1.0.0",
      auth: oauth.auth0({
        domain: "tenant.us.auth0.com",
        resource: "https://tools.example.com/mcp",
      }),
    });
    server.tool({ name: "whoami" }, async (_params, ctx) => {
      const roles: string[] | undefined = ctx.auth?.user?.roles;
      return { content: [{ type: "text", text: String(roles?.length ?? 0) }] };
    });
  });
});
