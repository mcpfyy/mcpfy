import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { InlineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { wrapIifeHtml, widgetBootstrapSource } from "./html-shell.js";
import { mcpfyWidgetPlugin, widgetTailwindPlugin, resolveReactEntries, resolveWidgetRuntimeEntry, sdkPackageRoot, toViteWidgetList } from "./vite-plugin.js";
import type { RegisteredToolWidget } from "./registry.js";

export interface BundleWidgetOptions {
  widget: RegisteredToolWidget;
  appName: string;
  appVersion: string;
  outFile?: string;
}

export function createViteWidgetConfig(options: {
  root: string;
  widgets: RegisteredToolWidget[];
  appName: string;
  appVersion: string;
  outDir?: string;
}): InlineConfig {
  const reactPaths = resolveReactEntries();
  return {
    configFile: false,
    root: options.root,
    plugins: [
      ...widgetTailwindPlugin(),
      react(),
      mcpfyWidgetPlugin({
        widgets: toViteWidgetList(options.widgets),
        appName: options.appName,
        appVersion: options.appVersion,
      }),
    ],
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
    resolve: {
      alias: {
        "mcpfy-sdk/widget": resolveWidgetRuntimeEntry(),
        react: reactPaths.react,
        "react-dom": reactPaths.reactDom,
        "react-dom/client": reactPaths.reactDomClient,
      },
      dedupe: ["react", "react-dom"],
    },
    build: {
      outDir: options.outDir ?? "dist",
      emptyOutDir: true,
      cssCodeSplit: false,
      assetsInlineLimit: 100_000_000,
      minify: true,
      chunkSizeWarningLimit: 2000,
    },
  };
}

function readBuiltCss(outDir: string): string {
  if (!existsSync(outDir)) return "";
  return readdirSync(outDir)
    .filter((name) => name.endsWith(".css"))
    .map((name) => readFileSync(join(outDir, name), "utf8"))
    .join("\n");
}

function siblingCss(entry: string): string | undefined {
  const css = join(dirname(entry), "styles.css");
  return existsSync(css) ? css : undefined;
}

async function loadVite() {
  return import("vite");
}

function makeWidgetBuildDir(): string {
  const cache = join(sdkPackageRoot(), "node_modules/.cache");
  mkdirSync(cache, { recursive: true });
  return realpathSync(mkdtempSync(join(cache, "mcpfy-widget-")));
}

/** Production-bundle one widget folder into a single HTML string. */
export async function bundleWidgetHtml(options: BundleWidgetOptions): Promise<string> {
  const { widget, appName, appVersion } = options;
  if (!widget.paths) {
    throw new Error(`Widget "${widget.toolName}" has no folder to bundle.`);
  }

  const tmp = makeWidgetBuildDir();
  try {
    writeFileSync(
      join(tmp, "bootstrap.tsx"),
      widgetBootstrapSource({
        toolName: widget.toolName,
        entryPath: widget.paths.entry,
        appName,
        appVersion,
        cssPath: siblingCss(widget.paths.entry),
      })
    );
    writeFileSync(join(tmp, "package.json"), JSON.stringify({ type: "module" }));
    const { build } = await loadVite();
    const base = createViteWidgetConfig({
      root: tmp,
      widgets: [widget],
      appName,
      appVersion,
      outDir: "dist",
    });
    await build({
      ...base,
      build: {
        outDir: "dist",
        emptyOutDir: true,
        cssCodeSplit: false,
        minify: true,
        chunkSizeWarningLimit: 2000,
        lib: {
          entry: join(tmp, "bootstrap.tsx"),
          name: "mcpfyWidget",
          formats: ["iife"],
          fileName: () => "widget.js",
        },
        rollupOptions: {
          output: {
            inlineDynamicImports: true,
            assetFileNames: "widget[extname]",
          },
        },
      },
    });
    const outDir = join(tmp, "dist");
    const js = readFileSync(join(outDir, "widget.js"), "utf8");
    const inlined = wrapIifeHtml(js, readBuiltCss(outDir), widget.csp);
    if (options.outFile) {
      mkdirSync(dirname(options.outFile), { recursive: true });
      writeFileSync(options.outFile, inlined);
    }
    return inlined;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
