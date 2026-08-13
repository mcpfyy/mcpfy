import type { IncomingMessage, ServerResponse } from "node:http";

const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

export interface HttpSecurityOptions {
  port: number;
  host: string;
  allowedHosts?: string[];
  allowedOrigins?: string[];
}

export function deriveBaseUrl(req: IncomingMessage, options: Pick<HttpSecurityOptions, "port" | "host">): string {
  const forwardedProto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0];
  const proto = forwardedProto === "https" ? "https" : "http";
  return `${proto}://${req.headers.host ?? `${options.host}:${options.port}`}`;
}

export function validateRequestHeaders(
  req: IncomingMessage,
  res: ServerResponse,
  options: HttpSecurityOptions
): boolean {
  const isLoopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(options.host.toLowerCase());
  const allowedHosts =
    options.allowedHosts ?? (isLoopback ? LOOPBACK_HOSTS.flatMap((host) => [host, `${host}:${options.port}`]) : []);
  const allowedOrigins =
    options.allowedOrigins ??
    (isLoopback ? LOOPBACK_HOSTS.flatMap((host) => [`http://${host}`, `http://${host}:${options.port}`]) : []);
  const includes = (values: string[], value?: string) =>
    value !== undefined && values.some((allowed) => allowed.toLowerCase() === value.toLowerCase());
  const origin = req.headers.origin;

  if (
    (allowedHosts.length > 0 && !includes(allowedHosts, req.headers.host)) ||
    (allowedOrigins.length > 0 && origin !== undefined && !includes(allowedOrigins, origin))
  ) {
    res.writeHead(403, { "content-type": "application/json" }).end(
      JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Forbidden" }, id: null })
    );
    return false;
  }
  return true;
}
