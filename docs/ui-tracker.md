# UI decisions and backend hookup tracker

Decisions made while building the UI without stopping to ask. Each is the recommended
option; change any of them later. **Cost to change:** S = under an hour, M = half a day, L = more.

## Decisions

| # | Area | Decision taken | Alternatives | Why | Cost to change |
|---|---|---|---|---|---|
| 1 | Auth | **Demo mode** (`DEMO_MODE=1` in `web/.env.local`) skips Supabase login and uses a demo user. Ignored in production builds. | Build UI only after real login works | Lets the whole UI be built and tested without login setup | S (delete `lib/demo.ts` checks) |
| 2 | Data | **All screens read mock data**, even with real login, until each FastAPI endpoint exists | Switch per screen as endpoints land | One place to swap (`lib/data/index.ts`, `lib/data/actions.ts`) | S per function |
| 3 | Demo docs | **Pages drawn on the fly as SVG** with dates relative to today (`/demo-pages/[id]/[n]`), instead of a script that writes fixed files | Static images in `public/demo` | Fixed images would go stale ("expires in 12 days" becomes wrong); highlights always line up | S |
| 4 | Demo docs | **Fictional vendors only** (Coolwave, Spinwell, Suraksha Health, BrightGrid, SkyFibre…), every page marked "fictional company · for demo only" | Real brand names | Public repo; never imitate real companies' documents | S |
| 5 | Viewer | **Document viewer shows page images**, not a PDF renderer. Backend will render page images at ingestion. | pdf.js / react-pdf in the browser | Faster on phones, simpler highlighting with % boxes, same viewer for photos and PDFs | M |
| 6 | Routes | App lives under **`/vault/*`** (`/vault`, `/vault/documents`, `/vault/ask`, `/vault/timeline`, `/vault/settings`) | Top-level `/documents`, `/ask`… | `proxy.ts` already protects `/vault`; one prefix = one rule | M |
| 7 | Design | **Stone neutrals + deep teal accent**, Geist font, light/dark/system | Blue accent, Inter | Calm and trustworthy, not "fintech blue"; teal reads as safe/secure | S (CSS variables in `globals.css`) |
| 8 | Design | **shadcn/ui, "radix-nova" preset**, lucide icons | Base UI / Aria bases, other presets | Most examples and docs online; accessible Radix primitives | M |
| 9 | Login | **Google button shown as "coming soon"** | Hide it | Shows the plan; Google OAuth needs Google Cloud setup first | S |
| 10 | Voice | **Mock transcription** in demo mode (`/api/transcribe` returns a sample question) | Browser Web Speech API | Real recording UI is built now; provider (Deepgram vs Sarvam) chosen in M5 after a Hinglish test | S |
| 11 | PWA | **Manifest + icons only, no service worker yet** | Offline caching with a service worker | Installable without cache-invalidation bugs; offline isn't needed for v1 | M |
| 12 | Uploads | Demo uploads **send no file bytes**; the store creates a placeholder page that "finishes processing" after 5 s (filenames containing "blur"/"fail" fail on purpose) | Store files in the browser | Real upload goes straight to Supabase Storage via signed URL in M0 step 6 | — |
| 13 | Tests | **Vitest for logic** (formatting, search, mock answers); browser checks for screens | Playwright end-to-end | Fast and dependency-light now; add Playwright before launch | M |

## Backend hookup TODO

Search the code for `TODO(api)` to find each spot.

| UI function (web) | Replace with (FastAPI) | Milestone |
|---|---|---|
| `listDocuments(filter)` | `GET /documents?q=&type=` | M0 step 6 |
| `getDocument(id)` | `GET /documents/{id}` (with signed page-image URLs) | M1 |
| `createUpload(req)` | `POST /documents/upload-url` → PUT file → `POST /documents` | M0 step 6 |
| `retryDocument(id)` | `POST /documents/{id}/retry` | M1 |
| `saveFields(id, fields, confirm)` | `PATCH /documents/{id}/fields` | M1 |
| `updateDocument(id, patch)` | `PATCH /documents/{id}` | M1 |
| `deleteDocument(id)` | `DELETE /documents/{id}` | M0 step 6 |
| `listDeadlines()` / `setReminder()` | `GET /deadlines`, `PATCH /deadlines/{id}` | M3 |
| `/api/ask` route (SSE) | proxy `POST /ask` (SSE) | M2 |
| `listAskHistory()` / `sendFeedback()` | `GET /asks`, `POST /asks/{id}/feedback` | M2 |
| `/api/transcribe` route | proxy `POST /ask/voice` | M5 |
| `getSettings()` / `saveSettings()` | `GET/PATCH /settings` | M4 |
| `/demo-pages/[id]/[n]` | page images from Storage (signed URLs) | M1 |
