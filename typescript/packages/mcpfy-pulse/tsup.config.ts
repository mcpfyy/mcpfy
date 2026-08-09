import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { "src/index": "src/index.ts" },
    format: ["cjs", "esm"],
    outDir: "dist",
    platform: "node",
    target: "es2022",
    splitting: false,
    sourcemap: true,
    clean: false,
    dts: false,
  },
  // CLI entry — kept separate so `mcpfy-proxy` doesn't pull the library build's dual
  // cjs/esm output along with it. esbuild preserves the `#!/usr/bin/env node` shebang
  // on src/bin/mcpfy-proxy.ts automatically since it's the first line of the entry file.
  {
    entry: { "bin/mcpfy-proxy": "src/bin/mcpfy-proxy.ts" },
    format: ["esm"],
    outDir: "dist",
    platform: "node",
    target: "es2022",
    splitting: false,
    sourcemap: true,
    clean: false,
    dts: false,
  },
]);
