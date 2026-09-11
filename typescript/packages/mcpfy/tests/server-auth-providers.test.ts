import { afterEach, describe, expect, it, vi } from "vitest";
import {
  oauth,
} from "../src/server/auth/providers.js";

const ORIGINAL_ENV = { ...process.env };

const clerkVerifyOAuthToken = vi.hoisted(() => vi.fn());
vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({
    idPOAuthAccessToken: { verify: clerkVerifyOAuthToken },
  }),
}));

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  clerkVerifyOAuthToken.mockReset();
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
    expect(typeof auth.verifyToken).toBe("function");
  });

  it("derives Clerk and WorkOS metadata from provider-native domain fields", () => {
    expect(oauth.clerk({
      domain: "app.clerk.accounts.dev",
      secretKey: "sk_test_example",
      resource: "https://tools.example.com/mcp",
    }).authorizationServers)
      .toEqual(["https://app.clerk.accounts.dev"]);
    expect(oauth.workos({
      authKitDomain: "app.authkit.app",
      resource: "https://tools.example.com/mcp",
    }).authorizationServers)
      .toEqual(["https://app.authkit.app"]);
  });

  it("rejects an insecure remote authorization server", () => {
    expect(() => oauth.custom({
      authorizationServers: ["http://auth.example.com"],
      resource: "https://tools.example.com/mcp",
      verifyToken: async () => null,
    })).toThrow("must use HTTPS");
  });

  it("rejects paths and queries in provider domain fields", () => {
    expect(() => oauth.auth0({
      domain: "tenant.us.auth0.com/oauth",
      resource: "https://tools.example.com/mcp",
    })).toThrow("must be an origin");
    expect(() => oauth.workos({
      authKitDomain: "app.authkit.app?tenant=other",
      resource: "https://tools.example.com/mcp",
    })).toThrow("must be an origin");
    expect(() => oauth.clerk({
      domain: "app.clerk.accounts.dev/path",
      secretKey: "sk_test_example",
      resource: "https://tools.example.com/mcp",
    })).toThrow("must be an origin");
  });

  it("always requires a canonical resource", () => {
    delete process.env.MCPFY_MCP_URL;
    delete process.env.MCPFY_URL;
    delete process.env.MCP_URL;
    expect(() => oauth.auth0({ domain: "tenant.us.auth0.com" }))
      .toThrow("OAuth resource is required");
  });

  it("accepts only tokens Clerk identifies as OAuth access tokens", async () => {
    clerkVerifyOAuthToken.mockResolvedValue({
      subject: "user_123",
      scopes: ["tools:read"],
      clientId: "client_123",
      revoked: false,
      expired: false,
    });
    const auth = oauth.clerk({
      domain: "app.clerk.accounts.dev",
      secretKey: "sk_test_example",
      resource: "https://tools.example.com/mcp",
    });
    await expect(auth.verifyToken("oauth-token", { resource: auth.resource, requiredScopes: [] }))
      .resolves.toMatchObject({ sub: "user_123", scopes: ["tools:read"], clientId: "client_123" });
    expect(clerkVerifyOAuthToken).toHaveBeenCalledWith("oauth-token");
  });

  it("rejects Clerk session tokens", async () => {
    clerkVerifyOAuthToken.mockRejectedValue(new Error("OAuth token not found"));
    const auth = oauth.clerk({
      domain: "app.clerk.accounts.dev",
      secretKey: "sk_test_example",
      resource: "https://tools.example.com/mcp",
    });
    await expect(auth.verifyToken("session-token", { resource: auth.resource, requiredScopes: [] }))
      .resolves.toBeNull();
  });

  it("rejects expired or revoked Clerk OAuth tokens", async () => {
    clerkVerifyOAuthToken.mockResolvedValue({
      subject: "user_123",
      scopes: [],
      clientId: "client_123",
      revoked: false,
      expired: true,
    });
    const auth = oauth.clerk({
      domain: "app.clerk.accounts.dev",
      secretKey: "sk_test_example",
      resource: "https://tools.example.com/mcp",
    });
    await expect(auth.verifyToken("expired-token", { resource: auth.resource, requiredScopes: [] }))
      .resolves.toBeNull();
  });
});
