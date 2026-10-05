import { z } from "zod";

export const DEMO_ORDER_IDS = ["MCP-1001", "MCP-1002", "MCP-1003"] as const;

export const orderSchema = z.object({
  orderId: z.string(),
  item: z.string(),
  total: z.string(),
  status: z.enum(["processing", "shipped", "delivered"]),
  delivery: z.string(),
  steps: z.array(z.object({
    label: z.string(),
    status: z.enum(["completed", "current", "pending"]),
  })),
});

export type Order = z.infer<typeof orderSchema>;
