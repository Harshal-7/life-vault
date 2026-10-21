import { describe, expect, it } from "vitest";

import { splitCitations } from "./citations";

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
