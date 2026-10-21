# Life Vault — plan for Free email (SMTP), M1 (reading documents) and M2 (Ask)

> Status 2026-10-22: M1 and M2 built. As built, Ask differs from the sketch below in two ways: a fast path skips the AI router for date/reference questions (tracker #40), and Gemini is the default provider (#34). See `api/app/ask/` and the README eval tables.

## Context
M0 is live: login, upload to private storage, a worker that marks files "ready", the full UI, Fly (Singapore) + Vercel. The worker is still a stub. Nothing actually *reads* documents yet, and Ask returns "arrives in M2".

This plan covers three things:
- **Step 0, free email:** Supabase's built-in email allows only about 2 logins per hour. That is what blocked your prod login.
- **M1:** turn every upload into page images, clean text, extracted fields (vendor, amount, dates) with highlight boxes, and searchable chunks.
- **M2:** real answers from *your* documents, streamed with clickable sources. This is the RAG core and the portfolio story.

How we work: every step is one commit. I explain it simply and run the tests myself before showing you. I ask before anything that costs money.

**Already decided:**
- Brevo + your Gmail as sender, from your answer.
- Claude only: Haiku 5.5 is fast and cheap, Sonnet 5.5 is smart and reads photos.
- Embeddings are hosted and must handle Hindi + English.

**New recommended picks.** Each gets logged in `docs/ui-tracker.md` so you can change it later:

| # | Pick | Why |
|---|---|---|
| 26 | **Voyage AI**: `voyage-3.5` embeddings + `rerank-2.5-lite` reranker | One account for both. The first 200M tokens are free, which is years of personal use. Multilingual. |
| 27 | **pypdfium2** reads PDFs and draws page images | Fast, permissive licence. PyMuPDF is AGPL, which is risky if this ever becomes a paid app. |
| 28 | Page images are WebP, ~1200px wide; documents are capped at 50 pages | Sharp on phones, small files, keeps the 512 MB Fly machine safe |
| 29 | `needs_review` only when a field's confidence is < 0.8 or a key field is missing; otherwise `ready` | You don't have to confirm every single document |
| 30 | Keyword search uses Postgres `simple` text config, not `english` | English stemming breaks Hindi and Hinglish words |
| 31 | Ask is single-question (no follow-up memory) in M2 | Simpler; follow-ups come later |
| 32 | Daily limits per user: 50 documents and 100 questions | Public site plus paid AI means a cap on surprise bills |

---

## Step 0: Free email with Brevo (about 15 min, you click, I guide)
1. Create a free Brevo account (300 emails/day). Under **Senders**, add your Gmail and confirm the code they email you.
2. Go to **SMTP & API → SMTP**. Copy the *SMTP login* and generate an *SMTP key*. Paste the key **only into Supabase, never in chat**.
3. Go to Supabase **prod → Authentication → Emails → SMTP Settings** and turn on custom SMTP:
   - host `smtp-relay.brevo.com`, port `587`
   - user = the Brevo SMTP login, password = the SMTP key
   - sender = your Gmail, name = "Life Vault"
4. Go to **Authentication → Rate limits** and raise "emails per hour" to about 30.
5. Custom SMTP lets us edit the magic-link email. I write a short branded template in `docs/email-templates/magic-link.html` and you paste it in.
6. Repeat steps 3 and 4 for the **dev** project, using the same Brevo account.
7. Test: log in on the live site and check the inbox *and spam*. If it lands in spam, mark it "Not spam". If Gmail rejects it, we switch to a cheap domain later (about 15 min).
8. This also finishes the M0 check: you upload one file on the live site, and I verify the Fly logs and the prod database.

---

## M1: Reading documents (the worker becomes real)

**Accounts first (I'll ask before any money):**
- **Anthropic API key.** Needs prepaid credit; I'll suggest a small amount plus a monthly spend cap, and ask first.
- **Voyage API key.** Free tier, no card needed for the free tokens.
- Both go into `api/.env`, never into git, and later into Fly secrets.

**Pipeline the worker runs per document** (`api/worker.py` → new `app/pipeline/`):
```
download file → read pages → mask ID numbers → extract fields (+ type, title, tags)
→ find highlight boxes → chunk → embed → save → status needs_review / ready
```

### Steps
1. **Settings + libraries**
   - Add `anthropic`, `voyageai`, `pypdfium2`, `pillow`, `pillow-heif`. Dev only: `fpdf2` to generate test PDFs.
   - In `app/config.py`, add model names (`claude-haiku-5-5`, `claude-sonnet-5-5`, `voyage-3.5`) and the daily limits. Keep the `EMBEDDINGS_API_KEY` name.
   - Update `.env.example`.
2. **Database migration** (new Alembic version, same style as `20261019_…`):
   - `documents`: add `page_count`, `vendor`, `amount numeric(12,2)`, `doc_date`, `expiry_date`, `due_date`, `reference_masked`, `tags text[]`, `field_boxes jsonb`, `confidence jsonb`, `text_source` (`pdf_text` | `vision`).
   - New `document_pages`: `document_id`, `page_no`, `storage_key`, `width`, `height`, `text` (already masked).
   - New `chunks`: `document_id`, `user_id`, `page_no`, `ordinal`, `content`, `box jsonb`, `embedding vector(1024)` (HNSW cosine index), `tsv tsvector` (generated with `'simple'`, GIN index).
   - RLS select-own policies on both new tables, matching `documents_select_own`.
   - Delete cascades from documents.
3. **Readers** (`app/pipeline/read.py`)
   - **PDF:** per page, read text with character boxes and render a WebP image.
     - Pages with almost no text are scans, so they go to vision.
   - **Photo:** fix rotation (EXIF), convert HEIC to JPEG, downscale to a 1568px long edge for Claude, and save a WebP page image.
   - Upload page images to `{user}/{doc}/pages/{n}.webp`:
     - Add `image/webp` to the bucket's allowed types in `ensure_bucket`.
     - Reuse `app/providers/storage.py`.
4. **Masking** (`app/pipeline/mask.py`)
   - What gets masked:
     - Aadhaar: 12 digits, confirmed with the Verhoeff checksum so random numbers aren't masked
     - PAN
     - card numbers: Luhn check
   - Output looks like `●●●● 1234`.
   - It runs on all text **before** it is stored, chunked or sent to Haiku.
   - Honest limit: for photos Sonnet sees the image itself. So it is told to write IDs masked, and we mask its output again.
5. **Claude calls** (`app/providers/llm.py`, with a fake provider for tests)
   - `extract(text)`: Haiku, structured output (JSON schema). Returns type, title, tags, the 6 fields and a confidence per field.
   - `read_image(image)`: Sonnet vision does transcription + extraction in **one** call (cheaper). It also returns approximate % boxes for fields.
   - Prompts are cached. Document text is wrapped as data in `<document>` tags, so it is never treated as instructions.
6. **Highlight boxes** (`app/pipeline/boxes.py`)
   - PDFs: search each extracted value on the page's text and convert the char boxes to % boxes with a 1-based page. That is the `Box` type the UI already uses.
   - Photos: use Sonnet's approximate boxes. No box means the UI simply shows no highlight.
7. **Chunk + embed** (`app/pipeline/chunk.py`, `app/providers/embeddings.py`)
   - About 1,600-character chunks per page with 15% overlap. Each chunk keeps its page and a box around its lines.
   - Each chunk is prefixed with a small header ("Warranty · Coolwave · 2025-03-02") before embedding. This cheap trick improves search.
   - Voyage `input_type="document"`, in batches.
8. **Worker orchestration** (`api/worker.py`)
   - Replace the stub with the pipeline.
   - Safe to re-run: it deletes the old pages and chunks first, so Retry works.
   - Friendly error text on failure (reuse `READ_FAILED`). Enforce the 50-page cap.
   - Status rule from #29.
   - Log timings per stage.
9. **API changes** (`app/routes/documents.py`, `app/schemas.py`)
   - `DocumentOut`:
     - adds `vendor`, `amount`, `docDate`, `expiryDate` (= expiry or due), a real `pageCount` and `tags`
     - `thumbnailUrl` = page 1 image, so PDFs get thumbnails too
   - `GET /documents/{id}`: `pages[]` as `{url,width,height}` with unique signed URLs (reuse `signed_urls`), plus `fields`, `fieldBoxes` and `confidence`.
   - New `PATCH /documents/{id}/fields {fields, confirm}`:
     - merges the edited fields and sets confidence to 1 for each edited key
     - `confirm` moves `needs_review` to `ready`
     - `referenceMasked` is read-only
   - `DELETE` also removes the page images.
   - Upload counts toward the daily limit (429 with a friendly message).
10. **Web hookup**
    - `web/src/lib/data/actions.ts`:
      - `saveFields` calls the new endpoint
      - stop dropping `tags`
      - remove the `TODO(api)` M1 markers
    - Remove the "details arrive in M1" placeholder text.
    - No type changes are needed: the API matches `web/src/lib/data/types.ts`.
11. **Extraction eval** (`evals/`)
    - 12 fictional sample documents, generated as PDFs and photos with the same fictional vendors as the demo, plus expected fields.
    - `uv run python -m evals.extract` prints per-field accuracy and the cost per document. This is the first resume number.
    - Real personal documents stay in the git-ignored `evals/private/`.
12. **Deploy M1**
    - Fly secrets (Anthropic + Voyage).
    - Run `setup_storage` on prod; the migration runs via `release_command`.
    - Watch worker memory. If 512 MB is tight, ask you about 1 GB (a few $ a month).

**Tests added:**
- Masking: real-format Aadhaar/PAN masked, random numbers left alone.
- PDF reader on generated PDFs: text, page count, image size.
- Box conversion maths.
- Chunker.
- Full pipeline with fake Claude/Voyage on a generated PDF: rows, chunks, status.
- PATCH fields: merge, confirm, other user gets 404.
- Delete removes pages.

---

## M2: Ask (the RAG core)

**Flow for each question** (new `app/ask/`):
```
(Router and answer use whichever provider LLM_PROVIDER picks: each reader gains route()
and stream_answer(), Gemini Flash-Lite / Claude Haiku for routing, the smart model for answers.)

question → ① router (Haiku) → ② field lookup (SQL)  ─┐
                            → ③ hybrid search      ─┼→ ④ answer (Sonnet, streamed) → ⑤ save + done
```

### Steps
1. **Migration:** an `asks` table storing:
   - `user_id`, `question`, `route`, `fact jsonb`, `citations jsonb`, `answer`
   - `not_found`, `feedback` (`up`/`down`), `timings jsonb`, `created_at`
   - RLS select-own
2. **Router** (`app/ask/router.py`): Haiku with structured output and today's date. It returns:
   - `route`: `field_lookup` | `content_search` | `both`
   - `field`: which date or amount is asked about
   - filters: `doc_types`, `vendor`, `date_from/to`
   - `search_query`: rewritten into English keywords, so Hinglish like "fridge ka warranty kab khatam" works
3. **Field lookup** (`app/ask/facts.py`): plain SQL on the new document columns plus filters (vendor/title `ILIKE`).
   - One strong match gives a `fact` event. Values are formatted Indian style (₹1,23,456; "12 Mar 2027 · in 4 months").
   - Its citation uses the field's highlight box.
4. **Hybrid search** (`app/ask/retrieve.py`):
   - vector top 20 (pgvector) + keyword top 20 (`websearch_to_tsquery('simple', …)`), always filtered by `user_id`
   - merged with Reciprocal Rank Fusion, then Voyage rerank to the top 5
   - below a score threshold means **not found** instead of guessing
5. **Answer** (`app/ask/answer.py`): Sonnet streams the answer.
   - Rules: use only the numbered sources, cite them like [1], keep it short, say plainly when the answer isn't there.
   - Sources are passed as data (prompt-injection safe), and the ask path has no tools that change anything.
6. **Endpoints** (`app/routes/ask.py`):
   - `POST /ask` streams SSE in **exactly** the UI's format, `data: {json}\n\n`. Event order is `route` → `fact?` → `sources` → `delta`… → `done{askId}`, or `not_found` when nothing matches.
   - Add a small `error` event, with the matching tiny change in `web/src/hooks/use-ask.ts` + `types.ts`.
   - `GET /asks?limit=` for recent questions and `POST /asks/{id}/feedback`.
   - Daily question limit.
   - Stage timings are saved for the latency numbers.
7. **Web hookup**
   - `web/src/app/api/ask/route.ts` forwards to FastAPI with your login token and pipes the stream through. Demo mode is unchanged.
   - `listAskHistory` and `sendFeedback` call the API.
8. **Ask eval** (`evals/ask.jsonl`, about 40 questions over the 12 fictional documents):
   - question types: field lookups, content questions, Hinglish, and "not in my vault"
   - scores: route accuracy, retrieval hit@5 and MRR, answer correctness (Haiku as judge), correct "not found"s, p50/p95 time-to-first-word
   - Results go in the README. This is the main portfolio proof.
9. **Deploy M2 + live test**
   - Note: Fly machines auto-stop, so the first question after idle has a few seconds of cold start. We measure it and decide later whether to keep one machine warm, which costs a little.

**Tests added:**
- Router output parsing.
- Facts formatting (₹, dates).
- RRF maths.
- Retrieval never returns another user's chunks.
- Not-found threshold.
- SSE event order with fake providers.
- Feedback ownership.

---

## Rough running cost (personal use)
| | Cost |
|---|---|
| Brevo | free |
| Voyage | free tier |
| Supabase / Upstash / Vercel | still free |
| Fly | ~$0–5/month |
| **Claude** (the only real cost) | Small. Native PDFs use Haiku only; photos and answers use Sonnet. I'll measure the real cost per document and per question in the evals and you set a monthly cap in the Anthropic console. |

## Verification (each milestone)
- `uv run pytest` and `uv run ruff check` in `api/`, `pnpm check` in `web/`. CI must be green before each push.
- **Local end-to-end** (web on 3001, API on 8001, dev worker on):
  - upload a generated bill PDF and a phone photo
  - watch the status go to ready/needs_review
  - check fields, highlights and page images in the browser pane
  - ask 5 eval questions and check sources, highlights, not-found
- **Evals** run and their numbers are recorded.
- **Prod:** you upload one real document and ask one question; I verify the Fly logs, the prod database rows and the timings.
