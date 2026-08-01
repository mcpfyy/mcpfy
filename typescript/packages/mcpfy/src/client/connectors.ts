import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  CallToolResult,
  GetPromptResult,
  Prompt,
  ReadResourceResult,
  Resource,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

export type ServerConfig =
  | { command: string; args?: string[]; env?: Record<string, string>; cwd?: string }
  | {
      url: string;
      headers?: Record<string, string>;
      /** Sent as `Authorization: Bearer <authToken>` — overwrites `headers.Authorization` if both are set. */
      authToken?: string;
      /** For OAuth-protected servers — e.g. a `NodeOAuthClientProvider` from `mcpfy-sdk/auth`. */
      authProvider?: OAuthClientProvider;
    };

const CLIENT_INFO = { name: "mcpfy-client", version: "0.1.0" };

export abstract class BaseConnector {
  protected client: Client;
  private connected = false;

  constructor() {
    this.client = new Client(CLIENT_INFO, { capabilities: {} });
  }

  protected abstract createTransport(): Promise<import("@modelcontextprotocol/sdk/shared/transport.js").Transport>;

  async connect(): Promise<void> {
    if (this.connected) return;
    const transport = await this.createTransport();
    await this.client.connect(transport);
    this.connected = true;
  }

  async listTools(): Promise<Tool[]> {
    const result = await this.client.listTools();
    return result.tools;
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
    return this.client.callTool({ name, arguments: args }) as Promise<CallToolResult>;
  }

  async listPrompts(): Promise<Prompt[]> {
    const result = await this.client.listPrompts();
    return result.prompts;
  }

  async getPrompt(name: string, args: Record<string, unknown> = {}): Promise<GetPromptResult> {
    return this.client.getPrompt({ name, arguments: args as Record<string, string> });
  }

  async listResources(): Promise<Resource[]> {
    const result = await this.client.listResources();
    return result.resources;
  }

  async readResource(uri: string): Promise<ReadResourceResult> {
    return this.client.readResource({ uri });
  }

  async close(): Promise<void> {
    if (!this.connected) return;
    await this.client.close();
    this.connected = false;
  }
}

export class StdioConnector extends BaseConnector {
  constructor(private readonly config: Extract<ServerConfig, { command: string }>) {
    super();
  }

  protected async createTransport() {
    const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
    return new StdioClientTransport({
      command: this.config.command,
      args: this.config.args,
      env: this.config.env,
      cwd: this.config.cwd,
    });
  }
}

export class HttpConnector extends BaseConnector {
  private readonly headers?: Record<string, string>;

  constructor(private readonly config: Extract<ServerConfig, { url: string }>) {
    super();
    this.headers = config.headers ? { ...config.headers } : config.authToken ? {} : undefined;
    if (config.authToken) this.headers!.Authorization = `Bearer ${config.authToken}`;
  }

  protected async createTransport() {
    const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
    return new StreamableHTTPClientTransport(new URL(this.config.url), {
      requestInit: this.headers ? { headers: this.headers } : undefined,
      authProvider: this.config.authProvider,
    });
  }
}

export function createConnectorFromConfig(config: ServerConfig): BaseConnector {
  if ("command" in config) return new StdioConnector(config);
  return new HttpConnector(config);
}
