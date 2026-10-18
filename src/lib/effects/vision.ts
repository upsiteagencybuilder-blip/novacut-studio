/**
 * NovaCut Studio — Vision effects (60 definitions)
 *
 * 10 families × 6 variants of stylized canvas post-FX recipes, interpreted
 * by the engine vision renderer (see VisionDraw in './types'):
 *   Pixelate (grid mosaic), Mirror (axis symmetry), Kaleidoscope (slices),
 *   Soft Blur, Dreamy Glow, Neon Glow (colored bloom), Chromatic Split (RGB
 *   offset), Duotone (dark/light remap), VHS Tape (analog artifacts),
 *   Comic Poster (color quantize).
 *
 * `intensity` is the default dry/wet-style strength (0..1) shown on the card;
 * heavier looks sit closer to 1. Swatches are css background strings that
 * hint at the look (gradients OK).
 */

import type { VisionDraw, VisionEffect } from './types'

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
  draw: VisionDraw,
  intensity: number,
  swatch: string,
  extraTags: string[],
): VisionEffect {
  return {
    id: `vision-${slug}-${nextSeq(slug)}`,
    name,
    family,
    category: 'vision',
    tags: ['vision', slug, ...extraTags],
    emoji,
    draw,
    intensity,
    swatch,
  }
}

/** convert #rrggbb → rgba() so swatches can layer softly on dark bases */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  if (h.length !== 6) return hex
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${Math.round(alpha * 100) / 100})`
}

/* ---------------- Pixelate (6) — grid mosaic, size 4..52 px ---------------- */

const PIXELATE: Array<{ label: string; size: number; cell: number; intensity: number; tags: string[] }> = [
  { label: 'Fine Mosaic', size: 4, cell: 5, intensity: 0.5, tags: ['subtle'] },
  { label: 'Soft Pixels', size: 8, cell: 7, intensity: 0.58, tags: ['light'] },
  { label: 'Chunky Blocks', size: 14, cell: 9, intensity: 0.66, tags: ['medium'] },
  { label: 'Retro Grid', size: 22, cell: 12, intensity: 0.75, tags: ['retro'] },
  { label: 'Giant Mosaic', size: 34, cell: 16, intensity: 0.88, tags: ['heavy'] },
  { label: '8-Bit Breakdown', size: 52, cell: 22, intensity: 1, tags: ['extreme', '8-bit'] },
]

function buildPixelate(): VisionEffect[] {
  return PIXELATE.map((v) =>
    mk(
      'pixelate',
      'Pixelate',
      `Pixelate · ${v.label}`,
      '🟪',
      { kind: 'pixelate', size: v.size },
      v.intensity,
      [
        `repeating-linear-gradient(90deg, rgba(255,255,255,0.14) 0 ${v.cell}px, transparent ${v.cell}px ${v.cell * 2}px)`,
        `repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0 ${v.cell}px, transparent ${v.cell}px ${v.cell * 2}px)`,
        'linear-gradient(135deg, #fbbf24, #fb7185, #22d3ee)',
      ].join(', '),
      v.tags,
    ),
  )
}

/* ---------------- Mirror (6) — axis symmetry ---------------- */

interface MirrorSpec {
  label: string
  mode: 'left' | 'right' | 'top' | 'bottom' | 'quad'
  intensity: number
  swatch: string
  tags: string[]
}

const MIRROR: MirrorSpec[] = [
  {
    label: 'Left Reflect',
    mode: 'left',
    intensity: 0.6,
    swatch: 'radial-gradient(circle at 30% 50%, rgba(163,230,53,0.9) 0 18%, transparent 55%), linear-gradient(90deg, #a3e635 0%, #14532d 50%, #a3e635 100%)',
    tags: ['left', 'symmetry'],
  },
  {
    label: 'Right Reflect',
    mode: 'right',
    intensity: 0.6,
    swatch: 'radial-gradient(circle at 70% 50%, rgba(251,113,133,0.9) 0 18%, transparent 55%), linear-gradient(90deg, #fb7185 0%, #450a0a 50%, #fb7185 100%)',
    tags: ['right', 'symmetry'],
  },
  {
    label: 'Top Mirror',
    mode: 'top',
    intensity: 0.65,
    swatch: 'radial-gradient(circle at 50% 30%, rgba(251,191,36,0.9) 0 18%, transparent 55%), linear-gradient(180deg, #fbbf24 0%, #451a03 50%, #fbbf24 100%)',
    tags: ['top', 'symmetry'],
  },
  {
    label: 'Bottom Mirror',
    mode: 'bottom',
    intensity: 0.65,
    swatch: 'radial-gradient(circle at 50% 70%, rgba(34,211,238,0.9) 0 18%, transparent 55%), linear-gradient(0deg, #22d3ee 0%, #164e63 50%, #22d3ee 100%)',
    tags: ['bottom', 'symmetry'],
  },
  {
    label: 'Quad Symmetry',
    mode: 'quad',
    intensity: 0.75,
    swatch: [
      'radial-gradient(circle at 12% 12%, rgba(240,171,252,0.85) 0 14%, transparent 45%)',
      'radial-gradient(circle at 88% 12%, rgba(240,171,252,0.85) 0 14%, transparent 45%)',
      'radial-gradient(circle at 12% 88%, rgba(240,171,252,0.85) 0 14%, transparent 45%)',
      'radial-gradient(circle at 88% 88%, rgba(240,171,252,0.85) 0 14%, transparent 45%)',
      'linear-gradient(135deg, #4a044e, #1c1917)',
    ].join(', '),
    tags: ['quad', 'symmetry'],
  },
  {
    label: 'Quad Kaleido',
    mode: 'quad',
    intensity: 0.9,
    swatch: [
      'repeating-conic-gradient(from 0deg at 50% 50%, rgba(253,224,71,0.85) 0 22deg, rgba(28,25,23,0.95) 22deg 45deg)',
      'linear-gradient(135deg, #4a044e, #1c1917)',
    ].join(', '),
    tags: ['quad', 'kaleido', 'mandala'],
  },
]

function buildMirror(): VisionEffect[] {
  return MIRROR.map((v) => mk('mirror', 'Mirror', `Mirror · ${v.label}`, '🪞', { kind: 'mirror', mode: v.mode }, v.intensity, v.swatch, v.tags))
}

/* ---------------- Kaleidoscope (6) — 2/4/8 mirrored slices ---------------- */

const KALEIDO: Array<{ label: string; slices: 2 | 4 | 8; intensity: number; c1: string; c2: string; tags: string[] }> = [
  { label: 'Gemini Bloom', slices: 2, intensity: 0.55, c1: '#fb7185', c2: '#450a0a', tags: ['2-slice', 'soft'] },
  { label: 'Twin Prism', slices: 2, intensity: 0.7, c1: '#fbbf24', c2: '#451a03', tags: ['2-slice'] },
  { label: 'Cross Bloom', slices: 4, intensity: 0.65, c1: '#a3e635', c2: '#14532d', tags: ['4-slice'] },
  { label: 'Mandala Lite', slices: 4, intensity: 0.8, c1: '#f0abfc', c2: '#4a044e', tags: ['4-slice', 'mandala'] },
  { label: 'Prismatic Burst', slices: 8, intensity: 0.75, c1: '#22d3ee', c2: '#164e63', tags: ['8-slice'] },
  { label: 'Hypno Mandala', slices: 8, intensity: 0.95, c1: '#fde047', c2: '#1c1917', tags: ['8-slice', 'mandala', 'hypnotic'] },
]

function buildKaleido(): VisionEffect[] {
  return KALEIDO.map((v) => {
    const step = 360 / v.slices / 2
    const swatch = `repeating-conic-gradient(from 0deg at 50% 50%, ${withAlpha(v.c1, 0.9)} 0 ${step}deg, ${withAlpha(v.c2, 0.95)} ${step}deg ${step * 2}deg)`
    return mk('kaleido', 'Kaleidoscope', `Kaleidoscope · ${v.label}`, '🔮', { kind: 'kaleido', slices: v.slices }, v.intensity, swatch, v.tags)
  })
}

/* ---------------- Soft Blur (6) — gaussian haze, 2..28 px ---------------- */

const BLUR: Array<{ label: string; px: number; intensity: number; tags: string[] }> = [
  { label: 'Feather Touch', px: 2, intensity: 0.5, tags: ['subtle'] },
  { label: 'Gentle Blur', px: 4, intensity: 0.55, tags: ['light'] },
  { label: 'Velvet Focus', px: 8, intensity: 0.62, tags: ['medium', 'dreamy'] },
  { label: 'Misty Glass', px: 14, intensity: 0.72, tags: ['misty'] },
  { label: 'Heavy Haze', px: 20, intensity: 0.85, tags: ['heavy'] },
  { label: 'Frost Glass', px: 28, intensity: 1, tags: ['extreme', 'frosted'] },
]

function buildBlur(): VisionEffect[] {
  return BLUR.map((v) => {
    const spread = 40 + v.px * 1.6
    const swatch = [
      `radial-gradient(circle at 35% 35%, rgba(255,255,255,${0.35 + v.px / 80}) 0 ${Math.round(spread / 2)}%, transparent ${Math.round(spread)}%)`,
      `radial-gradient(circle at 68% 66%, rgba(120,113,108,0.55) 0 ${Math.round(spread / 2)}%, transparent ${Math.round(spread)}%)`,
      'linear-gradient(135deg, #d6d3d1, #a8a29e, #78716c)',
    ].join(', ')
    return mk('soft-blur', 'Soft Blur', `Soft Blur · ${v.label}`, '🌫️', { kind: 'blur', px: v.px }, v.intensity, swatch, v.tags)
  })
}

/* ---------------- Dreamy Glow (6) — soft bloom, amount 0.15..0.6 ---------------- */

const DREAMY: Array<{ label: string; amount: number; intensity: number; tags: string[] }> = [
  { label: 'Soft Haze', amount: 0.15, intensity: 0.5, tags: ['subtle'] },
  { label: 'Daydream', amount: 0.24, intensity: 0.6, tags: ['light'] },
  { label: 'Ethereal', amount: 0.33, intensity: 0.68, tags: ['medium'] },
  { label: 'Fog Lift', amount: 0.42, intensity: 0.78, tags: ['misty'] },
  { label: 'Fairy Mist', amount: 0.5, intensity: 0.88, tags: ['heavy', 'sparkle'] },
  { label: 'Cloud Nine', amount: 0.6, intensity: 1, tags: ['extreme', 'bloom'] },
]

function buildDreamy(): VisionEffect[] {
  return DREAMY.map((v) =>
    mk(
      'dreamy',
      'Dreamy Glow',
      `Dreamy Glow · ${v.label}`,
      '✨',
      { kind: 'dreamy', amount: v.amount },
      v.intensity,
      [
        `radial-gradient(circle at 50% 38%, rgba(255,255,255,${0.4 + v.amount}) 0 ${Math.round(30 + v.amount * 40)}%, transparent 78%)`,
        'linear-gradient(135deg, #fbcfe8, #fecdd3, #fff7ed)',
      ].join(', '),
      v.tags,
    ),
  )
}

/* ---------------- Neon Glow (6) — colored bloom on dark ---------------- */

const NEON: Array<{ label: string; color: string; colorName: string; amount: number; radius: number; intensity: number }> = [
  { label: 'Neon Amber', color: '#fbbf24', colorName: 'amber', amount: 0.35, radius: 10, intensity: 0.5 },
  { label: 'Neon Flamingo', color: '#f0abfc', colorName: 'magenta', amount: 0.45, radius: 14, intensity: 0.6 },
  { label: 'Neon Emerald', color: '#34d399', colorName: 'emerald', amount: 0.5, radius: 16, intensity: 0.65 },
  { label: 'Neon Rose', color: '#fb7185', colorName: 'rose', amount: 0.55, radius: 20, intensity: 0.72 },
  { label: 'Neon Cyan', color: '#22d3ee', colorName: 'cyan', amount: 0.62, radius: 24, intensity: 0.82 },
  { label: 'Neon Lime', color: '#a3e635', colorName: 'lime', amount: 0.7, radius: 28, intensity: 0.9 },
]

function buildNeon(): VisionEffect[] {
  return NEON.map((v) =>
    mk(
      'neon',
      'Neon Glow',
      `Neon Glow · ${v.label}`,
      '💡',
      { kind: 'glow', amount: v.amount, color: v.color, radius: v.radius },
      v.intensity,
      [
        `radial-gradient(circle at 50% 50%, ${withAlpha(v.color, 0.95)} 0 12%, ${withAlpha(v.color, 0.4)} 34%, transparent 62%)`,
        'linear-gradient(180deg, #1c1917, #0c0a09)',
      ].join(', '),
      ['neon', 'bloom', v.colorName, `radius-${v.radius}`],
    ),
  )
}

/* ---------------- Chromatic Split (6) — RGB offset 2..14 px ---------------- */

const CHROMA: Array<{ label: string; shift: number; intensity: number; tags: string[] }> = [
  { label: '3D Pop', shift: 3, intensity: 0.5, tags: ['anaglyph', 'subtle'] },
  { label: 'Prism Edge', shift: 5, intensity: 0.58, tags: ['prism'] },
  { label: 'Retro Split', shift: 7, intensity: 0.66, tags: ['retro'] },
  { label: 'Glitch Fringe', shift: 9, intensity: 0.75, tags: ['glitch'] },
  { label: 'Deep Anaglyph', shift: 11, intensity: 0.85, tags: ['anaglyph', 'heavy'] },
  { label: 'Full Spectrum', shift: 14, intensity: 1, tags: ['extreme'] },
]

function buildChroma(): VisionEffect[] {
  return CHROMA.map((v) =>
    mk(
      'chroma',
      'Chromatic Split',
      `Chromatic Split · ${v.label}`,
      '🕶️',
      { kind: 'chroma', shift: v.shift },
      v.intensity,
      [
        `radial-gradient(circle at 42% 50%, rgba(255,45,85,${0.55 + v.shift / 40}) 0 26%, transparent 62%)`,
        `radial-gradient(circle at 58% 50%, rgba(34,211,238,${0.55 + v.shift / 40}) 0 26%, transparent 62%)`,
        'linear-gradient(180deg, #1c1917, #0c0a09)',
      ].join(', '),
      v.tags,
    ),
  )
}

/* ---------------- Duotone (6) — dark/light remap pairs ---------------- */

const DUOTONE: Array<{ label: string; dark: string; light: string; darkName: string; lightName: string; intensity: number }> = [
  { label: 'Amber Noir', dark: '#1c1917', light: '#fbbf24', darkName: 'charcoal', lightName: 'amber', intensity: 0.7 },
  { label: 'Espresso Rose', dark: '#292524', light: '#fb7185', darkName: 'espresso', lightName: 'rose', intensity: 0.75 },
  { label: 'Forest Lime', dark: '#14532d', light: '#bef264', darkName: 'forest', lightName: 'lime', intensity: 0.7 },
  { label: 'Plum Peach', dark: '#4a044e', light: '#fdba74', darkName: 'plum', lightName: 'peach', intensity: 0.8 },
  { label: 'Slate Mint', dark: '#292524', light: '#6ee7b7', darkName: 'slate', lightName: 'mint', intensity: 0.75 },
  { label: 'Wine Gold', dark: '#450a0a', light: '#fde047', darkName: 'wine', lightName: 'gold', intensity: 0.85 },
]

function buildDuotone(): VisionEffect[] {
  return DUOTONE.map((v) =>
    mk(
      'duotone',
      'Duotone',
      `Duotone · ${v.label}`,
      '🎨',
      { kind: 'duotone', dark: v.dark, light: v.light },
      v.intensity,
      `linear-gradient(135deg, ${v.dark} 0 38%, ${withAlpha(v.light, 0.85)} 100%)`,
      ['duotone', 'two-tone', v.darkName, v.lightName],
    ),
  )
}

/* ---------------- VHS Tape (6) — analog artifacts ---------------- */

const VHS: Array<{ label: string; shift: number; amount: number; intensity: number; tags: string[] }> = [
  { label: 'Analog Ghost', shift: 2, amount: 0.2, intensity: 0.5, tags: ['subtle'] },
  { label: '1994 Broadcast', shift: 3, amount: 0.3, intensity: 0.6, tags: ['retro'] },
  { label: 'Midnight Rental', shift: 4, amount: 0.35, intensity: 0.65, tags: ['rental'] },
  { label: 'Tape Warp', shift: 6, amount: 0.45, intensity: 0.75, tags: ['warp'] },
  { label: 'Tracking Error', shift: 8, amount: 0.5, intensity: 0.85, tags: ['tracking'] },
  { label: 'Static Memory', shift: 10, amount: 0.6, intensity: 1, tags: ['extreme', 'static'] },
]

function buildVhs(): VisionEffect[] {
  return VHS.map((v) =>
    mk(
      'vhs',
      'VHS Tape',
      `VHS · ${v.label}`,
      '📼',
      { kind: 'vhs', shift: v.shift, amount: v.amount },
      v.intensity,
      [
        `repeating-linear-gradient(0deg, rgba(0,0,0,${0.2 + v.amount / 3}) 0 2px, transparent 2px 4px)`,
        `linear-gradient(${100 + v.shift * 2}deg, rgba(251,113,133,0.6), rgba(163,230,53,0.45) 45%, rgba(34,211,238,0.6))`,
        'linear-gradient(180deg, #292524, #0c0a09)',
      ].join(', '),
      v.tags,
    ),
  )
}

/* ---------------- Comic Poster (6) — color quantize ---------------- */

const POSTER: Array<{ label: string; levels: number; strength: number; intensity: number; palette: string[]; dots: boolean }> = [
  { label: 'Ink Doodle', levels: 2, strength: 0.3, intensity: 0.6, palette: ['#1c1917', '#f5f5f4'], dots: false },
  { label: 'Comic Strip', levels: 3, strength: 0.4, intensity: 0.65, palette: ['#fde047', '#fb7185', '#1c1917'], dots: true },
  { label: 'Sunday Funnies', levels: 4, strength: 0.55, intensity: 0.7, palette: ['#fff7ed', '#fdba74', '#fb7185', '#1c1917'], dots: true },
  { label: 'Pop Poster', levels: 4, strength: 0.75, intensity: 0.8, palette: ['#fde047', '#a3e635', '#fb7185', '#1c1917'], dots: true },
  { label: 'Bold Blocks', levels: 5, strength: 0.65, intensity: 0.85, palette: ['#fff7ed', '#fdba74', '#fb7185', '#7c2d12', '#1c1917'], dots: false },
  { label: 'Fine Print', levels: 6, strength: 0.8, intensity: 0.95, palette: ['#fff7ed', '#fde047', '#fdba74', '#fb7185', '#7c2d12', '#1c1917'], dots: false },
]

function buildPoster(): VisionEffect[] {
  return POSTER.map((v) => {
    const n = v.palette.length
    const stops = v.palette.map((c, i) => `${c} ${Math.round((i * 100) / n)}% ${Math.round(((i + 1) * 100) / n)}%`).join(', ')
    const layers = v.dots
      ? [`repeating-radial-gradient(circle at 28% 30%, rgba(0,0,0,0.4) 0 2px, transparent 2px 9px)`]
      : []
    layers.push(`linear-gradient(135deg, ${stops})`)
    return mk(
      'poster',
      'Comic Poster',
      `Comic Poster · ${v.label}`,
      '💥',
      { kind: 'poster', levels: v.levels, strength: v.strength },
      v.intensity,
      layers.join(', '),
      ['poster', 'comic', `${v.levels}-levels`],
    )
  })
}

/* ---------------- assembly (10 × 6 = 60) ---------------- */

export const VISION_EFFECTS: VisionEffect[] = [
  ...buildPixelate(),
  ...buildMirror(),
  ...buildKaleido(),
  ...buildBlur(),
  ...buildDreamy(),
  ...buildNeon(),
  ...buildChroma(),
  ...buildDuotone(),
  ...buildVhs(),
  ...buildPoster(),
]
