import { MCPServer, object{{AUTH_IMPORT}} } from "mcpfy-sdk/server";
import { z } from "zod";

const server = new MCPServer({
  name: "{{PROJECT_NAME}}",
  version: "1.0.0",
  description: "An MCP server with a React weather widget.",
  // HTTP only. MCP endpoint path; defaults to /mcp (this example: http://localhost:3000/weather)
  basePath: "/weather",
  // Shown to MCP clients. Remote URL, data: URI, or a local file path (e.g. "./src/icon.svg" or "file:///abs/path/icon.png")
  icon: "https://mcpfy.ai/images/mcpfy-fav-icon-min.png",{{AUTH_CONFIG}}
});

server.tool(
  {
    name: "weather",
    description: "Look up the current temperature for a city",
    schema: z.object({ city: z.string().default("San Francisco") }),
    outputSchema: z.object({
      city: z.string(),
      temperatureC: z.number(),
    }),
    widget: {
      // React UI lives in this folder: src/widgets/weather/
      dir: "weather",
      // If this React UI fetch()es another origin (instead of useCallTool), list it here
      // so ChatGPT, Claude, and the MCPfy Inspector allow the request.
      // Prefer fetching in the tool handler below. Skip CSP when the UI only uses callTool.
      // csp: { connectDomains: ["https://api.example.com"] },
    },
  },
  // Fetch an external API inside the tool handler (Node).
  async ({ city }) => {
    const geo = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`
    ).then((r) => r.json() as Promise<{ results?: Array<{ name: string; latitude: number; longitude: number }> }>);
    const place = geo.results?.[0];
    if (!place) throw new Error(`No location found for "${city}"`);

    const forecast = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m`
    ).then((r) => r.json() as Promise<{ current?: { temperature_2m: number } }>);
    const temperatureC = forecast.current?.temperature_2m;
    if (temperatureC == null) throw new Error("No temperature returned");

    return object({ city: place.name, temperatureC });
  }
);

const transport = process.argv.includes("--http")
  ? "http"
  : process.argv.includes("--stdio")
    ? "stdio"
    : "{{DEFAULT_TRANSPORT}}";

await server.listen(transport === "http" ? { transport: "http" } : { transport: "stdio" });
