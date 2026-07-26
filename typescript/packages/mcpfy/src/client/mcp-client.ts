import { createConnectorFromConfig, type ServerConfig } from "./connectors.js";
import { MCPSession } from "./session.js";

export interface MCPClientConfig {
  mcpServers: Record<string, ServerConfig>;
}

export class MCPClient {
  private readonly sessions = new Map<string, MCPSession>();

  constructor(private readonly config: MCPClientConfig) {}

  async createSession(name: string): Promise<MCPSession> {
    const existing = this.sessions.get(name);
    if (existing) return existing;

    const serverConfig = this.config.mcpServers[name];
    if (!serverConfig) {
      throw new Error(`No server named "${name}" in mcpServers config.`);
    }

    const connector = createConnectorFromConfig(serverConfig);
    await connector.connect();
    const session = new MCPSession(connector);
    this.sessions.set(name, session);
    return session;
  }

  async createAllSessions(): Promise<Record<string, MCPSession>> {
    const names = Object.keys(this.config.mcpServers);
    const sessions = await Promise.all(names.map((name) => this.createSession(name)));
    return Object.fromEntries(names.map((name, i) => [name, sessions[i]]));
  }

  getSession(name: string): MCPSession | undefined {
    return this.sessions.get(name);
  }

  async closeAllSessions(): Promise<void> {
    await Promise.all([...this.sessions.values()].map((session) => session.close()));
    this.sessions.clear();
  }
}
