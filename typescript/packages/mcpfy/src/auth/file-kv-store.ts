import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { KVStore } from "./kv-store.js";

/**
 * `KVStore` implementation backed by one file per key on disk, under a
 * directory scoped to a single remote server (see `NodeOAuthClientProvider`).
 * Writes go through a tmp-file + rename so a crash mid-write can't corrupt
 * a previously-saved value.
 */
export class FileKVStore implements KVStore {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  private pathFor(key: string): string {
    return join(this.dir, `${key}.json`);
  }

  get(key: string): string | null {
    try {
      return readFileSync(this.pathFor(key), "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  set(key: string, value: string): void {
    const target = this.pathFor(key);
    const tmp = `${target}.${process.pid}.tmp`;
    writeFileSync(tmp, value, { mode: 0o600 });
    renameSync(tmp, target);
  }

  remove(key: string): void {
    try {
      rmSync(this.pathFor(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
}
