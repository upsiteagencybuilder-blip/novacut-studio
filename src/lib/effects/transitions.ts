/**
 * NovaCut Studio — Transition effects (240 definitions)
 *
 * 24 families × 10 variants. Each transition is a paired patch:
 *   - `out` is applied to the OUTGOING clip (fadeOut, motion keys anchored 'start'/'end')
 *   - `in`  is applied to the INCOMING clip (fadeIn, motion keys); null when intro/outro-only
 *
 * Keyframe values: x/y are fractions of the canvas (-1.2 = fully off-screen),
 * scale 1 = fit, rotation in degrees, opacity 0..1, iris 0..1 (wipe mask
 * progress). Easing applies per keyframe segment.
 *
 * NOTE (UI copy): applying a transition replaces the clips' transform keyframes —
 * every transition carries the 'replaces-keys' tag so the UI can show a hint.
 *
 * NOTE (Blur family): implemented as pure crossfades — the CSS `blur` filter is
 * NOT keyframable by the keyframe engine, so blur itself cannot animate (tagged
 * 'blur-not-keyframable').
 *
 * v2 families (Task 10-a): Whip Pan, Cube Spin, Swap, Warp Zoom, Stutter Cut.
 * Stutter Cut uses opacity keyframes (opacity IS keyframable) for
 * dip-to-black/white shutters; Whip Pan/Swap keep fades minimal (0–0.15s).
 *
 * v3 families (Sector 5): Film Dissolve (crossfade + gate weave) and TRUE
 * shape wipes — Iris Round/Box/Diamond/Cross, Clock Wipe, Barn Doors, Split —
 * driven by the keyframable 'iris' property rendered as an animated canvas
 * mask on the incoming clip while the engine's transition bridge keeps the
 * outgoing clip playing underneath.
 */

import type { EasingType, KeyframeProperty, WipeShape } from '@/lib/editor/types'
import type { TransitionEffect, TransitionPatch } from './types'

/* ---------------- helpers ---------------- */

type Dir = 'Left' | 'Right' | 'Up' | 'Down'

interface AxisSpec {
  prop: KeyframeProperty
  sign: -1 | 1
  tag: string
}

/** Left = motion toward -x, Right = +x, Up = -y, Down = +y. */
const DIR_AXIS: Record<Dir, AxisSpec> = {
  Left: { prop: 'x', sign: -1, tag: 'left' },
  Right: { prop: 'x', sign: 1, tag: 'right' },
  Up: { prop: 'y', sign: -1, tag: 'up' },
  Down: { prop: 'y', sign: 1, tag: 'down' },
}

interface KeyPair {
  property: KeyframeProperty
  at: 'start' | 'end'
  value: number
  easing: EasingType
}

function pair(property: KeyframeProperty, from: number, to: number, easing: EasingType): KeyPair[] {
  return [
    { property, at: 'start', value: from, easing },
    { property, at: 'end', value: to, easing },
  ]
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
  duration: number,
  out: TransitionPatch | null,
  inPatch: TransitionPatch | null,
  extraTags: string[],
): TransitionEffect {
  return {
    id: `transition-${slug}-${nextSeq(slug)}`,
    name,
    family,
    category: 'transition',
    tags: ['transition', 'replaces-keys', slug, `${duration}s`, ...extraTags],
    duration,
    out,
    in: inPatch,
  }
}

function durTag(d: number): string {
  return `${d}s`
}

/* ---------------- Fade family (crossfades + dips) ---------------- */

function buildFade(): TransitionEffect[] {
  const specs: Array<{ label: string; d: number; mode: 'cross' | 'dip' | 'intro' }> = [
    { label: 'Swift', d: 0.2, mode: 'cross' },
    { label: 'Fast', d: 0.3, mode: 'cross' },
    { label: 'Smooth', d: 0.5, mode: 'cross' },
    { label: 'Gentle', d: 0.8, mode: 'cross' },
    { label: 'Cinematic', d: 1.0, mode: 'cross' },
    { label: 'Slow', d: 1.2, mode: 'cross' },
    { label: 'Dramatic', d: 1.5, mode: 'cross' },
    { label: 'Dip to Black', d: 0.5, mode: 'dip' },
    { label: 'Long Dip', d: 1.2, mode: 'dip' },
    { label: 'Intro', d: 1.0, mode: 'intro' },
  ]
  return specs.map((s) => {
    const tags = [durTag(s.d)]
    if (s.mode === 'dip') tags.push('dip-to-black', 'linear')
    if (s.mode === 'intro') tags.push('intro-only')
    return mk(
      'fade',
      'Fade',
      `Fade · ${s.label}`,
      s.d,
      s.mode === 'intro' ? null : { fadeOut: s.d },
      { fadeIn: s.d },
      tags,
    )
  })
}

/* ---------------- Dissolve family (fades + slow drift) ---------------- */

function buildDissolve(): TransitionEffect[] {
  const ease: EasingType = 'easeInOut'
  const drift = (prop: KeyframeProperty, from: number, to: number) => pair(prop, from, to, ease)
  return [
    mk('dissolve', 'Dissolve', 'Dissolve · Soft', 0.5, { fadeOut: 0.5 }, { fadeIn: 0.5 }, ['soft']),
    mk('dissolve', 'Dissolve', 'Dissolve · Smooth', 0.8, { fadeOut: 0.8 }, { fadeIn: 0.8 }, ['smooth']),
    mk('dissolve', 'Dissolve', 'Dissolve · Slow', 1.2, { fadeOut: 1.2 }, { fadeIn: 1.2 }, ['slow']),
    mk('dissolve', 'Dissolve', 'Dissolve · Dreamy', 1.5, { fadeOut: 1.5 }, { fadeIn: 1.5 }, ['dreamy']),
    mk('dissolve', 'Dissolve', 'Dissolve · Drift Up', 0.8, { fadeOut: 0.8, keys: drift('y', 0, -0.12) }, { fadeIn: 0.8, keys: drift('y', 0.12, 0) }, ['drift', 'up']),
    mk('dissolve', 'Dissolve', 'Dissolve · Drift Down', 0.8, { fadeOut: 0.8, keys: drift('y', 0, 0.12) }, { fadeIn: 0.8, keys: drift('y', -0.12, 0) }, ['drift', 'down']),
    mk('dissolve', 'Dissolve', 'Dissolve · Drift Left', 1.0, { fadeOut: 1.0, keys: drift('x', 0, -0.12) }, { fadeIn: 1.0, keys: drift('x', 0.12, 0) }, ['drift', 'left']),
    mk('dissolve', 'Dissolve', 'Dissolve · Drift Right', 1.0, { fadeOut: 1.0, keys: drift('x', 0, 0.12) }, { fadeIn: 1.0, keys: drift('x', -0.12, 0) }, ['drift', 'right']),
    mk('dissolve', 'Dissolve', 'Dissolve · Zoom Fade', 1.0, { fadeOut: 1.0, keys: drift('scale', 1, 1.1) }, { fadeIn: 1.0, keys: drift('scale', 0.94, 1) }, ['zoom-fade']),
    mk('dissolve', 'Dissolve', 'Dissolve · Deep', 1.5, { fadeOut: 1.5, keys: drift('y', 0, -0.18) }, { fadeIn: 1.5, keys: drift('y', 0.18, 0) }, ['deep', 'drift']),
  ]
}

/* ---------------- Slide family (directional move + fades) ---------------- */

const DIR_10: Array<{ dir: Dir; label: string; d: number }> = [
  { dir: 'Left', label: 'Swift', d: 0.2 },
  { dir: 'Right', label: 'Swift', d: 0.2 },
  { dir: 'Left', label: 'Fast', d: 0.3 },
  { dir: 'Right', label: 'Fast', d: 0.3 },
  { dir: 'Up', label: 'Smooth', d: 0.5 },
  { dir: 'Down', label: 'Smooth', d: 0.5 },
  { dir: 'Left', label: 'Cinematic', d: 0.8 },
  { dir: 'Right', label: 'Cinematic', d: 0.8 },
  { dir: 'Up', label: 'Slow', d: 1.2 },
  { dir: 'Down', label: 'Dramatic', d: 1.5 },
]

function buildSlide(): TransitionEffect[] {
  return DIR_10.map((s) => {
    const a = DIR_AXIS[s.dir]
    return mk(
      'slide',
      'Slide',
      `Slide ${s.dir} · ${s.label}`,
      s.d,
      { fadeOut: s.d, keys: pair(a.prop, 0, a.sign * 1.2, 'easeInOut') },
      { fadeIn: s.d, keys: pair(a.prop, -a.sign * 1.2, 0, 'easeInOut') },
      [a.tag],
    )
  })
}

/* ---------------- Push family (directional move, NO fades) ---------------- */

function buildPush(): TransitionEffect[] {
  return DIR_10.map((s) => {
    const a = DIR_AXIS[s.dir]
    return mk(
      'push',
      'Push',
      `Push ${s.dir} · ${s.label}`,
      s.d,
      { keys: pair(a.prop, 0, a.sign * 1.2, 'easeInOut') },
      { keys: pair(a.prop, -a.sign * 1.2, 0, 'easeInOut') },
      [a.tag, 'no-fade'],
    )
  })
}

/* ---------------- Wipe family (linear directional sweep + fades) ---------------- */

function buildWipe(): TransitionEffect[] {
  return DIR_10.map((s) => {
    const a = DIR_AXIS[s.dir]
    return mk(
      'wipe',
      'Wipe',
      `Wipe ${s.dir} · ${s.label}`,
      s.d,
      { fadeOut: s.d, keys: pair(a.prop, 0, a.sign * 0.55, 'linear') },
      { fadeIn: s.d, keys: pair(a.prop, -a.sign * 0.9, 0, 'linear') },
      [a.tag, 'linear'],
    )
  })
}

/* ---------------- Zoom family (scale keys + fades) ---------------- */

function buildZoom(): TransitionEffect[] {
  const ease: EasingType = 'easeInOut'
  return [
    mk('zoom', 'Zoom', 'Zoom In · Fast', 0.3, { fadeOut: 0.3, keys: pair('scale', 1, 1.35, 'easeIn') }, { fadeIn: 0.3, keys: pair('scale', 0.5, 1, 'easeOut') }, ['zoom-in']),
    mk('zoom', 'Zoom', 'Zoom In · Smooth', 0.5, { fadeOut: 0.5, keys: pair('scale', 1, 1.5, ease) }, { fadeIn: 0.5, keys: pair('scale', 0.5, 1, ease) }, ['zoom-in']),
    mk('zoom', 'Zoom', 'Zoom In · Cinematic', 0.8, { fadeOut: 0.8, keys: pair('scale', 1, 1.6, ease) }, { fadeIn: 0.8, keys: pair('scale', 0.5, 1, ease) }, ['zoom-in']),
    mk('zoom', 'Zoom', 'Zoom In · Dramatic', 1.2, { fadeOut: 1.2, keys: pair('scale', 1, 1.7, ease) }, { fadeIn: 1.2, keys: pair('scale', 0.45, 1, ease) }, ['zoom-in', 'dramatic']),
    mk('zoom', 'Zoom', 'Zoom Out · Fast', 0.3, { fadeOut: 0.3, keys: pair('scale', 1, 1.35, 'easeIn') }, { fadeIn: 0.3, keys: pair('scale', 1.8, 1, 'easeOut') }, ['zoom-out']),
    mk('zoom', 'Zoom', 'Zoom Out · Smooth', 0.5, { fadeOut: 0.5, keys: pair('scale', 1, 1.5, ease) }, { fadeIn: 0.5, keys: pair('scale', 1.8, 1, ease) }, ['zoom-out']),
    mk('zoom', 'Zoom', 'Zoom Out · Cinematic', 0.8, { fadeOut: 0.8, keys: pair('scale', 1, 1.6, ease) }, { fadeIn: 0.8, keys: pair('scale', 1.8, 1, ease) }, ['zoom-out']),
    mk('zoom', 'Zoom', 'Zoom Out · Dramatic', 1.2, { fadeOut: 1.2, keys: pair('scale', 1, 1.7, ease) }, { fadeIn: 1.2, keys: pair('scale', 1.9, 1, ease) }, ['zoom-out', 'dramatic']),
    mk('zoom', 'Zoom', 'Zoom Punch · Extreme', 0.2, { fadeOut: 0.2, keys: pair('scale', 1, 1.9, 'easeIn') }, { fadeIn: 0.2, keys: pair('scale', 1.9, 1, 'easeOut') }, ['punch', 'extreme']),
    mk('zoom', 'Zoom', 'Zoom Whisper · Slow', 1.5, { fadeOut: 1.5, keys: pair('scale', 1, 1.25, ease) }, { fadeIn: 1.5, keys: pair('scale', 1.15, 1, ease) }, ['whisper', 'subtle']),
  ]
}

/* ---------------- Spin family (rotation keys + fades) ---------------- */

function buildSpin(): TransitionEffect[] {
  const rot = (from: number, to: number, easing: EasingType) => pair('rotation', from, to, easing)
  return [
    mk('spin', 'Spin', 'Spin CW · Fast', 0.3, { fadeOut: 0.3, keys: rot(0, 180, 'easeIn') }, { fadeIn: 0.3, keys: rot(-180, 0, 'easeOut') }, ['cw']),
    mk('spin', 'Spin', 'Spin CW · Smooth', 0.5, { fadeOut: 0.5, keys: rot(0, 180, 'easeInOut') }, { fadeIn: 0.5, keys: rot(-180, 0, 'easeInOut') }, ['cw']),
    mk('spin', 'Spin', 'Spin CW · Dramatic', 1.0, { fadeOut: 1.0, keys: rot(0, 180, 'easeInOut') }, { fadeIn: 1.0, keys: rot(-180, 0, 'easeInOut') }, ['cw', 'dramatic']),
    mk('spin', 'Spin', 'Spin CCW · Fast', 0.3, { fadeOut: 0.3, keys: rot(0, -180, 'easeIn') }, { fadeIn: 0.3, keys: rot(180, 0, 'easeOut') }, ['ccw']),
    mk('spin', 'Spin', 'Spin CCW · Smooth', 0.5, { fadeOut: 0.5, keys: rot(0, -180, 'easeInOut') }, { fadeIn: 0.5, keys: rot(180, 0, 'easeInOut') }, ['ccw']),
    mk('spin', 'Spin', 'Spin CCW · Dramatic', 1.0, { fadeOut: 1.0, keys: rot(0, -180, 'easeInOut') }, { fadeIn: 1.0, keys: rot(180, 0, 'easeInOut') }, ['ccw', 'dramatic']),
    mk('spin', 'Spin', 'Spin CW · Bounce', 0.8, { fadeOut: 0.6, keys: rot(0, 180, 'bounce') }, { fadeIn: 0.6, keys: rot(-180, 0, 'bounce') }, ['cw', 'bounce']),
    mk('spin', 'Spin', 'Spin CCW · Bounce', 0.8, { fadeOut: 0.6, keys: rot(0, -180, 'bounce') }, { fadeIn: 0.6, keys: rot(180, 0, 'bounce') }, ['ccw', 'bounce']),
    mk('spin', 'Spin', 'Spin Tornado · Extreme', 0.5, { fadeOut: 0.5, keys: rot(0, 360, 'easeIn') }, { fadeIn: 0.5, keys: rot(-360, 0, 'easeOut') }, ['extreme', 'tornado']),
    mk('spin', 'Spin', 'Spin Soft · Slow', 1.5, { fadeOut: 1.5, keys: rot(0, 90, 'easeInOut') }, { fadeIn: 1.5, keys: rot(-90, 0, 'easeInOut') }, ['soft', 'subtle']),
  ]
}

/* ---------------- Glitch family (very short fades + scale/rotation pops) ---------------- */

function buildGlitch(): TransitionEffect[] {
  const easeIn: EasingType = 'easeIn'
  const easeOut: EasingType = 'easeOut'
  const glitch = (
    label: string,
    d: number,
    fade: number,
    pop: number,
    tags: string[],
    rot = 0,
    yShift = 0,
  ) =>
    mk(
      'glitch',
      'Glitch',
      `Glitch · ${label}`,
      d,
      {
        fadeOut: fade,
        keys: [
          ...pair('scale', 1, pop, easeIn),
          ...(rot !== 0 ? pair('rotation', 0, rot, easeIn) : []),
          ...(yShift !== 0 ? pair('y', 0, yShift, easeIn) : []),
        ],
      },
      {
        fadeIn: fade,
        keys: [
          ...pair('scale', pop + 0.04, 1, easeOut),
          ...(rot !== 0 ? pair('rotation', -rot, 0, easeOut) : []),
          ...(yShift !== 0 ? pair('y', -yShift, 0, easeOut) : []),
        ],
      },
      tags,
    )
  return [
    glitch('Snap', 0.2, 0.08, 1.05, ['snap']),
    glitch('Micro', 0.2, 0.06, 1.03, ['micro'], 1.5),
    glitch('Stutter', 0.3, 0.1, 1.08, ['stutter'], 0, 0.02),
    glitch('Jolt', 0.3, 0.1, 1.05, ['jolt'], 3),
    glitch('Shatter', 0.5, 0.12, 1.15, ['shatter'], 2),
    glitch('Double', 0.5, 0.12, 1.1, ['double'], 0, 0.03),
    glitch('Rupture', 0.8, 0.15, 1.2, ['rupture'], 4, 0.04),
    glitch('Extreme', 0.5, 0.1, 1.25, ['extreme'], 6),
    glitch('Surge', 1.0, 0.25, 1.12, ['surge'], 0, 0.05),
    glitch('Chaos', 0.8, 0.12, 1.18, ['chaos'], -5, -0.04),
  ]
}

/* ---------------- Blur family (crossfade only — blur is not keyframable) ---------------- */

function buildBlur(): TransitionEffect[] {
  const specs: Array<{ label: string; d: number; mode: 'cross' | 'intro' | 'outro' }> = [
    { label: 'Swift', d: 0.2, mode: 'cross' },
    { label: 'Smooth', d: 0.5, mode: 'cross' },
    { label: 'Gentle', d: 0.8, mode: 'cross' },
    { label: 'Cinematic', d: 1.0, mode: 'cross' },
    { label: 'Slow', d: 1.2, mode: 'cross' },
    { label: 'Dreamy', d: 1.5, mode: 'cross' },
    { label: 'Feather', d: 0.8, mode: 'cross' },
    { label: 'Whisper', d: 1.0, mode: 'cross' },
    { label: 'Intro', d: 1.0, mode: 'intro' },
    { label: 'Outro', d: 1.0, mode: 'outro' },
  ]
  return specs.map((s) => {
    const tags = ['crossfade-only', 'blur-not-keyframable', durTag(s.d)]
    if (s.mode === 'intro') tags.push('intro-only')
    if (s.mode === 'outro') tags.push('outro-only')
    return mk(
      'blur',
      'Blur',
      `Blur Crossfade · ${s.label}`,
      s.d,
      s.mode === 'intro' ? null : { fadeOut: s.d },
      s.mode === 'outro' ? null : { fadeIn: s.d },
      tags,
    )
  })
}

/* ---------------- Flash family (strobe-like short fades + pops) ---------------- */

function buildFlash(): TransitionEffect[] {
  return [
    mk('flash', 'Flash', 'Flash · Snap', 0.2, { fadeOut: 0.06 }, { fadeIn: 0.1, keys: pair('scale', 1.1, 1, 'easeOut') }, ['snap']),
    mk('flash', 'Flash', 'Flash · Micro', 0.2, { fadeOut: 0.05 }, { fadeIn: 0.08, keys: pair('scale', 1.05, 1, 'easeOut') }, ['micro']),
    mk('flash', 'Flash', 'Flash · Pop', 0.3, { fadeOut: 0.1 }, { fadeIn: 0.15, keys: pair('scale', 1.15, 1, 'easeOut') }, ['pop']),
    mk('flash', 'Flash', 'Flash · Bang', 0.5, { fadeOut: 0.12 }, { fadeIn: 0.2, keys: pair('scale', 1.25, 1, 'easeOut') }, ['bang']),
    mk('flash', 'Flash', 'Flash · Lightning', 0.3, { fadeOut: 0.05, keys: pair('rotation', 0, 2, 'easeIn') }, { fadeIn: 0.25 }, ['lightning']),
    mk('flash', 'Flash', 'Flash · Camera', 0.5, { fadeOut: 0.3 }, { fadeIn: 0.3, keys: pair('scale', 1.12, 1, 'easeOut') }, ['camera']),
    mk('flash', 'Flash', 'Flash · Burst', 0.8, { fadeOut: 0.3 }, { fadeIn: 0.4, keys: pair('scale', 1.2, 1, 'easeOut') }, ['burst']),
    mk('flash', 'Flash', 'Flash · Impact', 0.3, { fadeOut: 0.15 }, { fadeIn: 0.2, keys: pair('scale', 1.3, 1, 'bounce') }, ['impact', 'bounce']),
    mk('flash', 'Flash', 'Flash · Strobe', 0.5, { fadeOut: 0.08, keys: pair('scale', 1, 1.06, 'easeIn') }, { fadeIn: 0.08, keys: pair('scale', 1.06, 1, 'easeOut') }, ['strobe']),
    mk('flash', 'Flash', 'Flash · Whiteout', 1.0, { fadeOut: 1.0 }, { fadeIn: 1.0 }, ['whiteout', 'slow']),
  ]
}

/* ---------------- Reveal family (incoming grows into place) ---------------- */

function buildReveal(): TransitionEffect[] {
  const ease: EasingType = 'easeInOut'
  return [
    mk('reveal', 'Reveal', 'Reveal · Zoom Soft', 0.5, { fadeOut: 0.5 }, { fadeIn: 0.5, keys: pair('scale', 0.6, 1, ease) }, ['zoom']),
    mk('reveal', 'Reveal', 'Reveal · Gentle', 0.8, { fadeOut: 0.8 }, { fadeIn: 0.8, keys: pair('scale', 0.6, 1, ease) }, ['gentle']),
    mk('reveal', 'Reveal', 'Reveal · Cinematic', 1.0, { fadeOut: 1.0 }, { fadeIn: 1.0, keys: pair('scale', 0.6, 1, ease) }, ['cinematic']),
    mk('reveal', 'Reveal', 'Reveal · Dramatic', 1.2, { fadeOut: 1.2 }, { fadeIn: 1.2, keys: pair('scale', 0.5, 1, ease) }, ['dramatic']),
    mk('reveal', 'Reveal', 'Reveal · Snap', 0.3, { fadeOut: 0.2 }, { fadeIn: 0.25, keys: pair('scale', 0.65, 1, 'easeOut') }, ['snap']),
    mk('reveal', 'Reveal', 'Reveal · Grand', 1.5, { fadeOut: 1.5 }, { fadeIn: 1.5, keys: pair('scale', 0.45, 1, ease) }, ['grand']),
    mk('reveal', 'Reveal', 'Reveal · From Below', 0.8, { fadeOut: 0.8 }, { fadeIn: 0.8, keys: pair('y', 0.4, 0, ease) }, ['from-below']),
    mk('reveal', 'Reveal', 'Reveal · From Above', 0.8, { fadeOut: 0.8 }, { fadeIn: 0.8, keys: pair('y', -0.4, 0, ease) }, ['from-above']),
    mk('reveal', 'Reveal', 'Reveal · Unfold', 0.8, { fadeOut: 0.8 }, { fadeIn: 0.8, keys: [...pair('scale', 0.7, 1, ease), ...pair('rotation', -8, 0, ease)] }, ['unfold']),
    mk('reveal', 'Reveal', 'Reveal · Outro', 1.0, { fadeOut: 1.0, keys: pair('scale', 1, 1.1, ease) }, null, ['outro-only']),
  ]
}

/* ---------------- Whip Pan family (fast directional smear, v2) ----------------
 * Hard directional throw ±1.4 with easeIn on the way out / easeOut on the
 * way in, plus near-zero fades (0.02–0.05) for a motion-blur feel.
 */

function buildWhipPan(): TransitionEffect[] {
  const whip = (
    label: string,
    d: number,
    fade: number,
    dirs: Array<{ prop: KeyframeProperty; sign: -1 | 1 }>,
    extraTags: string[],
    extraOutKeys: KeyPair[] = [],
    extraInKeys: KeyPair[] = [],
    sameSideIn = false,
  ): TransitionEffect =>
    mk(
      'whip-pan',
      'Whip Pan',
      `Whip Pan · ${label}`,
      d,
      { fadeOut: fade, keys: [...dirs.flatMap((a) => pair(a.prop, 0, a.sign * 1.4, 'easeIn')), ...extraOutKeys] },
      // camera-pan feel: in arrives from the OPPOSITE side so both clips travel
      // the same direction (Pass-Through flips this: in chases out off the same edge)
      { fadeIn: fade, keys: [...dirs.flatMap((a) => pair(a.prop, (sameSideIn ? a.sign : -a.sign) * 1.4, 0, 'easeOut')), ...extraInKeys] },
      ['whip', 'fast', 'motion-blur-feel', ...extraTags],
    )
  return [
    whip('Left', 0.25, 0.03, [{ prop: 'x', sign: -1 }], ['left']),
    whip('Right', 0.25, 0.03, [{ prop: 'x', sign: 1 }], ['right']),
    whip('Up', 0.3, 0.03, [{ prop: 'y', sign: -1 }], ['up']),
    whip('Down', 0.3, 0.03, [{ prop: 'y', sign: 1 }], ['down']),
    whip('Diagonal', 0.35, 0.04, [{ prop: 'x', sign: -1 }, { prop: 'y', sign: -1 }], ['diagonal']),
    whip('Diagonal Rise', 0.35, 0.04, [{ prop: 'x', sign: 1 }, { prop: 'y', sign: -1 }], ['diagonal', 'rise']),
    whip('Snap', 0.2, 0.02, [{ prop: 'x', sign: -1 }], ['left', 'snap']),
    whip('Soft', 0.45, 0.05, [{ prop: 'x', sign: 1 }], ['right', 'soft']),
    whip('Echo', 0.3, 0.03, [{ prop: 'x', sign: -1 }], ['left', 'echo'], pair('scale', 1, 1.06, 'easeIn'), pair('scale', 1.06, 1, 'easeOut')),
    whip('Pass-Through', 0.3, 0.03, [{ prop: 'x', sign: 1 }], ['right', 'pass-through', 'same-side'], [], [], true),
  ]
}

/* ---------------- Cube Spin family (3D-flavored rotation flip, v2) ----------------
 * ±90°/180° rotations paired with scale crushes (0.6..1.6) and moderate
 * fades — reads like a face of a cube flipping over.
 */

function buildCubeSpin(): TransitionEffect[] {
  return [
    mk(
      'cube-spin', 'Cube Spin', 'Cube Spin · Left', 0.4,
      { fadeOut: 0.35, keys: [...pair('rotation', 0, 90, 'easeIn'), ...pair('scale', 1, 0.6, 'easeIn')] },
      { fadeIn: 0.35, keys: [...pair('rotation', -90, 0, 'easeOut'), ...pair('scale', 0.6, 1, 'easeOut')] },
      ['cw', 'left', '3d'],
    ),
    mk(
      'cube-spin', 'Cube Spin', 'Cube Spin · Right', 0.4,
      { fadeOut: 0.35, keys: [...pair('rotation', 0, -90, 'easeIn'), ...pair('scale', 1, 0.6, 'easeIn')] },
      { fadeIn: 0.35, keys: [...pair('rotation', 90, 0, 'easeOut'), ...pair('scale', 0.6, 1, 'easeOut')] },
      ['ccw', 'right', '3d'],
    ),
    mk(
      'cube-spin', 'Cube Spin', 'Cube Spin · Half Turn', 0.6,
      { fadeOut: 0.55, keys: [...pair('rotation', 0, 180, 'easeInOut'), ...pair('scale', 1, 0.7, 'easeInOut')] },
      { fadeIn: 0.55, keys: [...pair('rotation', -180, 0, 'easeInOut'), ...pair('scale', 0.7, 1, 'easeInOut')] },
      ['cw', '180', '3d'],
    ),
    mk(
      'cube-spin', 'Cube Spin', 'Cube Spin · Flip Up', 0.5,
      { fadeOut: 0.45, keys: [...pair('rotation', 0, 90, 'easeIn'), ...pair('y', 0, -0.25, 'easeIn'), ...pair('scale', 1, 0.75, 'easeIn')] },
      { fadeIn: 0.45, keys: [...pair('rotation', -90, 0, 'easeOut'), ...pair('y', 0.25, 0, 'easeOut'), ...pair('scale', 0.75, 1, 'easeOut')] },
      ['cw', 'vertical', 'up', '3d'],
    ),
    mk(
      'cube-spin', 'Cube Spin', 'Cube Spin · Flip Down', 0.5,
      { fadeOut: 0.45, keys: [...pair('rotation', 0, 90, 'easeIn'), ...pair('y', 0, 0.25, 'easeIn'), ...pair('scale', 1, 0.75, 'easeIn')] },
      { fadeIn: 0.45, keys: [...pair('rotation', -90, 0, 'easeOut'), ...pair('y', -0.25, 0, 'easeOut'), ...pair('scale', 0.75, 1, 'easeOut')] },
      ['ccw', 'vertical', 'down', '3d'],
    ),
    mk(
      'cube-spin', 'Cube Spin', 'Cube Spin · Bounce', 0.6,
      { fadeOut: 0.5, keys: [...pair('rotation', 0, 90, 'bounce'), ...pair('scale', 1, 0.65, 'bounce')] },
      { fadeIn: 0.5, keys: [...pair('rotation', -90, 0, 'easeOut'), ...pair('scale', 0.65, 1, 'easeOut')] },
      ['cw', 'bounce', '3d'],
    ),
    mk(
      'cube-spin', 'Cube Spin', 'Cube Spin · Tumble', 0.7,
      { fadeOut: 0.6, keys: [...pair('rotation', 0, 180, 'easeIn'), ...pair('y', 0, -0.2, 'easeIn'), ...pair('scale', 1, 0.6, 'easeIn')] },
      { fadeIn: 0.6, keys: [...pair('rotation', -180, 0, 'easeOut'), ...pair('y', 0.2, 0, 'easeOut'), ...pair('scale', 0.6, 1, 'easeOut')] },
      ['cw', 'tumble', '3d'],
    ),
    mk(
      'cube-spin', 'Cube Spin', 'Cube Spin · Swift', 0.25,
      { fadeOut: 0.08, keys: [...pair('rotation', 0, 90, 'easeIn'), ...pair('scale', 1, 0.7, 'easeIn')] },
      { fadeIn: 0.08, keys: [...pair('rotation', -90, 0, 'easeOut'), ...pair('scale', 0.7, 1, 'easeOut')] },
      ['cw', 'fast', '3d'],
    ),
    mk(
      'cube-spin', 'Cube Spin', 'Cube Spin · Cinematic', 1.0,
      { fadeOut: 0.9, keys: [...pair('rotation', 0, 90, 'easeInOut'), ...pair('scale', 1, 0.65, 'easeInOut')] },
      { fadeIn: 0.9, keys: [...pair('rotation', -90, 0, 'easeInOut'), ...pair('scale', 0.65, 1, 'easeInOut')] },
      ['cw', 'slow', '3d'],
    ),
    mk(
      'cube-spin', 'Cube Spin', 'Cube Spin · Pop', 0.3,
      { fadeOut: 0.1, keys: [...pair('rotation', 0, 90, 'easeIn'), ...pair('scale', 1, 1.3, 'easeIn')] },
      { fadeIn: 0.1, keys: [...pair('rotation', -90, 0, 'easeOut'), ...pair('scale', 1.3, 1, 'easeOut')] },
      ['cw', 'pop', '3d'],
    ),
  ]
}

/* ---------------- Swap family (out one way, in from the opposite, v2) ----------------
 * The outgoing clip throws toward a side while the incoming clip arrives from
 * the exact opposite — minimal fades (0–0.15s) keep it snappy.
 */

function buildSwap(): TransitionEffect[] {
  const swap = (
    label: string,
    d: number,
    fade: number,
    dirs: Array<{ prop: KeyframeProperty; sign: -1 | 1 }>,
    outEase: EasingType,
    inEase: EasingType,
    extraTags: string[],
    extraOutKeys: KeyPair[] = [],
    extraInKeys: KeyPair[] = [],
  ): TransitionEffect =>
    mk(
      'swap',
      'Swap',
      `Swap · ${label}`,
      d,
      fade > 0 ? { fadeOut: fade, keys: [...dirs.flatMap((a) => pair(a.prop, 0, a.sign * 1.25, outEase)), ...extraOutKeys] } : { keys: [...dirs.flatMap((a) => pair(a.prop, 0, a.sign * 1.25, outEase)), ...extraOutKeys] },
      // out exits toward `sign`, in arrives from the OPPOSITE side
      fade > 0 ? { fadeIn: fade, keys: [...dirs.flatMap((a) => pair(a.prop, -a.sign * 1.25, 0, inEase)), ...extraInKeys] } : { keys: [...dirs.flatMap((a) => pair(a.prop, -a.sign * 1.25, 0, inEase)), ...extraInKeys] },
      ['swap', ...extraTags],
    )
  return [
    swap('Left', 0.35, 0.08, [{ prop: 'x', sign: -1 }], 'easeIn', 'easeOut', ['left']),
    swap('Right', 0.35, 0.08, [{ prop: 'x', sign: 1 }], 'easeIn', 'easeOut', ['right']),
    swap('Up', 0.4, 0.08, [{ prop: 'y', sign: -1 }], 'easeIn', 'easeOut', ['up']),
    swap('Down', 0.4, 0.08, [{ prop: 'y', sign: 1 }], 'easeIn', 'easeOut', ['down']),
    swap('Diagonal', 0.45, 0.08, [{ prop: 'x', sign: -1 }, { prop: 'y', sign: -1 }], 'easeIn', 'easeOut', ['diagonal']),
    swap('Counter', 0.45, 0.08, [{ prop: 'x', sign: -1 }, { prop: 'y', sign: 1 }], 'easeIn', 'easeOut', ['diagonal', 'counter']),
    swap('Snap', 0.2, 0, [{ prop: 'x', sign: 1 }], 'easeIn', 'easeOut', ['right', 'no-fade', 'snap']),
    swap('Float', 0.6, 0.15, [{ prop: 'x', sign: -1 }], 'easeInOut', 'easeInOut', ['left', 'gentle']),
    swap('Bounce', 0.5, 0.1, [{ prop: 'x', sign: 1 }], 'easeIn', 'bounce', ['right', 'bounce']),
    swap('Shrink', 0.4, 0.08, [{ prop: 'x', sign: -1 }], 'easeIn', 'easeOut', ['left', 'scale'], pair('scale', 1, 0.85, 'easeIn'), pair('scale', 1.15, 1, 'easeOut')),
  ]
}

/* ---------------- Warp Zoom family (extreme scale throw, v2) ----------------
 * Outgoing zooms violently toward the camera (scale up to 3.2) while the
 * incoming clip lands from far away (0.2..0.35 → 1); some variants add a
 * ±15° twist. Punchy easeIn/easeOut only.
 */

function buildWarpZoom(): TransitionEffect[] {
  return [
    mk('warp-zoom', 'Warp Zoom', 'Warp Zoom · Punch', 0.3, { fadeOut: 0.22, keys: pair('scale', 1, 2.6, 'easeIn') }, { fadeIn: 0.22, keys: pair('scale', 0.3, 1, 'easeOut') }, ['zoom-in', 'punch']),
    mk('warp-zoom', 'Warp Zoom', 'Warp Zoom · Deep', 0.5, { fadeOut: 0.35, keys: pair('scale', 1, 2.8, 'easeIn') }, { fadeIn: 0.35, keys: pair('scale', 0.28, 1, 'easeOut') }, ['zoom-in', 'deep']),
    mk('warp-zoom', 'Warp Zoom', 'Warp Zoom · Twist', 0.45, { fadeOut: 0.3, keys: [...pair('scale', 1, 2.4, 'easeIn'), ...pair('rotation', 0, 15, 'easeIn')] }, { fadeIn: 0.3, keys: [...pair('scale', 0.35, 1, 'easeOut'), ...pair('rotation', -15, 0, 'easeOut')] }, ['zoom-in', 'twist', 'cw']),
    mk('warp-zoom', 'Warp Zoom', 'Warp Zoom · Counter-Twist', 0.45, { fadeOut: 0.3, keys: [...pair('scale', 1, 2.4, 'easeIn'), ...pair('rotation', 0, -15, 'easeIn')] }, { fadeIn: 0.3, keys: [...pair('scale', 0.35, 1, 'easeOut'), ...pair('rotation', 15, 0, 'easeOut')] }, ['zoom-in', 'twist', 'ccw']),
    mk('warp-zoom', 'Warp Zoom', 'Warp Zoom · Hyperspace', 0.6, { fadeOut: 0.45, keys: pair('scale', 1, 3.2, 'easeIn') }, { fadeIn: 0.45, keys: pair('scale', 0.2, 1, 'easeOut') }, ['zoom-in', 'extreme']),
    mk('warp-zoom', 'Warp Zoom', 'Warp Zoom · Bounce', 0.5, { fadeOut: 0.35, keys: pair('scale', 1, 2.6, 'easeIn') }, { fadeIn: 0.35, keys: pair('scale', 0.4, 1, 'bounce') }, ['zoom-in', 'bounce']),
    mk('warp-zoom', 'Warp Zoom', 'Warp Zoom · Snap', 0.2, { fadeOut: 0.06, keys: pair('scale', 1, 2.4, 'easeIn') }, { fadeIn: 0.06, keys: pair('scale', 0.35, 1, 'easeOut') }, ['zoom-in', 'snap']),
    mk('warp-zoom', 'Warp Zoom', 'Warp Zoom · Cinematic', 0.9, { fadeOut: 0.7, keys: pair('scale', 1, 2.6, 'easeInOut') }, { fadeIn: 0.7, keys: pair('scale', 0.3, 1, 'easeInOut') }, ['zoom-in', 'slow']),
    mk('warp-zoom', 'Warp Zoom', 'Warp Zoom · Vortex', 0.55, { fadeOut: 0.4, keys: [...pair('scale', 1, 3.0, 'easeIn'), ...pair('rotation', 0, 15, 'easeIn')] }, { fadeIn: 0.4, keys: [...pair('scale', 0.25, 1, 'easeOut'), ...pair('rotation', -15, 0, 'easeOut')] }, ['zoom-in', 'vortex']),
    mk('warp-zoom', 'Warp Zoom', 'Warp Zoom · Reverse', 0.45, { fadeOut: 0.3, keys: pair('scale', 1, 0.35, 'easeIn') }, { fadeIn: 0.3, keys: pair('scale', 2.6, 1, 'easeOut') }, ['zoom-out', 'reverse']),
  ]
}

/* ---------------- Stutter Cut family (glitchy hard cuts, v2) ----------------
 * Dip-to-black / dip-to-white moments plus abrupt scale pops; uses real
 * opacity keyframes (opacity IS keyframable) or near-zero fades. Never
 * smooth — everything reads as a hard, beat-cut rhythm.
 */

function buildStutterCut(): TransitionEffect[] {
  return [
    mk(
      'stutter-cut', 'Stutter Cut', 'Stutter Cut · Black Dip', 0.4,
      { fadeOut: 0.35, keys: pair('scale', 1, 1.06, 'easeIn') },
      { fadeIn: 0.35, keys: pair('scale', 1.06, 1, 'easeOut') },
      ['dip-to-black'],
    ),
    mk(
      'stutter-cut', 'Stutter Cut', 'Stutter Cut · White Dip', 0.4,
      { fadeOut: 0.35, keys: pair('scale', 1, 1.06, 'easeIn') },
      { fadeIn: 0.35, keys: pair('scale', 1.06, 1, 'easeOut') },
      ['dip-to-white', 'whiteout'],
    ),
    mk(
      'stutter-cut', 'Stutter Cut', 'Stutter Cut · Hard', 0.2,
      { fadeOut: 0.02, keys: pair('scale', 1, 1.1, 'easeIn') },
      { fadeIn: 0.02, keys: pair('scale', 1.1, 1, 'easeOut') },
      ['hard-cut'],
    ),
    mk(
      'stutter-cut', 'Stutter Cut', 'Stutter Cut · Double Tap', 0.25,
      { fadeOut: 0.05, keys: pair('scale', 1, 1.12, 'easeIn') },
      { fadeIn: 0.05, keys: pair('scale', 1.12, 1, 'easeOut') },
      ['double-tap'],
    ),
    mk(
      'stutter-cut', 'Stutter Cut', 'Stutter Cut · Jolt', 0.3,
      { fadeOut: 0.06, keys: [...pair('scale', 1, 1.1, 'easeIn'), ...pair('rotation', 0, 3, 'easeIn')] },
      { fadeIn: 0.06, keys: [...pair('scale', 1.1, 1, 'easeOut'), ...pair('rotation', -3, 0, 'easeOut')] },
      ['jolt'],
    ),
    mk(
      'stutter-cut', 'Stutter Cut', 'Stutter Cut · Shutter', 0.35,
      { keys: [...pair('opacity', 1, 0, 'linear'), ...pair('scale', 1, 1.08, 'easeIn')] },
      { keys: [...pair('opacity', 0, 1, 'linear'), ...pair('scale', 1.08, 1, 'easeOut')] },
      ['opacity-keys', 'shutter'],
    ),
    mk(
      'stutter-cut', 'Stutter Cut', 'Stutter Cut · Flash Frame', 0.25,
      { fadeOut: 0.04 },
      { fadeIn: 0.04, keys: pair('scale', 1.15, 1, 'bounce') },
      ['flash-frame', 'bounce'],
    ),
    mk(
      'stutter-cut', 'Stutter Cut', 'Stutter Cut · Strobe', 0.3,
      { fadeOut: 0.08, keys: [...pair('rotation', 0, 3, 'easeIn'), ...pair('scale', 1, 1.08, 'easeIn')] },
      { fadeIn: 0.08, keys: [...pair('rotation', -3, 0, 'easeOut'), ...pair('scale', 1.08, 1, 'easeOut')] },
      ['strobe'],
    ),
    mk(
      'stutter-cut', 'Stutter Cut', 'Stutter Cut · Drop', 0.35,
      { keys: [...pair('opacity', 1, 0, 'easeIn'), ...pair('scale', 1, 1.12, 'easeIn')] },
      { keys: [...pair('opacity', 0, 1, 'easeOut'), ...pair('scale', 1.12, 1, 'bounce')] },
      ['opacity-keys', 'drop'],
    ),
    mk(
      'stutter-cut', 'Stutter Cut', 'Stutter Cut · Glitch Punch', 0.3,
      { fadeOut: 0.06, keys: [...pair('x', 0, 0.04, 'easeIn'), ...pair('scale', 1, 1.1, 'easeIn')] },
      { fadeIn: 0.06, keys: [...pair('x', -0.04, 0, 'easeOut'), ...pair('scale', 1.1, 1, 'easeOut')] },
      ['glitchy'],
    ),
  ]
}

/* ---------------- v3 families (Sector 5) ----------------
 * True shape wipes (animated canvas masks via the 'iris' keyframe property —
 * the incoming clip reveals OVER a live outgoing bridge) and the Film
 * Dissolve (crossfade + photochemical gate weave).
 */

/** Wipe reveal patch: mask shape + iris progress keys over the window */
function wipePatch(shape: WipeShape, easing: EasingType): TransitionPatch {
  return { wipe: shape, keys: pair('iris', 0, 1, easing) }
}

/** Gate-weave jitter keys (fractions of the transition window), amplitude `j` */
function weaveKeys(j: number): TransitionPatch['keys'] {
  const e: EasingType = 'easeInOut'
  return [
    { property: 'x', at: 0, value: 0, easing: e },
    { property: 'x', at: 0.25, value: j, easing: e },
    { property: 'x', at: 0.55, value: -j * 0.8, easing: e },
    { property: 'x', at: 1, value: 0, easing: e },
    { property: 'y', at: 0, value: 0, easing: e },
    { property: 'y', at: 0.35, value: j * 0.6, easing: e },
    { property: 'y', at: 0.8, value: -j * 0.5, easing: e },
    { property: 'y', at: 1, value: 0, easing: e },
  ]
}

/* ---------------- Film Dissolve (crossfade + gate weave) ---------------- */

function buildFilmDissolve(): TransitionEffect[] {
  const specs: Array<{ label: string; d: number; j: number }> = [
    { label: 'Subtle', d: 0.6, j: 0.004 },
    { label: 'Soft', d: 0.8, j: 0.006 },
    { label: '16mm', d: 1.0, j: 0.008 },
    { label: 'Super 8', d: 1.0, j: 0.012 },
    { label: 'Vintage', d: 1.2, j: 0.01 },
    { label: 'Projector', d: 1.2, j: 0.014 },
    { label: 'Heavy Grain Feel', d: 1.5, j: 0.016 },
    { label: 'Nervous', d: 0.5, j: 0.014 },
    { label: 'Dream Reel', d: 1.5, j: 0.006 },
    { label: 'Documentary', d: 0.8, j: 0.01 },
  ]
  return specs.map((s) =>
    mk(
      'film-dissolve', 'Film Dissolve', `Film Dissolve · ${s.label}`, s.d,
      { fadeOut: s.d, keys: weaveKeys(s.j) },
      { fadeIn: s.d, keys: weaveKeys(-s.j) },
      ['gate-weave', 'photochemical'],
    ),
  )
}

/* ---------------- Iris Round (circular mask reveal) ---------------- */

function buildIrisRound(): TransitionEffect[] {
  const specs: Array<{ label: string; d: number; e: EasingType }> = [
    { label: 'Swift', d: 0.2, e: 'easeOut' },
    { label: 'Fast', d: 0.3, e: 'easeOut' },
    { label: 'Smooth', d: 0.5, e: 'easeInOut' },
    { label: 'Gentle', d: 0.8, e: 'easeInOut' },
    { label: 'Cinematic', d: 1.0, e: 'easeInOut' },
    { label: 'Slow', d: 1.2, e: 'easeInOut' },
    { label: 'Dramatic', d: 1.5, e: 'easeInOut' },
    { label: 'Pop', d: 0.35, e: 'bounce' },
    { label: 'Snap', d: 0.25, e: 'easeIn' },
    { label: 'Linear', d: 0.6, e: 'linear' },
  ]
  return specs.map((s) =>
    mk('iris-round', 'Iris Round', `Iris Round · ${s.label}`, s.d, null, wipePatch('circle', s.e), ['wipe', 'circle', s.e]),
  )
}

/* ---------------- Iris Box (rectangular mask reveal) ---------------- */

function buildIrisBox(): TransitionEffect[] {
  return buildIrisRound().map((t, i) => ({
    ...t,
    id: `transition-iris-box-${String(i + 1).padStart(2, '0')}`,
    name: t.name.replace('Iris Round', 'Iris Box'),
    family: 'Iris Box',
    tags: [...t.tags.filter((g) => g !== 'circle'), 'box'],
    in: t.in ? { ...t.in, wipe: 'box' as WipeShape } : null,
  }))
}

/* ---------------- Iris Diamond ---------------- */

function buildIrisDiamond(): TransitionEffect[] {
  return buildIrisRound().map((t, i) => ({
    ...t,
    id: `transition-iris-diamond-${String(i + 1).padStart(2, '0')}`,
    name: t.name.replace('Iris Round', 'Iris Diamond'),
    family: 'Iris Diamond',
    tags: [...t.tags.filter((g) => g !== 'circle'), 'diamond'],
    in: t.in ? { ...t.in, wipe: 'diamond' as WipeShape } : null,
  }))
}

/* ---------------- Iris Cross ---------------- */

function buildIrisCross(): TransitionEffect[] {
  return buildIrisRound().map((t, i) => ({
    ...t,
    id: `transition-iris-cross-${String(i + 1).padStart(2, '0')}`,
    name: t.name.replace('Iris Round', 'Iris Cross'),
    family: 'Iris Cross',
    tags: [...t.tags.filter((g) => g !== 'circle'), 'cross'],
    in: t.in ? { ...t.in, wipe: 'cross' as WipeShape } : null,
  }))
}

/* ---------------- Clock Wipe (angular sweep from 12 o'clock) ---------------- */

function buildClockWipe(): TransitionEffect[] {
  const specs: Array<{ label: string; d: number; e: EasingType }> = [
    { label: 'Swift', d: 0.25, e: 'linear' },
    { label: 'Fast', d: 0.35, e: 'linear' },
    { label: 'Smooth', d: 0.5, e: 'easeInOut' },
    { label: 'Steady', d: 0.8, e: 'linear' },
    { label: 'Cinematic', d: 1.0, e: 'easeInOut' },
    { label: 'Slow', d: 1.2, e: 'linear' },
    { label: 'Dramatic', d: 1.5, e: 'easeInOut' },
    { label: 'Rush', d: 0.2, e: 'easeOut' },
    { label: 'Countdown', d: 1.0, e: 'linear' },
    { label: 'Mecury', d: 0.6, e: 'easeIn' },
  ]
  return specs.map((s) =>
    mk('clock-wipe', 'Clock Wipe', `Clock Wipe · ${s.label}`, s.d, null, wipePatch('clock', s.e), ['wipe', 'clock', 'sweep', s.e]),
  )
}

/* ---------------- Barn Doors (two panels close in from the edges) ---------------- */

function buildBarnDoors(): TransitionEffect[] {
  const specs: Array<{ label: string; d: number; e: EasingType }> = [
    { label: 'Swift', d: 0.2, e: 'easeOut' },
    { label: 'Fast', d: 0.3, e: 'easeOut' },
    { label: 'Smooth', d: 0.5, e: 'easeInOut' },
    { label: 'Gentle', d: 0.8, e: 'easeInOut' },
    { label: 'Cinematic', d: 1.0, e: 'easeInOut' },
    { label: 'Slow', d: 1.2, e: 'easeInOut' },
    { label: 'Dramatic', d: 1.5, e: 'easeInOut' },
    { label: 'Slam', d: 0.25, e: 'easeIn' },
    { label: 'Stage', d: 0.6, e: 'linear' },
    { label: 'Curtain Call', d: 1.0, e: 'bounce' },
  ]
  return specs.map((s) =>
    mk('barn-doors', 'Barn Doors', `Barn Doors · ${s.label}`, s.d, null, wipePatch('barnDoors', s.e), ['wipe', 'panels', 'vertical', s.e]),
  )
}

/* ---------------- Split (parting reveal — gap opens at center, grows outward) ---------------- */

function buildSplit(): TransitionEffect[] {
  const specs: Array<{ label: string; d: number; e: EasingType }> = [
    { label: 'Vertical · Swift', d: 0.2, e: 'easeOut' },
    { label: 'Vertical · Fast', d: 0.3, e: 'easeOut' },
    { label: 'Vertical · Smooth', d: 0.5, e: 'easeInOut' },
    { label: 'Vertical · Cinematic', d: 1.0, e: 'easeInOut' },
    { label: 'Vertical · Dramatic', d: 1.5, e: 'easeInOut' },
    { label: 'Horizontal · Swift', d: 0.2, e: 'easeOut' },
    { label: 'Horizontal · Fast', d: 0.3, e: 'easeOut' },
    { label: 'Horizontal · Smooth', d: 0.5, e: 'easeInOut' },
    { label: 'Horizontal · Cinematic', d: 1.0, e: 'easeInOut' },
    { label: 'Horizontal · Dramatic', d: 1.5, e: 'easeInOut' },
  ]
  return specs.map((s) => {
    const shape: WipeShape = s.label.startsWith('Vertical') ? 'splitV' : 'splitH'
    return mk('split', 'Split', `Split · ${s.label}`, s.d, null, wipePatch(shape, s.e), ['wipe', 'split', shape, s.e])
  })
}

/* ---------------- assembly (11 × 10 + 5 × 10 v2 + 8 × 10 v3 = 240) ---------------- */

export const TRANSITION_EFFECTS: TransitionEffect[] = [
  ...buildFade(),
  ...buildDissolve(),
  ...buildSlide(),
  ...buildPush(),
  ...buildWipe(),
  ...buildZoom(),
  ...buildSpin(),
  ...buildGlitch(),
  ...buildBlur(),
  ...buildFlash(),
  ...buildReveal(),
  // v2 families (Task 10-a)
  ...buildWhipPan(),
  ...buildCubeSpin(),
  ...buildSwap(),
  ...buildWarpZoom(),
  ...buildStutterCut(),
  // v3 families (Sector 5 — true shape wipes + film dissolve)
  ...buildFilmDissolve(),
  ...buildIrisRound(),
  ...buildIrisBox(),
  ...buildIrisDiamond(),
  ...buildIrisCross(),
  ...buildClockWipe(),
  ...buildBarnDoors(),
  ...buildSplit(),
]
