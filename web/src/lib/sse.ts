/**
 * Tiny Server-Sent Events helpers: one JSON object per `data:` line, events separated
 * by a blank line. Used by /api/ask now and by the FastAPI proxy later.
 */

export function encodeEvent(event: unknown): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Feed text chunks in, get complete events out. Handles events split across chunks.
 * `const parse = createParser(); for (chunk of stream) for (e of parse(chunk)) …`
 */
export function createParser<T = unknown>() {
  let buffer = "";
  return (chunk: string): T[] => {
    buffer += chunk;
    const events: T[] = [];
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const data = raw
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) events.push(JSON.parse(data) as T);
    }
    return events;
  };
}
