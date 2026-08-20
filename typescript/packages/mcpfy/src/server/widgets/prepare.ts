import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { McpServer as OfficialMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { bundleWidgetHtml } from "./bundle.js";
import { listFolderWidgets, type RegisteredToolWidget } from "./registry.js";
import { DEFAULT_WIDGETS_DIR } from "./types.js";
import { resolveWidgetPaths } from "./resolve.js";

export const DEFAULT_WIDGET_OUT_DIR = "dist/widgets";

export interface PrepareWidgetsOptions {
  appName: string;
  appVersion: string;
  cwd?: string;
  outDir?: string;
}

function isWidgetDev(): boolean {
  return process.env.MCPFY_WIDGET_DEV === "1" || process.env.NODE_ENV === "development";
}
function isProduction(): boolean {
  return process.env.NODE_ENV === "production" && process.env.MCPFY_WIDGET_DEV !== "1";
}

function readPrebuilt(record: RegisteredToolWidget, outDir: string): string | undefined {
  const name = record.paths?.outputName ?? record.options.dir;
  const file = join(outDir, `${name}.html`);
  if (existsSync(file)) return readFileSync(file, "utf8");
  return undefined;
}

/**
 * Fill each registered folder widget with a self-contained HTML document.
 * Inspector / srcdoc iframes cannot load Vite modules, so we always inline an IIFE.
 */
export async function prepareRegisteredWidgets(
  nativeServer: OfficialMcpServer,
  options: PrepareWidgetsOptions
): Promise<void> {
  const widgets = listFolderWidgets(nativeServer);
  if (widgets.length === 0) return;

  const cwd = options.cwd ?? process.cwd();
  const outDir = resolve(cwd, options.outDir ?? DEFAULT_WIDGET_OUT_DIR);

  const toBuild: RegisteredToolWidget[] = [];
  for (const widget of widgets) {
    if (isWidgetDev()) {
      toBuild.push(widget);
      continue;
    }
    const prebuilt = readPrebuilt(widget, outDir);
    if (prebuilt) widget.bundledHtml = prebuilt;
    else toBuild.push(widget);
  }

  if (toBuild.length === 0) return;

  if (isProduction()) {
    const names = toBuild.map((w) => w.paths?.outputName ?? w.toolName).join(", ");
    throw new Error(`Widget HTML missing for: ${names}. Run \`mcpfy build\` before starting in production.`);
  }

  for (const widget of toBuild) {
    widget.bundledHtml = await bundleWidgetHtml({
      widget,
      appName: options.appName,
      appVersion: options.appVersion,
      outFile: join(outDir, `${widget.paths!.outputName}.html`),
    });
  }
}

export interface DiscoveredWidgetFolder {
  dir: string;
  outputName: string;
  entry: string;
}

export function discoverWidgetFolders(
  widgetsDir = DEFAULT_WIDGETS_DIR,
  cwd = process.cwd()
): DiscoveredWidgetFolder[] {
  const abs = resolve(cwd, widgetsDir);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) return [];

  const found: DiscoveredWidgetFolder[] = [];
  for (const name of readdirSync(abs)) {
    const folder = join(abs, name);
    if (!statSync(folder).isDirectory()) continue;
    try {
      const paths = resolveWidgetPaths(name, { widgetsDir, cwd });
      found.push({ dir: name, outputName: paths.outputName, entry: paths.entry });
    } catch {
      // skip folders without a React entry
    }
  }
  return found;
}
