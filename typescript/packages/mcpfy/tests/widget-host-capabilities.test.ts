import { describe, expect, it } from "vitest";
import { deriveHostCapabilities } from "../src/widget-react/host-capabilities.js";

describe("deriveHostCapabilities", () => {
  it("exposes ChatGPT host methods and not view tools", () => {
    const caps = deriveHostCapabilities({
      protocol: "apps-sdk",
      openai: {
        callTool: async () => undefined,
        sendFollowUpMessage: async () => undefined,
        openExternal: () => undefined,
        requestDisplayMode: async () => ({ mode: "inline" }),
      },
    });
    expect(caps).toMatchObject({
      callTool: true,
      sendFollowUp: true,
      openExternal: true,
      viewTools: false,
      modelContext: false,
    });
    expect(caps.displayModes).toContain("fullscreen");
  });

  it("gates MCP Apps follow-up / links / model context on host advertisements", () => {
    const caps = deriveHostCapabilities({
      protocol: "mcp-apps",
      host: {
        message: {},
        openLinks: {},
        updateModelContext: { text: {} },
      },
      availableDisplayModes: ["inline"],
    });
    expect(caps).toEqual({
      callTool: true,
      sendFollowUp: true,
      openExternal: true,
      viewTools: true,
      modelContext: true,
      displayModes: ["inline"],
    });
  });

  it("treats MCP-UI postMessage actions as available without view tools", () => {
    expect(deriveHostCapabilities({ protocol: "mcp-ui" }).viewTools).toBe(false);
    expect(deriveHostCapabilities({ protocol: "mcp-ui" }).callTool).toBe(true);
  });
});
