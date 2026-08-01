import { discoverOAuthServerInfo, refreshAuthorization } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { KVStore } from "./kv-store.js";

type StoredTokens = OAuthTokens & { obtained_at?: number };

/**
 * Platform-neutral PKCE/token/client-info logic, layered on any `KVStore`.
 * Node's `NodeOAuthClientProvider` uses this with a `FileKVStore`; a future
 * browser provider would use the same class with a `localStorage`-backed
 * `KVStore` — no logic here is Node-specific.
 */
export class OAuthSessionStore {
  private refreshing?: Promise<OAuthTokens | undefined>;

  constructor(
    private readonly kv: KVStore,
    private readonly serverUrl: string
  ) {}

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    const raw = await this.kv.get("client_info");
    return raw ? JSON.parse(raw) : undefined;
  }

  async saveClientInformation(info: OAuthClientInformationMixed): Promise<void> {
    await this.kv.set("client_info", JSON.stringify(info));
  }

  async codeVerifier(): Promise<string> {
    const raw = await this.kv.get("code_verifier");
    if (!raw) throw new Error("No PKCE code verifier saved — call saveCodeVerifier() first.");
    return raw;
  }

  async saveCodeVerifier(verifier: string): Promise<void> {
    await this.kv.set("code_verifier", verifier);
  }

  /** Returns saved tokens, transparently refreshing first if they're within 30s of expiry. */
  async tokens(): Promise<OAuthTokens | undefined> {
    const raw = await this.kv.get("tokens");
    if (!raw) return undefined;
    const stored: StoredTokens = JSON.parse(raw);
    if (this.isExpiringSoon(stored)) {
      const refreshed = await this.dedupedRefresh(stored);
      if (refreshed) return refreshed;
    }
    return stored;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    const stored: StoredTokens = { ...tokens, obtained_at: Date.now() };
    await this.kv.set("tokens", JSON.stringify(stored));
  }

  async clear(): Promise<void> {
    await Promise.all([this.kv.remove("client_info"), this.kv.remove("code_verifier"), this.kv.remove("tokens")]);
  }

  private isExpiringSoon(tokens: StoredTokens): boolean {
    if (!tokens.expires_in || !tokens.obtained_at) return false;
    const expiresAt = tokens.obtained_at + tokens.expires_in * 1000;
    return expiresAt - Date.now() < 30_000;
  }

  /** Single in-flight refresh shared across concurrent callers, so overlapping requests don't race the AS. */
  private dedupedRefresh(current: StoredTokens): Promise<OAuthTokens | undefined> {
    if (!current.refresh_token) return Promise.resolve(undefined);
    if (!this.refreshing) {
      this.refreshing = this.doRefresh(current.refresh_token).finally(() => {
        this.refreshing = undefined;
      });
    }
    return this.refreshing;
  }

  private async doRefresh(refreshToken: string): Promise<OAuthTokens | undefined> {
    const clientInformation = await this.clientInformation();
    if (!clientInformation) return undefined;
    const { authorizationServerUrl, authorizationServerMetadata } = await discoverOAuthServerInfo(this.serverUrl);
    const refreshed = await refreshAuthorization(authorizationServerUrl, {
      metadata: authorizationServerMetadata,
      clientInformation,
      refreshToken,
    });
    await this.saveTokens(refreshed);
    return refreshed;
  }
}
