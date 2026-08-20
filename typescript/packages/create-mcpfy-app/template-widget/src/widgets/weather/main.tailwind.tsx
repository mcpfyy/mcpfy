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
    <div className="bg-white p-4 font-sans text-zinc-900">
      <div className="font-semibold">{name}</div>
      <p className="mb-4 mt-1 text-xs text-zinc-500">
        {protocol} · {layoutMode} · {theme}
        {locale ? ` · ${locale}` : ""}
      </p>
      <div className="font-semibold">{city || "—"}</div>
      <div className="text-3xl font-bold">{temp == null ? "…" : `${Math.round(temp)}°C`}</div>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      <form
        className="mt-4 flex gap-2"
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
          className="flex-1 rounded-lg border border-zinc-300 px-2.5 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !cityInput.trim()}
          className="cursor-pointer rounded-lg border border-zinc-900 bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          {busy ? "…" : "Lookup"}
        </button>
      </form>
    </div>
  );
}
