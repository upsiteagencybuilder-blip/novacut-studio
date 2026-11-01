/**
 * Day 18 — one-tap background removal (chroma-based auto keying).
 *
 * Honest scope: this is a deterministic color detector, not a neural matting
 * engine. It samples the composite frame, assumes the backdrop touches the
 * frame border (true for green screens / studio shots / solid backdrops),
 * finds the dominant border color via 4-bit-per-channel quantization, and
 * derives tolerance from the backdrop's spread. The result feeds the existing
 * chroma keyer, so everything stays editable afterwards.
 */
import type { ClipMask, ChromaKey } from './types'

const hex2 = (v: number) => v.toString(16).padStart(2, '0')

export interface AutoKeyResult {
  color: string
  similarity: number
  smoothness: number
  spill: number
  /** share of border pixels that matched the winning bucket (confidence) */
  confidence: number
}

/**
 * Detect the dominant border color of a sampled frame and derive chroma
 * settings. `pixels` is RGBA at `width × height` (engine sampleFrame output).
 */
export function detectAutoKey(pixels: Uint8ClampedArray, width: number): AutoKeyResult {
  const count = pixels.length / 4
  const height = Math.max(1, Math.round(count / width))
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()

  const visit = (x: number, y: number) => {
    const i = (y * width + x) * 4
    if (pixels[i + 3] < 8) return
    const r = pixels[i]
    const g = pixels[i + 1]
    const b = pixels[i + 2]
    // 4-bit quantization → 16³ buckets
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    e.n++
    e.r += r
    e.g += g
    e.b += b
    buckets.set(key, e)
  }

  // 2px border ring
  for (let x = 0; x < width; x++) {
    for (const y of [0, 1, height - 2, height - 1]) visit(x, y)
  }
  for (let y = 0; y < height; y++) {
    for (const x of [0, 1, width - 2, width - 1]) visit(x, y)
  }

  let best: { r: number; g: number; b: number; n: number } | null = null
  let totalBorder = 0
  for (const e of buckets.values()) totalBorder += e.n
  for (const e of buckets.values()) {
    if (!best || e.n > best.n) best = e
  }
  if (!best || totalBorder === 0) {
    return { color: '#00b140', similarity: 0.32, smoothness: 0.15, spill: 0.35, confidence: 0 }
  }

  const cr = Math.round(best.r / best.n)
  const cg = Math.round(best.g / best.n)
  const cb = Math.round(best.b / best.n)

  // spread of the winning bucket's members around its center → tolerance.
  // Re-scan the border for pixels inside the winning bucket and measure
  // their distance from the center color.
  let sum = 0
  let n = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const onBorder = x < 2 || x >= width - 2 || y < 2 || y >= height - 2
      if (!onBorder) continue
      const i = (y * width + x) * 4
      if (pixels[i + 3] < 8) continue
      const key = ((pixels[i] >> 4) << 8) | ((pixels[i + 1] >> 4) << 4) | (pixels[i + 2] >> 4)
      if (key !== (((cr >> 4) << 8) | ((cg >> 4) << 4) | (cb >> 4))) continue
      const dr = pixels[i] - cr
      const dg = pixels[i + 1] - cg
      const db = pixels[i + 2] - cb
      sum += Math.sqrt(dr * dr + dg * dg + db * db)
      n++
    }
  }
  const meanDist = n ? sum / n : 0
  // map mean border spread (0..~60) to tolerance 0.12..0.45
  const similarity = Math.min(0.45, Math.max(0.12, meanDist / 130))
  return {
    color: `#${hex2(cr)}${hex2(cg)}${hex2(cb)}`,
    similarity: Math.round(similarity * 100) / 100,
    smoothness: 0.18,
    spill: 0.35,
    confidence: Math.round((best.n / totalBorder) * 100) / 100,
  }
}

/** Build the chroma patch for a one-tap auto background removal. */
export function autoKeyPatch(result: AutoKeyResult): ChromaKey {
  return {
    enabled: true,
    color: result.color,
    similarity: result.similarity,
    smoothness: result.smoothness,
    spill: result.spill,
    edge: 0.5,
  }
}
