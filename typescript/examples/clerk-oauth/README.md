# Clerk OAuth

This example shows how to protect an MCP server with Clerk OAuth using the built-in `oauth.clerk()` provider in `mcpfy-sdk`.

## Prerequisites

- Node.js
- pnpm
- A Clerk application configured for OAuth

## Configuration

Create a local `.env` file from `.env.example`.

Then configure:

```env
CLERK_DOMAIN=https://your-instance.clerk.accounts.dev
MCP_URL=http://localhost:3000/mcp
```

If your Clerk OAuth access tokens include an audience, also set `CLERK_AUDIENCE` to the expected value.

When `CLERK_AUDIENCE` is not set, MCPfy validates tokens using the Clerk issuer
and accepts issuer-bound access tokens. Use a Clerk instance dedicated to this
MCP server or configure an audience to keep the trust boundary narrow.

## Clerk OAuth setup

In the Clerk Dashboard, configure OAuth for the instance and make sure the
OAuth consent flow is enabled.

Prefer Client ID Metadata Documents (CIMD) when your MCP client supports them,
and explicitly allow the client. Enable Dynamic Client Registration (DCR) only
when the client does not support CIMD and requires DCR.

## Run

From the repository root:

```bash
pnpm --dir ./typescript install
pnpm --dir ./typescript --filter @mcpfy-examples/clerk-oauth start
```

The MCP server starts over HTTP.

Connect an OAuth-capable MCP client to:

```text
http://localhost:3000/mcp
```

Use the deployed server's HTTPS MCP URL in production.

## How it works

The server configures Clerk as its OAuth authorization server:

```ts
auth: oauth.clerk({
  domain,
  audience: process.env.CLERK_AUDIENCE,
})
```

MCPfy validates incoming Clerk JWT access tokens against the instance's JWKS endpoint and issuer. When configured, it also validates the audience.

The example exposes an authenticated `get-user-info` tool. The tool reads authentication information from the MCPfy request context:

```ts
ctx.auth?.user
ctx.auth?.scopes
ctx.auth?.clientId
```

A valid Clerk OAuth access token results in authentication information being available through `ctx.auth`. Invalid or expired tokens are rejected.

## Resource URL

`MCP_URL` identifies the canonical MCP resource protected by this OAuth configuration.

For local development:

```env
MCP_URL=http://localhost:3000/mcp
```

For a deployed server, use the server's public HTTPS MCP endpoint.

## Notes

This example demonstrates the MCP server-side OAuth configuration and token verification. A complete end-to-end OAuth flow also requires an OAuth-capable MCP client and the Clerk OAuth setup above.
