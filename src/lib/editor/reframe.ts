/**
 * NovaCut Studio — Auto Reframe (Day 35): subject-aware aspect-ratio crop.
 *
 * Honest on-device saliency: a luma-gradient ENERGY GRID per sampled frame —
 * cells with strong local contrast (edges, detail, moving subjects) score
 * high, flat backdrops score ~0. The per-frame energy centroid is averaged
 * across the sampled window (temporal stability) and the largest crop window
 * of the TARGET aspect is positioned around it (clamped to the frame).
 *
 * This is edge-energy saliency, NOT neural subject segmentation — the UI
 * labels it truthfully and every crop stays fully editable afterwards.
 */

export interface EnergyCentroid {
  /** normalized 0..1 center of visual energy */
  cx: number
  cy: number
  /** mean energy 0..1 (how much "subject" contrast exists at all) */
  energy: number
}

/** Luma of one pixel (Rec.601 — fast, deterministic) */
function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

/**
 * Gradient-energy centroid of a frame (RGBA buffer, any square-ish downscale).
 * Grid cells average their local gradient magnitude; the centroid is the
 * energy-weighted mean position (energy^1.5 favors real subjects over noise).
 */
export function gridEnergyCentroid(px: Uint8ClampedArray, w: number, h: number): EnergyCentroid {
  const cellsX = 24
  const cellsY = 16
  const cellW = Math.max(1, Math.floor(w / cellsX))
  const cellH = Math.max(1, Math.floor(h / cellsY))
  const gridW = Math.max(2, Math.floor(w / cellW))
  const gridH = Math.max(2, Math.floor(h / cellH))
  const energy = new Float32Array(gridW * gridH)

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const x0 = gx * cellW
      const y0 = gy * cellH
      let sum = 0
      let n = 0
      for (let y = y0; y < Math.min(y0 + cellH, h - 1); y++) {
        for (let x = x0; x < Math.min(x0 + cellW, w - 1); x++) {
          const i = (y * w + x) * 4
          const iR = (y * w + x + 1) * 4
          const iD = ((y + 1) * w + x) * 4
          const l = luma(px[i], px[i + 1], px[i + 2])
          const lR = luma(px[iR], px[iR + 1], px[iR + 2])
          const lD = luma(px[iD], px[iD + 1], px[iD + 2])
          sum += Math.abs(l - lR) + Math.abs(l - lD)
          n++
        }
      }
      energy[gy * gridW + gx] = n ? sum / n / 255 : 0
    }
  }

  let total = 0
  let wx = 0
  let wy = 0
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const e = Math.pow(energy[gy * gridW + gx], 1.5)
      total += e
      wx += e * ((gx + 0.5) / gridW)
      wy += e * ((gy + 0.5) / gridH)
    }
  }
  if (total <= 1e-6) {
    // flat frame — keep the frame centered
    return { cx: 0.5, cy: 0.5, energy: 0 }
  }
  return { cx: wx / total, cy: wy / total, energy: Math.min(1, total / (gridW * gridH) * 4) }
}

export interface CropRectLite {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Largest crop window of `aspect` (w/h) positioned around the averaged
 * centroid, clamped inside the frame. Returned in normalized source fractions
 * (the project's CropRect semantics: x/y = top-left, width/height ≤ 1).
 */
export function subjectCropRect(
  centroid: EnergyCentroid,
  srcRatio: number,
  aspect: number
): CropRectLite {
  // window size from the aspect (same math as the centered ratio presets)
  let w = 1
  let h = 1
  if (srcRatio > aspect) w = aspect / srcRatio
  else h = srcRatio / aspect

  // center the window on the centroid, then clamp into the frame
  let x = centroid.cx - w / 2
  let y = centroid.cy - h / 2
  x = Math.max(0, Math.min(1 - w, x))
  y = Math.max(0, Math.min(1 - h, y))
  const r3 = (n: number) => Math.round(n * 1000) / 1000
  return { x: r3(x), y: r3(y), width: r3(w), height: r3(h) }
}

/** average several frame centroids into one temporal-stable centroid */
export function averageCentroids(list: EnergyCentroid[]): EnergyCentroid {
  const usable = list.filter((c) => c.energy > 0.02)
  const pool = usable.length ? usable : list
  if (!pool.length) return { cx: 0.5, cy: 0.5, energy: 0 }
  const cx = pool.reduce((a, c) => a + c.cx, 0) / pool.length
  const cy = pool.reduce((a, c) => a + c.cy, 0) / pool.length
  const energy = pool.reduce((a, c) => a + c.energy, 0) / pool.length
  return { cx, cy, energy }
}

/* ---------------- Day 35 QA harness — real detector receipts ---------------- */

if (typeof window !== 'undefined') {
  ;(window as unknown as { __ncReframeHarness?: unknown }).__ncReframeHarness = {
    gridEnergyCentroid,
    subjectCropRect,
    averageCentroids,
  }
}
