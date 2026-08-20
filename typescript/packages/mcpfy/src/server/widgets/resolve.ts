import { existsSync, statSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";
import { DEFAULT_WIDGETS_DIR, WIDGET_ENTRY_CANDIDATES } from "./types.js";

export interface ResolvedWidgetPaths {
  folder: string;
  entry: string;
  /** Basename used for `dist/widgets/<name>.html`. */
  outputName: string;
}

function looksLikePath(dir: string): boolean {
  return dir.includes("/") || dir.includes("\\") || dir.includes(".") || isAbsolute(dir);
}

export function resolveWidgetFolder(dir: string, widgetsDir = DEFAULT_WIDGETS_DIR, cwd = process.cwd()): string {
  if (isAbsolute(dir)) return dir;
  if (looksLikePath(dir)) return resolve(cwd, dir);
  return resolve(cwd, widgetsDir, dir);
}

export function resolveWidgetEntry(folder: string, entry?: string): string {
  if (entry) {
    const candidate = isAbsolute(entry) ? entry : join(folder, entry);
    if (!existsSync(candidate)) {
      throw new Error(`Widget entry not found: ${candidate}`);
    }
    return candidate;
  }

  for (const name of WIDGET_ENTRY_CANDIDATES) {
    const candidate = join(folder, name);
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    `No React entry found in "${folder}". Expected one of: ${WIDGET_ENTRY_CANDIDATES.join(", ")}.`
  );
}

export function resolveWidgetPaths(
  dir: string,
  options: { entry?: string; widgetsDir?: string; cwd?: string } = {}
): ResolvedWidgetPaths {
  const cwd = options.cwd ?? process.cwd();
  const folder = resolveWidgetFolder(dir, options.widgetsDir ?? DEFAULT_WIDGETS_DIR, cwd);

  if (!existsSync(folder) || !statSync(folder).isDirectory()) {
    throw new Error(
      `Widget folder "${folder}" does not exist. Create it with a React entry (${WIDGET_ENTRY_CANDIDATES.join(", ")}).`
    );
  }

  const entry = resolveWidgetEntry(folder, options.entry);
  if (!/\.(t|j)sx$/.test(entry)) {
    throw new Error(
      `Widget entry must be a React file (.tsx / .jsx), got "${entry}". Raw HTML is only supported on the deprecated server.widget() API.`
    );
  }

  const outputName = folder.split(sep).filter(Boolean).pop() ?? dir;
  return { folder, entry, outputName };
}
