# API Spec + Widget + Transformer Example

This example shows how a deployed MCPfy tool combines:

1. **API spec** — HTTP request configuration
2. **Response transformer** — shapes raw API output into widget-friendly JSON
3. **MCP UI widget** — HTML rendered in Claude / ChatGPT via MCP Apps

## apiSpec shape (stored in MongoDB)

```json
{
  "toolName": "listUsers",
  "description": "List users from the API",
  "request": {
    "type": "get",
    "url": "https://api.example.com/users",
    "headers": {},
    "pathParams": {},
    "queryParams": {},
    "bodyInput": {}
  },
  "responseTransformer": {
    "enabled": true,
    "language": "javascript",
    "code": "function transform(apiResponse) {\n  const users = apiResponse.data?.users || [];\n  return { items: users.map(u => ({ name: u.name, email: u.email })) };\n}"
  },
  "widget": {
    "enabled": true,
    "content": {
      "type": "html",
      "html": "<!doctype html><html><body><table id=\"t\"></table><script>function render(d){const rows=d?.items||[];document.getElementById('t').innerHTML=rows.map(r=>'<tr><td>'+r.name+'</td><td>'+r.email+'</td></tr>').join('');}window.addEventListener('message',e=>{if(e.data?.method==='ui/notifications/tool-result')render(e.data.params.structuredContent);});</script></body></html>"
    },
    "protocols": ["mcp-apps", "mcp-ui"]
  }
}
```

## Runtime flow

1. Host calls `listUsers` tool
2. MCP-backend executes `GET https://api.example.com/users`
3. Transformer returns `{ items: [...] }`
4. Tool result includes `structuredContent: { items: [...] }`
5. Host fetches `ui://{mcpServerId}/listUsers/mcp-apps.html` and renders the table widget

See `widget-hello-world` for a standalone MCP server widget example using mcpfy-sdk.
