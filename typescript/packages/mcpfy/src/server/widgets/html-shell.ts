import type { WidgetCsp } from "./types.js";
import { mergeWidgetCsp, widgetDocumentCsp } from "./csp.js";

function escapeClosingTag(source: string, tag: string): string {
  return source.replace(new RegExp(`</${tag}`, "gi"), `<\\/${tag}`);
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

export function wrapIifeHtml(js: string, css = "", csp?: WidgetCsp): string {
  const merged = mergeWidgetCsp(csp);
  const cspTag = merged
    ? `<meta http-equiv="Content-Security-Policy" content="${escapeAttr(widgetDocumentCsp(merged))}" />\n    `
    : "";
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${cspTag}<style>html,body{margin:0;background:#fff;}#root{min-height:160px;}</style>
    ${css ? `<style>${escapeClosingTag(css, "style")}</style>` : ""}
  </head>
  <body>
    <div id="root"></div>
    <script>
      window.process = window.process || { env: { NODE_ENV: "production" } };
      window.onerror = function (message) {
        var el = document.getElementById("root");
        if (el && !el.childElementCount) el.textContent = String(message);
      };
    </script>
    <script>${escapeClosingTag(js, "script")}</script>
  </body>
</html>
`;
}

export function widgetBootstrapSource(options: {
  toolName: string;
  entryPath: string;
  appName: string;
  appVersion: string;
  cssPath?: string;
}): string {
  const cssImport = options.cssPath ? `import ${JSON.stringify(options.cssPath)};\n` : "";
  return `${cssImport}import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { HostRuntime, ThemeProvider } from "mcpfy-sdk/widget";
import App from ${JSON.stringify(options.entryPath)};

const el = document.getElementById("root");
if (!el) throw new Error("mcpfy widget shell is missing #root");

createRoot(el).render(
  createElement(
    ThemeProvider,
    null,
    createElement(
      HostRuntime,
      { toolName: ${JSON.stringify(options.toolName)}, appName: ${JSON.stringify(options.appName)}, appVersion: ${JSON.stringify(options.appVersion)} },
      createElement(App)
    )
  )
);
`;
}
