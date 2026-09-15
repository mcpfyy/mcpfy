# Clerk OAuth

This example shows how to protect an MCP server with Clerk OAuth using the built-in `oauth.clerk()` provider in `mcpfy-sdk`.

## Prerequisites

- Node.js
- pnpm
- A Clerk application configured for OAuth
- A Clerk Backend API secret key

## Configuration

Create a local `.env` file from `.env.example`.

Then configure:

```env
CLERK_DOMAIN=https://your-instance.clerk.accounts.dev
CLERK_SECRET_KEY=your-clerk-secret-key
MCP_URL=http://localhost:3000/mcp
```

`CLERK_SECRET_KEY` is a server-side secret and must not be exposed to MCP clients or committed to source control.

## Run

From the repository root:

```bash
pnpm --dir ./typescript install
pnpm --dir ./typescript --filter @mcpfy-examples/clerk-oauth start
```

The MCP server starts over HTTP.

## How it works

The server configures Clerk as its OAuth authorization server:

```ts
auth: oauth.clerk({
  domain,
  secretKey,
  resource,
})
```

MCPfy uses Clerk's OAuth-specific access-token verification to validate incoming bearer tokens.

The example exposes an authenticated `get-user-info` tool. The tool reads authentication information from the MCPfy request context:

```ts
ctx.auth?.user
ctx.auth?.scopes
ctx.auth?.clientId
```

A valid Clerk OAuth access token results in authentication information being available through `ctx.auth`. Invalid, expired, revoked, or non-OAuth Clerk session tokens are rejected.

## Resource URL

`MCP_URL` identifies the canonical MCP resource protected by this OAuth configuration.

For local development:

```env
MCP_URL=http://localhost:3000/mcp
```

For a deployed server, use the server's public HTTPS MCP endpoint.

## Notes

This example demonstrates the MCP server-side OAuth configuration and token verification. A complete end-to-end OAuth flow also requires an OAuth-capable MCP client and a corresponding Clerk OAuth setup.
