# Authentication

Read this file when the server needs to verify incoming access tokens over HTTP, or when an MCP client needs to complete an OAuth flow against a protected server.

## Table of contents

- [Authentication](#authentication)
  - [Table of contents](#table-of-contents)
  - [Two ways to protect a server](#two-ways-to-protect-a-server)
  - [Protecting an HTTP server (OAuth + JWKS)](#protecting-an-http-server-oauth--jwks)
    - [Preset verifiers for common providers](#preset-verifiers-for-common-providers)
    - [What this unlocks](#what-this-unlocks)
    - [Request flow](#request-flow)
  - [Forwarding auth headers to upstream services](#forwarding-auth-headers-to-upstream-services)
  - [Client-side OAuth (connecting to a protected server)](#client-side-oauth-connecting-to-a-protected-server)
  - [Troubleshooting](#troubleshooting)
  - [Security notes](#security-notes)

## Two ways to protect a server

`AuthConfig` (the `auth` field of `MCPServerConfig`) has two shapes:

- `type: "oauth"` — full OAuth/JWT verification, exposes `.well-known/oauth-protected-resource` for client discovery. Use this for anything a general MCP client needs to authenticate against.
- `type: "header"` — a lighter option: `{ type: "header", verify: (token) => boolean | Promise<boolean> }`. No discovery metadata, just checks the bearer token yourself (e.g. against a static API key or a simple lookup). Use this for internal/simple deployments that don't need full OAuth discovery.

There is no `"jwt"` discriminant — JWT verification is what `type: "oauth"` with `jwksVerifier` does, not a separate type.

## Protecting an HTTP server (OAuth + JWKS)

```typescript
import { MCPServer, oauth } from "mcpfy-sdk/server";

const server = new MCPServer({
  name: "protected-server",
  version: "1.0.0",
  auth: oauth.auth0({
    domain: process.env.AUTH0_DOMAIN!,
  }),
});

await server.listen({ transport: "http", port: 4000 });
```

Set `MCP_URL` to the exact canonical public MCP endpoint, such as `https://example.com/mcp`. Provider configuration fails fast when neither `resource` nor `MCP_URL` is present. Legacy `MCPFY_MCP_URL` and `MCPFY_URL` variables remain compatibility fallbacks.

Provider helpers configure discovery, JWT verification, resource binding, scopes, and typed `ctx.auth.user` data together:

```typescript
oauth.auth0({ domain: "tenant.us.auth0.com" })
oauth.clerk({ domain: "instance.clerk.accounts.dev", audience: "optional-audience" })
oauth.workos({ authKitDomain: "app.authkit.app" })
oauth.supabase({ projectId: "project-id" })
oauth.betterAuth({ authUrl: "https://auth.example.com" })
oauth.keycloak({ serverUrl: "https://id.example.com", realm: "my-realm" })
```

All helpers accept `resource`, `requiredScopes`, `scopesSupported`, and `resourceName`. `oauth.clerk` verifies JWT access tokens from Clerk's JWKS and does not require a Clerk secret key.

For another standards-based JWT issuer, use `oauth.jwt`:

```ts
auth: oauth.jwt({
  issuer: "https://auth.example.com",
  jwksUri: "https://auth.example.com/.well-known/jwks.json",
})
```

Use `oauth.custom` only when the provider needs a custom `verifyToken`; it requires explicit `authorizationServers`. There is no `"jwt"` auth discriminant.

### What this unlocks

When `auth` is configured, mcpfy automatically exposes protected-resource metadata at:

```text
/.well-known/oauth-protected-resource
```

Don't hand-write this route — it's activated by the `auth` config, not a manual endpoint.

### Request flow

```text
MCP Client --Authorization: Bearer <token>--> MCP HTTP Server
                                                  │ verifyToken()
                                    Invalid ──────┼────── Valid
                                  (rejected)              │
                                                     Tool / Resource
```

The authorization server issues tokens; the mcpfy server only validates them via `verifyToken`.

## Forwarding auth headers to upstream services

When a tool needs to make an authenticated request to another API using the caller's inbound auth, use the SDK's allowlisted forwarding helpers instead of copying all headers:

```typescript
import type { IncomingMessage } from "node:http";
import { extractForwardableAuthHeaders, forwardAuthHeaders } from "mcpfy-sdk/server";

async function fetchUpstream(request: IncomingMessage) {
  const requestHeaders = extractForwardableAuthHeaders(request);
  return fetch("https://api.example.com/data", {
    headers: forwardAuthHeaders({ requestHeaders }),
  });
}
```

Inside a tool callback, use the context instead of the raw request:

```typescript
import type { ToolContext } from "mcpfy-sdk/server";

async function fetchWithContext(ctx: Pick<ToolContext, "requestHeaders" | "auth">) {
  return fetch("https://api.example.com/data", { headers: forwardAuthHeaders(ctx) });
}
```

`FORWARDABLE_AUTH_HEADER_NAMES` (also exported from `mcpfy-sdk/server`) lists exactly which header names are allowed through. Never forward arbitrary inbound headers upstream.

## Client-side OAuth (connecting to a protected server)

Import from `mcpfy-sdk/auth` — **not** `mcpfy-sdk/client**, which doesn't export these:

```typescript
import { NodeOAuthClientProvider, ensureAuthorized } from "mcpfy-sdk/auth";

// Constructor is private — always use the static factory. `serverUrl` is required;
// it's used to derive an isolated token-storage directory and the DCR client name's scope.
const provider = await NodeOAuthClientProvider.create({
  serverUrl: "https://example.com/mcp",
  clientName: "my-app",       // optional
  scope: "read write",        // optional
  portRange: [8090, 8099],    // optional — loopback redirect port range, this is the default
  dataDir: undefined,         // optional — override token-storage root (default ~/.mcpfy/oauth)
  onAuthorizationUrl: (url) => console.log("Open this to authorize:", url), // optional — default opens the OS browser
});

const serverUrl = "https://example.com/mcp";
await ensureAuthorized(provider, serverUrl); // both provider and target URL are required; drives PKCE + DCR + token exchange via a local loopback server
```

Call `ensureAuthorized` once before `client.createSession(...)` for any server whose config uses this `provider`.

Then use the provider with `MCPClient` (see client.md):

```typescript
const client = new MCPClient({
  mcpServers: {
    protectedServer: {
      url: "https://example.com/mcp",
      authProvider: provider,
    },
  },
});
```

## Troubleshooting

- **`type: "jwt"` rejected** — use an `oauth.*` helper or a complete `type: "oauth"` config.
- **"OAuth resource is required"** — set `MCP_URL` to the canonical public MCP endpoint or pass `resource` to the helper.
- **"`authorizationServers` is missing"** — use a provider helper, or add it to a raw/custom OAuth configuration.
- **Token verification fails** — check `issuer`, `jwksUri`, `audience`, token expiry, and signature match what the authorization server actually issued.
- **`/.well-known/oauth-protected-resource` not available** — `auth` isn't configured on the server, or isn't using the `oauth` shape above.
- **`new NodeOAuthClientProvider(...)` throws** — the constructor is private; use `NodeOAuthClientProvider.create({...})`.
- **`NodeOAuthClientProvider`/`ensureAuthorized` not found when imported from `mcpfy-sdk/client`** — they live in `mcpfy-sdk/auth`, a separate entry point from the client APIs.
- **`NodeOAuthClientProvider.create({...})` type error, missing `serverUrl`** — `serverUrl` is required (everything else on `NodeOAuthOptions` is optional).

## Security notes

- Use HTTPS in production; never send bearer tokens over plain HTTP.
- Set `issuer` and `audience` to the values actually issued by the authorization server, not placeholders.
- Keep private signing keys on the authorization server — the MCP server only ever needs the public JWKS.
