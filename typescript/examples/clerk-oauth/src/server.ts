import { MCPServer, object, oauth } from "mcpfy-sdk/server";
import { z } from "zod";

const domain = process.env.CLERK_DOMAIN;
const secretKey = process.env.CLERK_SECRET_KEY;
const resource = process.env.MCP_URL ?? "http://localhost:3000/mcp";

if (!domain) {
  throw new Error("Missing required environment variable: CLERK_DOMAIN");
}

if (!secretKey) {
  throw new Error("Missing required environment variable: CLERK_SECRET_KEY");
}

const server = new MCPServer({
  name: "clerk-oauth",
  version: "1.0.0",
  description: "MCPfy example using Clerk OAuth authentication.",
  auth: oauth.clerk({
    domain,
    secretKey,
    resource,
  }),
});

server.tool(
  {
    name: "get-user-info",
    description: "Get information about the authenticated Clerk user.",
    outputSchema: z.object({
      user: z.unknown().nullable(),
      scopes: z.array(z.string()),
      clientId: z.string().nullable(),
    }),
  },
  async (_args, ctx) =>
    object({
      user: ctx.auth?.user ?? null,
      scopes: ctx.auth?.scopes ?? [],
      clientId: ctx.auth?.clientId ?? null,
    })
);

console.log("Starting MCP server...");
await server.listen({ transport: "http" });
console.log("MCP server started successfully");
