import type { WidgetContent } from "./types.js";

/** Resolves widget content to a servable HTML string — wraps `url` content in a full-bleed iframe. */
export function resolveWidgetHtml(content: WidgetContent): string {
  if (content.type === "html") return content.html;
  return `<!doctype html><html><body style="margin:0"><iframe src="${content.url}" style="width:100%;height:100%;border:0"></iframe></body></html>`;
}
