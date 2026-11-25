# NovaCut Studio

**A professional, installable PWA video editor that runs entirely in your browser — local-first, honest by design.**

Trim and cut on a multi-track timeline, add text, stickers, cinematic filters and motion, edit audio with real metering, export MP4/WebM/GIF/PNG — and nothing ever leaves your device unless you explicitly enable cloud backup.

---

## Feature matrix (what actually ships)

### Editing core
- Multi-track timeline (video / overlay / audio) with drag, trim, snap, razor, ripple & roll tools
- **Virtualized timeline** — only viewport clips exist in the DOM; smooth at 100+ clips
- Undo/redo with **150 labeled steps** + visual Edit-history panel (click any step to jump)
- Compound (nested) clips, markers, beat detection, In/Out points, JKL shuttle
- Text engine (fonts, styles, animations), stickers, transitions, keyframes, speed ramps

### Visuals & audio
- 1000+ effect presets browser, color grading, LUT support, chroma key, compare-split view
- Adaptive **preview resolution** (auto de-scales under load, honest badge, exports always full-res)
- WebAudio mixer: per-track EQ, effects, meters, ducking, voice FX, noise gate

### AI
- AI copilot (chat → timeline actions), auto-cut suggestions, background removal,
  silence detection, audio denoise & pitch tools — all clearly disclosed local heuristics/SDK calls

### Export & delivery
- MP4 (WebMVP9/H264), WebM, GIF, PNG sequences, audio-only — with a **sequential render queue**
- Branding kits, watermark, timecode burn-in, captions (SRT/VTT), TikTok bundle
- Web Share API + clipboard helpers with truthful disabled states on unsupported browsers

### Platform (PWA)
- Installable, offline-capable shell (**service worker precache + full offline reload verified**)
- **Storage manager**: live quota bar, IndexedDB counts, orphan cleanup, factory reset
- **Memory budget**: media blobs evictable under a configurable RAM cap with transparent rehydration from IndexedDB
- **Crash safety**: boundary with recovery screen, local-only telemetry log, unclean-exit detection
- **Startup budget**: measured hydration time, disclosed in the Storage panel

### Productivity (Category H)
- **Template gallery** — 8 built-in edit structures (TikTok Hook, Trailer, Tutorial…) applied as real timeline scaffolds with honest placeholders, one-step undo
- **Onboarding v2** — contextual tips fired once on measured conditions
- **i18n scaffold (en/bn)** — cookie-driven locale, hand-written Bengali onboarding door
- **Editable keyboard shortcuts** — capture UI, conflict detection, device-local persistence, safe reset
- **Command palette (⌘K)** — honest search; natural-language phrasings ("make my title bigger and gold") resolve to real actions
- **Accessibility** — global focus-visible ring, skip link, landmarks, contrast promotions

### UX 60-day edition (v1.1.0)
- **First-cut speed** — use-case canvas picker, first-run coach marks, quick-start checklist
- **Smart assistance** — one-click cut-to-beat, highlight-reel suggest, silence-snap trim hints, selection-aware context toolbar
- **Guided workflows** — 4 task templates (Reels hook / YouTube intro / promo / end screen), step-by-step walkthrough banner, smart defaults that remember your panel/canvas/export preset
- **Progressive disclosure** — one-switch Simple mode, contextual chroma/keyframe tools, comfortable/compact density
- **Forgiveness** — history state browser with impact counts, impact-preview confirmations, draft-recovery banner, actionable empty states
- **Accessibility & Bangla** — complete keyboard map (Alt+1–9) + printable sheet, ARIA/focus-trap audit, Bangla primary chrome, contrast/reduced-motion/44px audits
- **Perceived performance** — lazy panels + post-paint properties load, real skeletons on every long async surface, direct-DOM playhead/scrub (1 render per playback, not per frame)
- **Delight** — film-strip export progress + one-shot success burst (reduced-motion safe), consistent press/lift/pop micro-interactions, help dialog mirroring the new features

### Cloud (optional)
- Device-key based project backup/restore to Turso, share links, versioned snapshots, feedback —
  all self-gated; the editor stays 100% functional signed-out (local-first)

---

## Honesty rule

Every user-facing entry point does what it says. Planned-but-missing features are labeled
**planned** in the Pro Toolkit catalog (336 live · 8 beta · 265 planned) and never fake behavior.
Numbers shown in the UI (storage, startup ms, cache files, command counts) are **measured live**.

---

## Development

```bash
bun install
bun run dev          # http://localhost:3000
bun run lint         # ESLint
bunx tsc --noEmit    # TypeScript
bun run db:push      # sync Prisma schema (SQLite dev fallback)
```

- **Stack**: Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · Prisma (SQLite dev / Turso prod) · Zustand · WebAudio · Canvas 2D
- **Local-first persistence**: IndexedDB (projects, media blobs, versions) + localStorage (settings)
- Deployment to Vercel + Turso: see [README-DEPLOY.md](./README-DEPLOY.md)

---

## Key source map

| Path | What lives there |
| --- | --- |
| `src/lib/editor/` | store (Zustand), engine (canvas render), audio, exporter, memory-manager, shortcuts, command-palette, templates |
| `src/components/editor/` | shell, timeline, preview, panels, dialogs, error boundary, command palette |
| `src/lib/cloud/` | optional Turso-backed backup/share/feedback |
| `src/i18n/` + `messages/` | next-intl config and en/bn catalogs |
| `docs/ROADMAP-90.md` | the 90-day build plan with the daily protocol |
| `docs/UX-60-DAYS.md` | the 60-day UX-friendliness plan (v1.1.0 arc) |

## License

Proprietary — © NovaCut Studio.
