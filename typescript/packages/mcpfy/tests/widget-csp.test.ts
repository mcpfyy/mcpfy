import { afterEach, describe, expect, it } from "vitest";
import { mergeWidgetCsp, widgetDocumentCsp, widgetPublicOrigins } from "../src/server/widgets/csp.js";
import { wrapIifeHtml } from "../src/server/widgets/html-shell.js";

describe("widget CSP public origin merge", () => {
  const originalFy = process.env.MCPFY_URL;
  const originalMcp = process.env.MCP_URL;

  afterEach(() => {
    if (originalFy === undefined) delete process.env.MCPFY_URL;
    else process.env.MCPFY_URL = originalFy;
    if (originalMcp === undefined) delete process.env.MCP_URL;
    else process.env.MCP_URL = originalMcp;
  });

  it("omits CSP when the author did not set one and no public URL is configured", () => {
    delete process.env.MCPFY_URL;
    delete process.env.MCP_URL;
    expect(mergeWidgetCsp(undefined)).toBeUndefined();
  });

  it("injects MCPFY_URL origin into connect and resource domains", () => {
    const merged = mergeWidgetCsp(
      { connectDomains: ["https://api.example.com"] },
      { MCPFY_URL: "https://my-app.example.com/mcp" }
    );
    expect(merged?.connectDomains).toEqual([
      "https://api.example.com",
      "https://my-app.example.com",
    ]);
    expect(merged?.resourceDomains).toEqual(["https://my-app.example.com"]);
  });

  it("emits CSP from MCPFY_URL alone so the widget can fetch the MCP origin", () => {
    expect(widgetPublicOrigins({ MCPFY_URL: "https://tunnel.example/mcp" })).toEqual([
      "https://tunnel.example",
    ]);
    const merged = mergeWidgetCsp(undefined, { MCPFY_URL: "https://tunnel.example/mcp" });
    expect(merged?.connectDomains).toEqual(["https://tunnel.example"]);
  });

  it("emits a document CSP string from connectDomains", () => {
    expect(widgetDocumentCsp({ connectDomains: ["https://api.example.com"] })).toContain(
      "connect-src https://api.example.com"
    );
  });

  it("writes connect-src into the widget HTML shell", () => {
    delete process.env.MCPFY_URL;
    delete process.env.MCP_URL;
    const html = wrapIifeHtml("void 0", "", { connectDomains: ["https://api.example.com"] });
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("connect-src https://api.example.com");
  });
});
