# Authentication

Read this file when the server needs to verify incoming access tokens over HTTP, or when an MCP client needs to complete an OAuth flow against a protected server.

## Two ways to protect a server

`AuthConfig` (the `auth` field of `MCPServerConfig`) has two shapes:

- `type: "oauth"` — full OAuth/JWT verification, exposes `.well-known/oauth-protected-resource` for client discovery. Use this for anything a general MCP client needs to authenticate against.
- `type: "header"` — a lighter option: `{ type: "header", verify: (token) => boolean | Promise<boolean> }`. No discovery metadata, just checks the bearer token yourself (e.g. against a static API key or a simple lookup). Use this for internal/simple deployments that don't need full OAuth discovery.

There is no `"jwt"` discriminant — JWT verification is what `type: "oauth"` with `jwksVerifier` does, not a separate type.

## Protecting an HTTP server (OAuth + JWKS)

```typescript
import { MCPServer, jwksVerifier } from "mcpfy-sdk/server";

const issuer = "https://auth.example.com";

const server = new MCPServer({
  name: "protected-server",
  version: "1.0.0",
  auth: {
    type: "oauth", // the only supported discriminant — "jwt" is rejected
    verifyToken: jwksVerifier({
      issuer,
      jwksUri: `${issuer}/.well-known/jwks.json`,
      audience: "my-mcp-server",
    }),
    authorizationServers: [issuer], // required whenever `auth` is set
  },
});

await server.listen({ transport: "http", port: 4000 });
```

`jwksVerifier({ issuer, jwksUri, audience })` validates a JWT's signature against the JWKS endpoint's public keys, and checks `issuer`/`audience` match the token.

Multiple trusted authorization servers can be listed:

```typescript
authorizationServers: ["https://auth.example.com", "https://login.example.com"]
```

An optional `resource` field overrides the resource identifier advertised in the discovery metadata (defaults to this server's own MCP URL) — only needed if that default is wrong for your deployment.

### Preset verifiers for common providers

For Auth0 or WorkOS, skip hand-building the `jwksVerifier` call:

```typescript
import { oauthAuth0Provider, oauthWorkOSProvider } from "mcpfy-sdk/server";

verifyToken: oauthAuth0Provider({ domain: "your-tenant.us.auth0.com", audience: "my-mcp-server" })
// or
verifyToken: oauthWorkOSProvider({ authKitDomain: "your-app.authkit.app", audience: "my-mcp-server" })
```

Both return the same `(token) => Promise<AuthInfo | null>` shape as `jwksVerifier`, so they drop straight into `auth.verifyToken`.

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

- **`type: "jwt"` rejected** — use `type: "oauth"`; there is no other discriminant.
- **"`authorizationServers` is missing"** — required any time `auth` is configured, even with a single issuer: `authorizationServers: [issuer]`.
- **Token verification fails** — check `issuer`, `jwksUri`, `audience`, token expiry, and signature match what the authorization server actually issued.
- **`/.well-known/oauth-protected-resource` not available** — `auth` isn't configured on the server, or isn't using the `oauth` shape above.
- **`new NodeOAuthClientProvider(...)` throws** — the constructor is private; use `NodeOAuthClientProvider.create({...})`.
- **`NodeOAuthClientProvider`/`ensureAuthorized` not found when imported from `mcpfy-sdk/client`** — they live in `mcpfy-sdk/auth`, a separate entry point from the client APIs.
- **`NodeOAuthClientProvider.create({...})` type error, missing `serverUrl`** — `serverUrl` is required (everything else on `NodeOAuthOptions` is optional).

## Security notes

- Use HTTPS in production; never send bearer tokens over plain HTTP.
- Set `issuer` and `audience` to the values actually issued by the authorization server, not placeholders.
- Keep private signing keys on the authorization server — the MCP server only ever needs the public JWKS.
