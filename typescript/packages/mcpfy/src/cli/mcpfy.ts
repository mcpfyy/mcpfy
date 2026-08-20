#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { bundleWidgetHtml } from "../server/widgets/bundle.js";
import { DEFAULT_WIDGET_OUT_DIR, discoverWidgetFolders } from "../server/widgets/prepare.js";
import { resolveWidgetPaths } from "../server/widgets/resolve.js";
import { DEFAULT_WIDGETS_DIR } from "../server/widgets/types.js";
import type { RegisteredToolWidget } from "../server/widgets/registry.js";

function printUsage(): void {
  console.log(`Usage:
  mcpfy dev [--entry src/server.ts] [-- ...]
  mcpfy build [--widgets-dir src/widgets] [--out dist/widgets]

  dev    Start the MCP server and bundle widgets as self-contained HTML (sets MCPFY_WIDGET_DEV=1)
  build  Bundle every React folder under widgets-dir into single HTML files
`);
}

function readArg(argv: string[], flag: string): string | undefined {
  const eq = argv.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.slice(flag.length + 1);
  const i = argv.indexOf(flag);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("-")) return argv[i + 1];
  return undefined;
}

function readPkg(cwd: string): { name: string; version: string } {
  try {
    const raw = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")) as {
      name?: string;
      version?: string;
    };
    return { name: raw.name ?? "mcp-server", version: raw.version ?? "0.0.0" };
  } catch {
    return { name: "mcp-server", version: "0.0.0" };
  }
}

function findTsx(cwd: string): string[] {
  const local = join(cwd, "node_modules/tsx/dist/cli.mjs");
  if (existsSync(local)) return [process.execPath, local];
  return ["npx", "tsx"];
}

async function runBuild(argv: string[]): Promise<void> {
  const cwd = process.cwd();
  const widgetsDir = readArg(argv, "--widgets-dir") ?? DEFAULT_WIDGETS_DIR;
  const outDir = resolve(cwd, readArg(argv, "--out") ?? DEFAULT_WIDGET_OUT_DIR);
  const pkg = readPkg(cwd);
  const folders = discoverWidgetFolders(widgetsDir, cwd);
  if (folders.length === 0) {
    console.log(`No widget folders found in ${resolve(cwd, widgetsDir)}.`);
    return;
  }

  for (const folder of folders) {
    const paths = resolveWidgetPaths(folder.dir, { widgetsDir, cwd });
    const widget: RegisteredToolWidget = {
      toolName: paths.outputName,
      options: { dir: folder.dir },
      protocols: [],
      paths,
    };
    const outFile = join(outDir, `${paths.outputName}.html`);
    await bundleWidgetHtml({
      widget,
      appName: pkg.name,
      appVersion: pkg.version,
      outFile,
    });
    console.log(`bundled ${folder.dir} -> ${outFile}`);
  }
}

function runDev(argv: string[]): void {
  const cwd = process.cwd();
  const entry = readArg(argv, "--entry") ?? "src/server.ts";
  const dash = argv.indexOf("--");
  const passthrough = dash >= 0 ? argv.slice(dash + 1) : argv.filter((a, i, all) => {
    if (a === "dev" || a === "--entry" || a.startsWith("--entry=")) return false;
    if (all[i - 1] === "--entry") return false;
    return a !== "--widgets-dir" && !a.startsWith("--widgets-dir=") && all[i - 1] !== "--widgets-dir";
  }).filter((a) => a !== "dev");

  const [cmd, ...cmdPrefix] = findTsx(cwd);
  const child = spawn(cmd, [...cmdPrefix, entry, ...passthrough], {
    cwd,
    stdio: "inherit",
    env: { ...process.env, MCPFY_WIDGET_DEV: "1" },
    shell: cmd === "npx",
  });
  child.on("exit", (code) => process.exit(code ?? 1));
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (cmd === "build") {
    await runBuild(argv.slice(1));
    return;
  }
  if (cmd === "dev") {
    runDev(argv.slice(1));
    return;
  }
  printUsage();
  process.exit(cmd ? 1 : 0);
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
