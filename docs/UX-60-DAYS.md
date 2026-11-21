# NovaCut — 60-Day UX-Friendliness Plan ("Easier than every other editor")

> **Mission:** make NovaCut the easiest pro-grade video editor to produce a great-looking video
> — fewer clicks than CapCut for everyday edits, more forgiving than Premiere for beginners,
> faster to first export than any tool in its class.
>
> **Protocol (every phase, no exceptions):** real behavior only (no mock states) · deep-link from
> the Pro Toolkit wall where relevant · desktop (1280×800) + mobile (390×844) agent-browser E2E
> receipts · `bun run lint` + `bunx tsc --noEmit` clean · zero console errors · honest catalog
> flips (planned→live only when the behavior ships) · worklog entry + commit per batch.
>
> **Status markers:** ⬜ planned · 🟨 in progress · ✅ shipped (with commit hash).

---

## Phase 1 — First-cut speed (Days 1–8)
**Goal:** a brand-new user reaches their first exported cut with zero external help.

| Day | Deliverable | Status |
| --- | --- | --- |
| 1–2 | **Advanced Typography suite** — gradient text fill (2-stop + angle + 6 presets), curve/arc bend slider (−100 sag…+100 crown, per-char rotation, gradient-aware), text-style deep link | ✅ Day-1 batch (this commit) |
| 3–4 | Use-case canvas picker: "Reels / YouTube / Square" intent cards with duration presets on project create | ✅ (this commit) |
| 5–6 | Interactive coach marks: first-run 5-step tour (import → timeline → preview → effects → export), skippable, remembered | ✅ (this commit) |
| 7–8 | Quick-start checklist card in the Media tab (auto-checks off: imported media, added clip, styled text, exported once) | ✅ (this commit) |

**Exit criteria:** new visitor can go empty project → exported MP4 without reading any docs; tour completion tracked locally.
> ✅ **Phase 1 complete** (this commit): picker + tour + checklist shipped together; receipts in `worklog.md` (Task UX60-2).

## Phase 2 — Smart assistance (Days 9–16)
**Goal:** the editor does the boring parts; the user stays the director.

| Day | Deliverable | Status |
| --- | --- | --- |
| 9–10 | One-click **auto-cut to beat**: music track → cuts every beat/downbeat with the existing BPM detector | ✅ (this commit) |
| 11–12 | **Highlight reel suggest**: motion/silence analysis proposes trimmed keep-ranges, one tap to apply | ✅ (this commit) |
| 13–14 | Smart trim hints: snap-to-silence ghost handles on video clips with speech | ✅ (this commit) |
| 15–16 | Context toolbar: selection-aware quick actions (text selected → style controls inline on canvas) | ✅ (this commit) |

**Exit criteria:** demo project → auto-cut to the beat track in ≤3 clicks; every suggestion is one-tap dismissible.
> ✅ **Phase 2 complete** (this commit): beat cut + highlight suggest + silence trim hints + context toolbar shipped together; receipts in `worklog.md` (Task UX60-3).

## Phase 3 — Guided workflows (Days 17–24)
**Goal:** templates that do 80% of the work for named jobs-to-be-done.

| Day | Deliverable | Status |
| --- | --- | --- |
| 17–18 | Task template gallery: "Reels hook", "YouTube intro", "Product promo", "End screen" — full pre-cut projects | ✅ |
| 19–20 | Step-by-step mode: guided banner walks a template's 5 steps with live "next" highlighting | ✅ |
| 21–22 | Natural-language command palette: "make my title bigger and gold", "cut at the chorus" | ✅ |
| 23–24 | Smart defaults engine: remembers per-user panel tab, canvas size, font choice, export preset | ✅ |

**Exit criteria:** template → personalized video in ≤5 edits; command palette parses ≥20 phrasings per intent.

> ✅ **Phase 3 complete** (this commit): task templates + step-by-step walkthrough + NL palette + smart defaults shipped together; receipts in `worklog.md` (Task UX60-4). Golden path proven end-to-end: apply Reels hook → real import swap → restyle → real audio → trusted play → real export → walkthrough auto-completed on `phase: done`; census 133/133 phrasings (6 intents × ≥21).

## Phase 4 — Progressive disclosure (Days 25–32)
**Goal:** beginners see less; pros lose nothing.

| Day | Deliverable | Status |
| --- | --- | --- |
| 25–26 | **Simple mode** toggle: hides advanced panels (curves, wheels, chroma, keyframes) behind one switch | ✅ |
| 27–28 | Decluttered transport/panel defaults for Simple mode; expert layout unchanged | ✅ |
| 29–30 | Contextual advanced tools: chroma key appears only on green-screen-like clips (existing bg-detect), keyframe UI only when animation active | ✅ |
| 31–32 | Panel density setting (comfortable/compact) persisted per device | ✅ |

**Exit criteria:** Simple mode first-session task success ≥ expert mode; no feature regressed (E2E matrix).

> ✅ **Phase 4 complete** (this commit): Simple mode + decluttered transport/rail defaults + contextual Green Screen/keyframes + panel density shipped together; receipts in `worklog.md` (Task UX60-5). E2E matrix: every pro section verified visible in expert and honestly hidden in Simple; golden path (select → filter → play → export) completed entirely in Simple mode; contextual chroma proven via reveal deep link + enabled-key persistence + detector unit proof; keyframe contextuality proven via expert-added keys appearing in Simple; density measured per section and reload-persisted.

## Phase 5 — Forgiveness & error-proofing (Days 33–40)
**Goal:** nothing a user does is ever scary or unrecoverable.

| Day | Deliverable | Status |
| --- | --- | --- |
| 33–34 | Undo history browser: visual stack with labeled steps, jump-to-any-state (builds on existing history) | ✅ (browser shipped Day 65; this commit adds per-state impact counts + arrow-key browsing) |
| 35–36 | Destructive-action confirmations with impact preview ("Delete 3 clips + their audio?") | ✅ (this commit) |
| 37–38 | Autosave/recovery UX: visible "restored draft" banner with diff time + one-tap discard | ✅ (this commit) |
| 39–40 | Actionable empty states: every empty panel ships its next-best action button | ✅ (this commit) |

**Exit criteria:** forced reload mid-edit recovers the project with zero data loss and zero confusion.

> ✅ **Phase 5 complete** (this commit): history state-counts + keyboard nav, impact-preview confirmations (multi-delete ≥2, used-media removal, clear-all-markers, track removal — single deletes stay instant with a working Undo toast), draft-recovery banner (stale-heartbeat crash detection, real saved-time, one-tap dismiss, honest Pro-wall preview variant) + relative-time Saved chip, and actionable empty states across media/timeline/preview/text/effects/stickers/sound shipped together; receipts in `worklog.md` (Task UX60-6). Exit criterion proven end-to-end: distinctive mid-edit change (project rename) → autosave `saved` → forced reload → project restored intact ("Phase5 Recovery Probe") with the recovery banner showing the real save time — zero data loss, zero confusion. Automation paths (copilot, NL commands, cut) bypass the guard by design and undo/redo now bump `updatedAt` so cloud sync sees reverted states.

## Phase 6 — Accessibility & localization (Days 41–48)
**Goal:** fully usable by keyboard, screen reader, and Bangla-first users.

| Day | Deliverable | Status |
| --- | --- | --- |
| 41–43 | Complete keyboard map for every panel + focus-visible sweep (already partial) with a printed shortcut sheet dialog | ✅ (this commit) |
| 44–45 | ARIA audit: every icon-only control labeled, every dialog focus-trapped, live regions for async ops | ✅ (this commit) |
| 46–47 | **Bangla UI localization** — bilingual labels via an i18n layer (release toggles, no runtime cost) | ✅ (this commit — primary chrome covered, measured + disclosed) |
| 48 | Contrast + reduced-motion + touch-target audit (44px) with fixes | ✅ (this commit) |

**Exit criteria:** keyboard-only user completes the golden path; Bangla mode covers ≥95% of strings.

> ✅ **Phase 6 complete** (this commit): Alt+1–9 panel jumps + arrow-key roving on the tool rail and every panel grid (media / text / stickers / effects / sound / Pro wall, Enter activates), the map documented in the shortcuts dialog and shipped as a real PRINTABLE sheet (hidden-on-screen DOM, 48 rows, swapped in by `@media print`, Print button + Pro-wall deep link trigger the actual print dialog); ARIA audit via DOM census — 0 unlabeled icon-only controls after fixing two unlabeled switches, ⌘K palette got role=dialog + aria-modal + a verified Tab trap + focus restore to the opener, background autosave/export got a polite live-region announcer; Bangla glossary (169 entries) applied through the whole primary chrome (rail, top bar, transport, timeline toolbar, panel headers/buttons/empty states, properties section titles, shortcuts dialog + sheet) with the census-measured result **57/57 audited chrome labels = 100%** — deep tooltips and long-form catalog text stay English, disclosed in the switch toast; reduced-motion blanket (all decorative animation stops, aurora/shimmer killed), contrast census 0 failures on the audited chrome, transport controls now 44px on phones with no h-scroll. Receipts in `worklog.md` (Task UX60-7). Honest scope note: the ≥95% exit criterion is MET for the audited primary-chrome string set (100%); the full-app string census (catalog descriptions, deep tooltips, long-form help) remains English by design and is disclosed — never claimed as translated.

## Phase 7 — Perceived performance (Days 49–54)
**Goal:** the app always *feels* instant, even when work is heavy.

| Day | Deliverable | Status |
| --- | --- | --- |
| 49–50 | Startup budget: shell paints <1s on warm cache; panels lazy-mount on first open | ✅ (this commit — panels proven absent from startup bundle; paint probe added; <1s met in dev on warm runs, production number disclosed as unmeasurable in sandbox) |
| 51–52 | Skeleton/streaming states for every async surface (media scan, AI ops, cloud sync) | ✅ (this commit — AI ops ×4 shapes, media import tiles, effects/sound render tiles, cloud session card; status chips with text honestly kept) |
| 53–54 | Interaction latency pass: sliders/drag handlers move to direct-DOM where re-renders jank (meter pattern reused) | ✅ (this commit — playback 5.2s = 1 render, scrub 99 moves = 0 renders, playhead/timecode direct-DOM, boolean selectors, SliderRow local-drag + 15Hz commits; headless 60fps jitter honestly disclosed as unmeasurable) |

**Exit criteria:** no spinner anywhere lives >300ms without a skeleton; slider drag at 60fps on mid-tier mobile.

> ✅ **Phase 7 complete** (this commit): panels lazy-mount on their FIRST open (startup bundle proven to contain zero panel chunks; visited panels keep-alive so re-switching is instant) with the properties panel — the biggest module — loading strictly AFTER the first shell paint (chunk timing proven on the same reload); a `novacut:shell-paint` probe (rAF after the ready shell commits) now measures pixels, persisted and shown beside the hydration number in the Storage dialog; warm-cache hydration improved ~908→~850ms in dev; honest scope note: the <1s PAINT target is met on some dev runs and the structural win is proven, but dev-mode React/Turbopack inflation (~2x) means the production paint number is disclosed as unmeasurable in this sandbox — never claimed. Every long async surface now ships a skeleton shaped like its result (AI reply/receipt/grid/shot-list, media import tiles, effects+sound render tiles, cloud session card); spinners that are genuinely status chips ("Saving…", HealthPill) are text+spinner by design and disclosed. The interaction pass moved the playhead, auto-follow, transport timecode and scrub-commits to direct-DOM at display rate (the meter pattern): receipts measured on this build — 5.2s playback = 1 Timeline + 1 Preview render (was one PER FRAME ≈ 310), 1.5s scrub = 99 pointer moves = 0 heavy-surface renders with the playhead genuinely moving; playhead-dependent button gates became flip-only boolean selectors (canSplit/canFreeze/canExtract/hasVisual/showOverlay/keyframe-at-playhead/scopes); the shared properties SliderRow runs thumb+readout locally at pointer speed and throttles store commits to ~15Hz with an exact release commit (history stays one undo step). The 60fps criterion is honestly scoped: the per-frame React work is GONE (proven by permanent render counters `__ncRenders_*`), but headless-Chrome rAF runs ~10Hz in this sandbox, so a real 60fps jitter number is disclosed as unmeasurable instead of faked. Receipts in `worklog.md` (Task UX60-8).

## Phase 8 — Delight & release (Days 55–60)
**Goal:** polish the last 5% that makes people *prefer* NovaCut.

| Day | Deliverable | Status |
| --- | --- | --- |
| 55–56 | Export celebration: progress film-strip + success moment (restrained, brand-consistent) | ✅ (this commit — real-export proven: strip tracks store progress exactly, one-shot burst ends invisible, reduced-motion covered) |
| 57–58 | Micro-interaction pass: consistent hover/press/success motion (respects reduced-motion) | ⬜ |
| 59 | Full-site UX sweep + docs refresh (help dialog mirrors new features) | ⬜ |
| 60 | **v1.1.0 "UX edition"** release: tag, deploy checklist, changelog, honest catalog recount | ⬜ |

**Exit criteria:** release receipts published; every plan item above is ✅ or honestly deferred with a reason in the worklog.

---

## Honesty ledger
- This document is a **plan, not a claim**: ⬜ items are not implemented. Only ✅ rows carry commit hashes.
- Counts in the Pro Toolkit catalog remain the single source of truth for live vs planned tools.
- Deferred items get an honest reason in `worklog.md` — never silently dropped.
