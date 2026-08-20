import type { z } from "zod";
import type { ToolContext } from "../context.js";

export type WidgetProtocol = "mcp-ui" | "mcp-apps" | "apps-sdk";

export type WidgetContent = { type: "html"; html: string } | { type: "url"; url: string };

export interface WidgetCsp {
  /** Hosts the widget may fetch (XHR/fetch/WebSocket). ChatGPT: `openai/widgetCSP.connect_domains`. */
  connectDomains?: string[];
  /** Hosts for images, fonts, CSS, scripts. ChatGPT: `openai/widgetCSP.resource_domains`. `data:` images are often blocked once any CSP is set — use inline SVG instead. */
  resourceDomains?: string[];
}

export interface WidgetOptions {
  /** Folder name under `widgetsDir` (default `src/widgets`), or a path relative to cwd. */
  dir: string;
  /** Defaults to `main.tsx`, then `main.jsx`, `index.tsx`, `index.jsx`. */
  entry?: string;
  /** Which protocol(s) to register this widget under. Defaults to all three. */
  protocols?: WidgetProtocol[];
  /** Preferred iframe size, e.g. ["800px", "600px"]. */
  size?: [string, string];
  csp?: WidgetCsp;
  /**
   * Pre-supplied HTML. Skip the React folder / Vite pipeline.
   * Intended for tests and advanced injection — app code should pass a folder instead.
   */
  html?: string;
}

export interface UIResourceDefinition<TInput = Record<string, any>> {
  name: string;
  title?: string;
  description?: string;
  /** The widget's markup — a self-contained HTML string, or a URL to iframe. */
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

export const DEFAULT_WIDGETS_DIR = "src/widgets";

export const WIDGET_ENTRY_CANDIDATES = ["main.tsx", "main.jsx", "index.tsx", "index.jsx"] as const;

export function normalizeWidgetOption(widget: string | WidgetOptions): WidgetOptions {
  if (typeof widget === "string") return { dir: widget };
  if (!widget.dir) {
    throw new Error(`widget.dir is required when passing a widget options object.`);
  }
  return widget;
}
