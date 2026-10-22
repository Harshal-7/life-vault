# UI evaluation (2026-10-22)

A full pass over the web app after M1 + M2, to decide what to polish before M3.

**How it was checked**
- **Locally, in demo mode** (`DEMO_MODE=1`, web on :3001). Demo mode uses the same screens and components as the real app, over a built-in dummy vault of 18 documents: one needs review, one is processing, one failed, plus deadlines and Ask answers.
- **13 screens** × **3 sizes**: phone 375×812, tablet 768×1024, desktop 1280×800. Plus 320px (small Android / iPhone SE) and 1024px spot checks.
- **Both light and dark themes.** Headless Chromium, full-page screenshots.
- **Interactions:**
  - the upload sheet, account menu, ⌘K palette and document ⋯ menu
  - field edit and "show on page"
  - list view, an empty search, and Ask answer / not-found / expired cases
- **Automated checks on every screen:** horizontal overflow, tap-target size, buttons without a name, images without alt, and console errors.
- **A line-by-line code read** of every component in `web/src/components` and `web/src/app`.
- **Real-mode (signed-in) behaviour** was read from the code (`lib/data/index.ts`, `api/transcribe`). It wasn't clicked through, because signing in needs your email.

**Good news first:**
- No console errors on any screen, in either theme.
- No missing image alt text, and no unnamed buttons.
- At 375px and up, nothing scrolls sideways.
- The app already looks calm, consistent and "finished".
- The issues below are mostly polish, plus a handful of real bugs.

---

## Scores

Scores are 1–10, where 10 means nothing worth changing.

| # | Area | Score | One-line verdict |
|---|---|---|---|
| A | Visual design & brand | **8.0** | Calm teal and warm-neutral palette, consistent cards, good type scale. Spacing and radii drift a little between pages. |
| B | Light / dark theming | **8.0** | Both themes are polished. A few light-mode status colours are too faint. |
| C | Phone layout (375px) | **7.0** | Works everywhere and nothing is broken. But key facts get cut off (timeline rows, card key lines), and review forms sit far below the page image. |
| D | Small phone (320px) | **6.0** | The landing header overflows by 8px and the logo wraps onto two lines. Timeline titles shrink to about 8 characters. |
| E | Tablet (768–1024px) | **5.5** | The full sidebar appears at 768px and squeezes the content. The library becomes 3 cramped columns with cut-off text. At 1024px the document viewer's zoom button is clipped. |
| F | Desktop (1280px+) | **7.5** | Good. Home and Timeline stretch edge to edge, so the eye has to travel from the title to a pill on the far right. Ask leaves a lot of empty space. |
| G | Navigation & structure | **7.0** | The bottom nav plus FAB on phones and the sidebar on desktop are clear. "Ask" and "Search" are muddled, and there are two ask boxes on Home and Ask. ⌘K doesn't find documents. |
| H | Feedback & states | **6.0** | Empty, loading and failed states exist and look good. Missing: pending and error handling on many actions, a stop button while answering, a "taking longer than usual" state, and offline handling. |
| I | Touch ergonomics | **5.0** | Most buttons are 28–36px (the guideline is 44px). Citation chips are 16px, switches 18px tall, and several 16–20px text links. |
| J | Accessibility | **5.5** | Good bones (Radix dialogs, labels, live regions). Weak focus rings on cards, light-mode contrast misses, the timeline's date hidden from screen readers, and no Hindi font. |
| K | Copy & trust | **6.0** | Friendly and plain. But **two privacy claims are currently not true**, internal words leak ("milestone M4"), and one state has four different names. |
| L | Real-mode completeness | **4.5** | After signing in: Timeline is always empty, Settings and reminders don't save, the mic returns an error, Delete account does nothing, and Download is greyed out. Demo mode hides all of this. |
| M | Speed & smoothness | **6.5** | Fast on the whole. Endless polling while a document is processing, full-size thumbnails, and the grid/list toggle flickers on load. |
| | **Overall** | **6.5** | A good-looking app with a solid base. A focused polish pass gets it to about 8.5. |

### Per screen

| Screen | Phone | Tablet | Desktop | Biggest issue |
|---|---|---|---|---|
| Landing `/` | 7.5 | 8 | 8.5 | Overflows at 320px. Two CTAs that mean the same thing. The privacy claim isn't accurate. |
| Login | 8 | 8.5 | 8.5 | No "resend link". Raw Supabase errors are shown. A dead "Google (soon)" button. |
| Home `/vault` | 7 | 6 | 7.5 | Two ask boxes. Truncated deadline titles. Reminder switch on an expired item. Too wide on desktop. |
| Documents | 7 | 5 | 8 | Key line (due date or amount) cut off. 3 cramped columns on tablet. No visible upload button on phones. |
| Document detail | 7 | 7.5 | 7 | On phones the review form is far below the image. Zoom button clipped at 1024px. Download is disabled. |
| Needs review | 6.5 | 7 | 8.5 | "Confirm details" is a long scroll away. The yellow "check" tag is faint in light mode. |
| Processing / failed | 7 | 7.5 | 7.5 | Failed page shows a big empty "No preview" box and has no Delete next to "Try again". Processing polls forever. |
| Ask | 7.5 | 7.5 | 7 | **Asking from ⌘K while on the Ask page does nothing (confirmed bug).** No stop button. 16px citation chips. |
| Timeline | 6 | 7 | 7 | Titles cut to "Policy ex…" at 320px. Unlabelled switches. **Always empty in real mode.** |
| Settings | 6.5 | 7.5 | 7.5 | Shows email forwarding and reminders that don't work yet. Delete account is fake. A privacy claim isn't accurate. |
| Upload sheet | 8 | 8 | 8 | No retry for a failed file. Can't close while uploading, with no explanation. |
| ⌘K palette | 6 | 7 | 7 | Only "Ask…": typing "fridge" doesn't list the fridge documents. Sits mid-screen on phones. |
| 404 | 8 | 8 | 8 | Fine |

---

## Must fix first: bugs and trust (P0)

These are wrong, not just unpolished.

| ID | What | Where | Fix |
|---|---|---|---|
| P0-1 | **Privacy claim is false for photos and scans.** "ID numbers are masked before any AI reads a document" is not true. Photos and scans go to the AI as images first, and masking happens on the text afterwards. The stored page images also still show full numbers. | `app/page.tsx:97`, `settings/page.tsx:32`, `fields-panel.tsx:259` | Short term: change the copy to "masked in everything we store and search". Real fix: blur ID numbers on page images (already a planned follow-up). |
| P0-2 | **"Your documents are never used to train AI models" is not true on the Gemini free tier.** Google may use free-tier data. | `settings/page.tsx:33` | Remove the line until a paid key is in place, or say "on the paid plan". Matches tracker #34. |
| P0-3 | **Asking from ⌘K while already on the Ask page is silently dropped.** The URL changes and no answer appears (confirmed in the browser). Back/Forward does the same. | `ask-experience.tsx:26-45` | Remember the last asked `q` instead of a true/false flag. |
| P0-4 | **Timeline is always empty after you sign in.** The dates are already extracted (M1), but `listDeadlines()` returns `[]` outside demo mode. Home's "Coming up" is empty too. | `lib/data/index.ts:39` | This is M3. Until then, show an honest "Reminders arrive soon" empty state, not "Nothing due". |
| P0-5 | **Features that look real but don't work after sign-in:** forwarding address and senders (M4), reminder days (M4), reminder switches (M3), Delete account (toast only), mic (501 error after you record). | `settings-forms.tsx`, `deadline-row.tsx`, `mic-button.tsx`, `api/transcribe` | In real mode, show these as clearly "Coming soon" (disabled, with a short reason), or hide them. Remove "milestone M4" wording. |
| P0-6 | **Landing page overflows sideways at 320px** (8px), and the logo wraps to "Life / Vault". | `app/page.tsx:33-42` | Below `sm`, hide "Sign in" (the hero already has it) and keep the logo on one line. |
| P0-7 | **Zoom-in button clipped at 1024px** on the document page. The viewer column is too narrow next to the sidebar and the 22rem details panel. | `document-workspace.tsx:111` | Use the two-column layout from `xl`. Below that, stack. |
| P0-8 | **Processing documents poll every 2.5s forever.** A stuck job never stops refreshing, and the user never hears that it's taking long. | `auto-refresh.tsx` | Back off (5s → 10s → 30s), stop after about 2 minutes, then show "Still working…" with Retry. |

---

## By area: what to improve

### A. Visual design & brand (8.0)
- **Radii:** cards use `rounded-xl`, the ask bar and answers `rounded-2xl`, inputs `rounded-lg`. Pick one per role and write it down (cards xl, inputs and buttons lg, pills full).
- **Spacing between sections:** Home uses `space-y-10`, Timeline 8, Settings 6. Use one page rhythm everywhere.
- **Warning colour:** amber is hard-coded in 5 places (`document-card.tsx:13`, `fields-panel.tsx`, `deadline-row.tsx:27`). Add a `--warning` token next to `--destructive`.
- **Tiny text:** 10px and 11px sizes appear in places (kbd hint, citation chips, bottom-nav labels). Keep 11px for nav labels and use `text-xs` (12px) as the minimum elsewhere.
- **Duplicates:**
  - 4 chip styles: library filter, reminder days, home starter questions, theme cards. Merge into one `Chip`.
  - 3 section-title patterns. Merge into one `SectionHeader`.
  - The fake paper thumbnail is drawn twice (landing and source card). Make one component.
- **Library cards:** the doc-type icon badge sits on top of the thumbnail's corner and covers the paper. Move it into the card body, or make it smaller with a ring.
- **Failed and processing cards** look different from the rest. The failed card is a big grey box with a ⚠️. Show the photo thumbnail dimmed, with the badge.

### B. Light / dark theming (8.0)
- **Light-mode contrast misses:**
  - "Reading…" (processing) badge text: 2.7:1
  - "Ready" and the red status text: about 4.3:1
  - the yellow "check" tag on review fields
  - Fix: add darker `*-text` tokens for light mode.
- **Dark mode:** white text on the red Delete buttons is 2.9:1. Add a `--destructive-foreground` token per theme.
- **Input borders** are very faint in both themes (1.3:1). Darken `--input` slightly so fields are clearly fields.

### C. Phone (7.0)
- **Home: two ask boxes.** The top bar has "Ask about your documents…" and the page has a big ask box right below it. On Home and Ask, hide the top-bar one on phones and show the Life Vault logo or page title there instead.
- **Starter question chips** scroll sideways with no hint. Add a soft fade at the right edge, or wrap them to two rows.
- **Placeholder cut off:** "Ask anything, e.g. when do…". Use a shorter placeholder on phones ("Ask about your documents").
- **Deadline rows** (Home and Timeline): the title and document name are cut to about 15 characters by the date block, the pill and the switch. Put the pill under the title on phones, and let the document name wrap to 2 lines.
- **Library 2-column cards:** the most useful line ("₹1,980 · due in 5 days") gets cut first. Give it its own line, allowed to wrap, or use 1-column cards with a small thumbnail on the left (like the list view) on phones.
- **Library has no visible upload button on phones**, only the 36px icon in the top bar. Add an "Upload" button in the page header.
- **Document page, needs review:** the "Check these details" form and "Confirm details" sit under a 62vh image.
  - Put the review panel first on phones, with a "View page" toggle.
  - Or give "Confirm" a sticky bar at the bottom.
  - Also, "Show on page" scrolls the viewer while it's off-screen.
- **Failed document page:** the big empty "No preview available" box takes half the screen. Show the original photo, if there is one, or drop the box. Put **Delete** next to **Try again**.
- **The ⌘K palette on phones** floats mid-screen over a blurred page. Show it as a full-width sheet from the top.
- **Safe areas:** `viewport-fit=cover` isn't set, so the bottom nav's safe-area padding currently does nothing. Add it, and add top and bottom insets for iPhones with a notch and home bar (top bar, bottom nav, sheet footers).

### D. Small phone, 320px (6.0)
- P0-6: landing overflow and logo wrap.
- Timeline and Home deadline titles shrink to "Policy ex…": see the fix in C.
- Settings: "Download all my data (coming soon)" is a no-wrap button that almost touches the card edge. Shorten the label.

### E. Tablet, 768–1024px (5.5)
- **The full 240px sidebar from 768px** leaves about 520px for content.
  - Use an **icon-only sidebar rail** from 768 to 1279px, and the full sidebar from 1280px.
  - Or keep the phone layout (bottom nav) until 1024px.
- **Library at 768px:** 3 columns of about 125px. Titles wrap to 3 lines and the key line is cut ("₹640 · due i…"). Use 2 columns until there's more than 900px of content.
- **Home attention cards:** 2 columns that wrap to 3 lines each. Use 1 column until `lg`.
- **Document detail at 1024px:** see P0-7.
- **Ask source cards** at tablet width are narrow and truncate the title. Let them use the full row width.

### F. Desktop (7.5)
- **Home and Timeline** stretch to the full width (about 1000px of rows), so the relative-date pill sits far from the title. Cap them at about `max-w-4xl`, like Ask (`max-w-3xl`).
- **Timeline on desktop** has room for a small month calendar or a summary column (overdue / this week / this month counts) on the right. That's optional and nice to have.
- **Ask on desktop** is a narrow column with lots of empty space below it. Show "Recent questions" and "Try asking" in a right column, or keep them under the answer.
- **The ⌘K hint in the top bar** says ⌘K to Windows users too. Show Ctrl K on Windows.

### G. Navigation & structure (7.0)
- **One word per job:** "Ask" for questions (nav, top bar, palette, the big box) and "Search" only for the library filter.
  - The ask bars currently use a 🔍 magnifier icon. Use a chat or sparkle icon so "ask" and "search" look different.
- **⌘K should also find documents:** typing "fridge" should list "Coolwave fridge warranty / invoice" to open, above "Ask 'fridge'".
  - Also, pressing Enter after "timeline" may jump to the Timeline page instead of asking. Check the ranking (the code read found this).
- **The FAB "Ask" button** in the bottom nav has no label, while the other 4 tabs do. Add a small "Ask" label under it, and an active state when you're on the Ask page.
- **Duplicates:** Settings appears twice on phones (tab and account menu), and the theme setting appears twice (account menu and Settings). Fine to keep, but make the account menu shorter.
- **Landing CTAs:** "Open your vault" and "Sign in with email" both lead to the login page. Use one primary ("Get started") and one secondary ("Try the demo"), if a public demo is ever wanted.

### H. Feedback & states (6.0)
- **Ask:**
  - Turn the send button into a **Stop** button while an answer streams.
  - After asking, scroll to the new answer.
  - Show friendly errors, not "Ask failed (500)".
  - Don't auto-focus the box on phones, because the keyboard covers the suggestions.
- **Thumbs up/down:** no pending state, no error handling, and you can't change your vote.
- **Field edit:** no "unsaved changes" warning. The masked reference is shown at 50% opacity, so it's hard to read.
- **Reminder days and allowed senders:** no saved or failed feedback, and the field clears before the save finishes.
- **Upload sheet:**
  - Failed files need a Retry and a Remove button.
  - Closing while uploading should say why it can't, or keep uploading in the background.
  - Uploading 20 photos at once reads all of them into memory: cap it at about 3 at a time.
- **Login:**
  - Add a "Resend link" button with a 30s timer.
  - Turn raw Supabase errors ("email rate limit exceeded") into plain sentences.
- **Offline:** no handling anywhere. Add a small "You're offline" banner, and catch failed actions with a toast.
- **Expired image links:** a page left open shows broken page images when the signed links expire. Reload them on error.
- **Expired deadlines** still show an "on" reminder switch. Show "Renewed?" / "Mark done" for overdue items instead.

### I. Touch ergonomics (5.0)
- Raise everything you tap to **at least 44px on touch screens**: one `@media (pointer: coarse)` rule on `Button`, `Switch` and links that look like buttons. Currently:
  - icon buttons are 32–36px
  - Edit, Copy, Leave demo and Done are 28–32px
  - sheet and dialog close buttons are 28px
- **Citation chips [1]** in answers are 16×16px. Give them a bigger invisible tap area.
- **Reminder switches** are 32×18px. Enlarge the tap area, or make the whole row toggle the reminder (with the row arrow opening the document).
- **Bare text links** "Timeline →", "All 18 →", "change", "Show on page" and "Manage reminders" are 16–20px tall. Add padding.
- **Page viewer on phones:** no pinch-zoom (only ± buttons), and the thumbnail strip is hidden. Check that swipe works on an iPhone (pointer events without `touch-action`).
- **The mic** is hold-to-talk only. Add tap-to-start / tap-to-stop (better for VoiceOver and TalkBack users).

### J. Accessibility (5.5)
- **Focus rings on link-cards** (document cards, deadline rows, source cards, home attention cards) are about 1.6:1. Use a full-strength ring.
- **Timeline:** the date block is hidden from screen readers, so they hear "in 12 days" but never the date. Include the date in the link's label.
- **Ask:** announce "Answer ready" once when it finishes, instead of a live region on every streamed word. Errors should use `role="alert"`.
- **Page highlight** is invisible to screen readers. Add the cited text as hidden text.
- **Hindi:**
  - Geist is loaded with Latin only, so Devanagari falls back to a different font.
  - Add Noto Sans Devanagari, and slightly taller line-height on titles.
  - Set `lang="hi"` on text detected as Hindi.
- **ThemePicker** acts like radio buttons but arrow keys don't move between them.
- Add a "Skip to content" link (`#main` already exists).

### K. Copy & trust (6.0)
- P0-1 and P0-2: privacy claims.
- **Remove internal words:** "milestone M4", "email capture", and "Demo mode: changes reset when the server restarts" (fine in demo, but make it friendlier). Never show raw backend errors.
- **One state, one name:** "Needs review" (badge) / "Check these details" (panel) / "Check the details we found" (home) / "check" (field tag). Suggested:
  - badge **"Check details"**
  - panel **"Please check these details"**
  - field tag **"Not sure"**
- **One name for the sender list:** "Accepted senders" vs "allowed senders". Pick one.
- **Reminder wording:** pick one sentence ("Email me 30, 7 and 1 day before") and use it on Timeline, Settings and the document page.
- **Timeline:** "Emails 30, 7, 1 days before" should read "Emails 30, 7 and 1 day before".
- **Field locate button:** the crosshair icon ⌖ is unusual. Add a tooltip "Show on page", or use the eye icon.
- **Title row:** the double space in "Warranty  · Coolwave Appliances".

### L. Real-mode completeness (4.5)
What a signed-in user sees today that demo mode hides:
- Timeline is empty (P0-4).
- Settings don't save: forwarding (M4), reminder days (M4), Delete (P0-5).
- The mic fails after recording (M5). Hide it, or show it disabled with "Voice questions are coming".
- **Download original** is greyed out in the ⋯ menu with no reason. The backend already has signed URLs, so this is a small win to wire up.
- **"Try asking" starter questions** are fixed demo questions (fridge, health insurance…). For a real vault, build them from your own documents ("When is my BrightGrid bill due?").
- **The landing page's live-looking demo card** says "in 5 months" and "14 Mar 2027". The relative date will go stale. Compute it.

### M. Speed & smoothness (6.5)
- P0-8: polling.
- **Thumbnails** load full-size (600×840, `unoptimized`) for every card. Serve smaller versions (the API can store a 300px thumb), or at least add `sizes`.
- **The grid/list preference** flickers from grid to list on load. Remember it in a cookie so the server renders the right one.
- **After every answer** the whole page refreshes just to update "Recent questions". Update that list locally.
- **Lazy-load the upload sheet and mic code** (they're on every page).
- `/vault/documents` asks for the document list twice.

---

## Suggested polish plan (for the next step)

Grouped so each phase is shippable on its own. The effort numbers are rough.

1. **Trust & bugs (P0-1 … P0-8): about 1 day.** Copy fixes, the ⌘K bug, honest "coming soon" states in real mode, the 320px landing, the 1024px viewer and polling backoff.
2. **Touch & phone layout: about 1–1.5 days.**
   - 44px targets, safe areas, a single ask box on Home and Ask
   - deadline rows that don't truncate, library key lines, an upload button on phones
   - review-first order on the document page, and the failed-document page
3. **Tablet & desktop layout: about 1 day.** The icon-rail sidebar from 768 to 1279px, library and home columns, max widths on Home and Timeline, the Ask side column.
4. **States & feedback: about 1 day.** Stop button, scroll to answer, friendly errors, upload retry, login resend, offline banner, image reload, toasts and pending states on every action.
5. **Design-system tidy-up and accessibility: about 1 day.**
   - tokens (warning, destructive-foreground, darker light-mode status text, input border)
   - one Chip and one SectionHeader
   - focus rings, timeline screen-reader dates, the answer-ready announcement, the Devanagari font, skip link
6. **Small wins: half a day.** Download original, starter questions from your own vault, ⌘K document results, a computed date on the landing card, lighter thumbnails, the grid/list cookie.

After phases 1–3, re-run this same check (same screens, sizes and themes) and update the scores.

---

## Re-check after the polish (2026-10-22)

Same method as above: 13 screens × phone / tablet / desktop × light / dark (78 captures, demo mode), 320px and 1024px spot checks, plus signed-in checks on a dev vault filled with the 12 fictional eval documents (`api/app/scripts/seed_dev.py`). Six commits: `2f4f3d7` … `5a6ac1c`.

**Automated results:** no sideways scroll on any screen (320px included), no console errors, no unnamed buttons or images. On phones every control now has a ≥ 44px tap area, except the "Skip to content" link, which only appears for keyboard users.

| # | Area | Before | After | What changed |
|---|---|---|---|---|
| A | Visual design & brand | 8.0 | **8.5** | Warning and destructive tokens, one name per state. Chip, section-header and thumbnail components are still separate (left for later). |
| B | Light / dark theming | 8.0 | **9.0** | Status colours readable in light mode, white-on-red fixed in dark, form borders at 3:1 |
| C | Phone layout | 7.0 | **8.5** | One ask box, deadline rows and key lines no longer cut off, review form first with a sticky Confirm, Upload button, safe areas |
| D | Small phone (320px) | 6.0 | **8.5** | Landing fits, timeline titles readable |
| E | Tablet | 5.5 | **8.5** | Icon rail from 768 to 1279px, document page stacks until xl, roomier grids |
| F | Desktop | 7.5 | **8.5** | Home capped, Ask side column, Ctrl K on Windows |
| G | Navigation & structure | 7.0 | **8.5** | ⌘K finds documents and Enter always asks; labelled Ask button |
| H | Feedback & states | 6.0 | **8.5** | Stop, friendly errors, no silent failures, upload retry/background, login resend, offline banner, polling stops |
| I | Touch ergonomics | 5.0 | **9.0** | 44px hit areas on touch screens |
| J | Accessibility | 5.5 | **8.0** | Focus rings, skip link, announcements, radio keys, Devanagari font. The page highlight's cited text still isn't read out. |
| K | Copy & trust | 6.0 | **8.5** | Privacy claims now true, no internal jargon, one wording per state |
| L | Real-mode completeness | 4.5 | **7.5** | Honest "Coming soon" for M3–M5 features; Download works; suggestions from your own documents. The rest arrives with M3–M5. |
| M | Speed & smoothness | 6.5 | **7.5** | Polling backoff, one library fetch, lazy upload/mic code, no grid/list flicker. Thumbnails are still full-size images. |
| | **Overall** | **6.5** | **8.4** | |

**Found while testing with real data (fixed):** the Home "Needs your attention" card widened the page with a long title; photo thumbnails showed only the table top; the Reference field claimed "only the last digits are kept" on serial numbers that aren't masked; one answer listed the same page twice as two sources.

**Still open:**
- ID numbers on stored page images: blurring is being built separately (backend). Until it ships and existing documents are re-read, thumbnails can show a full Aadhaar number (seen on the fictional gas receipt).
- The local worker crashes when Upstash resets the connection (Fly restarts it in prod; worth a reconnect setting).
- Duplicate UI pieces (chips, section headers, paper thumbnail) not merged; small thumbnail images not generated.
