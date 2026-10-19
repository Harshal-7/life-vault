# Life Vault

Ask your paperwork anything. Upload or forward bills, receipts, warranties, insurance policies and rent agreements, then ask questions like *"when does my fridge warranty expire?"* and get an answer with the source document highlighted.

> Status: early development. Backend skeleton (M0) in progress; full UI built on demo data.

## Stack

| Layer | Tech |
|---|---|
| Web (PWA) | Next.js, Tailwind, shadcn/ui, hosted on Vercel |
| API + worker | FastAPI, arq (Redis queue), hosted on Fly.io (Mumbai) |
| Data | Supabase: Postgres + pgvector, Auth, private Storage |
| AI | Claude (routing, extraction, answers), hosted multilingual embeddings |

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
uv run uvicorn app.main:app --reload
```

Health check: <http://localhost:8000/health>

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

## Privacy

This repo is public. Real documents and keys never go in it: `.env` files and `evals/private/` are git-ignored, and a gitleaks pre-commit hook blocks accidental secrets.
