/**
 * Answers cite their sources inline as "[1]" or "[1][2]" (also "[1, 2]"). This splits
 * the text so each number can become a link to that source; a number with no matching
 * source (the model miscounted) stays as plain text.
 */

export type AnswerPart = { kind: "text"; text: string } | { kind: "cite"; n: number };

const MARKER = /\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]/g;

export function splitCitations(text: string, sourceCount: number): AnswerPart[] {
  const parts: AnswerPart[] = [];
  let last = 0;
  for (const m of text.matchAll(MARKER)) {
    const numbers = m[1].split(",").map((s) => Number(s.trim()));
    if (!numbers.every((n) => n >= 1 && n <= sourceCount)) continue;
    if (m.index > last) parts.push({ kind: "text", text: text.slice(last, m.index) });
    for (const n of numbers) parts.push({ kind: "cite", n });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}

/**
 * Answers sometimes cite the same page twice (the exact field, and the passage around
 * it). Show each document page once: `sources` keeps the first of each (the more
 * precise highlight) and `toSource[i]` maps citation i to its place in `sources`, so
 * "[2]" in the text still points at the right card.
 */
export function dedupeCitations<C extends { documentId: string; page: number }>(
  citations: C[],
): { sources: C[]; toSource: number[] } {
  const sources: C[] = [];
  const seen = new Map<string, number>();
  const toSource = citations.map((c) => {
    const key = `${c.documentId}:${c.page}`;
    if (!seen.has(key)) {
      seen.set(key, sources.length);
      sources.push(c);
    }
    return seen.get(key)!;
  });
  return { sources, toSource };
}
