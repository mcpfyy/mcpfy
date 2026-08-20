import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

for (const name of ["template", "template-widget"]) {
  const src = join(root, name);
  const dest = join(root, "dist", name);
  if (!existsSync(src)) {
    throw new Error(`Missing ${src}`);
  }
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true });
  console.log(`Copied ${name}/ -> ${dest}`);
}
