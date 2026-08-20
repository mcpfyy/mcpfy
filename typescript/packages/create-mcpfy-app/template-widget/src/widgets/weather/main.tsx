import { useEffect, useState } from "react";
import {
  useCallTool,
  useHostContext,
  useHostTheme,
  useLinkedTool,
  useToolPayload,
} from "mcpfy-sdk/widget";

export default function Weather() {
  // Last tool result shown in this widget (`structuredContent`)
  const { output, isPending } = useToolPayload();
  // Call a tool on this MCP server through the host
  const callTool = useCallTool();
  // The tool that opened this widget
  const { name } = useLinkedTool();
  // Host session: protocol, layout, locale, capabilities
  const { protocol, layoutMode, locale } = useHostContext();
  // light | dark from the host (or OS)
  const theme = useHostTheme();

  // Also available from mcpfy-sdk/widget (not used here):
  // useHostProtocol() — same protocol as useHostContext().protocol
  // useLayoutMode() — { mode, request } to toggle inline / fullscreen
  // useSendFollowUp(prompt) — send a message into the host chat
  // useOpenExternal(url) — open a link via the host
  // useWidgetState() — { state, setState } persist JSON on ChatGPT
  // useViewState(initial) — local state + host persist + model context
  // useModelContext() — { supported, publish } for next-turn MCP Apps context
  // useViewTool({ name, schema }, handler) — model-callable tools on this view (MCP Apps)
  // useCallTool("tool-name") — { call, isPending, data, error } instead of a bare function
  // <HostImage /> — <img> with referrerPolicy suitable for host iframes

  const city = typeof output?.city === "string" ? output.city : "";
  const temp = typeof output?.temperatureC === "number" ? output.temperatureC : null;
  const [cityInput, setCityInput] = useState(city || "San Francisco");
  const [lookingUp, setLookingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (city) setCityInput(city);
  }, [city]);

  const busy = isPending || lookingUp;

  async function lookup(cityQuery: string) {
    setLookingUp(true);
    setError(null);
    try {
      await callTool("weather", { city: cityQuery });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLookingUp(false);
    }
  }

  return (
    <div
      style={{
        padding: 16,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        background: "#fff",
        color: "#111",
      }}
    >
      <div style={{ fontWeight: 600 }}>{name}</div>
      <p style={{ margin: "4px 0 16px", fontSize: 12, color: "#737373" }}>
        {protocol} · {layoutMode} · {theme}
        {locale ? ` · ${locale}` : ""}
      </p>
      <div style={{ fontWeight: 600 }}>{city || "—"}</div>
      <div style={{ fontSize: 32, fontWeight: 700 }}>{temp == null ? "…" : `${Math.round(temp)}°C`}</div>
      {error ? <p style={{ margin: "8px 0 0", color: "#b91c1c", fontSize: 13 }}>{error}</p> : null}
      <form
        style={{ display: "flex", gap: 8, marginTop: 16 }}
        onSubmit={(event) => {
          event.preventDefault();
          const cityQuery = cityInput.trim();
          if (cityQuery) void lookup(cityQuery);
        }}
      >
        <input
          value={cityInput}
          onChange={(event) => setCityInput(event.target.value)}
          placeholder="City"
          aria-label="City"
          style={{
            flex: 1,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #d4d4d4",
            font: "inherit",
          }}
        />
        <button
          type="submit"
          disabled={busy || !cityInput.trim()}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            font: "inherit",
            cursor: "pointer",
          }}
        >
          {busy ? "…" : "Lookup"}
        </button>
      </form>
    </div>
  );
}
