import { describe, expect, it } from "vitest";

import { createParser, encodeEvent } from "./sse";

describe("SSE", () => {
  it("round-trips events, even when split mid-event", () => {
    const wire = encodeEvent({ type: "delta", text: "Hello" }) + encodeEvent({ type: "done", askId: "a1" });
    const parse = createParser();
    const out = [...parse(wire.slice(0, 17)), ...parse(wire.slice(17, 40)), ...parse(wire.slice(40))];
    expect(out).toEqual([
      { type: "delta", text: "Hello" },
      { type: "done", askId: "a1" },
    ]);
  });
});
