/**
 * Type declarations only — no runtime code. ChatGPT's own host runtime injects
 * `window.openai` directly into the widget's iframe; there's nothing for mcpfy
 * to connect or bridge for the Apps SDK protocol.
 *
 * @see https://developers.openai.com/apps-sdk/build/mcp-server
 */
export interface OpenAiGlobal {
  toolInput?: Record<string, unknown>;
  toolOutput?: Record<string, unknown>;
  widgetState?: Record<string, unknown>;
  setWidgetState?: (state: Record<string, unknown>) => Promise<void>;
  callTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  sendFollowUpMessage?: (args: { prompt: string }) => Promise<void>;
  requestDisplayMode?: (args: { mode: "inline" | "pip" | "fullscreen" }) => Promise<{ mode: string }>;
  openExternal?: (args: { href: string }) => void;
}

/** Reads `window.openai`, if present (i.e. this widget is running inside ChatGPT). */
export function getOpenAiGlobal(): OpenAiGlobal | undefined {
  return (window as unknown as { openai?: OpenAiGlobal }).openai;
}
