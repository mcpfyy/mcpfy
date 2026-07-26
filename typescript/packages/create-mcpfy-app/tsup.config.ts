import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/bin.ts"],
  format: ["esm"],
  outDir: "dist",
  platform: "node",
  target: "es2022",
  splitting: false,
  sourcemap: true,
  clean: false,
  dts: false,
  shims: true,
});
