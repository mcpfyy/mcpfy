import type { McpServer as OfficialMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { HttpConnector, type ServerConfig } from "../client/connectors.js";
import { refreshPrompts, refreshResources, refreshTools } from "./refresh.js";

export type RemoteServerConfig = Extract<ServerConfig, { url: string }>;

function scopedName(alias: string, name: string): string {
  return `${alias}__${name}`;
}

function isUnavailable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /method not found|not supported|-32601/i.test(message);
}

/**
 * Connect to other HTTP MCP servers and re-expose their tools, resources, and
 * prompts on this server. Tool/prompt names become `{alias}__{original}`.
 * Resource URIs are kept as-is; a colliding URI is skipped.
 */
export async function mountRemote(
  nativeServer: OfficialMcpServer,
  remotes: Record<string, RemoteServerConfig>
): Promise<HttpConnector[]> {
  const connectors: HttpConnector[] = [];

  for (const [alias, config] of Object.entries(remotes)) {
    const connector = new HttpConnector(config);
    try {
      await connector.connect();
    } catch (err) {
      console.warn(`[mcpfy] mountRemote("${alias}") connect failed:`, err);
      continue;
    }
    connectors.push(connector);

    try {
      const tools = await connector.listTools();
      for (const tool of tools) {
        const name = scopedName(alias, tool.name);
        try {
          nativeServer.registerTool(
            name,
            {
              title: tool.title,
              description: tool.description ?? "",
              inputSchema: z.object({}).passthrough() as any,
              annotations: tool.annotations,
            },
            async (params: any) =>
              connector.callTool(tool.name, (params ?? {}) as Record<string, unknown>)
          );
        } catch (err) {
          console.warn(`[mcpfy] mountRemote("${alias}") skipped tool "${tool.name}":`, err);
        }
      }
    } catch (err) {
      if (!isUnavailable(err)) {
        console.warn(`[mcpfy] mountRemote("${alias}") tools/list failed:`, err);
      }
    }

    try {
      const resources = await connector.listResources();
      for (const resource of resources) {
        try {
          nativeServer.registerResource(
            scopedName(alias, resource.name),
            resource.uri,
            {
              title: resource.title,
              description: resource.description,
              mimeType: resource.mimeType,
            },
            async () => connector.readResource(resource.uri)
          );
        } catch (err) {
          console.warn(`[mcpfy] mountRemote("${alias}") skipped resource "${resource.uri}":`, err);
        }
      }
    } catch (err) {
      if (!isUnavailable(err)) {
        console.warn(`[mcpfy] mountRemote("${alias}") resources/list failed:`, err);
      }
    }

    try {
      const prompts = await connector.listPrompts();
      for (const prompt of prompts) {
        try {
          nativeServer.registerPrompt(
            scopedName(alias, prompt.name),
            {
              title: prompt.title,
              description: prompt.description ?? "",
            },
            async (params: any) =>
              connector.getPrompt(prompt.name, (params ?? {}) as Record<string, unknown>)
          );
        } catch (err) {
          console.warn(`[mcpfy] mountRemote("${alias}") skipped prompt "${prompt.name}":`, err);
        }
      }
    } catch (err) {
      if (!isUnavailable(err)) {
        console.warn(`[mcpfy] mountRemote("${alias}") prompts/list failed:`, err);
      }
    }
  }

  if (nativeServer.isConnected()) {
    refreshTools(nativeServer);
    refreshResources(nativeServer);
    refreshPrompts(nativeServer);
  }

  return connectors;
}
