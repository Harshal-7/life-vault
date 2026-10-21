/**
 * Privacy promises shown on the landing page, Settings and the document page. Written
 * once here so they can't drift apart, and so they stay true: check this file whenever
 * the pipeline or the AI provider changes.
 *
 * - Masking happens on the text we keep (and on page previews, which are blurred). A
 *   photo or scan still has to be sent to the AI as an image to be read at all.
 * - On Gemini's free tier, Google may use what it receives to improve its models, so
 *   there is deliberately no "never used for training" promise until a paid key is in
 *   place (docs/ui-tracker.md #34).
 */
export const PRIVACY = {
  storage: "Files are stored privately and only opened through short-lived links.",
  masking:
    "Aadhaar, PAN and card numbers are masked in everything we store and search, and blurred on page previews.",
  original: "Your original file is kept as you uploaded it, visible only to you.",
  short: "Stored privately. ID numbers are masked and blurred on previews.",
  badge: "Private by design. ID numbers are masked.",
} as const;
