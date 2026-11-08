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
| 3–4 | Use-case canvas picker: "Reels / YouTube / Square" intent cards with duration presets on project create | ⬜ |
| 5–6 | Interactive coach marks: first-run 5-step tour (import → timeline → preview → effects → export), skippable, remembered | ⬜ |
| 7–8 | Quick-start checklist card in the Media tab (auto-checks off: imported media, added clip, styled text, exported once) | ⬜ |

**Exit criteria:** new visitor can go empty project → exported MP4 without reading any docs; tour completion tracked locally.

## Phase 2 — Smart assistance (Days 9–16)
**Goal:** the editor does the boring parts; the user stays the director.

| Day | Deliverable | Status |
| --- | --- | --- |
| 9–10 | One-click **auto-cut to beat**: music track → cuts every beat/downbeat with the existing BPM detector | ⬜ |
| 11–12 | **Highlight reel suggest**: motion/silence analysis proposes trimmed keep-ranges, one tap to apply | ⬜ |
| 13–14 | Smart trim hints: snap-to-silence ghost handles on video clips with speech | ⬜ |
| 15–16 | Context toolbar: selection-aware quick actions (text selected → style controls inline on canvas) | ⬜ |

**Exit criteria:** demo project → auto-cut to the beat track in ≤3 clicks; every suggestion is one-tap dismissible.

## Phase 3 — Guided workflows (Days 17–24)
**Goal:** templates that do 80% of the work for named jobs-to-be-done.

| Day | Deliverable | Status |
| --- | --- | --- |
| 17–18 | Task template gallery: "Reels hook", "YouTube intro", "Product promo", "End screen" — full pre-cut projects | ⬜ |
| 19–20 | Step-by-step mode: guided banner walks a template's 5 steps with live "next" highlighting | ⬜ |
| 21–22 | Natural-language command palette: "make my title bigger and gold", "cut at the chorus" | ⬜ |
| 23–24 | Smart defaults engine: remembers per-user panel tab, canvas size, font choice, export preset | ⬜ |

**Exit criteria:** template → personalized video in ≤5 edits; command palette parses ≥20 phrasings per intent.

## Phase 4 — Progressive disclosure (Days 25–32)
**Goal:** beginners see less; pros lose nothing.

| Day | Deliverable | Status |
| --- | --- | --- |
| 25–26 | **Simple mode** toggle: hides advanced panels (curves, wheels, chroma, keyframes) behind one switch | ⬜ |
| 27–28 | Decluttered transport/panel defaults for Simple mode; expert layout unchanged | ⬜ |
| 29–30 | Contextual advanced tools: chroma key appears only on green-screen-like clips (existing bg-detect), keyframe UI only when animation active | ⬜ |
| 31–32 | Panel density setting (comfortable/compact) persisted per device | ⬜ |

**Exit criteria:** Simple mode first-session task success ≥ expert mode; no feature regressed (E2E matrix).

## Phase 5 — Forgiveness & error-proofing (Days 33–40)
**Goal:** nothing a user does is ever scary or unrecoverable.

| Day | Deliverable | Status |
| --- | --- | --- |
| 33–34 | Undo history browser: visual stack with labeled steps, jump-to-any-state (builds on existing history) | ⬜ |
| 35–36 | Destructive-action confirmations with impact preview ("Delete 3 clips + their audio?") | ⬜ |
| 37–38 | Autosave/recovery UX: visible "restored draft" banner with diff time + one-tap discard | ⬜ |
| 39–40 | Actionable empty states: every empty panel ships its next-best action button | ⬜ |

**Exit criteria:** forced reload mid-edit recovers the project with zero data loss and zero confusion.

## Phase 6 — Accessibility & localization (Days 41–48)
**Goal:** fully usable by keyboard, screen reader, and Bangla-first users.

| Day | Deliverable | Status |
| --- | --- | --- |
| 41–43 | Complete keyboard map for every panel + focus-visible sweep (already partial) with a printed shortcut sheet dialog | ⬜ |
| 44–45 | ARIA audit: every icon-only control labeled, every dialog focus-trapped, live regions for async ops | ⬜ |
| 46–47 | **Bangla UI localization** — bilingual labels via an i18n layer (release toggles, no runtime cost) | ⬜ |
| 48 | Contrast + reduced-motion + touch-target audit (44px) with fixes | ⬜ |

**Exit criteria:** keyboard-only user completes the golden path; Bangla mode covers ≥95% of strings.

## Phase 7 — Perceived performance (Days 49–54)
**Goal:** the app always *feels* instant, even when work is heavy.

| Day | Deliverable | Status |
| --- | --- | --- |
| 49–50 | Startup budget: shell paints <1s on warm cache; panels lazy-mount on first open | ⬜ |
| 51–52 | Skeleton/streaming states for every async surface (media scan, AI ops, cloud sync) | ⬜ |
| 53–54 | Interaction latency pass: sliders/drag handlers move to direct-DOM where re-renders jank (meter pattern reused) | ⬜ |

**Exit criteria:** no spinner anywhere lives >300ms without a skeleton; slider drag at 60fps on mid-tier mobile.

## Phase 8 — Delight & release (Days 55–60)
**Goal:** polish the last 5% that makes people *prefer* NovaCut.

| Day | Deliverable | Status |
| --- | --- | --- |
| 55–56 | Export celebration: progress film-strip + success moment (restrained, brand-consistent) | ⬜ |
| 57–58 | Micro-interaction pass: consistent hover/press/success motion (respects reduced-motion) | ⬜ |
| 59 | Full-site UX sweep + docs refresh (help dialog mirrors new features) | ⬜ |
| 60 | **v1.1.0 "UX edition"** release: tag, deploy checklist, changelog, honest catalog recount | ⬜ |

**Exit criteria:** release receipts published; every plan item above is ✅ or honestly deferred with a reason in the worklog.

---

## Honesty ledger
- This document is a **plan, not a claim**: ⬜ items are not implemented. Only ✅ rows carry commit hashes.
- Counts in the Pro Toolkit catalog remain the single source of truth for live vs planned tools.
- Deferred items get an honest reason in `worklog.md` — never silently dropped.
