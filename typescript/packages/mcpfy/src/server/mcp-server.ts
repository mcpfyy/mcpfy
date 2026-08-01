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
import { startStdio, startHttp, type HttpHandle } from "./transport.js";
import { registerWidget, type UIResourceDefinition, type WidgetCallback } from "./widgets/index.js";
import type { AuthConfig } from "./auth/types.js";

export interface MCPServerConfig {
  name: string;
  version: string;
  description?: string;
  /** Require callers to authenticate — see `mcpfy-sdk/server`'s `jwksVerifier`/`oauthAuth0Provider`/etc. HTTP transport only. */
  auth?: AuthConfig;
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

  constructor(config: MCPServerConfig) {
    this.config = config;
    this.nativeServer = new OfficialMcpServer(
      { name: config.name, version: config.version, title: config.name },
      {
        instructions: config.description,
        capabilities: {
          logging: {},
          tools: { listChanged: true },
          prompts: { listChanged: true },
          resources: { listChanged: true },
        },
      }
    );
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

  widget<TInput = Record<string, any>>(def: UIResourceDefinition<TInput>, cb?: WidgetCallback<TInput>): this {
    registerWidget(this.nativeServer, def, cb);
    return this;
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
    await this.nativeServer.close();
  }
}
