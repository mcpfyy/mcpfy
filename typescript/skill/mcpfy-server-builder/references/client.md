# Client

Read this file when the task is to *connect to* an MCP server (this project's own server, or a third-party one) rather than build one.

```typescript
import { MCPClient } from "mcpfy-sdk/client";
```
## Table of contents

- [Client](#client)
  - [Table of contents](#table-of-contents)
  - [Configuring servers](#configuring-servers)
    - [HTTP auth variants](#http-auth-variants)
  - [Sessions](#sessions)
  - [Using a session](#using-a-session)
  - [Connectors (transport-level control)](#connectors-transport-level-control)
  - [Complete example](#complete-example)


## Configuring servers

```typescript
const client = new MCPClient({
  mcpServers: {
    calculator: { command: "node", args: ["calculator-server.js"] }, // stdio
    weather: { url: "http://localhost:3000/mcp" },                  // HTTP
  },
});
```

`ServerConfig` is a discriminated union — stdio config (`command`, `args?`, `env?`, `cwd?`) or HTTP config (`url`, `headers?`, `authToken?`, `authProvider?`). The client infers the transport from which shape is present. There is no `transport` field to set manually.

### HTTP auth variants

```typescript
{ url: "https://example.com/mcp", headers: { "X-API-Key": "your-api-key" } }
{ url: "https://example.com/mcp", authToken: "your-access-token" } // sends "Authorization: Bearer ..."
{ url: "https://example.com/mcp", authProvider: oauthProvider }    // see auth.md
```

## Sessions

```typescript
const session = await client.createSession("calculator");
```

Steps performed: check for an existing session → look up config → create the right connector → connect → wrap in `MCPSession` → store → return. Calling `createSession` again for the same name reuses the existing session rather than reconnecting.

Create every configured server's session at once:

```typescript
const sessions = await client.createAllSessions(); // concurrent; keyed by server name
const weather = sessions.weather;
```

Look up without creating:

```typescript
const session = client.getSession("calculator"); // MCPSession | undefined
```

Close everything when done — always in a `finally`:

```typescript
try {
  const session = await client.createSession("calculator");
  const result = await session.callTool("add", { a: 10, b: 20 });
} finally {
  await client.closeAllSessions();
}
```

## Using a session

```typescript
const tools = await session.listTools();
const result = await session.callTool("add", { a: 10, b: 20 });

const prompts = await session.listPrompts();
const prompt = await session.getPrompt("summarize", { topic: "artificial intelligence" });

const resources = await session.listResources();
const contents = await session.readResource("file:///example/data.txt");

await session.close(); // close just this one session
```

## Connectors (transport-level control)

Usually unnecessary — `MCPClient` picks the right connector automatically. Use these directly only when transport-level control is genuinely needed:

```typescript
import { StdioConnector, HttpConnector, createConnectorFromConfig } from "mcpfy-sdk/client";

new StdioConnector({ command: "node", args: ["server.js"] });
new HttpConnector({ url: "http://localhost:3000/mcp" });

// or let the SDK choose based on shape:
createConnectorFromConfig({ command: "node", args: ["server.js"] }); // -> StdioConnector
createConnectorFromConfig({ url: "http://localhost:3000/mcp" });     // -> HttpConnector
```

## Complete example

```typescript
import { MCPClient } from "mcpfy-sdk/client";

const client = new MCPClient({
  mcpServers: { calculator: { command: "node", args: ["calculator-server.js"] } },
});

try {
  const session = await client.createSession("calculator");
  for (const tool of await session.listTools()) console.log(`- ${tool.name}`);
  console.log(await session.callTool("add", { a: 10, b: 20 }));
} finally {
  await client.closeAllSessions();
}
```
