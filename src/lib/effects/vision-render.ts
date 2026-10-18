/**
 * NovaCut Studio — deterministic canvas vision renderer (mega-effects).
 *
 * Post-processes one clip's pixels (video frame / image composite) with a
 * stylized VisionDraw recipe: pixelate / mirror / kaleido / blur / glow /
 * chroma / duotone / dreamy / vhs / poster.
 *
 * Same determinism contract as overlay-render.ts: every animated decision is
 * derived from (seed, time) via integer hashing + value noise — Math.random is
 * NEVER used — so identical inputs always produce identical pixels and the
 * preview matches the export frame-for-frame.
 *
 * drawVisionFrame(target, src, w, h, …) REPLACES a plain
 * `ctx.drawImage(src, 0, 0, w, h)`: it reads the clip content from `src`
 * (in the engine: a canvas holding the clip's pixels with the clip's own
 * filters already baked in) and ends with the processed result drawn into
 * `target` covering w×h in the target's CURRENT transform space. `target` may
 * be the same canvas as `src` (the engine processes its scratch in place) —
 * every recipe only ever reads `src` through drawImage, whose source bitmap is
 * snapshotted per call, and recipes that need the pristine content snapshot it
 * into an offscreen before mutating the target.
 *
 * Fill-based recipes (duotone / poster) are confined to the clip's own alpha
 * via a 'destination-in' mask against the pristine source, so they can never
 * tint neighbouring layers on the main canvas.
 *
 * Never throws: internal failures fall back to a plain drawImage. All canvas
 * state (alpha / composite / filter / smoothing) is restored in finally.
 * Note: ctx.filter values (blur/contrast/…) are written in the target's user
 * space — the caller's transform scales them to device pixels, which keeps
 * effect parameters identical between preview and export resolutions.
 */
import type { VisionDraw } from './types'
import { hash01, hashInt, hashString, valueNoise } from './overlay-render'

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** Finite, positive guard for effect parameters coming from data */
function safeNum(v: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

/** Intrinsic bitmap size of a drawImage source (0 when unknown) */
function sourcePixels(src: CanvasImageSource): { w: number; h: number } {
  try {
    const s = src as { width?: unknown; videoWidth?: unknown; naturalWidth?: unknown; height?: unknown; videoHeight?: unknown; naturalHeight?: unknown }
    const w =
      typeof s.videoWidth === 'number' && s.videoWidth > 0
        ? s.videoWidth
        : typeof s.naturalWidth === 'number' && s.naturalWidth > 0
          ? s.naturalWidth
          : typeof s.width === 'number' && s.width > 0
            ? s.width
            : 0
    const h =
      typeof s.videoHeight === 'number' && s.videoHeight > 0
        ? s.videoHeight
        : typeof s.naturalHeight === 'number' && s.naturalHeight > 0
          ? s.naturalHeight
          : typeof s.height === 'number' && s.height > 0
            ? s.height
            : 0
    return { w, h }
  } catch {
    return { w: 0, h: 0 }
  }
}

/** Cap a bitmap allocation to ~3.5 MP so exotic sources stay bounded */
function budgetedSize(w: number, h: number): { w: number; h: number } {
  const maxPixels = 3_500_000
  if (w > 0 && h > 0 && w * h > maxPixels) {
    const s = Math.sqrt(maxPixels / (w * h))
    return { w: Math.max(2, Math.round(w * s)), h: Math.max(2, Math.round(h * s)) }
  }
  return { w: Math.max(2, Math.ceil(w)), h: Math.max(2, Math.ceil(h)) }
}

/* ------------------------------------------------------------------ */
/* Module-level scratch canvases (reused across frames, tiny memory)   */
/* ------------------------------------------------------------------ */

interface Slot {
  canvas: HTMLCanvasElement | null
  ctx: CanvasRenderingContext2D | null
}

const slots: Record<'work' | 'soft' | 'tiny', Slot> = {
  work: { canvas: null, ctx: null }, // full-res pristine snapshot / blend-fill buffer
  soft: { canvas: null, ctx: null }, // half-res blurred glow layer
  tiny: { canvas: null, ctx: null }, // pixelate downsample
}

function acquire(
  slot: Slot,
  w: number,
  h: number
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null
  const size = budgetedSize(w, h)
  if (!slot.canvas) {
    slot.canvas = document.createElement('canvas')
    slot.ctx = slot.canvas.getContext('2d')
  }
  const c = slot.canvas
  if (c.width !== size.w || c.height !== size.h) {
    c.width = size.w
    c.height = size.h
  }
  if (!slot.ctx) slot.ctx = c.getContext('2d')
  const g = slot.ctx
  if (!g) return null
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'
  g.filter = 'none'
  g.clearRect(0, 0, size.w, size.h)
  return { canvas: c, ctx: g }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/** Deterministic per-effect seed (stable for a given effectId) */
export function getVisionSeed(effectId: string): number {
  return hashString(effectId)
}

interface VisionJob {
  /** target context (receives the processed result) */
  T: CanvasRenderingContext2D
  /** clip content source (already filter/chroma/grade processed by the engine) */
  S: CanvasImageSource
  /** destination size in the target's current user space */
  w: number
  h: number
  /** intrinsic source bitmap size (0 → treated as w×h) */
  bw: number
  bh: number
  /** source-bitmap scale factor relative to user space (bw/w, floored at 1 … capped 2) */
  k: number
  /** clamped intensity 0..1 */
  amt: number
  /** seconds since clip start (deterministic animation clock) */
  time: number
  seed: number
  /** caller's alpha/composite — recipes restore to these between passes */
  baseAlpha: number
  baseComposite: GlobalCompositeOperation
}

/**
 * Draw one vision-processed frame. Never throws. All canvas state
 * (alpha, composite, filter, image smoothing) is restored before returning.
 */
export function drawVisionFrame(
  target: CanvasRenderingContext2D,
  src: CanvasImageSource,
  w: number,
  h: number,
  draw: VisionDraw,
  intensity: number,
  time: number,
  seed: number
): void {
  if (typeof document === 'undefined') return
  if (!target || !src) return
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return
  const prevAlpha = target.globalAlpha
  const prevComposite = target.globalCompositeOperation
  const prevFilter = target.filter
  const prevSmoothing = target.imageSmoothingEnabled
  try {
    // keep the caller's alpha/blend as the BASE composite state (the engine
    // bakes clip fade/blend at the final composite; inside the job everything
    // composites against the clip content only)
    target.globalAlpha = Number.isFinite(prevAlpha) ? prevAlpha : 1
    target.globalCompositeOperation = prevComposite || 'source-over'
    target.filter = 'none'
    const dims = sourcePixels(src)
    const bw = dims.w > 0 ? dims.w : w
    const bh = dims.h > 0 ? dims.h : h
    const k = Math.min(2, Math.max(0.5, bw / w))
    const job: VisionJob = {
      T: target,
      S: src,
      w,
      h,
      bw,
      bh,
      k,
      amt: clamp01(Number.isFinite(intensity) ? intensity : 0),
      time: Number.isFinite(time) ? time : 0,
      seed: seed | 0,
      baseAlpha: Number.isFinite(prevAlpha) ? prevAlpha : 1,
      baseComposite: (prevComposite || 'source-over') as GlobalCompositeOperation,
    }
    switch (draw.kind) {
      case 'pixelate':
        visPixelate(job, draw)
        break
      case 'mirror':
        visMirror(job, draw)
        break
      case 'kaleido':
        visKaleido(job, draw)
        break
      case 'blur':
        visBlur(job, draw)
        break
      case 'glow':
        visGlow(job, draw)
        break
      case 'chroma':
        visChroma(job, draw)
        break
      case 'duotone':
        visDuotone(job, draw)
        break
      case 'dreamy':
        visDreamy(job, draw)
        break
      case 'vhs':
        visVhs(job, draw)
        break
      case 'poster':
        visPoster(job, draw)
        break
      default:
        // unknown runtime kind — plain content, never blank
        target.drawImage(src, 0, 0, w, h)
        break
    }
  } catch {
    // a vision effect must never break playback or export — fall back to the
    // plain content draw (best effort)
    try {
      target.globalAlpha = 1
      target.globalCompositeOperation = 'source-over'
      target.filter = 'none'
      target.drawImage(src, 0, 0, w, h)
    } catch {
      /* ignore */
    }
  } finally {
    target.globalAlpha = prevAlpha
    target.globalCompositeOperation = prevComposite
    target.filter = prevFilter
    target.imageSmoothingEnabled = prevSmoothing
  }
}

/* ------------------------------------------------------------------ */
/* Shared recipe helpers                                               */
/* ------------------------------------------------------------------ */

/** Erase the clip's own pixels inside `clipRect` (full frame when omitted) */
function eraseContent(j: VisionJob, clipRect?: { x: number; y: number; w: number; h: number }): void {
  const T = j.T
  T.save()
  if (clipRect) {
    T.beginPath()
    T.rect(clipRect.x, clipRect.y, clipRect.w, clipRect.h)
    T.clip()
  }
  T.globalAlpha = 1
  T.globalCompositeOperation = 'destination-out'
  T.drawImage(j.S, 0, 0, j.w, j.h)
  T.restore()
}

/** Map a logical-space rect onto the source bitmap's pixel space */
function srcRect(j: VisionJob, x: number, y: number, w: number, h: number): [number, number, number, number] {
  const fx = j.bw / j.w
  const fy = j.bh / j.h
  return [x * fx, y * fy, Math.max(1, w * fx), Math.max(1, h * fy)]
}

/**
 * Replace the target's content with a clean copy of the source: erases the
 * clip's own alpha first (destination-out) so redraws never stack opacity on
 * semi-transparent content, then draws with the caller's alpha/blend.
 */
function replaceBase(j: VisionJob): void {
  eraseContent(j)
  j.T.globalAlpha = j.baseAlpha
  j.T.globalCompositeOperation = j.baseComposite
  j.T.drawImage(j.S, 0, 0, j.w, j.h)
}

/* ------------------------------------------------------------------ */
/* Recipes                                                             */
/* ------------------------------------------------------------------ */

function visPixelate(
  j: VisionJob,
  draw: Extract<VisionDraw, { kind: 'pixelate' }>
): void {
  const T = j.T
  const size = Math.max(2, safeNum(draw.size, 12) * (0.5 + j.amt))
  const tw = Math.max(1, Math.round(j.w / size))
  const th = Math.max(1, Math.round(j.h / size))
  const tiny = acquire(slots.tiny, tw, th)
  if (!tiny) {
    replaceBase(j)
    return
  }
  tiny.ctx.imageSmoothingEnabled = true
  tiny.ctx.drawImage(j.S, 0, 0, tiny.canvas.width, tiny.canvas.height)
  eraseContent(j)
  T.imageSmoothingEnabled = false
  T.globalAlpha = j.baseAlpha
  T.globalCompositeOperation = j.baseComposite
  T.drawImage(tiny.canvas, 0, 0, j.w, j.h)
  T.imageSmoothingEnabled = true
}

function visMirror(
  j: VisionJob,
  draw: Extract<VisionDraw, { kind: 'mirror' }>
): void {
  const T = j.T
  replaceBase(j)
  const hw = j.w / 2
  const hh = j.h / 2
  // (dest rect, source rect) per mode — the named half is REPLACED by the
  // mirrored opposite half
  const halves: Record<string, Array<{ dest: [number, number, number, number]; src: [number, number, number, number]; flipX: boolean; flipY: boolean }>> = {
    left: [{ dest: [0, 0, hw, j.h], src: [hw, 0, hw, j.h], flipX: true, flipY: false }],
    right: [{ dest: [hw, 0, hw, j.h], src: [0, 0, hw, j.h], flipX: true, flipY: false }],
    top: [{ dest: [0, 0, j.w, hh], src: [0, hh, j.w, hh], flipX: false, flipY: true }],
    bottom: [{ dest: [0, hh, j.w, hh], src: [0, 0, j.w, hh], flipX: false, flipY: true }],
    quad: [
      // right half ← mirrored left half, then top half ← mirrored bottom half
      // ⇒ BR is the source quadrant, every quadrant mirrors toward center
      { dest: [0, 0, hw, j.h], src: [hw, 0, hw, j.h], flipX: true, flipY: false },
      { dest: [0, 0, j.w, hh], src: [0, hh, j.w, hh], flipX: false, flipY: true },
    ],
  }
  const passes = halves[draw.mode] ?? halves.left
  for (const p of passes) {
    const clip = { x: p.dest[0], y: p.dest[1], w: p.dest[2], h: p.dest[3] }
    eraseContent(j, clip)
    T.save()
    T.beginPath()
    T.rect(clip.x, clip.y, clip.w, clip.h)
    T.clip()
    T.globalAlpha = j.baseAlpha
    T.globalCompositeOperation = j.baseComposite
    T.translate(p.dest[0] + (p.flipX ? p.dest[2] : 0), p.dest[1] + (p.flipY ? p.dest[3] : 0))
    T.scale(p.flipX ? -1 : 1, p.flipY ? -1 : 1)
    const s = srcRect(j, p.src[0], p.src[1], p.src[2], p.src[3])
    T.drawImage(j.S, s[0], s[1], s[2], s[3], 0, 0, p.dest[2], p.dest[3])
    T.restore()
  }
}

function visKaleido(
  j: VisionJob,
  draw: Extract<VisionDraw, { kind: 'kaleido' }>
): void {
  const T = j.T
  const work = acquire(slots.work, j.bw, j.bh)
  if (!work) {
    replaceBase(j)
    return
  }
  // pristine snapshot — every wedge must sample the SAME base image
  work.ctx.drawImage(j.S, 0, 0, work.canvas.width, work.canvas.height)
  replaceBase(j)
  const slices = draw.slices === 4 || draw.slices === 8 ? draw.slices : 2
  const cx = j.w / 2
  const cy = j.h / 2
  const R = Math.hypot(j.w, j.h) * 0.52
  const a0 = j.time * 0.12 // slow deterministic drift
  const step = (Math.PI * 2) / slices
  for (let i = 0; i < slices; i++) {
    const a = a0 + i * step
    T.save()
    T.beginPath()
    T.moveTo(cx, cy)
    T.arc(cx, cy, R, a, a + step)
    T.closePath()
    T.clip()
    T.translate(cx, cy)
    T.rotate(a)
    if (i % 2 === 1) T.scale(1, -1) // mirrored wedges → kaleidoscope symmetry
    T.translate(-cx, -cy)
    T.drawImage(work.canvas, 0, 0, j.w, j.h)
    T.restore()
  }
}

function visBlur(
  j: VisionJob,
  draw: Extract<VisionDraw, { kind: 'blur' }>
): void {
  const T = j.T
  const px = Math.max(0.4, safeNum(draw.px, 8) * (0.4 + 0.6 * j.amt))
  eraseContent(j)
  T.globalAlpha = j.baseAlpha // (kept: blur fully replaces the content)
  T.globalCompositeOperation = j.baseComposite
  try {
    T.filter = `blur(${px.toFixed(2)}px)`
  } catch {
    /* filter unsupported — falls through to a plain draw */
  }
  T.drawImage(j.S, 0, 0, j.w, j.h)
  T.filter = 'none'
}

/** Half-res blurred + brightened + tinted copy of the content (glow layer) */
function buildGlowLayer(j: VisionJob, blurPx: number, tint: string, tintAlpha: number): HTMLCanvasElement | null {
  const soft = acquire(slots.soft, j.bw / 2, j.bh / 2)
  if (!soft) return null
  const g = soft.ctx
  try {
    g.filter = `blur(${Math.max(1, blurPx).toFixed(2)}px) brightness(1.55)`
  } catch {
    /* filter unsupported — the layer is just a soft copy */
  }
  g.drawImage(j.S, 0, 0, soft.canvas.width, soft.canvas.height)
  g.filter = 'none'
  // tint the glow, keeping the blurred alpha shape
  g.globalCompositeOperation = 'source-atop'
  g.globalAlpha = clamp01(tintAlpha)
  g.fillStyle = tint || '#ffffff'
  g.fillRect(0, 0, soft.canvas.width, soft.canvas.height)
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'
  return soft.canvas
}

function visGlow(
  j: VisionJob,
  draw: Extract<VisionDraw, { kind: 'glow' }>
): void {
  const T = j.T
  replaceBase(j)
  const radius = Math.max(2, safeNum(draw.radius, 18))
  // soft bitmap is half the source bitmap ⇒ blur radius scales by k/2
  const glow = buildGlowLayer(j, radius * (0.4 + 0.6 * j.amt) * j.k * 0.5, draw.color, 0.55)
  if (!glow) return
  T.save()
  T.globalAlpha = clamp01(safeNum(draw.amount, 0.6) * j.amt)
  T.globalCompositeOperation = 'screen'
  T.drawImage(glow, 0, 0, j.w, j.h)
  T.restore()
}

function visChroma(
  j: VisionJob,
  draw: Extract<VisionDraw, { kind: 'chroma' }>
): void {
  const T = j.T
  const work = acquire(slots.work, j.bw, j.bh)
  if (!work) {
    replaceBase(j)
    return
  }
  work.ctx.drawImage(j.S, 0, 0, work.canvas.width, work.canvas.height)
  replaceBase(j)
  const shift = Math.max(1, safeNum(draw.shift, 6) * (0.5 + 1.5 * j.amt))
  const alpha = clamp01(0.1 + 0.24 * j.amt)
  T.save()
  T.globalAlpha = alpha
  T.globalCompositeOperation = 'screen'
  try {
    T.filter = 'sepia(1) saturate(3.2) hue-rotate(-38deg)'
  } catch {
    /* filter unsupported */
  }
  T.drawImage(work.canvas, shift, 0, j.w, j.h)
  try {
    T.filter = 'sepia(1) saturate(2.6) hue-rotate(140deg)'
  } catch {
    /* filter unsupported */
  }
  T.drawImage(work.canvas, -shift, 0, j.w, j.h)
  T.filter = 'none'
  T.restore()
}

function visDuotone(
  j: VisionJob,
  draw: Extract<VisionDraw, { kind: 'duotone' }>
): void {
  const T = j.T
  const work = acquire(slots.work, j.bw, j.bh)
  if (!work) {
    replaceBase(j)
    return
  }
  const g = work.ctx
  // grayscale + slight contrast ⇒ gradient-map approximation base
  try {
    g.filter = 'grayscale(1) contrast(1.12)'
  } catch {
    /* filter unsupported */
  }
  g.drawImage(j.S, 0, 0, work.canvas.width, work.canvas.height)
  g.filter = 'none'
  // shadows → dark color, highlights → light color (both scaled by intensity)
  g.globalCompositeOperation = 'multiply'
  g.globalAlpha = clamp01(0.35 + 0.6 * j.amt)
  g.fillStyle = draw.dark || '#1a1a2e'
  g.fillRect(0, 0, work.canvas.width, work.canvas.height)
  g.globalCompositeOperation = 'screen'
  g.globalAlpha = clamp01(0.2 + 0.55 * j.amt)
  g.fillStyle = draw.light || '#f7f3e9'
  g.fillRect(0, 0, work.canvas.width, work.canvas.height)
  // confine to the clip's own alpha — never tint neighbouring layers
  g.globalAlpha = 1
  g.globalCompositeOperation = 'destination-in'
  g.drawImage(j.S, 0, 0, work.canvas.width, work.canvas.height)
  g.globalCompositeOperation = 'source-over'
  eraseContent(j)
  T.globalAlpha = j.baseAlpha
  T.globalCompositeOperation = j.baseComposite
  T.drawImage(work.canvas, 0, 0, j.w, j.h)
}

function visDreamy(
  j: VisionJob,
  draw: Extract<VisionDraw, { kind: 'dreamy' }>
): void {
  const T = j.T
  try {
    T.filter = 'saturate(0.92)'
  } catch {
    /* filter unsupported */
  }
  replaceBase(j)
  T.filter = 'none'
  const amt = clamp01(safeNum(draw.amount, 0.7) * j.amt)
  if (amt <= 0.004) return
  const glow = buildGlowLayer(j, 7 * j.k * 0.5, '#ffffff', 0.35)
  if (!glow) return
  T.save()
  T.globalAlpha = amt * 0.8
  T.globalCompositeOperation = 'screen'
  T.drawImage(glow, 0, 0, j.w, j.h)
  T.restore()
}

function visVhs(
  j: VisionJob,
  draw: Extract<VisionDraw, { kind: 'vhs' }>
): void {
  const T = j.T
  const work = acquire(slots.work, j.bw, j.bh)
  if (!work) {
    replaceBase(j)
    return
  }
  work.ctx.drawImage(j.S, 0, 0, work.canvas.width, work.canvas.height)
  // washed, contrasty tape look
  try {
    T.filter = 'saturate(0.75) contrast(1.08)'
  } catch {
    /* filter unsupported */
  }
  replaceBase(j)
  T.filter = 'none'
  const amt = clamp01(safeNum(draw.amount, 0.6) * j.amt)
  // chroma fringe copies at ±shift px (cheap 2-pass approximation)
  const shift = Math.max(1, safeNum(draw.shift, 4) * (0.4 + 1.2 * j.amt))
  T.save()
  T.globalAlpha = clamp01(0.07 + 0.2 * amt)
  T.globalCompositeOperation = 'screen'
  try {
    T.filter = 'sepia(1) saturate(3) hue-rotate(-40deg)'
  } catch {
    /* filter unsupported */
  }
  T.drawImage(work.canvas, shift, 0, j.w, j.h)
  try {
    T.filter = 'sepia(1) saturate(2.4) hue-rotate(140deg)'
  } catch {
    /* filter unsupported */
  }
  T.drawImage(work.canvas, -shift, 0, j.w, j.h)
  T.filter = 'none'
  T.restore()
  // deterministic per-band horizontal tracking jitter (re-rolled ~13×/sec)
  const bands = 22
  const bandH = j.h / bands
  const slot = Math.floor(j.time * 13)
  const bandAlpha = clamp01(0.3 + 0.7 * amt)
  for (let i = 0; i < bands; i++) {
    if (hash01(hashInt(j.seed, i * 61 + slot * 31)) > 0.28 + 0.4 * amt) continue
    const nx = valueNoise(i * 7.31 + slot * 3.7, j.seed)
    const dx = (nx - 0.5) * (2 + 14 * amt)
    const y = i * bandH
    const bh = Math.max(1, bandH + 1) // +1px overlap avoids seams
    const s = srcRect(j, 0, y, j.w, bandH)
    T.save()
    T.beginPath()
    T.rect(0, y, j.w, bh)
    T.clip()
    T.globalAlpha = bandAlpha
    T.globalCompositeOperation = j.baseComposite
    T.drawImage(j.S, s[0], s[1], s[2], s[3], dx, y, j.w, bh)
    T.restore()
  }
}

function visPoster(
  j: VisionJob,
  draw: Extract<VisionDraw, { kind: 'poster' }>
): void {
  const T = j.T
  const work = acquire(slots.work, j.bw, j.bh)
  if (!work) {
    replaceBase(j)
    return
  }
  const g = work.ctx
  const strength = clamp01(safeNum(draw.strength, 0.5) * (0.35 + 0.65 * j.amt))
  const levels = Math.max(2, safeNum(draw.levels, 6))
  // posterize approximation: hard contrast + saturation push, then a flat
  // 'saturation'-blend fill; levels inform the fill strength (documented
  // approximation — true per-channel quantization would need pixel access)
  try {
    g.filter = `contrast(${(1 + strength * 0.9).toFixed(3)}) saturate(${(1 + strength * 0.5).toFixed(3)})`
  } catch {
    /* filter unsupported */
  }
  g.drawImage(j.S, 0, 0, work.canvas.width, work.canvas.height)
  g.filter = 'none'
  g.globalCompositeOperation = 'saturation'
  g.globalAlpha = clamp01((0.12 + 0.25 * strength) * Math.min(1.4, levels / 8))
  g.fillStyle = 'hsl(35, 100%, 50%)'
  g.fillRect(0, 0, work.canvas.width, work.canvas.height)
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'
  // confine to the clip's own alpha — never recolour neighbouring layers
  g.globalCompositeOperation = 'destination-in'
  g.drawImage(j.S, 0, 0, work.canvas.width, work.canvas.height)
  g.globalCompositeOperation = 'source-over'
  eraseContent(j)
  T.globalAlpha = j.baseAlpha
  T.globalCompositeOperation = j.baseComposite
  T.drawImage(work.canvas, 0, 0, j.w, j.h)
}
