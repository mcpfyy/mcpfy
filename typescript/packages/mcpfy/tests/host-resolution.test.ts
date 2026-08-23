import { afterEach, describe, expect, it } from "vitest";
import { MCPServer, parseHostFromArgv } from "../src/server/mcp-server.js";

const originalArgv = process.argv;
const originalHost = process.env.HOST;

function stubArgv(argv: string[]): void {
  process.argv = ["node", "server.js", ...argv];
}

afterEach(async () => {
  process.argv = originalArgv;
  if (originalHost === undefined) delete process.env.HOST;
  else process.env.HOST = originalHost;
});

describe("parseHostFromArgv", () => {
  it("reads --host VALUE", () => {
    expect(parseHostFromArgv(["node", "server.js", "--host", "0.0.0.0"])).toBe("0.0.0.0");
  });

  it("reads --host=VALUE", () => {
    expect(parseHostFromArgv(["node", "server.js", "--host=127.0.0.1"])).toBe("127.0.0.1");
  });

  it("last occurrence wins", () => {
    expect(parseHostFromArgv(["node", "server.js", "--host", "a", "--host=b", "--host", "c"])).toBe("c");
  });

  it("returns undefined when absent", () => {
    expect(parseHostFromArgv(["node", "server.js", "--port", "3000"])).toBeUndefined();
    expect(parseHostFromArgv([])).toBeUndefined();
  });

  it("does not swallow --hostless-style flags or consume a following flag as its value", () => {
    expect(parseHostFromArgv(["node", "server.js", "--host", "--stdio"])).toBe("--stdio");
  });
});

describe("http host resolution in listen()", () => {
  let server: MCPServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("defaults to localhost", async () => {
    stubArgv([]);
    server = new MCPServer({ name: "host-fixture", version: "1.0.0" });
    const info = await server.listen({ transport: "http", port: 0, silent: true });
    expect(info.host).toBe("localhost");
  });

  it("uses HOST env var when no explicit option or flag", async () => {
    stubArgv([]);
    process.env.HOST = "127.0.0.1";
    server = new MCPServer({ name: "host-fixture", version: "1.0.0" });
    const info = await server.listen({ transport: "http", port: 0, silent: true });
    expect(info.host).toBe("127.0.0.1");
  });

  it("prefers --host flag over HOST env var", async () => {
    stubArgv(["--host", "0.0.0.0"]);
    process.env.HOST = "127.0.0.1";
    server = new MCPServer({ name: "host-fixture", version: "1.0.0" });
    const info = await server.listen({ transport: "http", port: 0, silent: true });
    expect(info.host).toBe("0.0.0.0");
  });

  it("prefers explicit option over --host flag and env", async () => {
    stubArgv(["--host", "0.0.0.0"]);
    process.env.HOST = "127.0.0.1";
    server = new MCPServer({ name: "host-fixture", version: "1.0.0" });
    const info = await server.listen({ transport: "http", port: 0, host: "localhost", silent: true });
    expect(info.host).toBe("localhost");
  });

  it("actually binds and serves when HOST=0.0.0.0", async () => {
    stubArgv([]);
    process.env.HOST = "0.0.0.0";
    server = new MCPServer({ name: "host-fixture", version: "1.0.0" });
    const info = await server.listen({ transport: "http", port: 0, silent: true });
    expect(info.host).toBe("0.0.0.0");
    const res = await fetch(`http://127.0.0.1:${info.port}/mcp`);
    expect(typeof res.status).toBe("number");
  });

  it("ignores empty HOST env var", async () => {
    stubArgv([]);
    process.env.HOST = "";
    server = new MCPServer({ name: "host-fixture", version: "1.0.0" });
    const info = await server.listen({ transport: "http", port: 0, silent: true });
    expect(info.host).toBe("localhost");
  });
});
