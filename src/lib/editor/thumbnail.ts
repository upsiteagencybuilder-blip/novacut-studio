/**
 * NovaCut Studio — AI Thumbnails (Day 36): best-frame picker + title-card generator.
 *
 * Best-frame scoring (honest, deterministic, on-device): each sampled frame is
 * graded on three measurable axes —
 *   • detail    — the Day 35 edge-energy grid mean (sharp, interesting frames)
 *   • exposure  — how close the mean luma sits to the 0.45–0.65 sweet spot
 *   • contrast  — luma std-dev (punchy range without clipping)
 * score = 0.5·detail + 0.3·exposure + 0.2·contrast. The three components are
 * surfaced in the UI so the pick is never a black box.
 *
 * Title cards render on an OffscreenCanvas-free plain canvas at real 1280×720
 * and export to PNG — same resolution class as the editor canvas.
 */

import { gridEnergyCentroid } from './reframe'

export interface FrameScore {
  /** time position of the sample within the clip (timeline seconds) */
  t: number
  detail: number
  exposure: number
  contrast: number
  score: number
  /** small preview dataURL for the contact sheet (raw sample re-rasterized) */
  preview?: string
}

/** exposure sweet-spot score: 1 at mean luma 0.55, falling off toward the extremes */
function exposureScore(meanLuma: number): number {
  const x = meanLuma
  if (x >= 0.45 && x <= 0.65) return 1
  if (x < 0.45) return Math.max(0, 1 - (0.45 - x) / 0.4)
  return Math.max(0, 1 - (x - 0.65) / 0.35)
}

/**
 * Score one RGBA frame. `w`/`h` are the sample raster dimensions (square-ish
 * grid from engine.sampleFrame). `previewW` optionally re-rasterizes the raw
 * sample into a small dataURL for the UI contact sheet.
 */
export function scoreFrame(
  px: Uint8ClampedArray,
  w: number,
  h: number,
  t: number,
  previewW?: number
): FrameScore {
  // detail from the shared Day 35 energy grid
  const cent = gridEnergyCentroid(px, w, h)
  const detail = Math.min(1, cent.energy * 12)

  // mean luma + std-dev
  let sum = 0
  let sum2 = 0
  const n = w * h
  for (let i = 0; i < n; i++) {
    const j = i * 4
    const l = (0.299 * px[j] + 0.587 * px[j + 1] + 0.114 * px[j + 2]) / 255
    sum += l
    sum2 += l * l
  }
  const mean = sum / n
  const std = Math.sqrt(Math.max(0, sum2 / n - mean * mean))
  const exposure = exposureScore(mean)
  const contrast = Math.min(1, std / 0.22)

  const score = 0.5 * detail + 0.3 * exposure + 0.2 * contrast

  let preview: string | undefined
  if (previewW) {
    const c = document.createElement('canvas')
    const scale = previewW / w
    c.width = previewW
    c.height = Math.max(1, Math.round(h * scale))
    const ctx = c.getContext('2d')
    if (ctx) {
      const img = new ImageData(new Uint8ClampedArray(px), w, h)
      // draw through a temp canvas at native size, then downscale smoothly
      const tmp = document.createElement('canvas')
      tmp.width = w
      tmp.height = h
      tmp.getContext('2d')?.putImageData(img, 0, 0)
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(tmp, 0, 0, c.width, c.height)
      preview = c.toDataURL('image/jpeg', 0.7)
    }
  }

  const r3 = (v: number) => Math.round(v * 1000) / 1000
  return { t: r3(t), detail: r3(detail), exposure: r3(exposure), contrast: r3(contrast), score: r3(score), preview }
}

/** rank frames best-first (stable tie-break on earlier time) */
export function rankFrames(frames: FrameScore[]): FrameScore[] {
  return [...frames].sort((a, b) => b.score - a.score || a.t - b.t)
}

/* ------------------------------ title cards ------------------------------ */

export interface TitleCardStyle {
  id: string
  label: string
  bg: (ctx: CanvasRenderingContext2D, w: number, h: number, frame: HTMLImageElement | null) => void
  titleColor: string
  titleStroke: string
  titleFont: string
  subtitleColor: string
  accent: string
  /** overlay scrim strength when drawing a photo frame behind the text */
  scrim: number
}

export const TITLE_CARD_STYLES: TitleCardStyle[] = [
  {
    id: 'punch',
    label: 'Punch yellow',
    accent: '#facc15',
    titleColor: '#ffffff',
    titleStroke: '#0a0a12',
    titleFont: '800 110px Montserrat, sans-serif',
    subtitleColor: '#facc15',
    scrim: 0.42,
    bg: (ctx, w, h, frame) => {
      drawFrameOrGradient(ctx, w, h, frame, ['#1a1030', '#2d1b4e'])
    },
  },
  {
    id: 'sunset',
    label: 'Sunset glow',
    accent: '#fb7185',
    titleColor: '#fff7ed',
    titleStroke: '#431407',
    titleFont: '800 110px Montserrat, sans-serif',
    subtitleColor: '#fde68a',
    scrim: 0.34,
    bg: (ctx, w, h, frame) => {
      drawFrameOrGradient(ctx, w, h, frame, ['#7c2d12', '#be185d', '#4c1d95'])
    },
  },
  {
    id: 'mint',
    label: 'Mint clean',
    accent: '#34d399',
    titleColor: '#ecfdf5',
    titleStroke: '#064e3b',
    titleFont: '800 110px Montserrat, sans-serif',
    subtitleColor: '#a7f3d0',
    scrim: 0.3,
    bg: (ctx, w, h, frame) => {
      drawFrameOrGradient(ctx, w, h, frame, ['#064e3b', '#065f46'])
    },
  },
  {
    id: 'ink',
    label: 'Ink minimal',
    accent: '#e879f9',
    titleColor: '#fafafa',
    titleStroke: '#111114',
    titleFont: '800 110px Montserrat, sans-serif',
    subtitleColor: '#d4d4d8',
    scrim: 0.25,
    bg: (ctx, w, h, frame) => {
      drawFrameOrGradient(ctx, w, h, frame, ['#111114', '#27272a'])
    },
  },
]

function drawFrameOrGradient(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  frame: HTMLImageElement | null,
  stops: string[]
): void {
  if (frame && frame.complete && frame.naturalWidth > 0) {
    // cover-fit the frame
    const sr = frame.naturalWidth / frame.naturalHeight
    const dr = w / h
    let sw = frame.naturalWidth
    let sh = frame.naturalHeight
    if (sr > dr) sw = sh * dr
    else sh = sw / dr
    const sx = (frame.naturalWidth - sw) / 2
    const sy = (frame.naturalHeight - sh) / 2
    ctx.drawImage(frame, sx, sy, sw, sh, 0, 0, w, h)
  } else {
    const g = ctx.createLinearGradient(0, 0, w, h)
    stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }
}

/**
 * Render a 1280×720 title card and return the PNG blob + a preview dataURL.
 * Layout: optional photo frame (cover) → scrim → accent bar → big title
 * (auto-wrapped, stroked) → subtitle. Deterministic, no fonts fetched —
 * falls back cleanly to system sans when Montserrat is unavailable.
 */
export async function renderTitleCard(opts: {
  title: string
  subtitle?: string
  style: TitleCardStyle
  frameDataUrl?: string | null
}): Promise<{ blob: Blob; preview: string }> {
  const W = 1280
  const H = 720
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')

  let frame: HTMLImageElement | null = null
  if (opts.frameDataUrl) {
    frame = await loadImage(opts.frameDataUrl).catch(() => null)
  }
  opts.style.bg(ctx, W, H, frame)

  if (frame) {
    ctx.fillStyle = `rgba(8,8,14,${opts.style.scrim})`
    ctx.fillRect(0, 0, W, H)
  }

  // accent bar
  ctx.fillStyle = opts.style.accent
  ctx.fillRect(64, 96, 10, H - 192)

  // title: wrap to ≤ 3 lines around 14 words
  const words = opts.title.trim().split(/\s+/).filter(Boolean).slice(0, 14)
  ctx.font = opts.style.titleFont
  ctx.textBaseline = 'top'
  const maxW = W - 200
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > maxW && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  const shown = lines.slice(0, 3)
  const lineH = 128
  const subH = opts.subtitle?.trim() ? 74 : 0
  const blockH = shown.length * lineH + subH
  let y = Math.max(120, (H - blockH) / 2)

  ctx.lineJoin = 'round'
  for (const l of shown) {
    ctx.strokeStyle = opts.style.titleStroke
    ctx.lineWidth = 14
    ctx.strokeText(l, 104, y)
    ctx.fillStyle = opts.style.titleColor
    ctx.fillText(l, 104, y)
    y += lineH
  }

  if (opts.subtitle?.trim()) {
    ctx.font = '600 44px Montserrat, sans-serif'
    ctx.fillStyle = opts.style.subtitleColor
    ctx.fillText(opts.subtitle.trim().slice(0, 60), 106, y + 10)
  }

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png')
  )
  return { blob, preview: canvas.toDataURL('image/jpeg', 0.72) }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('frame load failed'))
    img.src = src
  })
}

/** capture the CURRENT full-resolution preview frame as a PNG blob */
export function captureCurrentFrame(projectW: number, projectH: number): Promise<Blob> {
  const engine = (window as unknown as { __ncEngineInstance?: { canvas?: HTMLCanvasElement } }).__ncEngineInstance
  const src = engine?.canvas
  if (!src) throw new Error('Preview engine canvas unavailable')
  const c = document.createElement('canvas')
  c.width = projectW
  c.height = projectH
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(src, 0, 0, projectW, projectH)
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png')
  )
}

/* ---------------- Day 36 QA harness — real scorer receipts ---------------- */

if (typeof window !== 'undefined') {
  ;(window as unknown as { __ncThumbHarness?: unknown }).__ncThumbHarness = { scoreFrame, rankFrames, exposureScore }
}
