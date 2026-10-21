import { describe, expect, it } from "vitest";

import { questionsFor, STARTER_QUESTIONS } from "./starter-questions";

describe("questionsFor", () => {
  it("builds questions from the user's own documents", () => {
    const qs = questionsFor([
      { docType: "bill", title: "Electricity", vendor: "BRIGHTGRID POWER LTD", status: "ready", expiryDate: "2026-10-25" },
      { docType: "warranty", title: "Coolwave fridge", vendor: "Coolwave Appliances", status: "ready" },
      { docType: "receipt", title: "Groceries", vendor: "Annapurna Stores", status: "ready", amount: 642 },
      { docType: "bill", title: "Still reading", vendor: "X", status: "processing" },
    ]);
    expect(qs).toEqual([
      "When is my Brightgrid Power bill due?",
      "When does my Coolwave Appliances warranty end?",
      "How much did I pay at Annapurna Stores?",
    ]);
  });

  it("falls back to the examples for an (almost) empty vault", () => {
    expect(questionsFor([], 3)).toEqual(STARTER_QUESTIONS.slice(0, 3));
  });
});
