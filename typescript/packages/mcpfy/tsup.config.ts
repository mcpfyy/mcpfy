import { defineConfig } from "tsup";

const external = [
  "@modelcontextprotocol/sdk",
  "@modelcontextprotocol/ext-apps",
  "@mcp-ui/server",
  "zod",
  "jose",
  "mcpfy-pulse",
  "vite",
  "@vitejs/plugin-react",
  "react",
  "react-dom",
  "react-dom/client",
];

export default defineConfig([
  {
    entry: {
      "src/index": "src/index.ts",
      "src/server/index": "src/server/index.ts",
      "src/client/index": "src/client/index.ts",
      "src/auth/index": "src/auth/index.ts",
    },
    format: ["esm"],
    outDir: "dist",
    platform: "node",
    target: "es2022",
    splitting: false,
    sourcemap: true,
    clean: false,
    dts: false,
    external,
  },
  {
    entry: {
      "src/cli/mcpfy": "src/cli/mcpfy.ts",
    },
    format: ["esm"],
    outDir: "dist",
    platform: "node",
    target: "es2022",
    splitting: false,
    sourcemap: true,
    clean: false,
    dts: false,
    external,
  },
  {
    entry: {
      "src/client-widget/index": "src/client-widget/index.ts",
      "src/widget-react/index": "src/widget-react/index.ts",
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
    esbuildOptions(options) {
      options.jsx = "automatic";
    },
  },
]);
