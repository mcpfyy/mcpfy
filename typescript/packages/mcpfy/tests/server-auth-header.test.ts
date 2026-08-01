import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { MCPServer } from "../src/server/mcp-server.js";
import { object } from "../src/shared/response-helpers.js";
import { parseSseJson } from "./helpers.js";

describe("header auth", () => {
  let server: MCPServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("rejects requests without a token, rejects wrong tokens, accepts the right one", async () => {
    server = new MCPServer({
      name: "auth-fixture",
      version: "1.0.0",
      auth: { type: "header", verify: (token) => token === "correct-token" },
    });
    server.tool(
      { name: "whoami", schema: z.object({}), outputSchema: z.object({ authenticated: z.boolean() }) },
      async (_args, ctx) => object({ authenticated: ctx.auth !== undefined })
    );

    const port = 34000 + Math.floor(Math.random() * 1000);
    await server.listen({ transport: "http", port });
    const url = `http://localhost:${port}/mcp`;
    const rpcBody = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    });

    const noAuth = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: rpcBody,
    });
    expect(noAuth.status).toBe(401);

    const wrongAuth = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: "Bearer wrong-token",
      },
      body: rpcBody,
    });
    expect(wrongAuth.status).toBe(401);

    const rightAuth = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: "Bearer correct-token",
      },
      body: rpcBody,
    });
    expect(rightAuth.status).toBe(200);

    const callBody = JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "whoami", arguments: {} },
    });
    const callRes = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: "Bearer correct-token",
      },
      body: callBody,
    });
    const callJson = await parseSseJson<{ result: { structuredContent: { authenticated: boolean } } }>(callRes);
    expect(callJson.result.structuredContent).toEqual({ authenticated: true });
  });
});
