import type { McpServer as OfficialMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

/** Accept resources/subscribe so clients can watch URIs; updates are broadcast via refreshResource. */
export function enableResourceSubscriptions(nativeServer: OfficialMcpServer): void {
  nativeServer.server.setRequestHandler(SubscribeRequestSchema, async () => ({}));
  nativeServer.server.setRequestHandler(UnsubscribeRequestSchema, async () => ({}));
}
