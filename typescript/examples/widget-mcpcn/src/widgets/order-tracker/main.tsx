import { useEffect, useState } from "react";
import { useCallTool, useHostTheme, useToolPayload } from "mcpfy-sdk/widget";
import { ProgressSteps, ProgressStepsList } from "../../components/ui/progress-steps.js";
import { QuickReply, QuickReplyItem, QuickReplyList } from "../../components/ui/quick-reply.js";
import { StatusBadge, StatusBadgeIcon, StatusBadgeLabel } from "../../components/ui/status-badge.js";
import { DEMO_ORDER_IDS, orderSchema, type Order } from "../../order.js";

export default function OrderTracker() {
  const { output, isPending, error: toolError } = useToolPayload();
  const callTool = useCallTool();
  const theme = useHostTheme();
  const [order, setOrder] = useState<Order | null>(null);
  const [orderId, setOrderId] = useState<string>(DEMO_ORDER_IDS[0]);
  const [lookingUp, setLookingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the last valid result visible while the host processes the next call.
  useEffect(() => {
    const result = orderSchema.safeParse(output);
    if (result.success) {
      setOrder(result.data);
      setOrderId(result.data.orderId);
    }
  }, [output]);

  const busy = isPending || lookingUp;
  const errorMessage = error ?? toolError?.message;

  async function lookup(id: string) {
    if (busy || !id.trim()) return;
    setOrderId(id);
    setLookingUp(true);
    setError(null);
    try {
      const result = await callTool("track_order", { orderId: id });
      // MCP hosts can return an error result without rejecting the promise.
      if (result && typeof result === "object" && "isError" in result && result.isError) {
        const content = "content" in result ? result.content : undefined;
        const text = Array.isArray(content)
          ? content.find((part) => part.type === "text")?.text
          : undefined;
        setError(typeof text === "string" ? text : "Could not look up this order.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLookingUp(false);
    }
  }

  return (
    <main
      data-apps-sdk-ui
      className={`${theme === "dark" ? "dark " : ""}mx-auto w-full max-w-xl bg-background p-5 text-foreground sm:p-6`}
      aria-busy={busy}
    >
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">Demo store</p>
          <h1 className="text-xl font-semibold tracking-tight">Track your order</h1>
        </div>
        {order ? (
          <StatusBadge data={{ status: order.status }}>
            <StatusBadgeIcon aria-hidden="true" />
            <StatusBadgeLabel />
          </StatusBadge>
        ) : null}
      </header>

      <section className="mb-5" aria-live="polite" aria-atomic="true">
        {order ? (
          <>
            <p className="text-xs font-medium text-muted-foreground">{order.orderId}</p>
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-medium">{order.item}</h2>
              <span className="text-sm font-medium tabular-nums">{order.total}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{order.delivery}</p>
            <ProgressSteps data={{ steps: order.steps }} className="mt-5 p-0">
              <ProgressStepsList />
            </ProgressSteps>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {busy ? "Looking up your order…" : "Choose a demo order to see its delivery progress."}
          </p>
        )}
      </section>

      {errorMessage ? <p role="alert" className="mb-4 text-sm text-destructive">{errorMessage}</p> : null}

      <fieldset disabled={busy} className="min-w-0 border-0 p-0">
        <legend className="sr-only">Look up a demo order</legend>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void lookup(orderId);
          }}
        >
          <label htmlFor="order-id" className="mb-2 block text-sm font-medium">Order ID</label>
          <div className="flex gap-2">
            <input
              id="order-id"
              value={orderId}
              onChange={(event) => setOrderId(event.target.value)}
              placeholder="MCP-1001"
              autoComplete="off"
              spellCheck={false}
              required
              className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!orderId.trim()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Looking up…" : "Track"}
            </button>
          </div>
        </form>

        <QuickReply
          className="mt-4 p-0"
          actions={{ onSelectReply: (reply) => { if (reply.label) void lookup(reply.label); } }}
        >
          <p className="mb-2 text-xs text-muted-foreground">Try another demo order</p>
          <QuickReplyList>
            {DEMO_ORDER_IDS.map((id) => (
              <QuickReplyItem
                key={id}
                reply={{ label: id }}
                aria-pressed={order?.orderId === id}
                className="min-h-9 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            ))}
          </QuickReplyList>
        </QuickReply>
      </fieldset>
    </main>
  );
}
