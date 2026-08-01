/**
 * Deterministic codegen: cloud apiSpecs → mcpfy-sdk project file map.
 * Used by create-mcpfy-app and (vendored) by the MCPfy Nest export-to-GitHub flow.
 * No LLM — pure template expansion.
 */

import { AUTH_CONFIGS, AUTH_IMPORTS, type Auth, type Transport, toPackageName } from "./scaffold.js";

export type { Auth, Transport };

export interface ExportParamSpec {
  type?: string;
  required?: boolean;
  description?: string;
  placeholder?: string;
  example?: string;
}

export interface ExportToolSpec {
  toolName: string;
  description?: string;
  request: {
    type: string;
    url: string;
    headers?: Record<string, string>;
    pathParams?: Record<string, ExportParamSpec>;
    queryParams?: Record<string, ExportParamSpec>;
    bodyInput?: Record<string, ExportParamSpec>;
  };
  responseTransformer?: {
    enabled?: boolean;
    language?: string;
    code?: string;
  };
}

export interface ExportPromptSpec {
  name: string;
  title?: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

export type OutboundAuthType = "none" | "bearer" | "apikey" | "basic" | "custom";

export interface ExportAuthSpec {
  type?: OutboundAuthType;
  config?: {
    apiKeyHeader?: string;
    headers?: Record<string, unknown>;
  };
}

export interface GenerateProjectOptions {
  projectName: string;
  description?: string;
  transport?: Transport;
  /** MCP listener auth (who may call this server). */
  serverAuth?: Auth;
  /** Outbound HTTP auth for tool fetch calls. */
  authSpec?: ExportAuthSpec | null;
  tools?: ExportToolSpec[];
  prompts?: ExportPromptSpec[];
}

const PACKAGE_JSON = `{
  "name": "{{PROJECT_NAME}}",
  "type": "module",
  "version": "0.1.0",
  "private": true,
  "description": "{{DESCRIPTION}}",
  "scripts": {
    "dev": "tsx src/server.ts",
    "dev:stdio": "tsx src/server.ts --stdio",
    "dev:http": "tsx src/server.ts --http",
    "build": "tsc",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "mcpfy-sdk": "^0.2.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3"
  }
}
`;

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
`;

const GITIGNORE = `node_modules/
dist/
*.log
.env
`;

function escapeTsString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

function sanitizeIdent(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^(\d)/, "_$1");
  return cleaned || "tool";
}

function zodTypeExpr(param: ExportParamSpec): string {
  let base: string;
  switch (param.type) {
    case "number":
      base = "z.number()";
      break;
    case "boolean":
      base = "z.boolean()";
      break;
    case "object":
      base = "z.record(z.unknown())";
      break;
    case "array":
      base = "z.array(z.unknown())";
      break;
    default:
      base = "z.string()";
  }
  if (param.description) {
    base += `.describe(${JSON.stringify(param.description)})`;
  }
  if (param.required === false) {
    base += ".optional()";
  }
  return base;
}

function buildZodObject(fields: Record<string, ExportParamSpec> | undefined): string {
  if (!fields || Object.keys(fields).length === 0) return "z.object({})";
  const lines = Object.entries(fields).map(
    ([name, spec]) => `    ${JSON.stringify(name)}: ${zodTypeExpr(spec)},`
  );
  return `z.object({\n${lines.join("\n")}\n  })`;
}

function collectSchemaFields(request: ExportToolSpec["request"]): Record<string, ExportParamSpec> {
  return {
    ...(request.pathParams || {}),
    ...(request.queryParams || {}),
    ...(request.bodyInput || {}),
  };
}

function emitOutboundAuthHelper(authSpec?: ExportAuthSpec | null): string {
  const type = authSpec?.type || "none";
  if (type === "none") {
    return `function outboundAuthHeaders(): Record<string, string> {
  return {};
}
`;
  }
  if (type === "bearer") {
    return `function outboundAuthHeaders(): Record<string, string> {
  const token = process.env.API_TOKEN;
  if (!token) throw new Error("Set API_TOKEN in your environment (Bearer token for upstream API).");
  return { Authorization: \`Bearer \${token}\` };
}
`;
  }
  if (type === "apikey") {
    const header = authSpec?.config?.apiKeyHeader || "X-API-Key";
    return `function outboundAuthHeaders(): Record<string, string> {
  const key = process.env.API_KEY;
  if (!key) throw new Error("Set API_KEY in your environment.");
  return { ${JSON.stringify(header)}: key };
}
`;
  }
  if (type === "basic") {
    return `function outboundAuthHeaders(): Record<string, string> {
  const username = process.env.API_USERNAME;
  const password = process.env.API_PASSWORD ?? "";
  if (!username) throw new Error("Set API_USERNAME (and optionally API_PASSWORD) in your environment.");
  const encoded = Buffer.from(\`\${username}:\${password}\`).toString("base64");
  return { Authorization: \`Basic \${encoded}\` };
}
`;
  }
  // custom — use AUTH_HEADER_<NAME> env vars for each configured header key
  const keys = Object.keys(authSpec?.config?.headers || {});
  if (keys.length === 0) {
    return `function outboundAuthHeaders(): Record<string, string> {
  return {};
}
`;
  }
  const entries = keys
    .map((key) => {
      const envName = `AUTH_HEADER_${sanitizeIdent(key).toUpperCase()}`;
      return `  const ${sanitizeIdent(key)} = process.env[${JSON.stringify(envName)}];
  if (${sanitizeIdent(key)}) headers[${JSON.stringify(key)}] = ${sanitizeIdent(key)};`;
    })
    .join("\n");
  return `function outboundAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
${entries}
  return headers;
}
`;
}

function emitHttpHelpers(): string {
  return `function applyPathParams(
  url: string,
  pathParams: Record<string, { placeholder?: string }> | undefined,
  args: Record<string, unknown>
): string {
  if (!pathParams) return url;
  let out = url;
  for (const [name, spec] of Object.entries(pathParams)) {
    const placeholder = spec.placeholder || \`{{\${name}}}\`;
    const value = args[name];
    if (value !== undefined && value !== null) {
      out = out.split(placeholder).join(String(value));
    }
  }
  return out;
}

function applyQueryParams(
  url: string,
  queryParams: Record<string, unknown> | undefined,
  args: Record<string, unknown>
): string {
  if (!queryParams || Object.keys(queryParams).length === 0) return url;
  const qs = new URLSearchParams();
  for (const name of Object.keys(queryParams)) {
    const value = args[name];
    if (value !== undefined && value !== null) qs.append(name, String(value));
  }
  const s = qs.toString();
  if (!s) return url;
  return url + (url.includes("?") ? "&" : "?") + s;
}

function buildBody(
  bodyInput: Record<string, unknown> | undefined,
  args: Record<string, unknown>,
  method: string
): string | undefined {
  if (!bodyInput || Object.keys(bodyInput).length === 0) return undefined;
  if (!["post", "put", "patch"].includes(method.toLowerCase())) return undefined;
  const body: Record<string, unknown> = {};
  for (const name of Object.keys(bodyInput)) {
    if (args[name] !== undefined) body[name] = args[name];
  }
  return JSON.stringify(body);
}

async function callUpstream(opts: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  pathParams?: Record<string, { placeholder?: string }>;
  queryParams?: Record<string, unknown>;
  bodyInput?: Record<string, unknown>;
  args: Record<string, unknown>;
}): Promise<{ status: number; statusText: string; data: unknown }> {
  const method = opts.method.toUpperCase();
  let url = applyPathParams(opts.url, opts.pathParams, opts.args);
  url = applyQueryParams(url, opts.queryParams, opts.args);
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...outboundAuthHeaders(),
    ...(opts.headers || {}),
  };
  const body = buildBody(opts.bodyInput, opts.args, method);
  const res = await fetch(url, { method, headers, body });
  const textBody = await res.text();
  let data: unknown = textBody;
  try {
    data = textBody ? JSON.parse(textBody) : null;
  } catch {
    /* keep text */
  }
  if (!res.ok) {
    throw new Error(\`HTTP \${res.status}: \${typeof data === "string" ? data : JSON.stringify(data)}\`);
  }
  return { status: res.status, statusText: res.statusText, data };
}
`;
}

function emitTransformer(tool: ExportToolSpec): string {
  const id = sanitizeIdent(tool.toolName);
  const code = tool.responseTransformer?.code?.trim();
  if (!tool.responseTransformer?.enabled || !code) return "";
  // User code is typically: function transform(apiResponse) { ... }
  return `
const transform_${id} = (() => {
${code}
  if (typeof transform !== "function") {
    throw new Error("Transformer for ${escapeTsString(tool.toolName)} must define function transform(apiResponse)");
  }
  return transform as (apiResponse: unknown) => unknown;
})();
`;
}

function emitToolRegistration(tool: ExportToolSpec): string {
  const id = sanitizeIdent(tool.toolName);
  const schemaFields = collectSchemaFields(tool.request);
  const schema = buildZodObject(schemaFields);
  const method = (tool.request.type || "get").toLowerCase();
  const hasTransformer = Boolean(tool.responseTransformer?.enabled && tool.responseTransformer?.code);

  const pathParamsLit = JSON.stringify(tool.request.pathParams || {}, null, 2);
  const queryParamsLit = JSON.stringify(tool.request.queryParams || {}, null, 2);
  const bodyInputLit = JSON.stringify(tool.request.bodyInput || {}, null, 2);
  const headersLit = JSON.stringify(tool.request.headers || {}, null, 2);

  const resultExpr = hasTransformer
    ? `transform_${id}({ status: result.status, statusText: result.statusText, data: result.data })`
    : `result.data`;

  return `
server.tool(
  {
    name: ${JSON.stringify(tool.toolName)},
    description: ${JSON.stringify(tool.description || tool.toolName)},
    schema: ${schema},
  },
  async (args) => {
    const result = await callUpstream({
      method: ${JSON.stringify(method)},
      url: ${JSON.stringify(tool.request.url)},
      headers: ${headersLit},
      pathParams: ${pathParamsLit},
      queryParams: ${queryParamsLit},
      bodyInput: ${bodyInputLit},
      args: args as Record<string, unknown>,
    });
    const payload = ${resultExpr};
    return text(typeof payload === "string" ? payload : JSON.stringify(payload, null, 2));
  }
);
`;
}

function emitPromptRegistration(prompt: ExportPromptSpec): string {
  const args = prompt.arguments || [];
  const schemaFields =
    args.length === 0
      ? "z.object({})"
      : `z.object({\n${args
          .map((a) => {
            let field = "z.string()";
            if (a.description) field += `.describe(${JSON.stringify(a.description)})`;
            if (a.required === false) field += ".optional()";
            return `    ${JSON.stringify(a.name)}: ${field},`;
          })
          .join("\n")}\n  })`;

  const messagesLit = JSON.stringify(prompt.messages, null, 2);

  return `
server.prompt(
  {
    name: ${JSON.stringify(prompt.name)},
    description: ${JSON.stringify(prompt.description || prompt.title || prompt.name)},
    schema: ${schemaFields},
  },
  async (args) => {
    const stringArgs: Record<string, string> = {};
    for (const [k, v] of Object.entries(args || {})) {
      stringArgs[k] = v == null ? "" : String(v);
    }
    const messages = (${messagesLit} as Array<{ role: "user" | "assistant"; content: string }>).map((m) => ({
      role: m.role,
      content: {
        type: "text" as const,
        text: m.content.replace(/\\{\\{\\s*([a-zA-Z0-9_]+)\\s*\\}\\}/g, (_: string, key: string) => stringArgs[key] ?? ""),
      },
    }));
    return { description: ${JSON.stringify(prompt.description || prompt.title || prompt.name)}, messages };
  }
);
`;
}

function buildEnvExample(authSpec?: ExportAuthSpec | null, serverAuth?: Auth): string {
  const lines = ["# Copy to .env and fill in values", ""];
  if (serverAuth === "header") {
    lines.push("# Protects the MCP HTTP endpoint");
    lines.push("API_KEY=change-me");
    lines.push("");
  }
  const type = authSpec?.type || "none";
  if (type === "bearer") {
    lines.push("# Upstream API Bearer token");
    lines.push("API_TOKEN=");
  } else if (type === "apikey") {
    lines.push("# Upstream API key");
    lines.push("API_KEY=");
  } else if (type === "basic") {
    lines.push("API_USERNAME=");
    lines.push("API_PASSWORD=");
  } else if (type === "custom") {
    for (const key of Object.keys(authSpec?.config?.headers || {})) {
      lines.push(`AUTH_HEADER_${sanitizeIdent(key).toUpperCase()}=`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function buildReadme(
  projectName: string,
  transport: Transport,
  toolCount: number,
  promptCount: number
): string {
  return `# ${projectName}

Self-hosted MCP server generated by [MCPfy](https://mcpfy.ai) using [\`mcpfy-sdk\`](https://www.npmjs.com/package/mcpfy-sdk).

Includes **${toolCount}** tool(s) and **${promptCount}** prompt(s) exported from your MCPfy server.

## Setup

\`\`\`bash
npm install            # required before npm run dev (installs tsx + mcpfy-sdk)
cp .env.example .env   # fill in upstream API credentials
npm run dev            # default transport: ${transport}
\`\`\`

- \`npm run dev:http\` — HTTP on :3000 (override with \`--port 4000\` or \`PORT=4000\`)
- \`npm run dev:stdio\` — stdio (Claude Desktop / Cursor local)

## Cursor / Claude Desktop (stdio)

\`\`\`json
{
  "mcpServers": {
    "${projectName}": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/src/server.ts", "--stdio"]
    }
  }
}
\`\`\`

## Learn more

- [mcpfy-sdk docs](https://www.npmjs.com/package/mcpfy-sdk)
- Scaffold your own: \`npx create-mcpfy-app@latest\`
`;
}

/**
 * Generate a complete mcpfy-sdk project as path → file contents.
 * Paths use forward slashes; `.gitignore` is the final name (not `gitignore`).
 */
export function generateProjectFiles(options: GenerateProjectOptions): Record<string, string> {
  const projectName = toPackageName(options.projectName);
  const transport: Transport = options.transport || "http";
  const serverAuth: Auth = options.serverAuth || "none";
  const description = options.description || `Self-hosted MCP server for ${projectName}`;
  const tools = options.tools || [];
  const prompts = options.prompts || [];

  const transformers = tools.map(emitTransformer).filter(Boolean).join("\n");
  const toolBlocks = tools.map(emitToolRegistration).join("\n");
  const promptBlocks = prompts.map(emitPromptRegistration).join("\n");

  const serverTs = `import { MCPServer, text${AUTH_IMPORTS[serverAuth]} } from "mcpfy-sdk/server";
import { z } from "zod";

const server = new MCPServer({
  name: ${JSON.stringify(projectName)},
  version: "1.0.0",
  description: ${JSON.stringify(description)},${AUTH_CONFIGS[serverAuth]}
});

${emitOutboundAuthHelper(options.authSpec)}
${emitHttpHelpers()}
${transformers}
${toolBlocks}
${promptBlocks}
// Defaults to the transport chosen at export time (${transport}); pass --http or
// --stdio to override for a single run without touching this file.
const transport = process.argv.includes("--http")
  ? "http"
  : process.argv.includes("--stdio")
    ? "stdio"
    : ${JSON.stringify(transport)};

await server.listen(transport === "http" ? { transport: "http" } : { transport: "stdio" });
`;

  return {
    "package.json": PACKAGE_JSON.replace("{{PROJECT_NAME}}", projectName).replace(
      "{{DESCRIPTION}}",
      description.replace(/"/g, '\\"')
    ),
    "tsconfig.json": TSCONFIG,
    ".gitignore": GITIGNORE,
    ".env.example": buildEnvExample(options.authSpec, serverAuth),
    "README.md": buildReadme(projectName, transport, tools.length, prompts.length),
    "src/server.ts": serverTs,
  };
}
