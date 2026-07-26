import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MCPServer, object } from "mcpfy-sdk/server";
import { z } from "zod";

const here = dirname(fileURLToPath(import.meta.url));
const widgetHtml = readFileSync(join(here, "widget.html"), "utf-8");

const server = new MCPServer({
  name: "widget-hello-world",
  version: "1.0.0",
  description: "A single widget, registered for MCP-UI, MCP Apps, and Apps SDK at once.",
});

let count = 0;

server.widget({ name: "counter", description: "A counter widget", content: { type: "html", html: widgetHtml } }, async () =>
  object({ count })
);

server.tool(
  { name: "increment-counter", description: "Increment the counter the widget displays", schema: z.object({}) },
  async () => object({ count: ++count })
);

const useHttp = process.argv.includes("--http");
await server.listen(useHttp ? { transport: "http", port: 3000 } : { transport: "stdio" });
