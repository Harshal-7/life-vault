# Deploying Life Vault

| Piece | Where | Cost |
|---|---|---|
| Web (Next.js) | Vercel, Hobby plan, functions in Singapore (`sin1`, next to the API) | Free |
| API + worker | Fly.io, one `shared-cpu-1x` 512 MB machine in Singapore (`sin`; Fly Mumbai is deprecated), sleeps when idle | Pay-as-you-go; small (see Fly pricing) |
| Database, auth, files | Supabase project **life-vault-prod** (separate from dev) | Free tier |
| Job queue | Upstash Redis **life-vault-prod** | Free tier |

## One-time setup

1. **Supabase prod project** (Mumbai). Copy its URL, secret key, publishable key and Session-pooler connection string.
2. **Upstash prod Redis** (Mumbai). Copy its `rediss://` URL.
3. Put the server values in `api/.env.prod` (git-ignored), same names as `.env.example`, with `ENV=prod`.
4. Create the prod schema and bucket from your laptop:
   ```bash
   cd api
   uv run --env-file .env.prod alembic upgrade head
   uv run --env-file .env.prod python -m app.scripts.setup_storage
   ```

## API on Fly.io

```bash
cd api
fly apps create life-vault-api
fly secrets import < .env.prod     # sets every line as a secret; never printed
fly deploy                          # builds remotely, runs migrations, starts the machine
curl https://life-vault-api.fly.dev/health
```

The machine runs the API and the worker together (`start.sh`) and stops when idle; the next request wakes it in a second or two.
Jobs use a per-environment queue name, so the dev worker on your laptop never processes prod jobs.

## Web on Vercel

Import the GitHub repo in Vercel with **Root Directory = `web`**, then add these environment variables (Production):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | prod project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | prod publishable key |
| `NEXT_PUBLIC_API_URL` | `https://life-vault-api.fly.dev` |

Do **not** set `DEMO_MODE` (it's ignored in production anyway).

## Connect the two

- Supabase prod → Authentication → URL Configuration: Site URL = your Vercel URL; Redirect URLs = `https://<your-app>.vercel.app/**`.
- Fly: `fly secrets set CORS_ORIGINS='["https://<your-app>.vercel.app"]'`.

Every push to `main` then redeploys the web app automatically; the API redeploys with `fly deploy`.
