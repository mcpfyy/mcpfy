import type { McpServer as OfficialMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export async function refreshResource(nativeServer: OfficialMcpServer, uri: string): Promise<void> {
  if (!nativeServer.isConnected()) return;
  await nativeServer.server.sendResourceUpdated({ uri });
}

export function refreshResources(nativeServer: OfficialMcpServer): void {
  if (!nativeServer.isConnected()) return;
  nativeServer.sendResourceListChanged();
}

export function refreshTools(nativeServer: OfficialMcpServer): void {
  if (!nativeServer.isConnected()) return;
  nativeServer.sendToolListChanged();
}

export function refreshPrompts(nativeServer: OfficialMcpServer): void {
  if (!nativeServer.isConnected()) return;
  nativeServer.sendPromptListChanged();
}
