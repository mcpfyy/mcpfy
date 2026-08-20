import type { McpServer as OfficialMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WidgetContent, WidgetCsp, WidgetOptions, WidgetProtocol } from "./types.js";
import { ALL_PROTOCOLS, DEFAULT_WIDGETS_DIR, normalizeWidgetOption } from "./types.js";
import { resolveWidgetPaths, type ResolvedWidgetPaths } from "./resolve.js";

export interface RegisteredToolWidget {
  toolName: string;
  options: WidgetOptions;
  protocols: WidgetProtocol[];
  csp?: WidgetCsp;
  size?: [string, string];
  paths?: ResolvedWidgetPaths;
  htmlOverride?: string;
  bundledHtml?: string;
}

export interface WidgetRegistry {
  widgetsDir: string;
  cwd: string;
  widgets: Map<string, RegisteredToolWidget>;
}

const registries = new WeakMap<OfficialMcpServer, WidgetRegistry>();

export function getWidgetRegistry(nativeServer: OfficialMcpServer): WidgetRegistry {
  let registry = registries.get(nativeServer);
  if (!registry) {
    registry = { widgetsDir: DEFAULT_WIDGETS_DIR, cwd: process.cwd(), widgets: new Map() };
    registries.set(nativeServer, registry);
  }
  return registry;
}

export function configureWidgetRegistry(
  nativeServer: OfficialMcpServer,
  config: { widgetsDir?: string; cwd?: string }
): WidgetRegistry {
  const registry = getWidgetRegistry(nativeServer);
  if (config.widgetsDir) registry.widgetsDir = config.widgetsDir;
  if (config.cwd) registry.cwd = config.cwd;
  return registry;
}

export function registerToolWidget(
  nativeServer: OfficialMcpServer,
  toolName: string,
  widget: string | WidgetOptions
): RegisteredToolWidget {
  const registry = getWidgetRegistry(nativeServer);
  const options = normalizeWidgetOption(widget);
  const protocols = options.protocols ?? ALL_PROTOCOLS;

  const record: RegisteredToolWidget = {
    toolName,
    options,
    protocols,
    csp: options.csp,
    size: options.size,
    htmlOverride: options.html,
  };

  if (!options.html) {
    record.paths = resolveWidgetPaths(options.dir, {
      entry: options.entry,
      widgetsDir: registry.widgetsDir,
      cwd: registry.cwd,
    });
  }

  registry.widgets.set(toolName, record);
  return record;
}

export function widgetContentGetter(record: RegisteredToolWidget): () => WidgetContent {
  return () => {
    const html = record.htmlOverride ?? record.bundledHtml;
    if (!html) {
      throw new Error(
        `Widget "${record.toolName}" has no HTML yet. Run \`mcpfy build\` (production) or \`mcpfy dev\`, or call listen() so the SDK can bundle the React folder.`
      );
    }
    return { type: "html", html };
  };
}

/** Test helper: skip Vite and inject markup for a tool registered with `widget`. */
export function setWidgetHtmlForTest(nativeServer: OfficialMcpServer, toolName: string, html: string): void {
  const record = getWidgetRegistry(nativeServer).widgets.get(toolName);
  if (!record) {
    throw new Error(`No widget registered for tool "${toolName}".`);
  }
  record.htmlOverride = html;
}

export function listFolderWidgets(nativeServer: OfficialMcpServer): RegisteredToolWidget[] {
  return [...getWidgetRegistry(nativeServer).widgets.values()].filter((w) => w.paths && !w.htmlOverride);
}
