import type { McpServer as OfficialMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CreateMessageRequest,
  CreateMessageResult,
  ElicitResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerRequest, ServerNotification } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import { zodObjectToJsonSchema } from "./json-schema.js";

export interface SampleOptions {
  timeout?: number;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export type LogLevel = "debug" | "info" | "notice" | "warning" | "error";

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
}

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;

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
  };
}
