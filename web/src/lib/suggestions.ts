import "server-only";

import { listDocuments } from "@/lib/data";
import { isDemoMode } from "@/lib/demo";
import { questionsFor, STARTER_QUESTIONS } from "@/lib/starter-questions";

/** Question suggestions for Home, Ask and ⌘K: from your own documents (demo mode keeps
 * the examples, which have demo answers). */
export async function suggestedQuestions(count = 4): Promise<string[]> {
  if (isDemoMode()) return STARTER_QUESTIONS.slice(0, count);
  const docs = await listDocuments().catch(() => []);
  return questionsFor(docs, count);
}
