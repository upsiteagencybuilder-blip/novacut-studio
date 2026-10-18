/**
 * NovaCut Studio — Overlay effects (90 definitions)
 *
 * Deterministic canvas-drawn overlays interpreted by the engine renderer:
 *   particles 32 (8 kinds × 4 densities), grain 9, vignette 11, scanlines 8,
 *   light leaks 12 (corner/sweep/flicker × 4 hues), flash 6, shake 6,
 *   zoom pulse 6. The 'beam' leak variant and one near-invisible vignette
 *   level were dropped to hit exactly 90.
 */

import type { BlendMode } from '@/lib/editor/types'
import type { OverlayDraw, OverlayEffect } from './types'

/* ---------------- helpers ---------------- */

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

const seqs = new Map<string, number>()
function nextSeq(slug: string): string {
  const n = (seqs.get(slug) ?? 0) + 1
  seqs.set(slug, n)
  return String(n).padStart(2, '0')
}

function mk(slug: string, family: string, name: string, emoji: string, draw: OverlayDraw, intensity: number, swatch: string, extraTags: string[]): OverlayEffect {
  return {
    id: `overlay-${slug}-${nextSeq(slug)}`,
    name,
    family,
    category: 'overlay',
    tags: ['overlay', slug, ...extraTags],
    emoji,
    draw,
    intensity,
    swatch,
  }
}

/** dark base + three soft dots — the generic particle-card look */
function dotSwatch(color: string, dotPx: number, alpha = 0.9): string {
  return [
    `radial-gradient(circle at 25% 32%, ${withAlpha(color, alpha)} 0 ${dotPx}px, transparent ${dotPx + 1}px)`,
    `radial-gradient(circle at 64% 58%, ${withAlpha(color, alpha * 0.85)} 0 ${dotPx}px, transparent ${dotPx + 1}px)`,
    `radial-gradient(circle at 82% 24%, ${withAlpha(color, alpha * 0.7)} 0 ${Math.max(1, dotPx - 0.5)}px, transparent ${dotPx + 0.5}px)`,
    'linear-gradient(180deg,#292524,#0c0a09)',
  ].join(', ')
}

/** convert #rrggbb to rgba() with the given alpha (keeps swatches vivid on dark) */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  if (h.length !== 6) return hex
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${round2(alpha)})`
}

/* ---------------- particles (8 × 4 = 32) ---------------- */

type ParticleKind = 'snow' | 'rain' | 'sparks' | 'dust' | 'bokeh' | 'bubbles' | 'stars' | 'embers'

interface ParticleSpec {
  kind: ParticleKind
  name: string
  emoji: string
  color: string
  baseCount: number
  speed: number
  size: number
  drift: number
  blend: BlendMode
  swatch: string
  intensity: number
}

const PARTICLE_SPECS: ParticleSpec[] = [
  {
    kind: 'snow', name: 'Snow', emoji: '❄️', color: '#ffffff', baseCount: 140, speed: 0.5, size: 3, drift: 0.5, blend: 'source-over', intensity: 0.7,
    swatch: dotSwatch('#ffffff', 2, 0.95),
  },
  {
    kind: 'rain', name: 'Rain', emoji: '🌧️', color: 'rgba(255,255,255,0.55)', baseCount: 260, speed: 2.4, size: 1.5, drift: 0.08, blend: 'source-over', intensity: 0.7,
    swatch: 'repeating-linear-gradient(78deg, rgba(255,255,255,0.4) 0 1px, transparent 1px 7px), linear-gradient(180deg,#292524,#0c0a09)',
  },
  {
    kind: 'sparks', name: 'Sparks', emoji: '✨', color: '#fbbf24', baseCount: 90, speed: 1.4, size: 2, drift: 0.6, blend: 'screen', intensity: 0.75,
    swatch: dotSwatch('#fbbf24', 1.5),
  },
  {
    kind: 'dust', name: 'Dust', emoji: '🌫️', color: '#fde68a', baseCount: 110, speed: 0.25, size: 2.5, drift: 0.4, blend: 'screen', intensity: 0.6,
    swatch: dotSwatch('#fde68a', 1.5, 0.6),
  },
  {
    kind: 'bokeh', name: 'Bokeh', emoji: '💫', color: '#fbcfe8', baseCount: 46, speed: 0.35, size: 12, drift: 0.3, blend: 'screen', intensity: 0.65,
    swatch: [
      'radial-gradient(circle at 28% 40%, rgba(251,207,232,0.5) 0 9px, transparent 10px)',
      'radial-gradient(circle at 68% 66%, rgba(253,230,138,0.45) 0 6px, transparent 7px)',
      'radial-gradient(circle at 80% 22%, rgba(240,171,252,0.4) 0 5px, transparent 6px)',
      'linear-gradient(180deg,#292524,#0c0a09)',
    ].join(', '),
  },
  {
    kind: 'bubbles', name: 'Bubbles', emoji: '🫧', color: '#a3e635', baseCount: 70, speed: 0.7, size: 6, drift: 0.35, blend: 'screen', intensity: 0.6,
    swatch: [
      'radial-gradient(circle at 30% 70%, rgba(163,230,53,0.55) 0 5px, transparent 6px)',
      'radial-gradient(circle at 66% 44%, rgba(190,242,100,0.45) 0 4px, transparent 5px)',
      'radial-gradient(circle at 78% 78%, rgba(163,230,53,0.4) 0 3px, transparent 4px)',
      'linear-gradient(180deg,#1a2e05,#0c0a09)',
    ].join(', '),
  },
  {
    kind: 'stars', name: 'Stars', emoji: '⭐', color: '#fef08a', baseCount: 60, speed: 0.15, size: 2, drift: 0.1, blend: 'screen', intensity: 0.65,
    swatch: dotSwatch('#fef08a', 1, 0.95),
  },
  {
    kind: 'embers', name: 'Embers', emoji: '🔥', color: '#fb923c', baseCount: 80, speed: 0.9, size: 2.5, drift: 0.55, blend: 'screen', intensity: 0.75,
    swatch: dotSwatch('#fb923c', 1.5, 0.9),
  },
]

const DENSITIES = [
  { label: 'Gentle', mul: 0.5, tag: 'gentle' },
  { label: 'Light', mul: 0.75, tag: 'light' },
  { label: 'Rich', mul: 1, tag: 'rich' },
  { label: 'Storm', mul: 1.6, tag: 'storm' },
]

function buildParticles(): OverlayEffect[] {
  const out: OverlayEffect[] = []
  for (const p of PARTICLE_SPECS) {
    for (const d of DENSITIES) {
      out.push(
        mk(
          p.kind,
          p.name,
          `${p.name} · ${d.label}`,
          p.emoji,
          {
            kind: 'particles',
            variant: p.kind,
            count: Math.round(p.baseCount * d.mul),
            speed: p.speed,
            size: p.size,
            color: p.color,
            drift: p.drift,
            blend: p.blend,
          },
          p.intensity,
          p.swatch,
          [d.tag, p.blend === 'source-over' ? 'normal-blend' : 'additive-blend'],
        ),
      )
    }
  }
  return out
}

/* ---------------- grain (3 × 3 = 9) ---------------- */

function grainSwatch(amount: number): string {
  const a = round2(amount)
  return [
    `repeating-radial-gradient(circle at 13% 31%, rgba(255,255,255,${a * 0.4}) 0 1px, transparent 1px 3px)`,
    `repeating-radial-gradient(circle at 71% 63%, rgba(0,0,0,${a * 0.6}) 0 1px, transparent 1px 4px)`,
    'linear-gradient(135deg,#292524,#1c1917)',
  ].join(', ')
}

function buildGrain(): OverlayEffect[] {
  const variants: Array<{ variant: 'fine' | 'film' | 'heavy'; label: string; emoji: string }> = [
    { variant: 'fine', label: 'Fine', emoji: '🎞️' },
    { variant: 'film', label: 'Film', emoji: '🎞️' },
    { variant: 'heavy', label: 'Heavy', emoji: '📺' },
  ]
  const amounts = [
    { amount: 0.25, label: 'Subtle' },
    { amount: 0.5, label: 'Medium' },
    { amount: 0.8, label: 'Strong' },
  ]
  const out: OverlayEffect[] = []
  for (const v of variants) {
    for (const a of amounts) {
      out.push(
        mk(
          'grain',
          'Grain',
          `Grain ${v.label} · ${a.label}`,
          v.emoji,
          { kind: 'grain', variant: v.variant, amount: a.amount },
          round2(0.3 + a.amount * 0.6),
          grainSwatch(a.amount),
          [v.variant, a.label.toLowerCase()],
        ),
      )
    }
  }
  return out
}

/* ---------------- vignette (4 + 4 + 3 = 11) ---------------- */

function buildVignette(): OverlayEffect[] {
  const out: OverlayEffect[] = []
  const levels = [
    { label: 'Light', i: 0 },
    { label: 'Medium', i: 1 },
    { label: 'Deep', i: 2 },
    { label: 'Max', i: 3 },
  ]
  const groups: Array<{
    variant: 'soft' | 'strong' | 'cine'
    amounts: number[]
    feather: number
    count: number
  }> = [
    { variant: 'soft', amounts: [0.35, 0.5, 0.65, 0.8], feather: 0.5, count: 4 },
    { variant: 'strong', amounts: [0.5, 0.65, 0.8, 0.95], feather: 0.28, count: 4 },
    { variant: 'cine', amounts: [0.5, 0.7, 0.9], feather: 0.35, count: 3 },
  ]
  for (const g of groups) {
    for (let i = 0; i < g.count; i++) {
      const amount = g.amounts[i]
      out.push(
        mk(
          'vignette',
          'Vignette',
          `Vignette ${g.variant === 'cine' ? 'Cine' : g.variant === 'soft' ? 'Soft' : 'Strong'} · ${levels[i].label}`,
          '🌑',
          { kind: 'vignette', variant: g.variant, amount, feather: g.feather },
          amount,
          `radial-gradient(ellipse at center, transparent 42%, rgba(0,0,0,${amount}) 100%), linear-gradient(135deg,#292524,#57534e)`,
          [g.variant, levels[i].label.toLowerCase()],
        ),
      )
    }
  }
  return out
}

/* ---------------- scanlines (4 + 4 = 8) ---------------- */

function buildScanlines(): OverlayEffect[] {
  const out: OverlayEffect[] = []
  const groups: Array<{
    variant: 'crt' | 'vhs'
    label: string
    emoji: string
    base: string
    rows: Array<{ label: string; spacing: number; amount: number }>
  }> = [
    {
      variant: 'crt',
      label: 'CRT',
      emoji: '📺',
      base: 'linear-gradient(180deg,#022c22,#0c0a09)',
      rows: [
        { label: 'Fine', spacing: 2, amount: 0.35 },
        { label: 'Classic', spacing: 3, amount: 0.3 },
        { label: 'Wide', spacing: 4, amount: 0.25 },
        { label: 'Chunky', spacing: 6, amount: 0.2 },
      ],
    },
    {
      variant: 'vhs',
      label: 'VHS',
      emoji: '📼',
      base: 'linear-gradient(180deg,#2e1065,#0c0a09)',
      rows: [
        { label: 'Subtle', spacing: 3, amount: 0.45 },
        { label: 'Classic', spacing: 5, amount: 0.4 },
        { label: 'Retro', spacing: 7, amount: 0.3 },
        { label: 'Heavy', spacing: 9, amount: 0.25 },
      ],
    },
  ]
  for (const g of groups) {
    for (const r of g.rows) {
      out.push(
        mk(
          'scanlines',
          'Scanlines',
          `Scanlines ${g.label} · ${r.label}`,
          g.emoji,
          { kind: 'scanlines', variant: g.variant, amount: r.amount, spacing: r.spacing },
          r.amount,
          `repeating-linear-gradient(0deg, rgba(0,0,0,${r.amount}) 0 1px, transparent 1px ${r.spacing}px), ${g.base}`,
          [g.variant, r.label.toLowerCase()],
        ),
      )
    }
  }
  return out
}

/* ---------------- light leaks (3 variants × 4 hues = 12) ---------------- */

const LEAK_HUES = [
  { name: 'Amber', hue: 30, tag: 'amber' },
  { name: 'Rose', hue: 350, tag: 'rose' },
  { name: 'Emerald', hue: 120, tag: 'emerald' },
  { name: 'Violet', hue: 280, tag: 'violet' },
]

function leakSwatch(hue: number, amount: number, pos: string): string {
  return `radial-gradient(circle at ${pos}, hsla(${hue}, 92%, 62%, ${amount}), transparent 62%), #0c0a09`
}

function buildLeaks(): OverlayEffect[] {
  const out: OverlayEffect[] = []
  const groups: Array<{ variant: 'corner' | 'sweep' | 'flicker'; label: string; emoji: string; amount: number; pos: string }> = [
    { variant: 'corner', label: 'Corner', emoji: '🌅', amount: 0.7, pos: '78% 22%' },
    { variant: 'sweep', label: 'Sweep', emoji: '🌇', amount: 0.6, pos: '15% 85%' },
    { variant: 'flicker', label: 'Flicker', emoji: '💡', amount: 0.5, pos: '82% 78%' },
  ]
  for (const g of groups) {
    for (const h of LEAK_HUES) {
      out.push(
        mk(
          'leak',
          'Light Leak',
          `Light Leak ${g.label} · ${h.name}`,
          g.emoji,
          { kind: 'leak', variant: g.variant, hue: h.hue, blend: 'screen', amount: g.amount },
          g.amount,
          leakSwatch(h.hue, g.amount, g.pos),
          [g.variant, h.tag, 'screen-blend'],
        ),
      )
    }
  }
  return out
}

/* ---------------- flash (3 + 3 = 6) ---------------- */

function buildFlash(): OverlayEffect[] {
  const out: OverlayEffect[] = []
  const strobe = [
    { label: 'Rapid', amount: 0.6, speed: 8 },
    { label: 'Rhythmic', amount: 0.75, speed: 5 },
    { label: 'Slow', amount: 0.9, speed: 3 },
  ]
  for (const s of strobe) {
    out.push(
      mk(
        'flash',
        'Flash',
        `Flash Strobe · ${s.label}`,
        '⚡',
        { kind: 'flash', variant: 'strobe', amount: s.amount, speed: s.speed },
        s.amount,
        `radial-gradient(circle at 50% 45%, rgba(255,251,235,${s.amount}), transparent 72%), #1c1917`,
        ['strobe', s.label.toLowerCase()],
      ),
    )
  }
  const pulse = [
    { label: 'Quick', amount: 0.4, speed: 2 },
    { label: 'Heart', amount: 0.6, speed: 1 },
    { label: 'Glide', amount: 0.8, speed: 0.5 },
  ]
  for (const p of pulse) {
    out.push(
      mk(
        'flash',
        'Flash',
        `Flash Pulse · ${p.label}`,
        '🔆',
        { kind: 'flash', variant: 'pulse', amount: p.amount, speed: p.speed },
        p.amount,
        `radial-gradient(circle at 50% 55%, rgba(254,243,199,${p.amount}), transparent 78%), #1c1917`,
        ['pulse', p.label.toLowerCase()],
      ),
    )
  }
  return out
}

/* ---------------- shake (3 + 3 = 6) ---------------- */

function buildShake(): OverlayEffect[] {
  const out: OverlayEffect[] = []
  const handheld = [
    { label: 'Subtle', amount: 0.12, speed: 4 },
    { label: 'Noticeable', amount: 0.2, speed: 4 },
    { label: 'Rough', amount: 0.3, speed: 5 },
  ]
  for (const s of handheld) {
    out.push(
      mk(
        'shake',
        'Shake',
        `Shake Handheld · ${s.label}`,
        '🫨',
        { kind: 'shake', variant: 'handheld', amount: s.amount, speed: s.speed },
        s.amount * 2,
        `conic-gradient(from 20deg at 45% 55%, #44403c, #78716c, #292524, #57534e, #44403c)`,
        ['handheld', s.label.toLowerCase()],
      ),
    )
  }
  const quake = [
    { label: 'Rumble', amount: 0.4, speed: 9 },
    { label: 'Quake', amount: 0.6, speed: 11 },
    { label: 'Catastrophic', amount: 0.85, speed: 13 },
  ]
  for (const q of quake) {
    out.push(
      mk(
        'shake',
        'Shake',
        `Shake Earthquake · ${q.label}`,
        '🌎',
        { kind: 'shake', variant: 'earthquake', amount: q.amount, speed: q.speed },
        q.amount,
        `conic-gradient(from 60deg at 55% 45%, #57534e, #1c1917, #78716c, #292524, #57534e)`,
        ['earthquake', q.label.toLowerCase()],
      ),
    )
  }
  return out
}

/* ---------------- zoom pulse (3 + 3 = 6) ---------------- */

function buildZoomPulse(): OverlayEffect[] {
  const out: OverlayEffect[] = []
  const beat = [
    { label: 'Subtle', amount: 0.05, speed: 2.2 },
    { label: 'Club', amount: 0.09, speed: 2.2 },
    { label: 'Banger', amount: 0.14, speed: 2.4 },
  ]
  for (const b of beat) {
    out.push(
      mk(
        'zoom-pulse',
        'Zoom Pulse',
        `Zoom Pulse Beat · ${b.label}`,
        '💓',
        { kind: 'zoomPulse', variant: 'beat', amount: b.amount, speed: b.speed },
        round2(0.4 + b.amount * 2),
        `repeating-radial-gradient(circle at 50% 50%, rgba(244,63,94,${round2(0.2 + b.amount * 2)}) 0 6px, transparent 6px 18px), #1c0a0e`,
        ['beat', b.label.toLowerCase()],
      ),
    )
  }
  const breathe = [
    { label: 'Calm', amount: 0.03, speed: 0.4 },
    { label: 'Flow', amount: 0.06, speed: 0.4 },
    { label: 'Deep', amount: 0.1, speed: 0.3 },
  ]
  for (const b of breathe) {
    out.push(
      mk(
        'zoom-pulse',
        'Zoom Pulse',
        `Zoom Pulse Breathe · ${b.label}`,
        '🌬️',
        { kind: 'zoomPulse', variant: 'breathe', amount: b.amount, speed: b.speed },
        round2(0.4 + b.amount * 2),
        `repeating-radial-gradient(circle at 50% 50%, rgba(16,185,129,${round2(0.2 + b.amount * 2)}) 0 8px, transparent 8px 24px), #022c22`,
        ['breathe', b.label.toLowerCase()],
      ),
    )
  }
  return out
}

/* ---------------- assembly (32 + 9 + 11 + 8 + 12 + 6 + 6 + 6 = 90) ---------------- */

export const OVERLAY_EFFECTS: OverlayEffect[] = [
  ...buildParticles(),
  ...buildGrain(),
  ...buildVignette(),
  ...buildScanlines(),
  ...buildLeaks(),
  ...buildFlash(),
  ...buildShake(),
  ...buildZoomPulse(),
]
