import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ImgHTMLAttributes,
  type ReactNode,
} from "react";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import {
  connect,
  detectHostProtocol,
  getOpenAiGlobal,
  postLink,
  postPrompt,
  postToolCall,
  type App,
  type ConnectResult,
  type HostProtocol,
} from "../client-widget/index.js";
import {
  deriveHostCapabilities,
  type HostCapabilities,
  type LayoutMode,
} from "./host-capabilities.js";

export type { HostCapabilities, LayoutMode } from "./host-capabilities.js";
export type HostTheme = "light" | "dark";

export interface ToolPayload {
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  isPending: boolean;
  error?: Error;
}

/**
 * Optional module augmentation for typed `useCallTool("name")`.
 *
 * @example
 * declare module "mcpfy-sdk/widget" {
 *   interface WidgetToolMap {
 *     weather: { input: { city: string }; output: { city: string; temperatureC: number } };
 *   }
 * }
 */
export interface WidgetToolMap {}

type ToolInputOf<K extends string> = K extends keyof WidgetToolMap
  ? WidgetToolMap[K] extends { input: infer I }
    ? I
    : Record<string, unknown>
  : Record<string, unknown>;

type ToolOutputOf<K extends string> = K extends keyof WidgetToolMap
  ? WidgetToolMap[K] extends { output: infer O }
    ? O
    : Record<string, unknown>
  : Record<string, unknown>;

export interface CallToolHandle<K extends string = string> {
  call: (args?: ToolInputOf<K>) => Promise<unknown>;
  isPending: boolean;
  data: ToolOutputOf<K> | undefined;
  error: Error | undefined;
}

export interface HostEnv {
  protocol: HostProtocol;
  layoutMode: LayoutMode;
  locale?: string;
  platform?: string;
  capabilities: HostCapabilities;
}

export interface ViewToolDefinition<TInput = Record<string, unknown>> {
  name: string;
  title?: string;
  description?: string;
  schema?: z.ZodTypeAny;
}

export interface ModelContextPublish {
  text?: string;
  structuredContent?: Record<string, unknown>;
}

interface HostAdapter {
  protocol: HostProtocol;
  payload: ToolPayload;
  callTool: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
  sendFollowUp: (prompt: string) => Promise<void>;
  openExternal: (href: string) => void;
  requestLayoutMode: (mode: LayoutMode) => Promise<LayoutMode>;
  layoutMode: LayoutMode;
  theme: HostTheme;
  locale?: string;
  platform?: string;
  capabilities: HostCapabilities;
  widgetState: Record<string, unknown> | undefined;
  setWidgetState: (state: Record<string, unknown>) => Promise<void>;
  publishModelContext: (params: ModelContextPublish) => Promise<void>;
  registerViewTool: (
    def: ViewToolDefinition,
    handler: (args: Record<string, unknown>) => Promise<CallToolResult>
  ) => () => void;
}

interface HostRuntimeValue {
  ready: boolean;
  toolName: string;
  adapter: HostAdapter;
}

const HostRuntimeContext = createContext<HostRuntimeValue | null>(null);

const ThemeContext = createContext<{
  theme: HostTheme;
  setTheme: (theme: HostTheme) => void;
} | null>(null);

function readPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<HostTheme>(() => (readPrefersDark() ? "dark" : "light"));

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setTheme(mq.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.mcpfyTheme = theme;
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme]);
  return createElement(ThemeContext.Provider, { value }, children);
}

export interface HostRuntimeProps {
  toolName: string;
  appName?: string;
  appVersion?: string;
  children: ReactNode;
}

function readStructured(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (record.structuredContent && typeof record.structuredContent === "object") {
    return record.structuredContent as Record<string, unknown>;
  }
  return record;
}

function asCallToolResult(value: unknown): CallToolResult {
  if (value && typeof value === "object" && "content" in value) {
    return value as CallToolResult;
  }
  if (value && typeof value === "object") {
    return {
      content: [{ type: "text", text: JSON.stringify(value) }],
      structuredContent: value as Record<string, unknown>,
    };
  }
  return { content: [{ type: "text", text: String(value ?? "") }] };
}

export function HostRuntime({ toolName, appName = "mcpfy-widget", appVersion = "0.0.0", children }: HostRuntimeProps) {
  const themeCtx = useContext(ThemeContext);
  const [ready, setReady] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("inline");
  const [availableDisplayModes, setAvailableDisplayModes] = useState<LayoutMode[] | undefined>();
  const [locale, setLocale] = useState<string | undefined>(
    typeof navigator !== "undefined" ? navigator.language : undefined
  );
  const [platform, setPlatform] = useState<string | undefined>();
  const [payload, setPayloadState] = useState<ToolPayload>({ isPending: false });
  const [widgetState, setWidgetStateValue] = useState<Record<string, unknown> | undefined>();
  const [connection, setConnection] = useState<ConnectResult>({ protocol: "none" });

  const setPayload = useCallback((next: Partial<ToolPayload>) => {
    setPayloadState((prev) => ({ ...prev, ...next }));
  }, []);

  const applyHostContext = useCallback(
    (ctx: {
      theme?: HostTheme;
      displayMode?: LayoutMode;
      availableDisplayModes?: LayoutMode[];
      locale?: string;
      platform?: string;
    }) => {
      if (ctx.theme) themeCtx?.setTheme(ctx.theme);
      if (ctx.displayMode) setLayoutMode(ctx.displayMode);
      if (ctx.availableDisplayModes) setAvailableDisplayModes(ctx.availableDisplayModes);
      if (ctx.locale) setLocale(ctx.locale);
      if (ctx.platform) setPlatform(ctx.platform);
    },
    [themeCtx]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await connect(
        { name: appName, version: appVersion },
        {
          setupApp: (app) => {
            app.ontoolinput = (params) => {
              setPayload({ input: params.arguments, isPending: true, error: undefined });
            };
            app.ontoolresult = (params) => {
              setPayload({
                output: readStructured(params) ?? undefined,
                isPending: false,
                error: params.isError ? new Error("Tool returned an error") : undefined,
              });
            };
            app.ontoolcancelled = () => setPayload({ isPending: false });
            app.onhostcontextchanged = (ctx) => {
              applyHostContext({
                theme: ctx.theme,
                displayMode: ctx.displayMode,
                availableDisplayModes: ctx.availableDisplayModes,
                locale: ctx.locale,
                platform: ctx.platform,
              });
            };
          },
        }
      );
      if (cancelled) return;
      setConnection(result);

      if (result.protocol === "apps-sdk" && result.openai) {
        setPayload({
          input: result.openai.toolInput,
          output: result.openai.toolOutput,
          isPending: false,
        });
        setWidgetStateValue(result.openai.widgetState);
      }
      if (result.protocol === "mcp-apps" && result.app) {
        const host = result.app.getHostContext();
        applyHostContext({
          theme: host?.theme,
          displayMode: host?.displayMode,
          availableDisplayModes: host?.availableDisplayModes,
          locale: host?.locale,
          platform: host?.platform,
        });
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [appName, appVersion, applyHostContext, setPayload]);

  useEffect(() => {
    const reportSize = () => {
      const height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, 160);
      const width = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, 1);
      window.parent.postMessage({ type: "ui-size-change", payload: { height, width } }, "*");
    };
    reportSize();
    const observer = new ResizeObserver(reportSize);
    observer.observe(document.documentElement);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [connection, payload, ready]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.method === "ui/notifications/tool-result") {
        setPayload({ output: msg.params?.structuredContent, isPending: false, error: undefined });
      }
      if (msg?.type === "tool-result" && msg.payload) {
        setPayload({ output: readStructured(msg.payload), isPending: false, error: undefined });
      }
    };
    const onOpenAiGlobals = (event: Event) => {
      const openai = getOpenAiGlobal();
      if (!openai) return;
      setPayload({ input: openai.toolInput, output: openai.toolOutput, isPending: false, error: undefined });
      setWidgetStateValue(openai.widgetState);
      const detail = (event as CustomEvent).detail as { globals?: { theme?: HostTheme } } | undefined;
      if (detail?.globals?.theme) themeCtx?.setTheme(detail.globals.theme);
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("openai:set_globals", onOpenAiGlobals as EventListener);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("openai:set_globals", onOpenAiGlobals as EventListener);
    };
  }, [setPayload, themeCtx]);

  const adapter = useMemo<HostAdapter>(() => {
    const protocol = connection.protocol;
    const openai = connection.openai;
    const app = connection.app as App | undefined;
    const capabilities = deriveHostCapabilities({
      protocol,
      openai,
      host: app?.getHostCapabilities?.(),
      availableDisplayModes,
    });

    return {
      protocol,
      payload,
      layoutMode,
      theme: themeCtx?.theme ?? (readPrefersDark() ? "dark" : "light"),
      locale,
      platform,
      capabilities: {
        ...capabilities,
        displayModes: availableDisplayModes ?? capabilities.displayModes,
      },
      widgetState,
      async callTool(name, args = {}) {
        setPayload({ isPending: true, error: undefined });
        try {
          if (openai?.callTool) {
            const result = await openai.callTool(name, args);
            const output = readStructured(result) ?? (result as Record<string, unknown> | undefined);
            setPayload({ output, isPending: false, error: undefined });
            return result;
          }
          if (app?.callServerTool) {
            const result = await app.callServerTool({ name, arguments: args });
            const output = readStructured(result);
            setPayload({
              output,
              isPending: false,
              error: result.isError ? new Error("Tool returned an error") : undefined,
            });
            return result;
          }
          postToolCall(name, args);
          setPayload({ isPending: false });
          return undefined;
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          setPayload({ isPending: false, error });
          throw error;
        }
      },
      async sendFollowUp(prompt: string) {
        if (openai?.sendFollowUpMessage) {
          await openai.sendFollowUpMessage({ prompt });
          return;
        }
        if (app?.sendMessage) {
          await app.sendMessage({
            role: "user",
            content: [{ type: "text", text: prompt }],
          });
          return;
        }
        postPrompt(prompt);
      },
      openExternal(href: string) {
        if (openai?.openExternal) {
          openai.openExternal({ href });
          return;
        }
        if (app?.openLink) {
          void app.openLink({ url: href });
          return;
        }
        postLink(href);
      },
      async requestLayoutMode(mode: LayoutMode) {
        if (openai?.requestDisplayMode) {
          const result = await openai.requestDisplayMode({ mode });
          const next = (result.mode as LayoutMode) ?? mode;
          setLayoutMode(next);
          return next;
        }
        if (app?.requestDisplayMode) {
          const result = await app.requestDisplayMode({ mode });
          setLayoutMode(result.mode);
          return result.mode;
        }
        setLayoutMode(mode);
        return mode;
      },
      async setWidgetState(state: Record<string, unknown>) {
        setWidgetStateValue(state);
        if (openai?.setWidgetState) await openai.setWidgetState(state);
      },
      async publishModelContext(params) {
        if (openai?.setWidgetState && params.structuredContent) {
          await openai.setWidgetState(params.structuredContent);
        }
        if (!app?.updateModelContext) return;
        await app.updateModelContext({
          content: params.text ? [{ type: "text", text: params.text }] : undefined,
          structuredContent: params.structuredContent,
        });
      },
      registerViewTool(def, handler) {
        if (!app?.registerTool) return () => undefined;
        const registered = app.registerTool(
          def.name,
          {
            title: def.title,
            description: def.description,
            ...(def.schema ? { inputSchema: def.schema as never } : {}),
          },
          (async (args: unknown) =>
            handler((args ?? {}) as Record<string, unknown>)) as never
        );
        return () => registered.remove();
      },
    };
  }, [
    availableDisplayModes,
    connection,
    layoutMode,
    locale,
    payload,
    platform,
    setPayload,
    themeCtx,
    widgetState,
  ]);

  const value = useMemo<HostRuntimeValue>(() => ({ ready, toolName, adapter }), [adapter, ready, toolName]);

  return createElement(HostRuntimeContext.Provider, { value }, children);
}

function useRuntime(): HostRuntimeValue {
  const ctx = useContext(HostRuntimeContext);
  if (!ctx) {
    throw new Error("mcpfy widget hooks must be used inside HostRuntime.");
  }
  return ctx;
}

export function useHostContext(): HostEnv {
  const { adapter } = useRuntime();
  return {
    protocol: adapter.protocol,
    layoutMode: adapter.layoutMode,
    locale: adapter.locale,
    platform: adapter.platform,
    capabilities: adapter.capabilities,
  };
}

export function useHostProtocol(): HostProtocol {
  const ctx = useContext(HostRuntimeContext);
  if (ctx) return ctx.adapter.protocol;
  const detected = detectHostProtocol();
  if (detected === "apps-sdk") return "apps-sdk";
  if (detected === "iframe") return "mcp-ui";
  return "none";
}

export function useToolPayload(): ToolPayload {
  return useRuntime().adapter.payload;
}

export function useCallTool(): (name: string, args?: Record<string, unknown>) => Promise<unknown>;
export function useCallTool<K extends string>(name: K): CallToolHandle<K>;
export function useCallTool(
  name?: string
): CallToolHandle | ((name: string, args?: Record<string, unknown>) => Promise<unknown>) {
  const { adapter } = useRuntime();
  if (name === undefined) return adapter.callTool;
  return {
    call: (args?: Record<string, unknown>) => adapter.callTool(name, args ?? {}),
    isPending: adapter.payload.isPending,
    data: adapter.payload.output,
    error: adapter.payload.error,
  };
}

export function useSendFollowUp(): (prompt: string) => Promise<void> {
  return useRuntime().adapter.sendFollowUp;
}

export function useOpenExternal(): (href: string) => void {
  return useRuntime().adapter.openExternal;
}

export function useLayoutMode(): {
  mode: LayoutMode;
  request: (mode: LayoutMode) => Promise<LayoutMode>;
  available: LayoutMode[];
} {
  const { adapter } = useRuntime();
  return {
    mode: adapter.layoutMode,
    request: adapter.requestLayoutMode,
    available: adapter.capabilities.displayModes,
  };
}

export function useHostTheme(): HostTheme {
  const themeCtx = useContext(ThemeContext);
  const runtime = useContext(HostRuntimeContext);
  return runtime?.adapter.theme ?? themeCtx?.theme ?? (readPrefersDark() ? "dark" : "light");
}

export function useLinkedTool(): {
  name: string;
  call: (args?: Record<string, unknown>) => Promise<unknown>;
} {
  const { toolName, adapter } = useRuntime();
  return {
    name: toolName,
    call: (args) => adapter.callTool(toolName, args),
  };
}

export function useWidgetState(): {
  state: Record<string, unknown> | undefined;
  setState: (state: Record<string, unknown>) => Promise<void>;
} {
  const { adapter } = useRuntime();
  return { state: adapter.widgetState, setState: adapter.setWidgetState };
}

/** Local view state plus host persistence / model context (MCP Apps `updateModelContext`, ChatGPT `widgetState`). */
export function useViewState<T extends Record<string, unknown>>(
  initial: T
): [T, (next: T | ((prev: T) => T)) => void] {
  const { adapter } = useRuntime();
  const [state, setLocal] = useState<T>(() => {
    const restored = adapter.widgetState;
    return restored ? ({ ...initial, ...restored } as T) : initial;
  });

  const setState = useCallback(
    (next: T | ((prev: T) => T)) => {
      setLocal((prev) => {
        const value = typeof next === "function" ? (next as (prev: T) => T)(prev) : next;
        void adapter.setWidgetState(value);
        void adapter.publishModelContext({ structuredContent: value });
        return value;
      });
    },
    [adapter]
  );

  return [state, setState];
}

export function useModelContext(): {
  supported: boolean;
  publish: (params: ModelContextPublish) => Promise<void>;
} {
  const { adapter } = useRuntime();
  return {
    supported: adapter.capabilities.modelContext,
    publish: adapter.publishModelContext,
  };
}

/** Register a tool the host/model can call on this mounted view. No-op on ChatGPT / MCP-UI. */
export function useViewTool<TInput extends Record<string, unknown> = Record<string, unknown>>(
  def: ViewToolDefinition<TInput>,
  handler: (args: TInput) => Promise<unknown> | unknown
): void {
  const { adapter, ready } = useRuntime();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!ready || !adapter.capabilities.viewTools) return undefined;
    return adapter.registerViewTool(def, async (args) =>
      asCallToolResult(await handlerRef.current(args as TInput))
    );
  }, [adapter, def.description, def.name, def.schema, def.title, ready]);
}

export function HostImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  return createElement("img", { ...props, referrerPolicy: props.referrerPolicy ?? "no-referrer" });
}
