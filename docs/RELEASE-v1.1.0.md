# NovaCut Studio — v1.1.0 "UX edition" Release Report (UX60 Day 60)

**Date:** release day · **Tag:** `v1.1.0` · **Version bump:** `1.0.0 → 1.1.0`
(package.json + `manifest.webmanifest`)

v1.1.0 closes the 60-day UX-friendliness plan (`docs/UX-60-DAYS.md`): 8 phases,
every day logged in `worklog.md` (Tasks UX60-1 … UX60-12) with receipts. The
mission — *easier than every other editor* — shipped as real behavior only:
every plan row is ✅ with a commit; nothing was claimed that does not run.

---

## 1. Release gate — regression summary (desktop 1280×800 + mobile 390×844)

Static gates (run on the release build):

- `bun run lint` — clean
- `bunx tsc --noEmit` — clean (excluding `examples/`, `skills/`)
- Dev server healthy; console census 0 errors across all four Phase-8 batches

Live receipts carried from the Phase-8 batches (agent-browser, fresh reloads):

| Area | Check | Receipt |
| --- | --- | --- |
| Export celebration | REAL in-browser export (demo, trusted Start) | film strip tracks store progress exactly (23% → 3 done + 1 live cell + head 23.11%); done phase = 12-bit burst + ring + pop + gradient title + real 4.1 MB · 8.4 s · WEBM chips; "Export again" resets clean |
| Export celebration | finalizing | progress 1 + gentle cell pulse + honest "Finalizing the file…" copy |
| Micro-interactions | PRESS verb | trusted pointer press on Play → `:active` matches, computed transform matrix(0.96); release → none; keyboard :active fires the same rule; disabled buttons + role=slider drag surfaces excluded |
| Micro-interactions | LIFT verb | queue row hover → translateY(-1px) + soft shadow; rest → none |
| Micro-interactions | POP verb | checklist checkmarks + export success replay one-shot on mount |
| Help surface | "New in v1.1.0" block | 7 one-line capabilities render in the ShortcutsDialog (rail Help), 336px fits mobile |
| Site sweep | 404 / dialogs / palette | branded dark 404 + back-home on both viewports; 6 store dialogs + ⌘K opened with real content; Phase-5 recovery banner showed a real "saved 5 min ago" draft |
| Honest catalog | tool wall chips (running app) | **Live · 329 / Beta · 8 / Roadmap · 272** (All · 749 incl. 140 role entries) |

---

## 2. The 60-day UX arc — what shipped

| Phase | Days | Headline deliveries |
| --- | --- | --- |
| 1 — First-cut speed | 1–8 | advanced typography (gradient fill + curve/arc), use-case canvas picker, coach marks, quick-start checklist |
| 2 — Smart assistance | 9–16 | one-click cut-to-beat, highlight-reel suggest, silence-snap trim hints, selection-aware context toolbar |
| 3 — Guided workflows | 17–24 | 4 task templates, step-by-step walkthrough, NL command palette (133/133 phrasings), smart defaults |
| 4 — Progressive disclosure | 25–32 | Simple mode one-switch, decluttered defaults, contextual chroma/keyframes, panel density |
| 5 — Forgiveness | 33–40 | history state browser + impact counts, impact-preview confirmations, draft-recovery banner, actionable empty states |
| 6 — Accessibility & Bangla | 41–48 | complete keyboard map + printable sheet, ARIA/focus-trap audit, Bangla primary chrome (57/57 audited = 100%), contrast/reduced-motion/44px |
| 7 — Perceived performance | 49–54 | lazy panels + post-paint properties, skeletons on every long async surface, direct-DOM playhead/scrub (playback 5.2 s = 1 render, scrub 99 moves = 0 renders) |
| 8 — Delight & release | 55–60 | film-strip export progress + one-shot success burst, press/lift/pop micro-interaction system, help mirrors the features, v1.1.0 release |

Phase-8 detail (this release's delta):

- **Days 55–56** — `ExportFilmStrip` (16 brand-gradient cells + sprocket rows +
  sweeping playhead; finalizing pulse; honest tooltip: progress segments, not
  decoded frames) and `ExportSuccessBurst` (single ring + 12 brand bits, ends
  invisible; pop-in check; gradient "Export complete!"). CSS-only, one-shot,
  covered by the reduced-motion blanket PLUS an explicit reduce rule.
- **Days 57–58** — the three-verb motion system: PRESS (global
  `button:not(:disabled):active` scale 0.96 + 130ms brand-bezier base
  transition), LIFT (opt-in `.nc-mi-lift` on queue rows), POP (`.nc-pop-in` on
  checklist + export success). Disabled buttons and drag surfaces excluded.
- **Day 59** — ShortcutsDialog "New in v1.1.0" block (7 capabilities with
  where-to-find-them) + full-site sweep (404, 6 dialogs, palette, recovery
  banner, mobile fit).
- **Day 60** — this report + version bump + catalog recount + tag.

## 3. Honest catalog at release

Read from the running app's tool-wall chips (source: `src/lib/tools/catalog.ts`):

| Chip | Count |
| --- | --- |
| Live | **329** |
| Beta | **8** |
| Roadmap (planned) | **272** |
| All (incl. 140 role entries) | 749 |

No entries were flipped during Phase 8 — celebration, motion and help work are
editor chrome, not catalog tools. The 272 planned entries remain genuinely
absent from the code and say so on the tool wall.

## 4. Known limitations at v1.1.0

1. **272 planned tools** — see §3; each carries a recorded audit verdict.
2. **Export is client-side** (MediaRecorder/canvas) — real-time-bound; no server render farm.
3. **Bangla coverage is primary-chrome** (57/57 audited labels = 100%); deep
   tooltips, catalog descriptions and long-form help (incl. the whats-new
   block) stay English by design — disclosed in the switch toast.
4. **Paint <1 s** was met on some dev runs only; dev-mode inflation (~2×) means
   the production paint number is disclosed as unmeasurable in this sandbox.
5. **Turso production mode** is wired but this release was validated against the
   SQLite dev fallback; run the deploy checklist (below) on first prod deploy.

## 5. Release artifacts

- `package.json` → `1.1.0`; `public/manifest.webmanifest` → `"version": "1.1.0"`
- `README.md` — new "UX 60-day edition (v1.1.0)" matrix section + refreshed honesty counts
- `docs/UX-60-DAYS.md` — all 8 phases ✅ with commit hashes; honesty ledger intact
- `worklog.md` → Tasks UX60-9 … UX60-12 with today's receipts
- Git tag `v1.1.0` pushed with the release commit
- Deploy: reuse `docs/DEPLOY-v1.0.0.md` (Vercel + Turso steps unchanged for this release)
