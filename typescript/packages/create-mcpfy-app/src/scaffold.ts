import { spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = existsSync(join(here, "template")) ? here : join(here, "..");

export type Transport = "stdio" | "http";
export type Auth = "none" | "header" | "oauth";

export interface ScaffoldOptions {
  targetDir: string;
  projectName: string;
  transport: Transport;
  auth: Auth;
  /** Default HTTP listen port baked into the generated server (ignored for stdio). */
  port?: number;
  /** Scaffold a React widget folder + `server.tool({ widget })` example. */
  widget?: boolean;
  /** Add Tailwind CSS for the widget (requires widget). */
  tailwind?: boolean;
  install: boolean;
  packageManager: string;
}

export const AUTH_IMPORTS: Record<Auth, string> = {
  none: "",
  header: "",
  oauth: ", jwksVerifier",
};

export const AUTH_CONFIGS: Record<Auth, string> = {
  none: "",
  header: `\n  auth: { type: "header", verify: (token) => token === process.env.API_KEY }, // set API_KEY in your environment`,
  oauth: `\n  auth: {
    type: "oauth",
    // Replace with your real OIDC issuer + JWKS URL — works with Auth0, Keycloak, WorkOS, Clerk,
    // etc. by just pointing this at that provider's endpoints, or use the oauthAuth0Provider /
    // oauthWorkOSProvider shortcuts from mcpfy-sdk/server instead of jwksVerifier directly.
    verifyToken: jwksVerifier({
      issuer: "https://your-issuer.example.com",
      jwksUri: "https://your-issuer.example.com/.well-known/jwks.json",
    }),
    authorizationServers: ["https://your-issuer.example.com"],
  },`,
};

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

function templateDirFor(widget: boolean): string {
  const name = widget ? "template-widget" : "template";
  const dir = join(packageRoot, name);
  if (!existsSync(dir)) {
    throw new Error(`Scaffold template missing: ${dir}`);
  }
  return dir;
}

/**
 * Local checkouts of this monorepo should depend on the sibling mcpfy-sdk (the
 * published npm copy does not yet ship the `mcpfy` CLI). Published create-mcpfy-app
 * falls back to the registry version.
 */
export function mcpfySdkDependency(): string {
  const candidates = [
    join(packageRoot, "..", "mcpfy"),
    join(packageRoot, "..", "..", "mcpfy"),
    join(packageRoot, "..", "..", "..", "mcpfy"),
  ];
  for (const local of candidates) {
    const pkgPath = join(local, "package.json");
    if (!existsSync(pkgPath)) continue;
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string; bin?: Record<string, string> };
      if (pkg.name === "mcpfy-sdk" && pkg.bin?.mcpfy) {
        return `file:${local}`;
      }
    } catch {
      // try next
    }
  }
  return "^0.2.3";
}

export function copyTemplate(
  targetDir: string,
  projectName: string,
  transport: Transport,
  auth: Auth,
  port = 3000,
  widget = true,
  tailwind = false
): void {
  mkdirSync(targetDir, { recursive: true });
  cpSync(templateDirFor(widget), targetDir, { recursive: true });
  const gitignorePath = join(targetDir, "gitignore");
  if (existsSync(gitignorePath)) {
    renameSync(gitignorePath, join(targetDir, ".gitignore"));
  }
  const replacements = {
    "{{PROJECT_NAME}}": projectName,
    "{{DEFAULT_TRANSPORT}}": transport,
    "{{DEFAULT_PORT}}": String(port),
    "{{DEV_PORT_ARGS}}": transport === "http" ? ` --port ${port}` : "",
    "{{MCPFY_DEV_ARGS}}": transport === "http" ? ` -- --http --port ${port}` : "",
    "{{AUTH_IMPORT}}": AUTH_IMPORTS[auth],
    "{{AUTH_CONFIG}}": AUTH_CONFIGS[auth],
    "{{MCPFY_SDK}}": mcpfySdkDependency(),
  };
  for (const file of ["package.json", "README.md", "src/server.ts"]) {
    replacePlaceholders(join(targetDir, file), replacements);
  }
  if (widget) applyWidgetStyle(targetDir, tailwind);
}

function applyWidgetStyle(targetDir: string, tailwind: boolean): void {
  const dir = join(targetDir, "src/widgets/weather");
  const inline = join(dir, "main.tsx");
  const tw = join(dir, "main.tailwind.tsx");
  const css = join(dir, "styles.css");

  if (tailwind) {
    if (existsSync(inline)) unlinkSync(inline);
    if (existsSync(tw)) renameSync(tw, inline);
    const pkgPath = join(targetDir, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      devDependencies?: Record<string, string>;
    };
    pkg.devDependencies = {
      ...pkg.devDependencies,
      "@tailwindcss/vite": "^4.1.11",
      tailwindcss: "^4.1.11",
    };
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    return;
  }

  if (existsSync(tw)) unlinkSync(tw);
  if (existsSync(css)) unlinkSync(css);
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
  copyTemplate(
    options.targetDir,
    options.projectName,
    options.transport,
    options.auth,
    options.port ?? 3000,
    options.widget ?? true,
    Boolean(options.widget && options.tailwind)
  );
  if (options.install) {
    await runInstall(options.packageManager, options.targetDir);
  }
}
