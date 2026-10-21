# Life Vault

Ask your paperwork anything. Upload or forward bills, receipts, warranties, insurance policies and rent agreements, then ask questions like *"when does my fridge warranty expire?"* and get an answer with the source document highlighted.

> Status: early development. Live on Vercel + Fly.io; documents are read into page images, fields and searchable chunks (M1). Asking questions (M2) is next.

## Stack

| Layer | Tech |
|---|---|
| Web (PWA) | Next.js, Tailwind, shadcn/ui, hosted on Vercel |
| API + worker | FastAPI, arq (Redis queue), hosted on Fly.io (Singapore) |
| Data | Supabase: Postgres + pgvector, Auth, private Storage |
| AI | Gemini or Claude, switched by `LLM_PROVIDER` (reading photos, extracting fields, answers); search embeddings from Gemini (free) or Voyage with its reranker, switched by `EMBEDDINGS_PROVIDER` |

## Repo layout

```
api/     FastAPI app + background worker (Python, uv)
web/     Next.js app
evals/   evaluation questions and synthetic sample documents
```

## Local development

```bash
cd api
cp ../.env.example .env   # then fill in your dev keys
uv sync
uv run uvicorn app.main:app --reload --port 8001
```

Health check: <http://localhost:8001/health>

## Screens (UI built on demo data)

| Route | What it does |
|---|---|
| `/` | Landing page |
| `/login` | Email magic-link sign in (Google: coming soon) |
| `/vault` | Home: ask box with voice, items needing attention, upcoming deadlines, recent documents |
| `/vault/documents` | Library: search, type filters, grid/list, upload (drag-and-drop, files, phone camera) |
| `/vault/documents/[id]` | Page viewer with zoom and highlights, extracted details, review and edit, rename/delete |
| `/vault/ask` | Ask: streaming answers with a key fact, explanation and clickable sources; voice input |
| `/vault/timeline` | Warranties, renewals and bills grouped by urgency, with reminder switches |
| `/vault/settings` | Forwarding address, accepted senders, reminder timing, theme, privacy, delete account |

### Run the UI without the backend (demo mode)

```bash
cd web
cp .env.example .env.local   # then add: DEMO_MODE=1
pnpm install
pnpm dev
```

Demo mode skips login and uses fictional sample documents. It's ignored in production builds.
Decisions made while building the UI, and the list of mock functions to swap for real API calls, are in [docs/ui-tracker.md](docs/ui-tracker.md).

### Checks

```bash
cd web && pnpm check   # typecheck, lint, unit tests, production build
cd api && uv run pytest
```

## Evals

`cd api && uv run python -m evals.extract` reads 12 fictional documents (typed PDFs and tilted, blurred "photos", one with an Aadhaar number that must be masked) and scores every extracted field. It runs each provider that has a key (`--provider gemini|claude|both`) and saves results to `api/evals/results/`.

| Date | Provider (models) | Fields right | Highlight box found | Sec/doc | ID numbers leaked |
|---|---|---|---|---|---|
| 2026-10-22 | Gemini (`gemini-3.5-flash-lite` for text and photos, free tier) | 57/58 (98%) | 46/46 | 3.8 | none |

`cd api && uv run python -m evals.ask` builds a vault from the same 12 documents (in a database transaction that is rolled back) and asks 30 questions: dates, amounts, reference numbers, questions answered by the text, a total across bills, Hinglish, and 4 about things that aren't in the vault.

| Date | Provider (AI · search) | Right answer | Right document in sources | Fact card | "Not found" when missing | First word p50 / p95 |
|---|---|---|---|---|---|---|
| 2026-10-22 | Gemini `gemini-3.5-flash-lite` · Gemini embeddings, no reranker (free tier) | 26/26 (100%) | 26/26, MRR 1.00 | 11/12 | 4/4, 0 false | 1.9 s / 2.7 s |

Caveats: 12 clean fictional documents is a small, friendly test. The one miss (a pharmacy receipt filed as "receipt" instead of "medical") varies between runs, and real crumpled receipts and Hindi script need private samples in `evals/private/`.

## Privacy

This repo is public. Real documents and keys never go in it: `.env` files and `evals/private/` are git-ignored, and a gitleaks pre-commit hook blocks accidental secrets.
