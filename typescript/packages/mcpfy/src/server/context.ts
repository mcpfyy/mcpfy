import type { McpServer as OfficialMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CreateMessageRequest,
  CreateMessageResult,
  ElicitResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerRequest, ServerNotification } from "@modelcontextprotocol/sdk/types.js";
import type { IncomingMessage } from "node:http";
import type { z } from "zod";
import { zodObjectToJsonSchema } from "./json-schema.js";
import type { AuthInfo } from "./auth/types.js";

export interface SampleOptions {
  timeout?: number;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export type LogLevel = "debug" | "info" | "notice" | "warning" | "error";

/** Headers MCP-backend (and exports) forward from the inbound MCP HTTP request to upstream API calls. */
export const FORWARDABLE_AUTH_HEADER_NAMES = [
  "authorization",
  "x-api-key",
  "x-auth-token",
] as const;

export interface ToolContext {
  /** Ask the connected client's LLM to sample a completion. */
  sample(prompt: string, options?: SampleOptions): Promise<CreateMessageResult>;
  sample(
    params: CreateMessageRequest["params"],
    options?: SampleOptions
  ): Promise<CreateMessageResult>;

  /** Ask the connected client to collect structured input from the end user. */
  elicit<T extends z.ZodObject<any>>(
    message: string,
    schema: T
  ): Promise<ElicitResult & { data?: z.infer<T> }>;

  /** Report progress on a long-running call, if the client requested it. */
  reportProgress(progress: number, total?: number, message?: string): Promise<void>;

  /** Send a log message to the client. */
  log(level: LogLevel, message: string): Promise<void>;

  /** The transport session this call is associated with, if any. */
  sessionId?: string;

  /** The authenticated caller, if this server has `auth` configured and the request passed it. Only set for HTTP requests. */
  auth?: AuthInfo;

  /**
   * Allowlisted inbound HTTP headers from the current MCP request (HTTP transport only).
   * Use with `forwardAuthHeaders(ctx)` when calling upstream APIs — the SDK does not inject
   * these into fetch automatically.
   */
  requestHeaders?: Record<string, string>;
}

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;

// Requests are serialized one-at-a-time per `nativeServer` by the HTTP transport (see
// server/transport.ts) — a single "current auth" slot per server instance is therefore safe,
// and avoids threading an extra parameter through every registerTool/Prompt/Resource/Widget call.
const currentAuthByServer = new WeakMap<OfficialMcpServer, AuthInfo | undefined>();
const currentRequestHeadersByServer = new WeakMap<
  OfficialMcpServer,
  Record<string, string> | undefined
>();

export function setRequestAuth(nativeServer: OfficialMcpServer, auth: AuthInfo | undefined): void {
  currentAuthByServer.set(nativeServer, auth);
}

export function setRequestHeaders(
  nativeServer: OfficialMcpServer,
  headers: Record<string, string> | undefined
): void {
  currentRequestHeadersByServer.set(nativeServer, headers);
}

/** Pull allowlisted auth-related headers from an inbound Node HTTP request (case-insensitive). */
export function extractForwardableAuthHeaders(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of FORWARDABLE_AUTH_HEADER_NAMES) {
    const raw = req.headers[name];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === "string" && value.length > 0) {
      if (name === "authorization") out.Authorization = value;
      else if (name === "x-api-key") out["x-api-key"] = value;
      else if (name === "x-auth-token") out["x-auth-token"] = value;
    }
  }
  return out;
}

/**
 * Opt-in helper: copy allowlisted inbound MCP auth headers for use on an upstream `fetch`.
 * Prefer these over env secrets when the MCP client sent credentials on the HTTP connection.
 */
export function forwardAuthHeaders(
  ctx: Pick<ToolContext, "requestHeaders" | "auth"> | undefined
): Record<string, string> {
  if (ctx?.requestHeaders && Object.keys(ctx.requestHeaders).length > 0) {
    return { ...ctx.requestHeaders };
  }
  if (ctx?.auth?.token) {
    return { Authorization: `Bearer ${ctx.auth.token}` };
  }
  return {};
}

export function buildToolContext(nativeServer: OfficialMcpServer, extra: Extra): ToolContext {
  const progressToken = extra._meta?.progressToken;

  return {
    async sample(
      promptOrParams: string | CreateMessageRequest["params"],
      options?: SampleOptions
    ): Promise<CreateMessageResult> {
      const params: CreateMessageRequest["params"] =
        typeof promptOrParams === "string"
          ? {
              messages: [{ role: "user", content: { type: "text", text: promptOrParams } }],
              maxTokens: options?.maxTokens ?? 1000,
              temperature: options?.temperature,
              systemPrompt: options?.systemPrompt,
            }
          : promptOrParams;
      return nativeServer.server.createMessage(params, { timeout: options?.timeout });
    },

    async elicit<T extends z.ZodObject<any>>(
      message: string,
      schema: T
    ): Promise<ElicitResult & { data?: z.infer<T> }> {
      const result = await nativeServer.server.elicitInput({
        message,
        requestedSchema: zodObjectToJsonSchema(schema) as any,
      });
      return {
        ...result,
        data: result.action === "accept" ? (result.content as z.infer<T>) : undefined,
      };
    },

    async reportProgress(progress: number, total?: number, message?: string): Promise<void> {
      if (progressToken === undefined) return;
      await extra.sendNotification({
        method: "notifications/progress",
        params: { progressToken, progress, total, message },
      });
    },

    async log(level: LogLevel, message: string): Promise<void> {
      await nativeServer.sendLoggingMessage({ level, data: message }, extra.sessionId);
    },

    sessionId: extra.sessionId,
    auth: currentAuthByServer.get(nativeServer),
    requestHeaders: currentRequestHeadersByServer.get(nativeServer),
  };
}
