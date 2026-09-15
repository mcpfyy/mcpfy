function normalizePath(path: string): string {
  const normalized = `/${path.replace(/^\/+/, "")}`;
  return normalized === "/" ? normalized : normalized.replace(/\/+$/, "");
}

/** Validate and canonicalize an OAuth resource identifier. */
export function canonicalOAuthResource(
  value: string,
  mcpPath?: string,
): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("OAuth resource must be an absolute URL");
  }
  const loopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error(
      "OAuth resource must use HTTPS (HTTP is allowed only for loopback development)",
    );
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      "OAuth resource must not contain credentials, a query, or a fragment",
    );
  }
  if (mcpPath && normalizePath(url.pathname) !== normalizePath(mcpPath)) {
    throw new Error(
      `OAuth resource path must match the MCP path (${normalizePath(mcpPath)})`,
    );
  }
  url.pathname = normalizePath(url.pathname);
  return url.toString();
}
