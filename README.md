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
- **Command palette (⌘K)** — 27 live commands, every one dispatching to a real feature
- **Accessibility** — global focus-visible ring, skip link, landmarks, contrast promotions

### Cloud (optional)
- Device-key based project backup/restore to Turso, share links, versioned snapshots, feedback —
  all self-gated; the editor stays 100% functional signed-out (local-first)

---

## Honesty rule

Every user-facing entry point does what it says. Planned-but-missing features are labeled
**planned** in the Pro Toolkit catalog (289 live / 291 planned) and never fake behavior.
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

## License

Proprietary — © NovaCut Studio.
