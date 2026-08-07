import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { auth, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { FileKVStore } from "./file-kv-store.js";
import { OAuthSessionStore } from "./oauth-session-store.js";

export interface NodeOAuthOptions {
  /** The remote MCP server's URL — used to derive an isolated token-storage directory and as the DCR client name's scope. */
  serverUrl: string;
  clientName?: string;
  scope?: string;
  /** Port range to scan for the loopback redirect server. Default `[8090, 8099]`. */
  portRange?: [number, number];
  /** Override the token-storage root directory (default `~/.mcpfy/oauth`) — mainly for tests/multi-profile setups. */
  dataDir?: string;
  /** Called with the authorization URL instead of the default OS-browser-open behavior — e.g. for a CLI that just wants to print it, or a test driving the URL itself. */
  onAuthorizationUrl?: (url: string) => void;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: Error) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
  });
}

async function scanForFreePort([start, end]: [number, number]): Promise<number> {
  for (let port = start; port <= end; port++) {
    if (await isPortFree(port)) return port;
  }
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : undefined;
      probe.close(() => (port ? resolve(port) : reject(new Error("Could not determine an ephemeral port."))));
    });
  });
}

/** Prints the URL (the reliable fallback) and best-effort tries to open the OS browser too. */
function openUrl(url: string): void {
  console.log(`\nOpen this URL to authorize:\n  ${url}\n`);
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "rundll32.exe" : "xdg-open";
  const args = process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  execFile(command, args, () => {});
}

/**
 * Node OAuth client provider: implements the MCP SDK's `OAuthClientProvider`
 * interface, driving PKCE + Dynamic Client Registration + token storage
 * through a local loopback HTTP server for the authorization redirect.
 *
 * The actual protocol logic (PKCE, DCR, token exchange) is the SDK's own
 * `auth()`/`refreshAuthorization()` — this class only supplies storage
 * (via `OAuthSessionStore`/`FileKVStore`) and the redirect/callback mechanics.
 */
export class NodeOAuthClientProvider implements OAuthClientProvider {
  private readonly store: OAuthSessionStore;
  private readonly port: number;
  private loopback?: Server;
  private pending?: Deferred<string>;

  private constructor(
    private readonly serverUrl: string,
    private readonly clientName: string,
    private readonly scope: string | undefined,
    port: number,
    kv: FileKVStore,
    private readonly onAuthorizationUrl: (url: string) => void
  ) {
    this.port = port;
    this.store = new OAuthSessionStore(kv, serverUrl);
  }

  static async create(options: NodeOAuthOptions): Promise<NodeOAuthClientProvider> {
    const hash = createHash("sha256").update(options.serverUrl).digest("hex").slice(0, 16);
    const dir = join(options.dataDir ?? join(homedir(), ".mcpfy", "oauth"), hash);
    const kv = new FileKVStore(dir);

    const range = options.portRange ?? [8090, 8099];
    const storedPort = kv.get("port");
    const port = storedPort ? Number(storedPort) : await scanForFreePort(range);
    if (!storedPort) kv.set("port", String(port));

    return new NodeOAuthClientProvider(
      options.serverUrl,
      options.clientName ?? "mcpfy-sdk client",
      options.scope,
      port,
      kv,
      options.onAuthorizationUrl ?? openUrl
    );
  }

  get redirectUrl(): string {
    return `http://127.0.0.1:${this.port}/callback`;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: this.clientName,
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: this.scope,
    };
  }

  clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    return this.store.clientInformation();
  }

  saveClientInformation(info: OAuthClientInformationMixed): Promise<void> {
    return this.store.saveClientInformation(info);
  }

  tokens(): Promise<OAuthTokens | undefined> {
    return this.store.tokens();
  }

  saveTokens(tokens: OAuthTokens): Promise<void> {
    return this.store.saveTokens(tokens);
  }

  codeVerifier(): Promise<string> {
    return this.store.codeVerifier();
  }

  saveCodeVerifier(verifier: string): Promise<void> {
    return this.store.saveCodeVerifier(verifier);
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    this.pending = deferred<string>();
    await this.startLoopback();
    this.onAuthorizationUrl(authorizationUrl.toString());
  }

  /** Resolves once the loopback server receives the `?code=` callback. Call after `redirectToAuthorization()`. */
  async getAuthorizationCode(timeoutMs = 5 * 60_000): Promise<string> {
    if (!this.pending) {
      throw new Error("No authorization in progress — the SDK's auth() call triggers redirectToAuthorization() first.");
    }
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timed out waiting for OAuth authorization (5 minutes).")), timeoutMs)
    );
    try {
      return await Promise.race([this.pending.promise, timeout]);
    } finally {
      this.stopLoopback();
    }
  }

  private async startLoopback(): Promise<void> {
    if (this.loopback) return;
    this.loopback = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${this.port}`);
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      res
        .writeHead(200, { "content-type": "text/html" })
        .end(
          error
            ? `<html><body>Authorization failed: ${error}. You can close this window.</body></html>`
            : `<html><body>Authorization complete — you can close this window.</body></html>`
        );
      if (error) this.pending?.reject(new Error(`Authorization failed: ${error}`));
      else if (code) this.pending?.resolve(code);
    });
    await new Promise<void>((resolve, reject) => {
      this.loopback?.once("error", reject);
      this.loopback?.listen(this.port, "127.0.0.1", () => resolve());
    });
  }

  private stopLoopback(): void {
    this.loopback?.close();
    this.loopback = undefined;
  }
}

/**
 * Drives the full OAuth round-trip: the SDK's `auth()` orchestrates discovery
 * + DCR + PKCE and (on first call) triggers `provider.redirectToAuthorization()`;
 * this waits for the loopback callback and completes the exchange with a second
 * `auth()` call. Call this once before `client.createSession(...)` for any
 * server whose config uses this `provider` as its `authProvider`.
 */
export async function ensureAuthorized(provider: NodeOAuthClientProvider, serverUrl: string): Promise<void> {
  const result = await auth(provider, { serverUrl });
  if (result === "AUTHORIZED") return;

  const code = await provider.getAuthorizationCode();
  const finalResult = await auth(provider, { serverUrl, authorizationCode: code });
  if (finalResult !== "AUTHORIZED") {
    throw new Error(`OAuth authorization did not complete (got "${finalResult}").`);
  }
}
