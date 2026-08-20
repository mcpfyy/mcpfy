import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveServerIcon } from "../src/server/icon.js";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#0ea5e9"/></svg>`;

describe("resolveServerIcon", () => {
  it("leaves http(s) and data URIs unchanged", () => {
    expect(resolveServerIcon("https://example.com/icon.png")).toEqual({
      src: "https://example.com/icon.png",
    });
    expect(resolveServerIcon("data:image/png;base64,aaa")).toEqual({
      src: "data:image/png;base64,aaa",
    });
  });

  it("inlines a local file as a data URI", () => {
    const dir = join(tmpdir(), `mcpfy-icon-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, "icon.svg");
    writeFileSync(filePath, SVG);

    const resolved = resolveServerIcon("./icon.svg", dir);
    expect(resolved.mimeType).toBe("image/svg+xml");
    expect(resolved.src).toMatch(/^data:image\/svg\+xml;base64,/);
    const decoded = Buffer.from(resolved.src.split(",")[1]!, "base64").toString("utf8");
    expect(decoded).toBe(SVG);
  });

  it("inlines a file: URL", () => {
    const dir = join(tmpdir(), `mcpfy-icon-file-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, "icon.svg");
    writeFileSync(filePath, SVG);

    const resolved = resolveServerIcon(pathToFileURL(filePath).href);
    expect(resolved.src.startsWith("data:image/svg+xml;base64,")).toBe(true);
  });

  it("throws when the file is missing", () => {
    expect(() => resolveServerIcon("./missing.png", tmpdir())).toThrow(/Failed to read icon file/);
  });
});
