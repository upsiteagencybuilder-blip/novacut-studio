/**
 * Day 14 — Built-in LUT library.
 *
 * Ten procedural cinematic looks generated as real 3D LUT tables (size 8 →
 * 512 entries) sampled from per-look color transforms. They behave exactly
 * like imported .cube LUTs (same engine path, same intensity mix) but need no
 * files: clips reference them via lutId `builtin:<id>` and the engine resolves
 * the table on demand with caching.
 */
import type { LutData } from './types'

export interface BuiltinLut {
  /** stored on clips as `builtin:<id>` */
  id: string
  name: string
  /** css filter string approximating the look for the chip preview swatch */
  swatch: string
  /** the color transform applied to normalized 0..1 rgb */
  fn: (r: number, g: number, b: number) => [number, number, number]
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
/** soft screen/rolloff helper */
const smooth = (v: number) => v * v * (3 - 2 * v)

export const BUILTIN_LUTS: BuiltinLut[] = [
  {
    id: 'teal-orange',
    name: 'Teal & Orange',
    swatch: 'saturate(1.3) hue-rotate(-8deg)',
    fn: (r, g, b) => {
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
      const shadow = 1 - smooth(clamp01(l * 1.6))
      const high = smooth(clamp01((l - 0.45) * 1.8))
      return [
        clamp01(r + high * 0.16 - shadow * 0.1),
        clamp01(g + shadow * 0.04 - high * 0.02),
        clamp01(b + shadow * 0.16 - high * 0.12),
      ]
    },
  },
  {
    id: 'warm-film',
    name: 'Warm Film',
    swatch: 'sepia(0.25) saturate(1.15)',
    fn: (r, g, b) => [clamp01(r * 1.06 + 0.03), clamp01(g * 1.01 + 0.015), clamp01(b * 0.92)],
  },
  {
    id: 'cool-noir',
    name: 'Cool Noir',
    swatch: 'contrast(1.25) saturate(0.8) hue-rotate(12deg)',
    fn: (r, g, b) => {
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
      const c = clamp01((l - 0.5) * 1.5 + 0.5)
      return [clamp01(c * 0.96), clamp01(c * 0.98 + 0.01), clamp01(c * 1.08)]
    },
  },
  {
    id: 'vintage-fade',
    name: 'Vintage Fade',
    swatch: 'sepia(0.4) contrast(0.9) brightness(1.05)',
    fn: (r, g, b) => [clamp01(r * 0.88 + 0.12), clamp01(g * 0.86 + 0.1), clamp01(b * 0.8 + 0.12)],
  },
  {
    id: 'punchy',
    name: 'Punchy HDR',
    swatch: 'contrast(1.35) saturate(1.25)',
    fn: (r, g, b) => [clamp01((r - 0.5) * 1.4 + 0.5), clamp01((g - 0.5) * 1.4 + 0.5), clamp01((b - 0.5) * 1.4 + 0.5)],
  },
  {
    id: 'sun-kissed',
    name: 'Sun-Kissed',
    swatch: 'brightness(1.1) sepia(0.2) saturate(1.2)',
    fn: (r, g, b) => [clamp01(r * 1.08 + 0.05), clamp01(g * 1.03 + 0.03), clamp01(b * 0.94 + 0.02)],
  },
  {
    id: 'cyber-night',
    name: 'Cyber Night',
    swatch: 'hue-rotate(-20deg) saturate(1.4) contrast(1.15)',
    fn: (r, g, b) => {
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
      const shadow = 1 - smooth(clamp01(l * 1.4))
      const high = smooth(clamp01((l - 0.5) * 2))
      return [clamp01(r + high * 0.1 + shadow * 0.12), clamp01(g + high * 0.06 - shadow * 0.08), clamp01(b + shadow * 0.2 - high * 0.06)]
    },
  },
  {
    id: 'forest',
    name: 'Forest Green',
    swatch: 'hue-rotate(18deg) saturate(1.2)',
    fn: (r, g, b) => [clamp01(r * 0.92), clamp01(g * 1.08 + 0.02), clamp01(b * 0.9)],
  },
  {
    id: 'bleach',
    name: 'Bleach Bypass',
    swatch: 'contrast(1.3) saturate(0.5)',
    fn: (r, g, b) => {
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
      const sat = 0.45
      return [clamp01((l * (1 - sat) + r * sat - 0.5) * 1.3 + 0.5), clamp01((l * (1 - sat) + g * sat - 0.5) * 1.3 + 0.5), clamp01((l * (1 - sat) + b * sat - 0.5) * 1.3 + 0.5)]
    },
  },
  {
    id: 'mono-silver',
    name: 'Mono Silver',
    swatch: 'grayscale(1) contrast(1.15)',
    fn: (r, g, b) => {
      const l = clamp01((0.2126 * r + 0.7152 * g + 0.0722 * b - 0.5) * 1.2 + 0.52)
      return [l, l, l]
    },
  },
]

export const BUILTIN_LUT_PREFIX = 'builtin:'

/** Resolve a `builtin:<id>` lutId to its generated LutData (null when unknown). */
export function getBuiltinLutData(lutId: string): LutData | null {
  if (!lutId.startsWith(BUILTIN_LUT_PREFIX)) return null
  const def = BUILTIN_LUTS.find((l) => l.id === lutId.slice(BUILTIN_LUT_PREFIX.length))
  if (!def) return null
  return buildLutTable(def)
}

/** Sample the look over an 8³ grid (red fastest, then green, then blue). */
export function buildLutTable(def: BuiltinLut): LutData {
  const size = 8
  const table: number[] = new Array(size * size * size * 3)
  let i = 0
  for (let bi = 0; bi < size; bi++) {
    for (let gi = 0; gi < size; gi++) {
      for (let ri = 0; ri < size; ri++) {
        const [r, g, b] = def.fn(ri / (size - 1), gi / (size - 1), bi / (size - 1))
        table[i++] = clamp01(r)
        table[i++] = clamp01(g)
        table[i++] = clamp01(b)
      }
    }
  }
  return { size, table, title: def.name }
}
