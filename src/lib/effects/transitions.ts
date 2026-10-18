/**
 * NovaCut Studio — Transition effects (110 definitions)
 *
 * 11 families × 10 variants. Each transition is a paired patch:
 *   - `out` is applied to the OUTGOING clip (fadeOut, motion keys anchored 'start'/'end')
 *   - `in`  is applied to the INCOMING clip (fadeIn, motion keys); null when intro/outro-only
 *
 * Keyframe values: x/y are fractions of the canvas (-1.2 = fully off-screen),
 * scale 1 = fit, rotation in degrees. Easing applies per keyframe segment.
 *
 * NOTE (UI copy): applying a transition replaces the clips' transform keyframes —
 * every transition carries the 'replaces-keys' tag so the UI can show a hint.
 *
 * NOTE (Blur family): implemented as pure crossfades — the CSS `blur` filter is
 * NOT keyframable by the keyframe engine, so blur itself cannot animate (tagged
 * 'blur-not-keyframable').
 */

import type { EasingType, KeyframeProperty } from '@/lib/editor/types'
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

/* ---------------- assembly (11 × 10 = 110) ---------------- */

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
]
