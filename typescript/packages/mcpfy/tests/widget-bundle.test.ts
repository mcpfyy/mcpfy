import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { bundleWidgetHtml } from "../src/server/widgets/bundle.js";
import type { RegisteredToolWidget } from "../src/server/widgets/registry.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("widget Vite bundler", () => {
  it("compiles a React folder into a single HTML document", async () => {
    const folder = join(here, "fixtures/widgets/hello");
    const entry = join(folder, "main.tsx");
    const widget: RegisteredToolWidget = {
      toolName: "hello",
      options: { dir: "hello" },
      protocols: [],
      paths: { folder, entry, outputName: "hello" },
    };

    const html = await bundleWidgetHtml({
      widget,
      appName: "test-server",
      appVersion: "1.0.0",
    });

    expect(html).toContain("<div id=\"root\">");
    expect(html).toMatch(/<script>/i);
    expect(html).not.toMatch(/type="module"/);
    expect(html).not.toMatch(/src="\.\/assets\//);
    expect(html).toContain("hello-widget");
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
    const widgetJs = scripts.at(-1) ?? "";
    expect(widgetJs).not.toMatch(/\bprocess\.env\b/);
  }, 60_000);
});
