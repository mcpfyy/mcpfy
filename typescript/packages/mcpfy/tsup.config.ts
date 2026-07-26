import { defineConfig } from "tsup";

const external = ["@modelcontextprotocol/sdk", "@modelcontextprotocol/ext-apps", "@mcp-ui/server", "zod"];

export default defineConfig([
  {
    entry: {
      "src/index": "src/index.ts",
      "src/server/index": "src/server/index.ts",
      "src/client/index": "src/client/index.ts",
    },
    format: ["cjs", "esm"],
    outDir: "dist",
    platform: "node",
    target: "es2022",
    splitting: false,
    sourcemap: true,
    clean: false,
    dts: false,
    external,
  },
  // Widget bridge: runs inside a widget's <iframe>, not Node — separate browser-target build.
  {
    entry: {
      "src/client-widget/index": "src/client-widget/index.ts",
    },
    format: ["esm"],
    outDir: "dist",
    platform: "browser",
    target: "es2022",
    splitting: false,
    sourcemap: true,
    clean: false,
    dts: false,
    external,
  },
]);
