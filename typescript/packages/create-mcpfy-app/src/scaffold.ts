import { spawn } from "node:child_process";
import { cpSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// Built layout: dist/bin.js + dist/template/ (copied by scripts/copy-templates.mjs).
// Dev layout (tsx src/bin.ts, no build step): src/scaffold.ts + ../template/ at the package root.
const templateDir = existsSync(join(here, "template")) ? join(here, "template") : join(here, "..", "template");

export type Transport = "stdio" | "http";

export interface ScaffoldOptions {
  targetDir: string;
  projectName: string;
  transport: Transport;
  install: boolean;
  packageManager: string;
}

/** Turns an arbitrary directory/display name into a valid npm package name. */
export function toPackageName(name: string): string {
  const sanitized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_.]+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");
  return sanitized || "my-mcp-server";
}

/** Reads `npm_config_user_agent` to figure out which package manager launched this CLI. */
export function detectPackageManager(): string {
  const userAgent = process.env.npm_config_user_agent ?? "";
  if (userAgent.startsWith("pnpm")) return "pnpm";
  if (userAgent.startsWith("yarn")) return "yarn";
  return "npm";
}

export function assertEmptyTarget(targetDir: string): void {
  if (!existsSync(targetDir)) return;
  const entries = readdirSync(targetDir);
  if (entries.length > 0) {
    throw new Error(
      `"${targetDir}" already exists and is not empty. Choose a different name or remove it first.`
    );
  }
}

function replacePlaceholders(filePath: string, replacements: Record<string, string>): void {
  let content = readFileSync(filePath, "utf-8");
  let changed = false;
  for (const [placeholder, value] of Object.entries(replacements)) {
    if (!content.includes(placeholder)) continue;
    content = content.replaceAll(placeholder, value);
    changed = true;
  }
  if (changed) writeFileSync(filePath, content, "utf-8");
}

export function copyTemplate(targetDir: string, projectName: string, transport: Transport): void {
  cpSync(templateDir, targetDir, { recursive: true });
  const replacements = { "{{PROJECT_NAME}}": projectName, "{{DEFAULT_TRANSPORT}}": transport };
  for (const file of ["package.json", "README.md", "src/server.ts"]) {
    replacePlaceholders(join(targetDir, file), replacements);
  }
}

export function runInstall(packageManager: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(packageManager, ["install"], { cwd, stdio: "inherit", shell: false });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${packageManager} install failed with exit code ${code}`));
    });
    child.on("error", reject);
  });
}

export async function scaffold(options: ScaffoldOptions): Promise<void> {
  assertEmptyTarget(options.targetDir);
  copyTemplate(options.targetDir, options.projectName, options.transport);
  if (options.install) {
    await runInstall(options.packageManager, options.targetDir);
  }
}
