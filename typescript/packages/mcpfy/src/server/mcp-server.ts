import { McpServer as OfficialMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool, type ToolCallback, type ToolDefinition } from "./tools.js";
import { registerPrompt, type PromptCallback, type PromptDefinition } from "./prompts.js";
import {
  registerResource,
  registerResourceTemplate,
  type ReadResourceCallback,
  type ReadResourceTemplateCallback,
  type ResourceDefinition,
  type FlatResourceTemplateDefinition,
} from "./resources.js";
import { startStdio, startHttp, type HttpHandle, normalizeMcpPath } from "./transport.js";
import { resolveServerIcons, type ServerIcon } from "./icon.js";
import { registerWidget, type UIResourceDefinition, type WidgetCallback } from "./widgets/index.js";
import { configureWidgetRegistry } from "./widgets/registry.js";
import { prepareRegisteredWidgets } from "./widgets/prepare.js";
import { DEFAULT_WIDGETS_DIR } from "./widgets/types.js";
import type { AuthConfig } from "./auth/types.js";
import { refreshPrompts, refreshResource, refreshResources, refreshTools } from "./refresh.js";
import { enableResourceSubscriptions } from "./subscriptions.js";
import { mountRemote, type RemoteServerConfig } from "./mount-remote.js";
import type { HttpConnector } from "../client/connectors.js";

export type { ServerIcon } from "./icon.js";

export interface MCPServerConfig {
  name: string;
  version: string;
  description?: string;
  /**
   * HTTP pathname for the MCP endpoint. Defaults to `/mcp`.
   * Example: `basePath: "/weather"` → `http://localhost:3000/weather`.
   */
  basePath?: string;
  /**
   * Server icon advertised in initialize (MCP `icons`).
   * A remote URL, a `data:` URI, a local file path (`./icon.png`), or a `file:` URL.
   * Local files are inlined as `data:` URIs so MCP clients can display them.
   */
  icon?: string | ServerIcon;
  /** Require callers to authenticate — see `mcpfy-sdk/server`'s `jwksVerifier`/`oauthAuth0Provider`/etc. HTTP transport only. */
  auth?: AuthConfig;
  /** Root for `tool({ widget: "name" })` folders. Defaults to `src/widgets`. */
  widgetsDir?: string;
}

export interface ListenOptions {
  /** Defaults to "stdio" — the transport most MCP hosts (Claude Desktop, Claude Code, etc.) use to launch servers. */
  transport?: "stdio" | "http";
  /**
   * HTTP only. Priority: `options.port` → `--port N` / `--port=N` argv → `process.env.PORT` → `3000`.
   * Pass `0` to let the OS pick a free port; the bound port is returned from `listen()`.
   */
  port?: number;
  /** HTTP only. Defaults to "localhost". */
  host?: string;
  /** HTTP only. Suppress the startup log line with the local URL. Defaults to false. */
  silent?: boolean;
}

export interface ListenResult {
  transport: "stdio" | "http";
  /** Bound port — only set for HTTP. */
  port?: number;
  /** Listen host — only set for HTTP. */
  host?: string;
  /** Local MCP endpoint URL, e.g. `http://localhost:3000/mcp` — only set for HTTP. */
  url?: string;
}

/** Reads `--port 4000` or `--port=4000` from argv. Last occurrence wins (so CLI overrides script defaults). */
export function parsePortFromArgv(argv: string[] = process.argv): number | undefined {
  let found: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--port" && argv[i + 1]) {
      const n = Number(argv[i + 1]);
      if (Number.isFinite(n) && n >= 0) found = n;
    }
    if (arg.startsWith("--port=")) {
      const n = Number(arg.slice("--port=".length));
      if (Number.isFinite(n) && n >= 0) found = n;
    }
  }
  return found;
}

function resolveHttpPort(explicit?: number): number {
  if (explicit !== undefined) return explicit;
  const fromArgv = parsePortFromArgv();
  if (fromArgv !== undefined) return fromArgv;
  const fromEnv = process.env.PORT;
  if (fromEnv !== undefined && fromEnv !== "") {
    const n = Number(fromEnv);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 3000;
}

export class MCPServer {
  /** The underlying `@modelcontextprotocol/sdk` McpServer instance, for advanced/escape-hatch use. */
  public readonly nativeServer: OfficialMcpServer;
  public readonly config: MCPServerConfig;

  private httpHandle?: HttpHandle;
  private remotes: HttpConnector[] = [];

  constructor(config: MCPServerConfig) {
    this.config = config;
    this.nativeServer = new OfficialMcpServer(
      { name: config.name, version: config.version, title: config.name, icons: resolveServerIcons(config.icon) },
      {
        instructions: config.description,
        capabilities: {
          logging: {},
          tools: { listChanged: true },
          prompts: { listChanged: true },
          resources: { subscribe: true, listChanged: true },
        },
      }
    );
    configureWidgetRegistry(this.nativeServer, {
      widgetsDir: config.widgetsDir ?? DEFAULT_WIDGETS_DIR,
      cwd: process.cwd(),
    });
    enableResourceSubscriptions(this.nativeServer);
  }

  tool<TInput = Record<string, any>, TOutput extends Record<string, unknown> = Record<string, unknown>>(
    def: ToolDefinition<TInput, TOutput>,
    cb?: ToolCallback<TInput, TOutput>
  ): this {
    registerTool(this.nativeServer, def, cb);
    return this;
  }

  prompt<TInput = Record<string, any>>(def: PromptDefinition<TInput>, cb?: PromptCallback<TInput>): this {
    registerPrompt(this.nativeServer, def, cb);
    return this;
  }

  resource(def: ResourceDefinition, cb?: ReadResourceCallback): this {
    registerResource(this.nativeServer, def, cb);
    return this;
  }

  resourceTemplate<TParams extends Record<string, any> = Record<string, any>>(
    def: FlatResourceTemplateDefinition<TParams>,
    cb?: ReadResourceTemplateCallback<TParams>
  ): this {
    registerResourceTemplate(this.nativeServer, def, cb);
    return this;
  }

  /**
   * @deprecated Pass `widget: "folder-name"` (or `{ dir, protocols, csp }`) on `server.tool()` instead.
   * HTML-string widgets remain available on this method for one release.
   */
  widget<TInput = Record<string, any>>(def: UIResourceDefinition<TInput>, cb?: WidgetCallback<TInput>): this {
    registerWidget(this.nativeServer, def, cb);
    return this;
  }

  /** Tell subscribed clients this resource URI has new content. */
  async refreshResource(uri: string): Promise<void> {
    await refreshResource(this.nativeServer, uri);
  }

  /** Tell clients to list resources again. */
  refreshResources(): void {
    refreshResources(this.nativeServer);
  }

  /** Tell clients to list tools again. */
  refreshTools(): void {
    refreshTools(this.nativeServer);
  }

  /** Tell clients to list prompts again. */
  refreshPrompts(): void {
    refreshPrompts(this.nativeServer);
  }

  /**
   * Re-expose tools/resources/prompts from other HTTP MCP servers on this one.
   * Names become `{alias}__{original}` (tools and prompts). Call before or after `listen()`.
   */
  async mountRemote(remotes: Record<string, RemoteServerConfig>): Promise<void> {
    const connected = await mountRemote(this.nativeServer, remotes);
    this.remotes.push(...connected);
  }

  /**
   * Start the server. For HTTP, logs the local MCP URL (unless `silent: true`) and
   * returns `{ transport, port, host, url }`.
   *
   * @example
   * await server.listen({ transport: "http", port: 4000 });
   * // MCP server listening on http://localhost:4000/mcp  (port 4000)
   *
   * @example
   * // CLI: `node server.js --http --port 8080`  (port picked up automatically)
   * await server.listen({ transport: "http" });
   */
  async listen(options: ListenOptions = {}): Promise<ListenResult> {
    await prepareRegisteredWidgets(this.nativeServer, {
      appName: this.config.name,
      appVersion: this.config.version,
    });

    const transport = options.transport ?? "stdio";
    if (transport === "stdio") {
      await startStdio(this.nativeServer);
      return { transport: "stdio" };
    }

    const port = resolveHttpPort(options.port);
    const host = options.host ?? "localhost";
    this.httpHandle = await startHttp(this.nativeServer, {
      port,
      host,
      auth: this.config.auth,
      silent: options.silent,
      mcpPath: normalizeMcpPath(this.config.basePath),
    });

    return {
      transport: "http",
      port: this.httpHandle.port,
      host: this.httpHandle.host,
      url: this.httpHandle.url,
    };
  }

  /** HTTP listen details after a successful `listen({ transport: "http" })`, if still running. */
  get http(): HttpHandle | undefined {
    return this.httpHandle;
  }

  async close(): Promise<void> {
    await this.httpHandle?.close();
    this.httpHandle = undefined;
    await Promise.all(this.remotes.map((remote) => remote.close()));
    this.remotes = [];
    await this.nativeServer.close();
  }
}
