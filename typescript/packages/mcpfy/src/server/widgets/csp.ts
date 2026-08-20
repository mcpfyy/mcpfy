import type { WidgetCsp } from "./types.js";

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function originFromUrl(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

/**
 * Public origins the widget iframe may call (`MCPFY_URL`, then `MCP_URL`).
 * Set these to the HTTPS origin clients use (ngrok, production), not 127.0.0.1.
 */
export function widgetPublicOrigins(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const origins: string[] = [];
  for (const key of ["MCPFY_URL", "MCP_URL"] as const) {
    const raw = env[key];
    if (!raw) continue;
    const origin = originFromUrl(raw);
    if (origin) origins.push(origin);
  }
  return unique(origins);
}

/**
 * Merge author CSP with the server's public origin. Omits CSP entirely when
 * neither the author nor `MCPFY_URL`/`MCP_URL` declared any domains — hosts
 * stay permissive for inline HTML/JS.
 */
export function mergeWidgetCsp(
  csp: WidgetCsp | undefined,
  env: NodeJS.ProcessEnv = process.env
): WidgetCsp | undefined {
  const extra = widgetPublicOrigins(env);
  if (!csp && extra.length === 0) return undefined;

  const connectDomains = unique([...(csp?.connectDomains ?? []), ...extra]);
  const resourceDomains = unique([...(csp?.resourceDomains ?? []), ...extra]);

  return {
    ...csp,
    ...(connectDomains.length > 0 ? { connectDomains } : {}),
    ...(resourceDomains.length > 0 ? { resourceDomains } : {}),
  };
}

/**
 * `Content-Security-Policy` for the widget HTML document (`connect-src` / `img-src`
 * from author CSP). Inline script and style are required for the bundled IIFE shell.
 */
export function widgetDocumentCsp(csp: WidgetCsp): string {
  const connect = unique(csp.connectDomains ?? []);
  const resources = unique(csp.resourceDomains ?? []);
  const img = resources.length > 0 ? resources.join(" ") : "'none'";
  return [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    `connect-src ${connect.length > 0 ? connect.join(" ") : "'none'"}`,
    `img-src ${img}`,
    `font-src ${img}`,
  ].join("; ");
}
