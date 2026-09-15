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
const packageRoot = existsSync(join(here, "template"))
  ? here
  : join(here, "..");

export type Transport = "stdio" | "http";
export type Auth = "none" | "header" | "oauth";
export type OAuthProvider =
  | "auth0"
  | "clerk"
  | "workos"
  | "supabase"
  | "better-auth"
  | "keycloak"
  | "custom";

export interface ScaffoldOptions {
  targetDir: string;
  projectName: string;
  transport: Transport;
  auth: Auth;
  oauthProvider?: OAuthProvider;
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
  oauth: ", oauth",
};

export const AUTH_CONFIGS: Record<Auth, string> = {
  none: "",
  header: `\n  auth: { type: "header", verify: (token) => token === process.env.API_KEY }, // set API_KEY in your environment`,
  oauth: `\n  auth: oauth.jwt({
    issuer: process.env.OAUTH_ISSUER!,
    jwksUri: process.env.OAUTH_JWKS_URL!,
    resource: process.env.MCP_URL,
    ...(process.env.OAUTH_AUDIENCE ? { audience: process.env.OAUTH_AUDIENCE } : {}),
    ...(process.env.OAUTH_ALGORITHMS ? { algorithms: process.env.OAUTH_ALGORITHMS.split(",").map((value) => value.trim()).filter(Boolean) } : {}),
  }),`,
};

export const OAUTH_CONFIGS: Record<OAuthProvider, string> = {
  auth0: `\n  auth: oauth.auth0({
    domain: process.env.AUTH0_DOMAIN!,
    ...(process.env.AUTH0_AUDIENCE ? { audience: process.env.AUTH0_AUDIENCE } : {}),
  }),`,
  clerk: `\n  auth: oauth.clerk({
    domain: process.env.CLERK_DOMAIN!,
    ...(process.env.CLERK_AUDIENCE ? { audience: process.env.CLERK_AUDIENCE } : {}),
  }),`,
  workos: `\n  auth: oauth.workos({
    authKitDomain: process.env.WORKOS_AUTHKIT_DOMAIN!,
    ...(process.env.WORKOS_AUDIENCE ? { audience: process.env.WORKOS_AUDIENCE } : {}),
  }),`,
  supabase: `\n  auth: oauth.supabase({
    supabaseUrl: process.env.SUPABASE_URL!,
    ...(process.env.SUPABASE_AUDIENCE ? { audience: process.env.SUPABASE_AUDIENCE } : {}),
    ...(process.env.SUPABASE_JWT_SECRET ? { jwtSecret: process.env.SUPABASE_JWT_SECRET } : {}),
  }),`,
  "better-auth": `\n  auth: oauth.betterAuth({
    authUrl: process.env.BETTER_AUTH_URL!,
  }),`,
  keycloak: `\n  auth: oauth.keycloak({
    serverUrl: process.env.KEYCLOAK_SERVER_URL!,
    realm: process.env.KEYCLOAK_REALM!,
    ...(process.env.KEYCLOAK_AUDIENCE ? { audience: process.env.KEYCLOAK_AUDIENCE } : {}),
  }),`,
  custom: AUTH_CONFIGS.oauth,
};

export const OAUTH_ENV: Record<OAuthProvider, string> = {
  auth0: `
# OAuth protection for the MCP endpoint
AUTH0_DOMAIN=your-tenant.us.auth0.com
# Optional: Auth0 API Identifier when it differs from MCP_URL
AUTH0_AUDIENCE=
MCP_URL=http://localhost:{{OAUTH_PORT}}{{OAUTH_PATH}}`,
  clerk: `
# OAuth protection for the MCP endpoint
CLERK_DOMAIN=your-app.clerk.accounts.dev
# Optional: exact aud emitted by Clerk OAuth JWTs
CLERK_AUDIENCE=
MCP_URL=http://localhost:{{OAUTH_PORT}}{{OAUTH_PATH}}`,
  workos: `
# OAuth protection for the MCP endpoint
WORKOS_AUTHKIT_DOMAIN=your-app.authkit.app
# Optional: only when WorkOS emits an API audience different from MCP_URL
WORKOS_AUDIENCE=
MCP_URL=http://localhost:{{OAUTH_PORT}}{{OAUTH_PATH}}`,
  supabase: `
# OAuth protection for the MCP endpoint
SUPABASE_URL=https://your-project.supabase.co
# Optional; defaults to authenticated
SUPABASE_AUDIENCE=
# Optional legacy HS256 secret; omit for JWKS verification
SUPABASE_JWT_SECRET=
MCP_URL=http://localhost:{{OAUTH_PORT}}{{OAUTH_PATH}}`,
  "better-auth": `
# OAuth protection for the MCP endpoint
BETTER_AUTH_URL=https://your-app.example.com/api/auth
MCP_URL=http://localhost:{{OAUTH_PORT}}{{OAUTH_PATH}}`,
  keycloak: `
# OAuth protection for the MCP endpoint
KEYCLOAK_SERVER_URL=https://auth.example.com
KEYCLOAK_REALM=your-realm
# Optional: audience configured by a Keycloak audience mapper
KEYCLOAK_AUDIENCE=
MCP_URL=http://localhost:{{OAUTH_PORT}}{{OAUTH_PATH}}`,
  custom: `
# OAuth protection for the MCP endpoint
OAUTH_ISSUER=https://your-issuer.example.com
OAUTH_JWKS_URL=https://your-issuer.example.com/.well-known/jwks.json
# Optional expected aud claim
OAUTH_AUDIENCE=
# Optional comma-separated allowlist, for example RS256,ES256
OAUTH_ALGORITHMS=
MCP_URL=http://localhost:{{OAUTH_PORT}}{{OAUTH_PATH}}`,
};

const OAUTH_SETUP: Record<OAuthProvider, string> = {
  auth0: `## Authentication

This server validates Auth0 access tokens. Copy \`.env.example\` to \`.env\`, set the tenant domain, and configure the Auth0 API Identifier to match the canonical \`MCP_URL\`. OAuth scopes are optional; add \`requiredScopes\` in \`src/server.ts\` only when you want permission-level authorization.

Auth0 setup: https://auth0.com/docs/get-started/apis`,
  clerk: `## Authentication

This server validates Clerk OAuth JWT access tokens. Set \`CLERK_DOMAIN\` to the Frontend API URL and enable Dynamic Client Registration or explicitly allow your MCP client. \`CLERK_AUDIENCE\` is optional. Because Clerk tokens without an audience are issuer-bound, use a Clerk instance dedicated to this MCP/application.

Clerk MCP setup: https://clerk.com/docs/expressjs/guides/ai/mcp/build-mcp-server`,
  workos: `## Authentication

This server validates WorkOS AuthKit access tokens. Copy \`.env.example\` to \`.env\` and set the AuthKit domain. Configure the MCP client/application in WorkOS before connecting. OAuth scopes are optional; add \`requiredScopes\` only when needed.

WorkOS AuthKit setup: https://workos.com/docs/user-management`,
  supabase: `## Authentication

This server validates Supabase Auth access tokens. Copy \`.env.example\` to \`.env\`, set your Supabase project URL, enable the OAuth 2.1 server, and configure its authorization page and client registration policy.

Supabase MCP authentication: https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication`,
  "better-auth": `## Authentication

This server validates access tokens from a Better Auth OAuth Provider. Copy \`.env.example\` to \`.env\`, set the full Better Auth issuer URL including its base path, and configure the MCP resource in Better Auth to match \`MCP_URL\`.

Better Auth OAuth Provider: https://better-auth.com/docs/plugins/oauth-provider`,
  keycloak: `## Authentication

This server validates access tokens issued by a Keycloak realm. Copy \`.env.example\` to \`.env\`, set the server URL and realm, enable client registration as appropriate, and configure Keycloak to issue access tokens for the canonical \`MCP_URL\`.

Keycloak OIDC: https://www.keycloak.org/securing-apps/oidc-layers`,
  custom: `## Authentication

This server accepts JWT access tokens from any standards-based OAuth/OIDC authorization server. Copy \`.env.example\` to \`.env\` and set the issuer, JWKS URL, and exact public MCP endpoint. Add \`requiredScopes\` in \`src/server.ts\` only when the authorization server is configured to issue those scopes.`,
};

export const OAUTH_USER_INFO_TOOL = `
server.tool(
  {
    name: "getuserinfo",
    description: "Return the identity and authorization details from the verified OAuth access token.",
    schema: z.object({}),
  },
  async (_input, ctx) => object({
    user: ctx.auth?.user ?? null,
    scopes: ctx.auth?.scopes ?? [],
    permissions: ctx.auth?.permissions ?? [],
    clientId: ctx.auth?.clientId ?? null,
  })
);
`;

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
      `"${targetDir}" already exists and is not empty. Choose a different name or remove it first.`,
    );
  }
}

function replacePlaceholders(
  filePath: string,
  replacements: Record<string, string>,
): void {
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
 * Local checkouts of this monorepo depend on the sibling mcpfy-sdk so scaffolded
 * projects pick up unpublished changes. Published create-mcpfy-app falls back to
 * the registry version.
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
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        name?: string;
        bin?: Record<string, string>;
      };
      if (pkg.name === "mcpfy-sdk" && pkg.bin?.mcpfy) {
        return `file:${local}`;
      }
    } catch {
      // try next
    }
  }
  return "^0.3.1";
}

function hostConnection(
  auth: Auth,
  widget: boolean,
  projectName: string,
  port: number,
): string {
  if (auth === "oauth") {
    const path = widget ? "/weather" : "/hello";
    return `OAuth authentication requires HTTP. Start the server with \`npm run dev:http\`, then connect your MCP client to \`http://localhost:${port}${path}\`.`;
  }
  const args = widget
    ? '["mcpfy", "dev", "--", "--stdio"]'
    : '["tsx", "/absolute/path/to/src/server.ts", "--stdio"]';
  const cwd = widget ? ',\n      "cwd": "/absolute/path/to/this-project"' : "";
  return `Most desktop MCP hosts launch local servers over stdio:

\`\`\`json
{
  "mcpServers": {
    ${JSON.stringify(projectName)}: {
      "command": "npx",
      "args": ${args}${cwd}
    }
  }
}
\`\`\``;
}

export function copyTemplate(
  targetDir: string,
  projectName: string,
  transport: Transport,
  auth: Auth,
  port = 3000,
  widget = true,
  tailwind = false,
  oauthProvider: OAuthProvider = "custom",
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
    "{{MCPFY_DEV_ARGS}}":
      transport === "http" ? ` -- --http --port ${port}` : "",
    "{{AUTH_IMPORT}}": AUTH_IMPORTS[auth],
    "{{AUTH_CONFIG}}":
      auth === "oauth" ? OAUTH_CONFIGS[oauthProvider] : AUTH_CONFIGS[auth],
    "{{AUTH_ENV}}":
      auth === "oauth"
        ? OAUTH_ENV[oauthProvider]
            .replaceAll("{{OAUTH_PORT}}", String(port))
            .replaceAll("{{OAUTH_PATH}}", widget ? "/weather" : "/hello")
        : "",
    "{{AUTH_SETUP}}": auth === "oauth" ? OAUTH_SETUP[oauthProvider] : "",
    "{{AUTH_TOOL}}": auth === "oauth" ? OAUTH_USER_INFO_TOOL : "",
    "{{HOST_CONNECTION}}": hostConnection(auth, widget, projectName, port),
    "{{MCPFY_SDK}}": mcpfySdkDependency(),
  };
  for (const file of [
    "package.json",
    "README.md",
    ".env.example",
    "src/server.ts",
  ]) {
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
    const child = spawn(packageManager, ["install"], {
      cwd,
      stdio: "inherit",
      shell: false,
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(`${packageManager} install failed with exit code ${code}`),
        );
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
    Boolean(options.widget && options.tailwind),
    options.oauthProvider ?? "custom",
  );
  if (options.install) {
    await runInstall(options.packageManager, options.targetDir);
  }
}
