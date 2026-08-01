/** The streamable-HTTP transport replies as SSE (`event: message\ndata: {...}`) — pull the JSON out of the `data:` line. */
export async function parseSseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
  if (!dataLine) throw new Error(`No "data:" line in SSE response body:\n${text}`);
  return JSON.parse(dataLine.slice("data: ".length)) as T;
}
