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
| 14 | Ask | The question lives in the URL (`/vault/ask?q=…`) and is asked on arrival; Home and ⌘K just link there | Ask inline on every page | Refresh, back and sharing work; one place renders answers | S |
| 15 | Ask | The answer thread is per visit (not saved); the **recent questions** list is saved | Persist full conversations | Simple; real follow-ups with context come with the backend (M2) | M |
| 16 | Upload | The upload panel opens on `?upload=1` from any page (one global panel) | A separate /upload page | Any link or button can open it; works with back/forward | S |
| 17 | Status | Processing status updates by **polling every 2.5 s** while something is processing | Supabase Realtime | No extra setup now; RLS is already in place for Realtime later | M |
| 18 | Voice | **Hold to talk** on touch, **click to toggle** with mouse/keyboard, Esc or slide away cancels, 30 s limit | Toggle only | Hold-to-talk is the most natural on phones (like voice notes) | S |
| 19 | Demo | The sample "New scan" finishes processing **15 s after the server starts** and becomes a water bill to review | Static processing card | Shows the full upload lifecycle in the demo | S |
| 20 | Reminders | Reminder options: 60 / 30 / 14 / 7 / 3 / 1 days (default 30, 7, 1); at least one must stay on | Free-form number | Covers renewals and bills without a fiddly input | S |
| 21 | Settings | **Delete account is UI only** (shows a toast) until `DELETE /me` exists | Hide it | Shows the flow and the typed confirmation now | S |
| 22 | Layout | Nav "active" highlight streams in behind `<Suspense>` (Cache Components treats the URL as request data on dynamic routes) | `instant = false` on routes | Keeps every page frame prerendered and instant | — |
| 23 | Documents | A missing document shows the in-app "Not found" screen with HTTP 200 (status is sent before the document lookup finishes) | Block streaming to return 404 | Faster pages; search engines don't index /vault anyway | S |
| 24 | Landing | Landing copy makes no usage or user-count claims; the hero shows a static example answer | Screenshots or testimonials | Nothing to claim yet; honest and fast | S |

## Testing notes

- In the Claude desktop **browser pane**, if the pane is hidden, streamed sections may not swap in (browsers pause animation frames in background tabs). Not an app bug; keep the pane visible when checking pages.
- The dev server is slow on first load after edits (several seconds to an answer); judge speed on a production build with the real backend.

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
