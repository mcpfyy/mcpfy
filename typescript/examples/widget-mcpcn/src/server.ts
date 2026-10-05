import { MCPServer, object } from "mcpfy-sdk/server";
import { z } from "zod";
import { DEMO_ORDER_IDS, orderSchema, type Order } from "./order.js";

const server = new MCPServer({
  name: "widget-mcpcn",
  version: "1.0.0",
  description: "An order-tracking MCP App built with mcpcn React components.",
  basePath: "/mcp",
});

// Local fixtures keep this example runnable without API keys or external services.
const orders: Record<string, Omit<Order, "orderId" | "steps"> & { stage: number }> = {
  "MCP-1001": {
    item: "Everyday backpack",
    total: "$79.00",
    status: "shipped",
    delivery: "On the way · arrives in 2–3 business days",
    stage: 2,
  },
  "MCP-1002": {
    item: "Ceramic coffee mug",
    total: "$24.00",
    status: "processing",
    delivery: "Being packed · dispatches in 1 business day",
    stage: 1,
  },
  "MCP-1003": {
    item: "Wireless headphones",
    total: "$149.00",
    status: "delivered",
    delivery: "Delivered · left at the front door",
    stage: 3,
  },
};

server.tool(
  {
    name: "track_order",
    description: `Track a demo order and show its status in an interactive mcpcn widget. Available IDs: ${DEMO_ORDER_IDS.join(", ")}.`,
    schema: z.object({
      orderId: z.string().trim().min(1).transform((value) => value.toUpperCase()).default("MCP-1001"),
    }),
    outputSchema: orderSchema,
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    widget: { dir: "order-tracker" },
  },
  async ({ orderId }) => {
    const order = Object.hasOwn(orders, orderId) ? orders[orderId] : undefined;
    if (!order) {
      throw new Error(`Order "${orderId}" was not found. Try ${DEMO_ORDER_IDS.join(", ")}.`);
    }
    const { stage, ...details } = order;
    const steps: Order["steps"] = ["Placed", "Packed", "Shipped", "Delivered"].map((label, index) => ({
      label,
      status: index < stage || order.status === "delivered"
        ? "completed"
        : index === stage ? "current" : "pending",
    }));
    return object({ orderId, ...details, steps });
  }
);

await server.listen({ transport: process.argv.includes("--http") ? "http" : "stdio" });
