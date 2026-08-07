import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NodeOAuthClientProvider } from "../src/auth/node-oauth-provider.js";

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

describe("NodeOAuthClientProvider", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "mcpfy-oauth-test-"));
    execFileMock.mockClear();
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("round-trips client info, code verifier, and non-expiring tokens through storage", async () => {
    const provider = await NodeOAuthClientProvider.create({ serverUrl: "https://mcp.example.com", dataDir });

    expect(await provider.clientInformation()).toBeUndefined();
    await provider.saveClientInformation({ client_id: "abc123", redirect_uris: [provider.redirectUrl] });
    expect(await provider.clientInformation()).toEqual({ client_id: "abc123", redirect_uris: [provider.redirectUrl] });

    await provider.saveCodeVerifier("pkce-verifier-value");
    expect(await provider.codeVerifier()).toBe("pkce-verifier-value");

    expect(await provider.tokens()).toBeUndefined();
    await provider.saveTokens({ access_token: "at-1", token_type: "Bearer" });
    expect(await provider.tokens()).toMatchObject({ access_token: "at-1", token_type: "Bearer" });
  });

  it("derives a stable redirectUrl and clientMetadata pointing at the loopback server", async () => {
    const provider = await NodeOAuthClientProvider.create({ serverUrl: "https://mcp.example.com", dataDir, scope: "read write" });
    expect(provider.redirectUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
    expect(provider.clientMetadata.redirect_uris).toEqual([provider.redirectUrl]);
    expect(provider.clientMetadata.scope).toBe("read write");
    expect(provider.clientMetadata.grant_types).toContain("authorization_code");
  });

  it("persists the loopback port across separate provider instances for the same server", async () => {
    const first = await NodeOAuthClientProvider.create({ serverUrl: "https://mcp.example.com", dataDir });
    const second = await NodeOAuthClientProvider.create({ serverUrl: "https://mcp.example.com", dataDir });
    expect(second.redirectUrl).toBe(first.redirectUrl);
  });

  it("opens authorization URLs without a shell and resolves the loopback callback", async () => {
    const provider = await NodeOAuthClientProvider.create({ serverUrl: "https://mcp.example.com", dataDir });
    const authorizationUrl = new URL("https://fake-auth.example.com/authorize?value=$(touch%20/tmp/pwned)");

    await provider.redirectToAuthorization(authorizationUrl);
    const codePromise = provider.getAuthorizationCode();

    const callbackRes = await fetch(`${provider.redirectUrl}?code=real-auth-code&state=xyz`);
    expect(callbackRes.status).toBe(200);

    await expect(codePromise).resolves.toBe("real-auth-code");
    expect(execFileMock.mock.calls[0][1]).toContain(authorizationUrl.toString());
  });

  it("rejects getAuthorizationCode() when the callback reports an error", async () => {
    const provider = await NodeOAuthClientProvider.create({ serverUrl: "https://mcp.example.com", dataDir });

    await provider.redirectToAuthorization(new URL("https://fake-auth.example.com/authorize?client_id=abc"));
    // Attach the assertion before triggering the callback — the reject() fires synchronously
    // inside the request handler, so awaiting fetch() first would race an unhandled-rejection window.
    const assertion = expect(provider.getAuthorizationCode()).rejects.toThrow(/access_denied/);

    await fetch(`${provider.redirectUrl}?error=access_denied`);

    await assertion;
  });
});
