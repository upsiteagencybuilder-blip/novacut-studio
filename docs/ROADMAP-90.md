# NovaCut — 90-Day Development Roadmap

> **Cadence**: every single day ships something real (feature / fix / verified flip), follows the
> serial sector protocol — implement → lint + filtered tsc → agent-browser E2E (desktop + mobile)
> → worklog entry → Bengali report → `git push origin main`.
> **Tracking**: each day = one worklog Task ID (`Day-01` … `Day-90`).

---

## 0. Current State Inventory (survey date: Day 0)

| Area | Status |
| --- | --- |
| Editor core | Timeline, clips, trim/split/ripple, JKL shuttle, In/Out + Lift/Extract, Blade, nudge, zoom-fit — all live |
| Motion | 29 live tools (keyframes basics, transforms) |
| Sound | 26 live — 64 music loops, 200 SFX, favorites/recents, beat quantize, offline mixdown |
| VFX / Filters / Color | 24 / 12 / 10 live; 17 canvas blend modes incl. Linear Dodge (Add) |
| Transitions | 18 live |
| Delivery | 19 live — VP9 video export, WAV/MP3 mixdown, SRT sidecar, timecode burn-in, bitrate ladder |
| AI | Copilot, Script Writer, Captions (transcribe), Voiceover (tts), AI Image — all with pro busy-bars (elapsed, phase, Cancel) |
| Cloud | Turso-backed project backup (health / backup / restore / upsert / delete) with SQLite dev fallback — Sector 15 done |
| PWA | Direct install flow, service worker, offline-first shell |
| Tool catalog | **216 live / 310 planned (SOON)** — honesty rule: flip only with real feature + deep link + E2E proof |
| Known backlog | audio-extract voice FX, favorites/recents for video effects, per-effect custom controls (pitch/mix), beat-sync markers, share viewer page |

**Biggest SOON backlogs**: color 49 · vfx 52 · timeline 51 · delivery 36 · filters 29 · sound 26.

---

## 1. Category A — Core Editing Engine (Days 1–10)

| Day | Deliverable |
| --- | --- |
| 1 | Keyframes v2 — per-property curve editor (easing presets + visual graph) |
| 2 | Multi-select + batch ops (marquee, shift-click, group move/delete/scale) |
| 3 | Magnetic timeline + ripple/roll/slip/slide edit modes |
| 4 | Nested / compound clips (group → single block, double-click to enter) |
| 5 | Speed ramps — per-segment speed with smooth curves |
| 6 | Per-effect custom controls (pitch slider, mix knob) — woven backlog item |
| 7 | Favorites + Recents extended to ALL FX panels (video effects, transitions, text) |
| 8 | Timeline markers — colored pins, labels, jump navigation |
| 9 | Paste attributes — copy FX/motion/transform between clips |
| 10 | Transform presets library + Category A audit & stress E2E |

## 2. Category B — Visual FX & Color (Days 11–20)

| Day | Deliverable |
| --- | --- |
| 11 | Adjustment layers — FX applied over a track range |
| 12 | Color grading — RGB curves editor |
| 13 | Color wheels (lift / gamma / gain) + compare split view |
| 14 | LUT import (.cube parser) + built-in LUT library |
| 15 | Scopes — histogram + luma waveform preview panel |
| 16 | Shape masks (rect / ellipse) with keyframed position/scale |
| 17 | Chroma key v2 — spill suppression, tolerance + edge UI |
| 18 | AI background removal integrated as one-tap clip FX |
| 19 | Overlay pack — light leaks, film grain, vignette presets gallery |
| 20 | Blend preset gallery + Category B audit; first color/filters SOON batch flip |

## 3. Category C — Audio Suite (Days 21–30)

| Day | Deliverable |
| --- | --- |
| 21 | Audio-extract → voice FX chain (extract, then pitch/tempo/formant FX) — woven item |
| 22 | Voice FX presets (robot, deep, chipmunk, radio, telephone) |
| 23 | Per-clip + per-track EQ (3-band, then 10-band) |
| 24 | Compressor + noise gate + offline de-noise |
| 25 | Auto-ducking v2 — threshold-based music under speech |
| 26 | Beat-sync markers — detected beats become timeline markers — woven item |
| 27 | Multi-track mixing console (volume / pan / mute / solo strips) |
| 28 | Reverb + delay sends; fade-curve editor (linear / ease / hold) |
| 29 | Waveform upgrades — RMS view, per-clip normalize, zoom |
| 30 | Loudness normalize (target LUFS) + master meters + Category C audit |

## 4. Category D — AI Studio (Days 31–40)

| Day | Deliverable |
| --- | --- |
| 31 | Copilot v2 — multi-step edit sequences from one chat instruction |
| 32 | AI subtitles — translation (multi-language) + styled caption presets |
| 33 | TTS expansion — more voices, speed/pitch controls, per-language picks |
| 34 | AI BGM — mood → music arrangement from loop library |
| 35 | Auto-reframe — subject-aware aspect-ratio crop |
| 36 | AI thumbnails — title-card generator + best-frame picker |
| 37 | Script → storyboard — shot list that scaffolds the timeline |
| 38 | Silence scan v2 + one-tap jump-cut removal |
| 39 | AI asset search (stickers/bg) with drag-to-timeline |
| 40 | AI ops dashboard (latency/cost visible) + Category D audit |

## 5. Category E — Cloud, Sync & Collaboration (Days 41–50)

| Day | Deliverable |
| --- | --- |
| 41 | Media manifest sync — project payload + asset hash map |
| 42 | Asset upload pipeline (media binaries travel with the backup) |
| 43 | Project versioning — snapshot history, restore any version |
| 44 | Debounced auto-save to cloud + offline queue with retry |
| 45 | Share links — read-only viewer page (`/s/[id]`) |
| 46 | Cross-device restore polish — media re-link flow |
| 47 | In-app feedback widget → existing `Feedback` model wiring |
| 48 | Auth scaffolding (NextAuth) — optional sign-in, device linking |
| 49 | Cloud project manager — rename / duplicate / folder chips |
| 50 | Cloud E2E suite (multi-tab, quota, conflict) + Category E audit |

## 6. Category F — Export & Delivery (Days 51–58)

| Day | Deliverable |
| --- | --- |
| 51 | Export preset manager — YouTube / Reels / TikTok / Square bundles |
| 52 | 4K + 60 fps path with quality ladder verification |
| 53 | GIF export + PNG frame-sequence export |
| 54 | Subtitle burn toggle + SRT/VTT/ASS sidecars |
| 55 | Branding kit — logo watermark, intro/outro auto-attach |
| 56 | Export queue — multiple jobs, background, cancel |
| 57 | Web Share API + clipboard share helpers |
| 58 | Delivery SOON batch flip (36 backlog) + Category F audit |

## 7. Category G — PWA, Performance & Reliability (Days 59–66)

| Day | Deliverable |
| --- | --- |
| 59 | Full offline mode — editor shell + assets cached by service worker |
| 60 | IndexedDB autosave hardening + storage manager (quota, cleanup) |
| 61 | Virtualized timeline — smooth at 100+ clips |
| 62 | Memory budget — media eviction, preview resolution scaling |
| 63 | Startup budget + code splitting audit |
| 64 | Error boundaries + local telemetry + crash-recovery dialog |
| 65 | Undo/redo depth + visual History panel |
| 66 | Stress E2E (long projects) + Category G audit |

## 8. Category H — Templates, Onboarding & Growth (Days 67–74)

| Day | Deliverable |
| --- | --- |
| 67 | Template gallery v1 — ready-made edit structures |
| 68 | Template apply → timeline scaffold with media placeholders |
| 69 | Onboarding tour v2 — contextual feature tips |
| 70 | i18n scaffold (bn / en) via next-intl |
| 71 | Custom keyboard-shortcut editor |
| 72 | Command palette (⌘K) — every live tool reachable by keyboard |
| 73 | Accessibility pass — ARIA, focus rings, contrast |
| 74 | Docs/README polish + Category H audit |

## 9. Category I — Tools-Wall Honesty Batches & v1.0 (Days 75–90)

Every flip follows the honesty rule: real behavior behind the entry + deep link + E2E proof.

| Days | Batch (SOON → live target) |
| --- | --- |
| 75–78 | Color + filters (~78 backlog entries — biggest visual wins first) |
| 79–82 | VFX (52) |
| 83–85 | Timeline (51) |
| 86–87 | Delivery (36) |
| 88 | Sound (26) |
| 89 | AI + panels + libraries + motion |
| 90 | **v1.0.0** — full regression across all categories, version tag, Vercel+Turso deploy checklist, release report |

---

## 10. Daily Protocol (mental preparation contract)

1. Read last worklog entry → pick today's row (no scope drift).
2. Implement → `bun run lint` → `bunx tsc --noEmit | grep -v "examples/\|skills/"` → clean only.
3. agent-browser E2E on the exact feature — desktop (1280×800) + mobile (390×844), receipts stored.
4. Append worklog (`Day-XX`) → Bengali report to user → `git push origin main`.
5. If a planned item proves too large: ship the honest subset, move remainder to next day — never fake progress, never ask the user what to do.

## 11. Weekly Rhythm

- **Every 10 days** (end of category): full-category regression E2E + catalog audit + plan delta notes.
- **Every 7 days**: repo hygiene — dependency review, bundle-size check, worklog digest.

## 12. Non-Negotiables

- Serial discipline: one category at a time, days in order.
- Honesty: SOON stays SOON until proven; fallbacks named; no invented credentials.
- Local-first never breaks: cloud features degrade gracefully offline.
- Zero-error bar: dev.log + console clean on every shipped day.
