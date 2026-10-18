/**
 * NovaCut Studio — Motion presets (40 definitions)
 *
 * 4 families × 10 camera-move presets:
 *   Ken Burns In  — engine `zoomIn` across 10 intensity steps (0.1..0.95)
 *   Cinema Pans   — engine panLeft/Right/Up/Down at 2-3 intensities
 *   Orbit & Spin  — `none` motion + transform keyframes (rotation breathe,
 *                   x/y arcs via a mid anchor at 0.5)
 *   Punch & Pop   — beat-drop scale pops via keyframes, or strong zoomIn +
 *                   a rotation kick
 *
 * Keyframe value semantics (see MotionEffect in './types'):
 *   `at` is a FRACTION of clip duration (0 | 0.5 | 1), x/y are -1..1 canvas
 *   fractions, scale 0.1..5 (1 = fit), rotation in degrees.
 * Pure-keyframe presets set motionIntensity 0 and carry the 'keys-only' tag
 * (engine motion is 'none'; all movement comes from the keys).
 */

import type { EasingType, KeyframeProperty, MotionType } from '@/lib/editor/types'
import type { MotionEffect } from './types'

/* ---------------- helpers ---------------- */

interface KeySpec {
  property: KeyframeProperty
  at: 0 | 0.5 | 1
  value: number
  easing: EasingType
}

function key(property: KeyframeProperty, at: 0 | 0.5 | 1, value: number, easing: EasingType): KeySpec {
  return { property, at, value, easing }
}

/** straight ramp from `from` (at 0) to `to` (at 1) */
function ramp(property: KeyframeProperty, from: number, to: number, easing: EasingType): KeySpec[] {
  return [key(property, 0, from, easing), key(property, 1, to, easing)]
}

/** out-and-back through a mid anchor (arc / swing / pop shapes) */
function arc(property: KeyframeProperty, mid: number, end: number, easing: EasingType): KeySpec[] {
  return [key(property, 0, 0, easing), key(property, 0.5, mid, easing), key(property, 1, end, easing)]
}

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
  motion: MotionType,
  motionIntensity: number,
  keys: KeySpec[] | undefined,
  extraTags: string[],
): MotionEffect {
  return {
    id: `motion-${slug}-${nextSeq(slug)}`,
    name,
    family,
    category: 'motion',
    tags: ['motion', slug, ...extraTags],
    emoji,
    motion,
    motionIntensity,
    ...(keys && keys.length > 0 ? { keys } : {}),
  }
}

/* ---------------- Ken Burns In (10) — zoomIn intensity ladder ---------------- */

const KEN_BURNS: Array<{ label: string; intensity: number; tags: string[] }> = [
  { label: 'Subtle Push', intensity: 0.1, tags: ['subtle'] },
  { label: 'Gentle Push', intensity: 0.2, tags: ['light'] },
  { label: 'Soft Drift In', intensity: 0.3, tags: ['light'] },
  { label: 'Steady Push', intensity: 0.4, tags: ['medium'] },
  { label: 'Classic Zoom', intensity: 0.5, tags: ['medium', 'classic'] },
  { label: 'Bold Push', intensity: 0.6, tags: ['bold'] },
  { label: 'Strong Climb', intensity: 0.7, tags: ['strong'] },
  { label: 'Deep Climb', intensity: 0.8, tags: ['strong'] },
  { label: 'Towering Climb', intensity: 0.9, tags: ['heavy'] },
  { label: 'Epic Climb', intensity: 0.95, tags: ['extreme'] },
]

function buildKenBurns(): MotionEffect[] {
  return KEN_BURNS.map((v) =>
    mk('ken-burns', 'Ken Burns In', `Ken Burns In · ${v.label}`, '🔍', 'zoomIn', v.intensity, undefined, ['zoom-in', 'ken-burns', v.tags[0]]),
  )
}

/* ---------------- Cinema Pans (10) — 4 directions × 2-3 intensities ---------------- */

const PANS: Array<{ label: string; motion: MotionType; intensity: number; dir: string; tags: string[] }> = [
  { label: 'Drift Left', motion: 'panLeft', intensity: 0.3, dir: 'left', tags: ['subtle'] },
  { label: 'Glide Left', motion: 'panLeft', intensity: 0.6, dir: 'left', tags: ['medium'] },
  { label: 'Sweep Left', motion: 'panLeft', intensity: 0.9, dir: 'left', tags: ['strong'] },
  { label: 'Drift Right', motion: 'panRight', intensity: 0.3, dir: 'right', tags: ['subtle'] },
  { label: 'Glide Right', motion: 'panRight', intensity: 0.6, dir: 'right', tags: ['medium'] },
  { label: 'Sweep Right', motion: 'panRight', intensity: 0.9, dir: 'right', tags: ['strong'] },
  { label: 'Rise Up', motion: 'panUp', intensity: 0.4, dir: 'up', tags: ['medium'] },
  { label: 'Soar Up', motion: 'panUp', intensity: 0.8, dir: 'up', tags: ['strong'] },
  { label: 'Sink Down', motion: 'panDown', intensity: 0.4, dir: 'down', tags: ['medium'] },
  { label: 'Plunge Down', motion: 'panDown', intensity: 0.8, dir: 'down', tags: ['strong'] },
]

function buildPans(): MotionEffect[] {
  return PANS.map((v) =>
    mk('pans', 'Cinema Pans', `Cinema Pans · ${v.label}`, '🎥', v.motion, v.intensity, undefined, ['pan', v.dir, v.tags[0]]),
  )
}

/* ---------------- Orbit & Spin (10) — none + rotation breathe / arcs ----------------
 * Rotation is kept in the ±6..±20° band and paired with a slight scale-up
 * (≥1.06) so rotating a fitted image never reveals empty corners.
 */

function buildOrbitSpin(): MotionEffect[] {
  const ease: EasingType = 'easeInOut'
  return [
    mk('orbit-spin', 'Orbit & Spin', 'Orbit & Spin · Gentle Orbit', '🌀', 'none', 0, [...ramp('rotation', 0, 6, ease), ...ramp('scale', 1, 1.08, ease)], ['keys-only', 'breathe', 'cw']),
    mk('orbit-spin', 'Orbit & Spin', 'Orbit & Spin · Lazy Susan', '🌀', 'none', 0, [...ramp('rotation', 0, 12, 'linear'), ...ramp('scale', 1, 1.12, 'easeOut')], ['keys-only', 'turntable', 'cw']),
    mk('orbit-spin', 'Orbit & Spin', 'Orbit & Spin · Pendulum Sway', '🌀', 'none', 0, [...arc('rotation', 6, -6, ease), ...ramp('scale', 1, 1.06, ease)], ['keys-only', 'swing']),
    mk('orbit-spin', 'Orbit & Spin', 'Orbit & Spin · Compass Swing', '🌀', 'none', 0, [...arc('rotation', 8, -8, ease), ...ramp('scale', 1, 1.1, ease)], ['keys-only', 'swing', 'wobble']),
    mk('orbit-spin', 'Orbit & Spin', 'Orbit & Spin · Hypnotic Spin', '🌀', 'none', 0, [...ramp('rotation', 0, 20, 'linear'), ...ramp('scale', 1, 1.15, ease)], ['keys-only', 'spin', 'cw', 'hypnotic']),
    mk('orbit-spin', 'Orbit & Spin', 'Orbit & Spin · Drift Arc', '🌀', 'none', 0, [...arc('x', 0.1, 0, ease), ...ramp('y', 0, -0.08, ease), ...ramp('rotation', 0, 6, ease), ...ramp('scale', 1, 1.08, ease)], ['keys-only', 'arc', 'drift']),
    mk('orbit-spin', 'Orbit & Spin', 'Orbit & Spin · Carousel Drift', '🌀', 'none', 0, [...ramp('rotation', 0, 8, ease), ...ramp('x', -0.05, 0.05, ease), ...ramp('scale', 1, 1.1, ease)], ['keys-only', 'carousel']),
    mk('orbit-spin', 'Orbit & Spin', 'Orbit & Spin · Twirl Bloom', '🌀', 'none', 0, [...ramp('rotation', 0, 16, 'easeOut'), ...ramp('scale', 1, 1.18, 'easeOut')], ['keys-only', 'twirl', 'cw']),
    mk('orbit-spin', 'Orbit & Spin', 'Orbit & Spin · Sway & Breathe', '🌀', 'none', 0, [...ramp('rotation', 0, -9, ease), ...ramp('scale', 1, 1.14, ease)], ['keys-only', 'breathe', 'ccw']),
    mk('orbit-spin', 'Orbit & Spin', 'Orbit & Spin · Zen Orbit', '🌀', 'none', 0, [...ramp('rotation', 0, -14, 'linear'), ...ramp('scale', 1, 1.1, ease)], ['keys-only', 'orbit', 'ccw']),
  ]
}

/* ---------------- Punch & Pop (10) — beat-drop pops ---------------- */

function buildPunchPop(): MotionEffect[] {
  const ease: EasingType = 'easeInOut'
  const easeOut: EasingType = 'easeOut'
  const easeIn: EasingType = 'easeIn'
  /** scale 1 → punch to `mid` at 0.5 → settle at `end` (per-segment easing) */
  const popScale = (mid: number, end: number, midEasing: EasingType, endEasing: EasingType): KeySpec[] => [
    key('scale', 0, 1, midEasing),
    key('scale', 0.5, mid, midEasing),
    key('scale', 1, end, endEasing),
  ]
  return [
    // scale 1 → punch at the midpoint → settles slightly above fit
    mk('punch-pop', 'Punch & Pop', 'Punch & Pop · Beat Punch', '🥊', 'none', 0, popScale(1.12, 1.02, easeOut, ease), ['keys-only', 'beat', 'scale-pop']),
    mk('punch-pop', 'Punch & Pop', 'Punch & Pop · Hard Punch', '🥊', 'none', 0, popScale(1.2, 1.04, easeOut, 'bounce'), ['keys-only', 'beat', 'scale-pop', 'bounce']),
    mk('punch-pop', 'Punch & Pop', 'Punch & Pop · Micro Pop', '🥊', 'none', 0, popScale(1.06, 1, ease, ease), ['keys-only', 'subtle', 'scale-pop']),
    mk('punch-pop', 'Punch & Pop', 'Punch & Pop · Heartbeat', '🥊', 'none', 0, [...popScale(1.08, 1.03, ease, ease), ...arc('rotation', 1.5, 0, ease)], ['keys-only', 'pulse']),
    mk('punch-pop', 'Punch & Pop', 'Punch & Pop · Snap Pop', '🥊', 'none', 0, popScale(1.15, 1, easeOut, 'bounce'), ['keys-only', 'snap', 'bounce']),
    // strong zoomIn + rotation kick (no scale keys — engine motion zooms, keys kick)
    mk('punch-pop', 'Punch & Pop', 'Punch & Pop · Kick In', '🥊', 'zoomIn', 0.75, [...arc('rotation', 4, 0, easeOut)], ['zoom-in', 'rotation-kick', 'beat']),
    mk('punch-pop', 'Punch & Pop', 'Punch & Pop · Bass Drop', '🥊', 'zoomIn', 0.9, [...arc('rotation', -5, 0, easeOut)], ['zoom-in', 'rotation-kick', 'drop']),
    mk('punch-pop', 'Punch & Pop', 'Punch & Pop · Punch Left', '🥊', 'none', 0, [...arc('x', -0.05, 0, easeOut), ...popScale(1.1, 1.03, easeOut, easeOut)], ['keys-only', 'sideways', 'scale-pop']),
    mk('punch-pop', 'Punch & Pop', 'Punch & Pop · Rise Punch', '🥊', 'none', 0, [...arc('y', -0.06, 0, easeOut), ...popScale(1.1, 1.04, easeOut, easeOut)], ['keys-only', 'rise', 'scale-pop']),
    mk('punch-pop', 'Punch & Pop', 'Punch & Pop · Double Drop', '🥊', 'zoomIn', 0.85, [...arc('y', -0.04, 0, easeIn)], ['zoom-in', 'drop', 'beat']),
  ]
}

/* ---------------- assembly (4 × 10 = 40) ---------------- */

export const MOTION_EFFECTS: MotionEffect[] = [
  ...buildKenBurns(),
  ...buildPans(),
  ...buildOrbitSpin(),
  ...buildPunchPop(),
]
