import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { MCPServer } from "../src/server/mcp-server.js";
import { forwardAuthHeaders } from "../src/server/context.js";
import { object } from "../src/shared/response-helpers.js";
import { parseSseJson } from "./helpers.js";

describe("forwardAuthHeaders / requestHeaders", () => {
  let server: MCPServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("exposes allowlisted inbound headers on ctx and forwardAuthHeaders copies them", async () => {
    let seen: Record<string, string> | undefined;

    server = new MCPServer({ name: "fwd-fixture", version: "1.0.0" });
    server.tool(
      {
        name: "echo_auth",
        schema: z.object({}),
        outputSchema: z.object({ headers: z.record(z.string()) }),
      },
      async (_args, ctx) => {
        seen = forwardAuthHeaders(ctx);
        return object({ headers: seen });
      }
    );

    await server.listen({ transport: "http", port: 0, silent: true });
    const url = server.http!.url;

    const callBody = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "echo_auth", arguments: {} },
    });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: "Bearer upstream-secret",
        "x-api-key": "key-123",
      },
      body: callBody,
    });
    expect(res.status).toBe(200);

    const json = await parseSseJson<{
      result: { structuredContent: { headers: Record<string, string> } };
    }>(res);

    expect(json.result.structuredContent.headers).toEqual({
      Authorization: "Bearer upstream-secret",
      "x-api-key": "key-123",
    });
    expect(seen).toEqual({
      Authorization: "Bearer upstream-secret",
      "x-api-key": "key-123",
    });
  });

  it("forwardAuthHeaders returns empty when nothing was sent", async () => {
    expect(forwardAuthHeaders(undefined)).toEqual({});
    expect(forwardAuthHeaders({})).toEqual({});
    expect(forwardAuthHeaders({ requestHeaders: {} })).toEqual({});
  });

  it("forwardAuthHeaders falls back to auth.token", () => {
    expect(forwardAuthHeaders({ auth: { claims: {}, token: "t" } })).toEqual({
      Authorization: "Bearer t",
    });
  });
});
