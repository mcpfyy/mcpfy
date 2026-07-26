import type { z } from "zod";
import type { ToolContext } from "../context.js";

export type WidgetProtocol = "mcp-ui" | "mcp-apps" | "apps-sdk";

export type WidgetContent = { type: "html"; html: string } | { type: "url"; url: string };

export interface WidgetCsp {
  connectDomains?: string[];
  resourceDomains?: string[];
}

export interface UIResourceDefinition<TInput = Record<string, any>> {
  name: string;
  title?: string;
  description?: string;
  /** The widget's markup — a self-contained HTML string, or a URL to iframe. mcpfy does not compile/bundle this for you. */
  content: WidgetContent;
  /** Which protocol(s) to register this widget under. Defaults to all three. */
  protocols?: WidgetProtocol[];
  /** A `z.object({...})` schema describing the paired tool's input parameters. */
  schema?: z.ZodTypeAny;
  /** Preferred iframe size, e.g. ["800px", "600px"]. */
  size?: [string, string];
  csp?: WidgetCsp;
  /**
   * Called when the paired tool is invoked. The return value becomes the tool's
   * structuredContent (and the widget's initial render data, delivered via each
   * protocol's own handshake — see `mcpfy-sdk/widget-bridge`).
   */
  cb?: WidgetCallback<TInput>;
}

export type WidgetCallback<TInput = Record<string, any>> = (
  params: TInput,
  ctx: ToolContext
) => Promise<Record<string, unknown>>;

export const ALL_PROTOCOLS: WidgetProtocol[] = ["mcp-ui", "mcp-apps", "apps-sdk"];
