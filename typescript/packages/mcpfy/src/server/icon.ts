import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface ServerIcon {
  src: string;
  mimeType?: string;
  sizes?: string[];
  theme?: "light" | "dark";
}

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
};

function looksLikeRemoteUri(src: string): boolean {
  if (src.startsWith("data:")) return true;
  if (src.startsWith("file:")) return false;
  return /^[a-z][a-z0-9+.-]*:/i.test(src);
}

function mimeFromPath(filePath: string, explicit?: string): string {
  if (explicit) return explicit;
  return MIME_BY_EXT[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function fileToDataUri(filePath: string, mimeType: string): string {
  const bytes = readFileSync(filePath);
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

function resolveLocalPath(src: string, cwd: string): string {
  if (src.startsWith("file:")) {
    return fileURLToPath(src);
  }
  return resolve(cwd, src);
}

/** HTTP/HTTPS/`data:` URIs are left as-is. Local paths and `file:` URLs are inlined as `data:` URIs. */
export function resolveServerIcon(icon: string | ServerIcon, cwd = process.cwd()): ServerIcon {
  const input: ServerIcon = typeof icon === "string" ? { src: icon } : { ...icon };
  if (looksLikeRemoteUri(input.src)) return input;

  const filePath = resolveLocalPath(input.src, cwd);
  let dataUri: string;
  try {
    dataUri = fileToDataUri(filePath, mimeFromPath(filePath, input.mimeType));
  } catch (err) {
    const hint = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read icon file "${input.src}" (resolved: ${filePath}): ${hint}`);
  }

  return {
    ...input,
    src: dataUri,
    mimeType: input.mimeType ?? mimeFromPath(filePath),
  };
}

export function resolveServerIcons(
  icon: string | ServerIcon | undefined,
  cwd = process.cwd()
): ServerIcon[] | undefined {
  if (!icon) return undefined;
  return [resolveServerIcon(icon, cwd)];
}
