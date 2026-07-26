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

export interface MCPServerConfig {
  name: string;
  version: string;
  description?: string;
}

export interface ListenOptions {
  /** Defaults to "stdio" — the transport most MCP hosts (Claude Desktop, Claude Code, etc.) use to launch servers. */
  transport?: "stdio" | "http";
  /** HTTP only. Defaults to `process.env.PORT` or 3000. */
  port?: number;
  /** HTTP only. Defaults to "localhost". */
  host?: string;
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

  async listen(options: ListenOptions = {}): Promise<void> {
    const transport = options.transport ?? "stdio";
    if (transport === "stdio") {
      await startStdio(this.nativeServer);
    } else {
      const port = options.port ?? Number(process.env.PORT ?? 3000);
      this.httpHandle = await startHttp(this.nativeServer, { port, host: options.host ?? "localhost" });
    }
  }

  async close(): Promise<void> {
    await this.httpHandle?.close();
    await this.nativeServer.close();
  }
}
