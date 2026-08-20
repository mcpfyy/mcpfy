import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { widgetBootstrapSource } from "./html-shell.js";
import type { RegisteredToolWidget } from "./registry.js";

const require = createRequire(import.meta.url);

export function sdkPackageRoot(): string {
  try {
    return dirname(require.resolve("mcpfy-sdk/package.json"));
  } catch {
    // Running from source / unusual layouts — walk up from this file.
  }
  let dir = dirname(fileURLToPath(import.meta.url));
  while (true) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const name = (JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string }).name;
        if (name === "mcpfy-sdk") return dir;
      } catch {
        // keep walking
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error("Could not locate the mcpfy-sdk package root.");
    }
    dir = parent;
  }
}

export function resolveWidgetRuntimeEntry(): string {
  const root = sdkPackageRoot();
  const distJs = join(root, "dist/src/widget-react/index.js");
  const srcTs = join(root, "src/widget-react/index.ts");
  if (existsSync(distJs)) return distJs;
  return srcTs;
}

export function resolveReactEntries(): { react: string; reactDom: string; reactDomClient: string } {
  return {
    react: dirname(require.resolve("react/package.json")),
    reactDom: dirname(require.resolve("react-dom/package.json")),
    reactDomClient: require.resolve("react-dom/client"),
  };
}

/** Tailwind v4 Vite plugin — always registered so `@import "tailwindcss"` in widget CSS works. */
export function widgetTailwindPlugin(): Plugin[] {
  const plugin = tailwindcss() as Plugin | Plugin[];
  return Array.isArray(plugin) ? plugin : [plugin];
}

export interface WidgetViteContext {
  widgets: Array<{ toolName: string; entry: string; cssPath?: string }>;
  appName: string;
  appVersion: string;
}

export function mcpfyWidgetPlugin(ctx: WidgetViteContext): Plugin {
  const runtime = resolveWidgetRuntimeEntry();

  return {
    name: "mcpfy-widget",
    resolveId(id) {
      const bare = id.split("?")[0];
      if (bare === "mcpfy-sdk/widget") return runtime;
      const isProdBootstrap =
        bare === "/bootstrap.tsx" ||
        bare === "bootstrap.tsx" ||
        bare === "./bootstrap.tsx" ||
        bare.endsWith("/bootstrap.tsx");
      if (isProdBootstrap) {
        const only = ctx.widgets[0];
        if (only) return `\0mcpfy-bootstrap:${only.toolName}`;
      }
      return undefined;
    },
    load(id) {
      if (!id.startsWith("\0mcpfy-bootstrap:")) return undefined;
      const toolName = id.slice("\0mcpfy-bootstrap:".length);
      const widget = ctx.widgets.find((w) => w.toolName === toolName);
      if (!widget) throw new Error(`Unknown mcpfy widget bootstrap "${toolName}"`);
      return widgetBootstrapSource({
        toolName,
        entryPath: widget.entry,
        appName: ctx.appName,
        appVersion: ctx.appVersion,
        cssPath: widget.cssPath,
      });
    },
  };
}

export function toViteWidgetList(widgets: RegisteredToolWidget[]): WidgetViteContext["widgets"] {
  return widgets
    .filter((w) => w.paths)
    .map((w) => {
      const entry = w.paths!.entry;
      const cssPath = join(dirname(entry), "styles.css");
      return {
        toolName: w.toolName,
        entry,
        cssPath: existsSync(cssPath) ? cssPath : undefined,
      };
    });
}
