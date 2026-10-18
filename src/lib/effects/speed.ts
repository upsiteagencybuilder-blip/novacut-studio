/**
 * NovaCut Studio — Speed presets (25 definitions)
 *
 * 5 families × 5 playback-rate presets:
 *   Slow-Motion  (0.25..0.75)  — cinematic slow-down
 *   Fast-Forward (1.5..4)      — everyday speed-ups
 *   Time-Lapse   (6..15)       — extreme compression, static-scene feel
 *   Hyper Speed  (18..50)      — stylized blur-run pacing
 *   Micro Adjust (0.85..1.25)  — subtle pacing nudges around 1×
 *
 * NOTE: the engine clamps media playbackRate to [0.0625, 16]
 * (engine.ts `el.playbackRate = clamp(clip.speed, ...)`), so Hyper Speed
 * values above 16 play at the browser cap — kept here because the presets
 * still compress clip duration exactly (duration ÷ speed) regardless.
 */

import type { SpeedEffect } from './types'

/* ---------------- helpers ---------------- */

const seqs = new Map<string, number>()
function nextSeq(slug: string): string {
  const n = (seqs.get(slug) ?? 0) + 1
  seqs.set(slug, n)
  return String(n).padStart(2, '0')
}

function mk(
  slug: string,
  family: string,
  name: string,
  emoji: string,
  speed: number,
  hint: string,
  extraTags: string[],
): SpeedEffect {
  return {
    id: `speed-${slug}-${nextSeq(slug)}`,
    name,
    family,
    category: 'speed',
    tags: ['speed', slug, `${speed}x`, ...extraTags],
    emoji,
    speed,
    hint,
  }
}

/* ---------------- Slow-Motion (5) ---------------- */

const SLOW: Array<{ label: string; speed: number; hint: string; tags: string[] }> = [
  { label: 'Bullet Time', speed: 0.25, hint: 'dreamy slow motion for hero moments', tags: ['extreme-slow'] },
  { label: 'Dramatic Slow-Mo', speed: 0.35, hint: 'cinematic tension and reveals', tags: ['dramatic'] },
  { label: 'Cinema Slow', speed: 0.5, hint: 'classic half-speed slow motion', tags: ['classic'] },
  { label: 'Smooth Slow', speed: 0.6, hint: 'gentle, easy-going slow down', tags: ['smooth'] },
  { label: 'Lazy Sunday', speed: 0.75, hint: 'breezy relaxed pacing', tags: ['subtle'] },
]

function buildSlow(): SpeedEffect[] {
  return SLOW.map((v) => mk('slow-mo', 'Slow-Motion', `Slow-Motion · ${v.label}`, '🐌', v.speed, v.hint, ['slower', ...v.tags]))
}

/* ---------------- Fast-Forward (5) ---------------- */

const FAST: Array<{ label: string; speed: number; hint: string; tags: string[] }> = [
  { label: 'Quick Pace', speed: 1.5, hint: 'tighten the pace slightly', tags: ['subtle'] },
  { label: 'Double Time', speed: 2, hint: 'classic 2× speed-up', tags: ['classic'] },
  { label: 'Brisk Forward', speed: 2.5, hint: 'energetic fast-forward', tags: ['energetic'] },
  { label: 'Triple Time', speed: 3, hint: 'fast montage pacing', tags: ['montage'] },
  { label: 'Cartoon Rush', speed: 4, hint: 'comedic, zippy speed-up', tags: ['comedic'] },
]

function buildFast(): SpeedEffect[] {
  return FAST.map((v) => mk('fast-forward', 'Fast-Forward', `Fast-Forward · ${v.label}`, '⏩', v.speed, v.hint, ['faster', ...v.tags]))
}

/* ---------------- Time-Lapse (5) ---------------- */

const LAPSE: Array<{ label: string; speed: number; hint: string; tags: string[] }> = [
  { label: 'Cloud Sprint', speed: 6, hint: 'clouds race across the sky', tags: ['nature'] },
  { label: 'City Pulse', speed: 8, hint: 'street traffic becomes light trails', tags: ['urban'] },
  { label: 'Day Sprinter', speed: 10, hint: 'compress a whole scene', tags: ['scene'] },
  { label: 'Sun Chaser', speed: 12, hint: 'sunset in the blink of an eye', tags: ['nature'] },
  { label: 'Life Unfolds', speed: 15, hint: 'long-form moments, seconds long', tags: ['extreme'] },
]

function buildLapse(): SpeedEffect[] {
  return LAPSE.map((v) => mk('time-lapse', 'Time-Lapse', `Time-Lapse · ${v.label}`, '⏱️', v.speed, v.hint, ['lapse', 'faster', ...v.tags]))
}

/* ---------------- Hyper Speed (5) ---------------- */

const HYPER: Array<{ label: string; speed: number; hint: string; tags: string[] }> = [
  { label: 'Warp Dash', speed: 18, hint: 'blistering dash through footage', tags: ['dash'] },
  { label: 'Lightspeed', speed: 24, hint: 'sci-fi pacing, frames melt', tags: ['scifi'] },
  { label: 'Blur Run', speed: 30, hint: 'motion-blur energy rush', tags: ['rush'] },
  { label: 'Warp Factor', speed: 40, hint: 'absurd, stylized velocity', tags: ['stylized'] },
  { label: 'Ludicrous Speed', speed: 50, hint: 'maximum chaos — use with intent', tags: ['extreme'] },
]

function buildHyper(): SpeedEffect[] {
  return HYPER.map((v) => mk('hyper-speed', 'Hyper Speed', `Hyper Speed · ${v.label}`, '🚀', v.speed, v.hint, ['hyper', 'faster', ...v.tags]))
}

/* ---------------- Micro Adjust (5) ---------------- */

const MICRO: Array<{ label: string; speed: number; hint: string; tags: string[] }> = [
  { label: 'Slight Brake', speed: 0.85, hint: 'a touch more breathing room', tags: ['slower', 'subtle'] },
  { label: 'Easy Pace', speed: 0.9, hint: 'soft, relaxed rhythm', tags: ['slower', 'subtle'] },
  { label: 'Light Push', speed: 1.1, hint: 'gently tighten the pace', tags: ['faster', 'subtle'] },
  { label: 'Brisk Nudge', speed: 1.15, hint: 'snappier without being fast', tags: ['faster', 'subtle'] },
  { label: 'Snappy Beat', speed: 1.25, hint: 'punchy rhythm for cuts', tags: ['faster', 'snappy'] },
]

function buildMicro(): SpeedEffect[] {
  return MICRO.map((v) => mk('micro-adjust', 'Micro Adjust', `Micro Adjust · ${v.label}`, '🎚️', v.speed, v.hint, v.tags))
}

/* ---------------- assembly (5 × 5 = 25) ---------------- */

export const SPEED_EFFECTS: SpeedEffect[] = [
  ...buildSlow(),
  ...buildFast(),
  ...buildLapse(),
  ...buildHyper(),
  ...buildMicro(),
]
