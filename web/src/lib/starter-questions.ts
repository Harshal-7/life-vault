/** Example questions shown as chips; each one has a demo answer. */
export const STARTER_QUESTIONS = [
  "When does my fridge warranty expire?",
  "How much was my last electricity bill?",
  "Does my health insurance cover dental?",
  "When does my rent agreement end?",
  "How do I descale the washing machine?",
  "Is my car insurance still valid?",
];

type DocLike = { docType: string; title: string; vendor?: string; status: string; expiryDate?: string; amount?: number };

/** "BRIGHTGRID POWER LTD" → "BrightGrid Power"-ish: tidy shouting vendor names. */
function tidy(name: string): string {
  const short = name.replace(/\s+(pvt\.?|private|ltd\.?|limited|llp|inc\.?|co\.?)(\s.*)?$/i, "").trim();
  return short === short.toUpperCase() ? short.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : short;
}

/**
 * Suggestions built from the user's own documents ("When is my BrightGrid bill due?"),
 * so the first question they tap has an answer. Falls back to the generic examples
 * when there's too little to go on.
 */
export function questionsFor(docs: DocLike[], count = 4): string[] {
  const out: string[] = [];
  const add = (q: string) => !out.includes(q) && out.push(q);
  for (const d of docs) {
    if (d.status !== "ready" && d.status !== "needs_review") continue;
    const who = d.vendor ? tidy(d.vendor) : null;
    if (d.docType === "bill" && who) add(d.expiryDate ? `When is my ${who} bill due?` : `How much was my last ${who} bill?`);
    else if (d.docType === "warranty") add(`When does my ${who ?? d.title} warranty end?`);
    else if (d.docType === "insurance") add(`When does my ${who ?? ""} policy renew?`.replace("my  ", "my "));
    else if (d.docType === "rent") add("When does my rent agreement end?");
    else if ((d.docType === "receipt" || d.docType === "medical") && who && d.amount) add(`How much did I pay at ${who}?`);
    if (out.length >= count) break;
  }
  return out.length >= 2 ? out : STARTER_QUESTIONS.slice(0, count);
}
