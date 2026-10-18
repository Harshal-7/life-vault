# Life Vault

Ask your paperwork anything. Upload or forward bills, receipts, warranties, insurance policies and rent agreements, then ask questions like *"when does my fridge warranty expire?"* and get an answer with the source document highlighted.

> Status: early development (milestone M0, skeleton).

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

## Privacy

This repo is public. Real documents and keys never go in it: `.env` files and `evals/private/` are git-ignored, and a gitleaks pre-commit hook blocks accidental secrets.
