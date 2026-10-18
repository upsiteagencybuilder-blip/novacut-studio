/**
 * NovaCut Studio — Color effects (220 definitions)
 *
 * 22 families × 10 variants, generated from per-family base patches.
 * Variant progression scales the family's delta from neutral, then applies
 * a per-step tweak (deep shadows, bloom, faded, punchy...).
 * Filter values stay inside the Filters contract ranges.
 */

import type { ColorGrade, Filters } from '@/lib/editor/types'
import type { ColorEffect } from './types'

/* ---------------- helpers ---------------- */

const FILTER_KEYS = ['brightness', 'contrast', 'saturation', 'hue', 'blur', 'sepia', 'grayscale', 'invert'] as const
type FilterKey = (typeof FILTER_KEYS)[number]

const FILTER_NEUTRAL: Filters = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 0,
  blur: 0,
  sepia: 0,
  grayscale: 0,
  invert: 0,
}

const FILTER_RANGES: Record<FilterKey, [number, number]> = {
  brightness: [0, 2],
  contrast: [0, 2],
  saturation: [0, 2],
  hue: [-180, 180],
  blur: [0, 20],
  sepia: [0, 1],
  grayscale: [0, 1],
  invert: [0, 1],
}

const GRADE_KEYS = ['temperature', 'tint', 'shadows', 'highlights', 'vibrance'] as const
type GradeKey = (typeof GRADE_KEYS)[number]

const GRADE_NEUTRAL: ColorGrade = {
  temperature: 0,
  tint: 0,
  shadows: 0,
  highlights: 0,
  vibrance: 1,
}

const GRADE_RANGES: Record<GradeKey, [number, number]> = {
  temperature: [-1, 1],
  tint: [-1, 1],
  shadows: [-1, 1],
  highlights: [-1, 1],
  vibrance: [0, 2],
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/** Scale a filter patch's distance from neutral by k, add deltas, clamp to contract ranges. */
function scaleFilters(base: Partial<Filters>, k: number, deltas: Partial<Filters>): Partial<Filters> {
  const out: Partial<Filters> = {}
  for (const key of FILTER_KEYS) {
    const b = base[key]
    const delta = deltas[key] ?? 0
    if (b === undefined && delta === 0) continue
    const neutral = FILTER_NEUTRAL[key]
    const start = b === undefined ? neutral : b
    const [min, max] = FILTER_RANGES[key]
    out[key] = round3(clamp(neutral + (start - neutral) * k + delta, min, max))
  }
  return out
}

/** Scale a grade patch's distance from neutral by k, add deltas, clamp to contract ranges. */
function scaleGrade(base: Partial<ColorGrade> | undefined, k: number, deltas: Partial<ColorGrade>): Partial<ColorGrade> | undefined {
  const out: Partial<ColorGrade> = {}
  let touched = false
  for (const key of GRADE_KEYS) {
    const b = base?.[key]
    const delta = deltas[key] ?? 0
    if (b === undefined && delta === 0) continue
    touched = true
    const neutral = GRADE_NEUTRAL[key]
    const start = b === undefined ? neutral : b
    const [min, max] = GRADE_RANGES[key]
    out[key] = round3(clamp(neutral + (start - neutral) * k + delta, min, max))
  }
  return touched ? out : undefined
}

/** CSS filter string approximating the look, used by the preview swatch. */
function filterCss(f: Partial<Filters>): string {
  const parts: string[] = []
  if (f.brightness !== undefined && f.brightness !== 1) parts.push(`brightness(${f.brightness})`)
  if (f.contrast !== undefined && f.contrast !== 1) parts.push(`contrast(${f.contrast})`)
  if (f.saturation !== undefined && f.saturation !== 1) parts.push(`saturate(${f.saturation})`)
  if (f.hue !== undefined && f.hue !== 0) parts.push(`hue-rotate(${f.hue}deg)`)
  if (f.sepia !== undefined && f.sepia !== 0) parts.push(`sepia(${f.sepia})`)
  if (f.grayscale !== undefined && f.grayscale !== 0) parts.push(`grayscale(${f.grayscale})`)
  if (f.invert !== undefined && f.invert !== 0) parts.push(`invert(${f.invert})`)
  if (f.blur !== undefined && f.blur !== 0) parts.push(`blur(${f.blur}px)`)
  return parts.length > 0 ? parts.join(' ') : 'none'
}

/* ---------------- family definitions (data) ---------------- */

interface ColorFamilySpec {
  family: string
  slug: string
  tags: string[]
  /** vivid multi-color gradient for the preview card */
  bg: string
  filters: Partial<Filters>
  grade?: Partial<ColorGrade>
}

const FAMILIES: ColorFamilySpec[] = [
  {
    family: 'Cinematic Teal & Orange',
    slug: 'cinematic',
    tags: ['cinematic', 'teal', 'orange', 'film', 'blockbuster'],
    bg: 'linear-gradient(135deg,#134e4a 0%,#0d9488 38%,#f97316 78%,#fbbf24 100%)',
    filters: { contrast: 1.16, saturation: 1.08, hue: -6 },
    grade: { temperature: 0.28, shadows: -0.18, highlights: 0.1, vibrance: 1.15 },
  },
  {
    family: 'Vintage Film',
    slug: 'vintage-film',
    tags: ['vintage', 'film', 'retro', 'analog'],
    bg: 'linear-gradient(135deg,#e7d8b8 0%,#c9a876 55%,#8c6239 100%)',
    filters: { sepia: 0.34, contrast: 0.96, saturation: 0.85, brightness: 1.05 },
    grade: { temperature: 0.16, shadows: 0.12, vibrance: 0.9 },
  },
  {
    family: 'Golden Hour',
    slug: 'golden-hour',
    tags: ['golden', 'warm', 'glow', 'sunset'],
    bg: 'linear-gradient(135deg,#fde68a 0%,#fbbf24 45%,#b45309 100%)',
    filters: { sepia: 0.18, saturation: 1.18, brightness: 1.08, hue: -10 },
    grade: { temperature: 0.4, highlights: 0.2, vibrance: 1.2 },
  },
  {
    family: 'Warm Sunset',
    slug: 'warm-sunset',
    tags: ['sunset', 'warm', 'romance', 'summer'],
    bg: 'linear-gradient(135deg,#fb7185 0%,#f97316 55%,#7c2d12 100%)',
    filters: { sepia: 0.2, saturation: 1.28, hue: -16, contrast: 1.05 },
    grade: { temperature: 0.45, tint: 0.1, vibrance: 1.15 },
  },
  {
    family: 'Cool Arctic',
    slug: 'cool-arctic',
    tags: ['arctic', 'cool', 'crisp', 'ice'],
    bg: 'linear-gradient(135deg,#ccfbf1 0%,#2dd4bf 45%,#0f766e 100%)',
    filters: { saturation: 0.92, brightness: 1.06, hue: 12, contrast: 1.1 },
    grade: { temperature: -0.42, shadows: -0.1, vibrance: 0.95 },
  },
  {
    family: 'Noir Mono',
    slug: 'noir-mono',
    tags: ['noir', 'monochrome', 'black-and-white', 'classic'],
    bg: 'linear-gradient(135deg,#e5e5e5 0%,#737373 50%,#171717 100%)',
    filters: { grayscale: 1, contrast: 1.4, brightness: 0.92 },
    grade: { shadows: -0.25, highlights: 0.12, vibrance: 0 },
  },
  {
    family: 'Vivid Pop',
    slug: 'vivid-pop',
    tags: ['vivid', 'pop', 'colorful', 'punch'],
    bg: 'linear-gradient(135deg,#f0abfc 0%,#fbbf24 50%,#34d399 100%)',
    filters: { saturation: 1.45, contrast: 1.15, brightness: 1.04 },
    grade: { vibrance: 1.35 },
  },
  {
    family: 'Pastel Dream',
    slug: 'pastel-dream',
    tags: ['pastel', 'dreamy', 'soft', 'aesthetic'],
    bg: 'linear-gradient(135deg,#fbcfe8 0%,#f5d0fe 50%,#a7f3d0 100%)',
    filters: { saturation: 0.75, brightness: 1.14, contrast: 0.9, blur: 0.6 },
    grade: { shadows: 0.22, highlights: 0.15, vibrance: 0.9 },
  },
  {
    family: 'Moody Dusk',
    slug: 'moody-dusk',
    tags: ['moody', 'dusk', 'dark', 'drama'],
    bg: 'linear-gradient(135deg,#6d28d9 0%,#9f1239 60%,#1c1917 100%)',
    filters: { contrast: 1.3, saturation: 0.9, brightness: 0.88, hue: -8 },
    grade: { temperature: -0.15, shadows: -0.3, highlights: -0.1, vibrance: 1.05 },
  },
  {
    family: 'Retro 80s',
    slug: 'retro-80s',
    tags: ['retro', '80s', 'synth', 'nostalgia'],
    bg: 'linear-gradient(135deg,#d946ef 0%,#a855f7 45%,#fb923c 100%)',
    filters: { saturation: 1.35, contrast: 1.12, hue: 8, sepia: 0.08 },
    grade: { temperature: 0.2, tint: 0.15, vibrance: 1.3 },
  },
  {
    family: 'Neon Night',
    slug: 'neon-night',
    tags: ['neon', 'night', 'glow', 'urban'],
    bg: 'linear-gradient(135deg,#0c0a09 0%,#d946ef 55%,#10b981 100%)',
    filters: { contrast: 1.35, saturation: 1.4, brightness: 0.9, hue: -12 },
    grade: { shadows: -0.35, highlights: 0.2, vibrance: 1.35 },
  },
  {
    family: 'Faded Denim',
    slug: 'faded-denim',
    tags: ['faded', 'denim', 'casual', 'matte'],
    bg: 'linear-gradient(135deg,#cbd5e1 0%,#64748b 55%,#334155 100%)',
    filters: { saturation: 0.72, contrast: 0.86, brightness: 1.1, hue: 6 },
    grade: { temperature: -0.2, shadows: 0.2, vibrance: 0.85 },
  },
  {
    family: 'Emerald Forest',
    slug: 'emerald-forest',
    tags: ['emerald', 'forest', 'nature', 'green'],
    bg: 'linear-gradient(135deg,#064e3b 0%,#059669 55%,#a3e635 100%)',
    filters: { saturation: 1.15, contrast: 1.12, hue: -14 },
    grade: { tint: -0.25, shadows: -0.15, vibrance: 1.2 },
  },
  {
    family: 'Desert Sand',
    slug: 'desert-sand',
    tags: ['desert', 'sand', 'warm', 'earth'],
    bg: 'linear-gradient(135deg,#fde68a 0%,#d97706 55%,#78350f 100%)',
    filters: { sepia: 0.28, saturation: 1.05, brightness: 1.06, hue: -6 },
    grade: { temperature: 0.35, shadows: 0.1, vibrance: 1.05 },
  },
  {
    family: 'Cyberpunk',
    slug: 'cyberpunk',
    tags: ['cyberpunk', 'neon', 'sci-fi', 'future'],
    bg: 'linear-gradient(135deg,#0c0a09 0%,#e879f9 50%,#14b8a6 100%)',
    filters: { saturation: 1.4, contrast: 1.25, hue: -20, brightness: 0.95 },
    grade: { shadows: -0.25, highlights: 0.15, tint: 0.2, vibrance: 1.4 },
  },
  {
    family: 'Rose Gold',
    slug: 'rose-gold',
    tags: ['rose-gold', 'glam', 'warm', 'beauty'],
    bg: 'linear-gradient(135deg,#fecdd3 0%,#fb7185 50%,#fbbf24 100%)',
    filters: { sepia: 0.14, saturation: 1.1, brightness: 1.07, hue: -4 },
    grade: { temperature: 0.3, tint: 0.2, highlights: 0.15, vibrance: 1.15 },
  },
  {
    family: 'Sepia Archive',
    slug: 'sepia-archive',
    tags: ['sepia', 'archive', 'antique', 'paper'],
    bg: 'linear-gradient(135deg,#f5e6d3 0%,#b98a5a 55%,#5c4033 100%)',
    filters: { sepia: 0.62, saturation: 0.7, contrast: 1.05, brightness: 1.02 },
    grade: { temperature: 0.2, vibrance: 0.75 },
  },
  {
    family: 'High Contrast',
    slug: 'high-contrast',
    tags: ['contrast', 'bold', 'graphic', 'editorial'],
    bg: 'linear-gradient(135deg,#fafaf9 0%,#fbbf24 55%,#0c0a09 100%)',
    filters: { contrast: 1.5, saturation: 1.1 },
    grade: { shadows: -0.3, highlights: 0.2 },
  },
  {
    family: 'Soft Skin',
    slug: 'soft-skin',
    tags: ['soft', 'skin', 'beauty', 'portrait'],
    bg: 'linear-gradient(135deg,#ffe4e6 0%,#fda4af 55%,#fde68a 100%)',
    filters: { brightness: 1.06, saturation: 1.05, contrast: 0.96, blur: 0.8 },
    grade: { temperature: 0.15, shadows: 0.15, highlights: -0.05, vibrance: 1.05 },
  },
  {
    family: 'Emerald',
    slug: 'emerald',
    tags: ['emerald', 'jewel', 'green', 'tint'],
    bg: 'linear-gradient(135deg,#10b981 0%,#047857 55%,#022c22 100%)',
    filters: { hue: -26, saturation: 1.12, contrast: 1.08 },
    grade: { tint: -0.35, vibrance: 1.25 },
  },
  {
    family: 'Crimson',
    slug: 'crimson',
    tags: ['crimson', 'red', 'drama', 'passion'],
    bg: 'linear-gradient(135deg,#f43f5e 0%,#9f1239 55%,#450a0a 100%)',
    filters: { hue: -24, saturation: 1.25, contrast: 1.15 },
    grade: { temperature: 0.25, shadows: -0.2, vibrance: 1.2 },
  },
  {
    family: 'Aurora',
    slug: 'aurora',
    tags: ['aurora', 'glow', 'colorful', 'ethereal'],
    bg: 'linear-gradient(135deg,#10b981 0%,#2dd4bf 40%,#a855f7 75%,#f0abfc 100%)',
    filters: { saturation: 1.25, hue: -10, brightness: 1.05, contrast: 1.08 },
    grade: { highlights: 0.25, vibrance: 1.35 },
  },
]

/* ---------------- variant progression (10 per family) ---------------- */

interface VariantStep {
  suffix: string
  tag: string
  /** scales the family's distance from neutral */
  k: number
  /** absolute deltas applied after scaling */
  filters?: Partial<Filters>
  grade?: Partial<ColorGrade>
}

const VARIANT_STEPS: VariantStep[] = [
  { suffix: 'Soft', tag: 'soft', k: 0.5 },
  { suffix: 'Light', tag: 'light', k: 0.7 },
  { suffix: 'Medium', tag: 'medium', k: 1 },
  { suffix: 'Strong', tag: 'strong', k: 1.3 },
  { suffix: 'Extreme', tag: 'extreme', k: 1.6 },
  {
    suffix: 'Deep Shadows',
    tag: 'deep-shadows',
    k: 1.1,
    filters: { brightness: -0.05, contrast: 0.08 },
    grade: { shadows: -0.35 },
  },
  {
    suffix: 'Bloom Highlights',
    tag: 'bloom',
    k: 1.1,
    filters: { brightness: 0.06 },
    grade: { highlights: 0.35 },
  },
  {
    suffix: 'Faded',
    tag: 'faded',
    k: 0.8,
    filters: { brightness: 0.1, contrast: -0.18, saturation: -0.1 },
    grade: { shadows: 0.3, vibrance: -0.15 },
  },
  {
    suffix: 'Punchy',
    tag: 'punchy',
    k: 1.25,
    filters: { contrast: 0.15, saturation: 0.12 },
    grade: { vibrance: 0.2 },
  },
  {
    suffix: 'Ultimate',
    tag: 'ultimate',
    k: 1.8,
    filters: { contrast: 0.1, saturation: 0.15 },
    grade: { shadows: -0.2, highlights: 0.2, vibrance: 0.3 },
  },
]

/* ---------------- generation ---------------- */

export const COLOR_EFFECTS: ColorEffect[] = []

for (const fam of FAMILIES) {
  for (let i = 0; i < VARIANT_STEPS.length; i++) {
    const step = VARIANT_STEPS[i]
    const filters = scaleFilters(fam.filters, step.k, step.filters ?? {})
    const grade = scaleGrade(fam.grade, step.k, step.grade ?? {})
    COLOR_EFFECTS.push({
      id: `color-${fam.slug}-${String(i + 1).padStart(2, '0')}`,
      name: `${fam.family} · ${step.suffix}`,
      family: fam.family,
      category: 'color',
      tags: [...fam.tags, step.tag],
      filters,
      ...(grade ? { grade } : {}),
      swatch: { bg: fam.bg, filter: filterCss(filters) },
    })
  }
}
