import type { CallToolResult, GetPromptResult, Prompt, ReadResourceResult, Resource, Tool } from "@modelcontextprotocol/sdk/types.js";
import type { BaseConnector } from "./connectors.js";

/** A connected server session — thin forwarding wrapper around a `BaseConnector`. */
export class MCPSession {
  constructor(private readonly connector: BaseConnector) {}

  listTools(): Promise<Tool[]> {
    return this.connector.listTools();
  }

  callTool(name: string, args?: Record<string, unknown>): Promise<CallToolResult> {
    return this.connector.callTool(name, args);
  }

  listPrompts(): Promise<Prompt[]> {
    return this.connector.listPrompts();
  }

  getPrompt(name: string, args?: Record<string, unknown>): Promise<GetPromptResult> {
    return this.connector.getPrompt(name, args);
  }

  listResources(): Promise<Resource[]> {
    return this.connector.listResources();
  }

  readResource(uri: string): Promise<ReadResourceResult> {
    return this.connector.readResource(uri);
  }

  close(): Promise<void> {
    return this.connector.close();
  }
}
