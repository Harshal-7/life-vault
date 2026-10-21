import { describe, expect, it } from "vitest";

import { dedupeCitations, splitCitations } from "./citations";

describe("splitCitations", () => {
  it("turns markers into citations and keeps the text around them", () => {
    expect(splitCitations("Due on 25 Oct [1]. Units: 214 [2][3].", 3)).toEqual([
      { kind: "text", text: "Due on 25 Oct " },
      { kind: "cite", n: 1 },
      { kind: "text", text: ". Units: 214 " },
      { kind: "cite", n: 2 },
      { kind: "cite", n: 3 },
      { kind: "text", text: "." },
    ]);
  });

  it("reads comma lists", () => {
    expect(splitCitations("Both [1, 2]", 2).filter((p) => p.kind === "cite")).toEqual([
      { kind: "cite", n: 1 },
      { kind: "cite", n: 2 },
    ]);
  });

  it("leaves numbers without a source, and other brackets, as text", () => {
    expect(splitCitations("See [4] and [note]", 2)).toEqual([{ kind: "text", text: "See [4] and [note]" }]);
  });

  it("handles a marker still arriving mid-stream", () => {
    expect(splitCitations("Ends 2 Mar 2027 [", 1)).toEqual([{ kind: "text", text: "Ends 2 Mar 2027 [" }]);
  });
});

describe("dedupeCitations", () => {
  it("shows each document page once and keeps numbers pointing at the right card", () => {
    const a1 = { documentId: "a", page: 1, box: "field" };
    const a1again = { documentId: "a", page: 1, box: "passage" };
    const b2 = { documentId: "b", page: 2, box: null };
    const a2 = { documentId: "a", page: 2, box: null };
    const { sources, toSource } = dedupeCitations([a1, a1again, b2, a2]);
    expect(sources).toEqual([a1, b2, a2]);
    expect(toSource).toEqual([0, 0, 1, 2]);
  });
});
