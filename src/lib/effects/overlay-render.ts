/**
 * NovaCut Studio — deterministic canvas overlay renderer (mega-effects).
 *
 * Every visual is derived from a string seed + time via integer hashing and a
 * mulberry32 PRNG — Math.random is NEVER used — so the same seed + time always
 * produces identical pixels. This guarantees preview matches export
 * frame-for-frame.
 *
 * drawOverlayFrame is called by the engine AFTER the clip frame content has
 * been drawn, with the context already transformed into canvas space and
 * w/h = canvas logical size. `time` is seconds since the clip start and
 * `intensity` (0..1) scales every effect's amount.
 *
 * Transform-side kinds (shake / zoomPulse) draw nothing here — the engine
 * applies overlayShake()/overlayZoomPulse() to the clip transform BEFORE the
 * content draw instead.
 */
import type { OverlayDraw } from './types'

/* ------------------------------------------------------------------ */
/* Deterministic hashing / PRNG helpers (shared with the engine)       */
/* ------------------------------------------------------------------ */

/** FNV-1a style string hash → uint32 seed */
export function hashString(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Integer avalanche hash → uint32. Deterministic across sessions. */
export function hashInt(a: number, b: number): number {
  let t = (Math.imul(a | 0, 0x85ebca6b) ^ Math.imul(b | 0, 0xc2b2ae35)) | 0
  t = Math.imul(t ^ (t >>> 13), 0x27d4eb2f)
  return (t ^ (t >>> 16)) >>> 0
}

/** Hash a uint32 into [0, 1) */
export function hash01(n: number): number {
  return hashInt(n, 0x9e3779b9) / 4294967296
}

/** mulberry32 PRNG — deterministic stream from a uint32 seed */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Smooth C1-continuous 1D value noise in [0,1) — deterministic */
export function valueNoise(x: number, seed: number): number {
  const i = Math.floor(x)
  const f = x - i
  const s = f * f * (3 - 2 * f)
  const a = hash01(hashInt(seed, i))
  const b = hash01(hashInt(seed, i + 1))
  return a + (b - a) * s
}

function wrap01(v: number): number {
  const r = v % 1
  return r < 0 ? r + 1 : r
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

const BLEND_WHITELIST: readonly string[] = [
  'source-over',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
]

function safeBlend(mode: string, fallback: string = 'source-over'): GlobalCompositeOperation {
  return (BLEND_WHITELIST.includes(mode) ? mode : fallback) as GlobalCompositeOperation
}

/** Tolerant color → rgba() with explicit alpha (hex / rgb() supported, else pass-through) */
function withAlpha(color: string, a: number): string {
  const c = color.trim()
  let m = /^#([0-9a-f]{6})$/i.exec(c)
  if (m) {
    const v = parseInt(m[1], 16)
    return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a.toFixed(3)})`
  }
  m = /^#([0-9a-f]{3})$/i.exec(c)
  if (m) {
    const v = m[1]
    return `rgba(${parseInt(v[0] + v[0], 16)},${parseInt(v[1] + v[1], 16)},${parseInt(v[2] + v[2], 16)},${a.toFixed(3)})`
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(c)
  if (rgb) {
    const parts = rgb[1].split(/[,/\s]+/).filter(Boolean)
    if (parts.length >= 3) {
      const r = Math.round(parseFloat(parts[0]) || 0)
      const g = Math.round(parseFloat(parts[1]) || 0)
      const b = Math.round(parseFloat(parts[2]) || 0)
      return `rgba(${r},${g},${b},${a.toFixed(3)})`
    }
  }
  // Non-parseable color: rely on ctx.globalAlpha for modulation
  return c
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Draw one overlay frame. Never throws. All canvas state (alpha, composite,
 * filter, shadow) is restored to its previous values before returning.
 */
export function drawOverlayFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  intensity: number,
  draw: OverlayDraw,
  seed: string
): void {
  if (typeof document === 'undefined') return
  const prevAlpha = ctx.globalAlpha
  const prevComposite = ctx.globalCompositeOperation
  const prevFilter = ctx.filter
  const prevShadowBlur = ctx.shadowBlur
  const prevShadowColor = ctx.shadowColor
  try {
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.filter = 'none'
    const seedNum = hashString(seed)
    const amt = clamp01(intensity)
    switch (draw.kind) {
      case 'particles':
        drawParticles(ctx, w, h, time, amt, draw, seed)
        break
      case 'grain':
        drawGrain(ctx, w, h, time, amt, draw, seed, seedNum)
        break
      case 'vignette':
        drawVignette(ctx, w, h, amt, draw)
        break
      case 'scanlines':
        drawScanlines(ctx, w, h, time, amt, draw, seedNum)
        break
      case 'leak':
        drawLeak(ctx, w, h, time, amt, draw, seedNum)
        break
      case 'flash':
        drawFlash(ctx, w, h, time, amt, draw)
        break
      case 'shake':
      case 'zoomPulse':
      default:
        // transform-side kinds: applied by the engine before the content draw
        break
    }
  } catch {
    // an overlay must never break playback or export
  } finally {
    ctx.globalAlpha = prevAlpha
    ctx.globalCompositeOperation = prevComposite
    ctx.filter = prevFilter
    ctx.shadowBlur = prevShadowBlur
    ctx.shadowColor = prevShadowColor
  }
}

/**
 * Deterministic per-frame camera shake.
 * dx/dy are fractions of the canvas size, rot is in degrees.
 * 'handheld' = small smooth value-noise drift, 'earthquake' = violent jitter.
 */
export function overlayShake(
  time: number,
  amount: number,
  speed: number,
  variant: string,
  seed: string
): { dx: number; dy: number; rot: number } {
  const a = Math.max(0, amount)
  if (a <= 0.0001) return { dx: 0, dy: 0, rot: 0 }
  const s = hashString(seed)
  if (variant === 'earthquake') {
    const step = Math.floor(time * 28)
    const jx = hash01(hashInt(s, step)) - 0.5
    const jy = hash01(hashInt(s, step + 101)) - 0.5
    const jz = hash01(hashInt(s, step + 202)) - 0.5
    const sx = Math.sin(time * 37.7) * 0.35
    const sy = Math.sin(time * 43.3 + 1.7) * 0.35
    return {
      dx: (jx + jz * 0.6 + sx) * a * 0.09,
      dy: (jy + sy) * a * 0.09,
      rot: (jz + sx * 0.5) * a * 3.2,
    }
  }
  // handheld: smooth interpolated noise
  const f = Math.max(0.2, speed)
  const nx = valueNoise(time * f * 1.8, s)
  const ny = valueNoise(time * f * 1.8 + 57.3, s ^ 0x51ab)
  const nr = valueNoise(time * f * 1.3 + 11.9, s ^ 0x9e37)
  return { dx: (nx - 0.5) * a * 0.035, dy: (ny - 0.5) * a * 0.03, rot: (nr - 0.5) * a * 2.4 }
}

/**
 * Deterministic zoom pulse → scale multiplier (1 + pulse * amount).
 * 'beat' = sharp attack with fast exponential decay, 'breathe' = smooth sine.
 */
export function overlayZoomPulse(time: number, amount: number, speed: number, variant: string): number {
  const a = Math.max(0, amount)
  if (a <= 0.0001) return 1
  const sp = Math.max(0.05, speed)
  if (variant === 'breathe') {
    const s = 0.5 + 0.5 * Math.sin(time * sp * Math.PI * 2)
    return 1 + s * a * 0.09
  }
  // beat: sharp attack (first ~5% of the period), fast decay
  const phase = (time * sp) % 1
  const attack = Math.min(1, phase / 0.055)
  const decay = Math.exp(-phase * 7)
  return 1 + attack * decay * a * 0.16
}

/* ------------------------------------------------------------------ */
/* Particles                                                           */
/* ------------------------------------------------------------------ */

interface Particle {
  bx: number
  by: number
  s: number
  sp: number
  ph: number
  dr: number
  o: number
}

const particleCache = new Map<string, Particle[]>()

function particleField(seed: string, variant: string, count: number): Particle[] {
  const key = `${seed}|${variant}|${count}`
  const hit = particleCache.get(key)
  if (hit) return hit
  const rnd = mulberry32(hashString(`particles|${seed}|${variant}`))
  const arr: Particle[] = []
  for (let i = 0; i < Math.max(1, count); i++) {
    arr.push({
      bx: rnd(),
      by: rnd(),
      s: 0.55 + rnd() * 0.9,
      sp: 0.6 + rnd() * 0.9,
      ph: rnd() * Math.PI * 2,
      dr: 0.5 + rnd() * 1.5,
      o: 0.35 + rnd() * 0.65,
    })
  }
  if (particleCache.size > 48) particleCache.clear()
  particleCache.set(key, arr)
  return arr
}

interface ParticleMotion {
  /** vertical speed, fraction of frame height per second (negative = rising) */
  fall: number
  /** horizontal sway amplitude, fraction of frame width */
  sway: number
  alpha: number
  radius: number
}

function particleMotion(variant: string): ParticleMotion {
  switch (variant) {
    case 'rain':
      return { fall: 0.55, sway: 0.003, alpha: 0.4, radius: 1 }
    case 'sparks':
      return { fall: 0.16, sway: 0.008, alpha: 0.9, radius: 0.9 }
    case 'dust':
      return { fall: 0.014, sway: 0.03, alpha: 0.3, radius: 0.35 }
    case 'bokeh':
      return { fall: -0.018, sway: 0.012, alpha: 0.2, radius: 4.2 }
    case 'bubbles':
      return { fall: -0.075, sway: 0.018, alpha: 0.5, radius: 1.4 }
    case 'stars':
      return { fall: 0, sway: 0.001, alpha: 0.9, radius: 0.9 }
    case 'embers':
      return { fall: -0.16, sway: 0.022, alpha: 0.85, radius: 0.55 }
    case 'snow':
    default:
      return { fall: 0.05, sway: 0.018, alpha: 0.85, radius: 1 }
  }
}

function particleColor(variant: string, color: string): string {
  if (color) return color
  switch (variant) {
    case 'rain':
      return '#cfe4ff'
    case 'sparks':
      return '#ffd27a'
    case 'dust':
      return '#d8cfc0'
    case 'bokeh':
      return '#ffe9c4'
    case 'bubbles':
      return '#bfe9ff'
    case 'embers':
      return '#ff8040'
    case 'snow':
    case 'stars':
    default:
      return '#ffffff'
  }
}

const TAU = Math.PI * 2

function drawParticles(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  intensity: number,
  draw: Extract<OverlayDraw, { kind: 'particles' }>,
  seed: string
): void {
  const count = Math.max(0, Math.round(draw.count))
  const active = Math.round(count * intensity)
  if (active <= 0) return
  ctx.globalCompositeOperation = safeBlend(draw.blend)
  const field = particleField(seed, draw.variant, count)
  const color = particleColor(draw.variant, draw.color)
  const m = particleMotion(draw.variant)
  const driftMul = Math.max(0.1, draw.drift)
  const spd = Math.max(0, draw.speed)
  const sizePx = Math.max(1, draw.size * (Math.min(w, h) / 720))
  for (let i = 0; i < active; i++) {
    const pt = field[i % field.length]
    const y = wrap01(pt.by + m.fall * time * spd * pt.sp)
    const x = wrap01(pt.bx + Math.sin(time * pt.dr * driftMul + pt.ph) * m.sway)
    const px = x * w
    const py = y * h
    const r = Math.max(0.6, sizePx * m.radius * pt.s)
    const twinkle =
      draw.variant === 'stars' || draw.variant === 'sparks' || draw.variant === 'embers'
        ? 0.55 + 0.45 * Math.sin(time * pt.dr * driftMul * 2.4 + pt.ph)
        : 1
    const baseAlpha = clamp01(m.alpha * pt.o * twinkle)
    ctx.globalAlpha = baseAlpha
    switch (draw.variant) {
      case 'rain': {
        const len = sizePx * 9 * pt.s
        ctx.strokeStyle = color
        ctx.lineCap = 'round'
        ctx.lineWidth = Math.max(1, sizePx * 0.16)
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(px - len * 0.06, py - len)
        ctx.stroke()
        break
      }
      case 'sparks': {
        const len = sizePx * 3.2 * pt.s
        ctx.strokeStyle = color
        ctx.lineCap = 'round'
        // additive glow pass (wider, fainter) then bright core
        ctx.globalAlpha = baseAlpha * 0.35
        ctx.lineWidth = Math.max(1.6, sizePx * 0.5)
        ctx.beginPath()
        ctx.moveTo(px, py - len)
        ctx.lineTo(px, py)
        ctx.stroke()
        ctx.globalAlpha = baseAlpha
        ctx.lineWidth = Math.max(0.8, sizePx * 0.16)
        ctx.beginPath()
        ctx.moveTo(px, py - len)
        ctx.lineTo(px, py)
        ctx.stroke()
        break
      }
      case 'dust': {
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(px, py, Math.min(r, 1.6), 0, TAU)
        ctx.fill()
        break
      }
      case 'bokeh': {
        const g = ctx.createRadialGradient(px, py, 0, px, py, r)
        g.addColorStop(0, withAlpha(color, 0.9))
        g.addColorStop(0.6, withAlpha(color, 0.4))
        g.addColorStop(1, withAlpha(color, 0))
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(px, py, r, 0, TAU)
        ctx.fill()
        break
      }
      case 'bubbles': {
        ctx.strokeStyle = color
        ctx.lineWidth = Math.max(1, sizePx * 0.12)
        ctx.beginPath()
        ctx.arc(px, py, r, 0, TAU)
        ctx.stroke()
        ctx.globalAlpha = baseAlpha * 0.85
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(px - r * 0.35, py - r * 0.35, Math.max(0.8, r * 0.16), 0, TAU)
        ctx.fill()
        break
      }
      case 'stars': {
        const arm = r * 2.6
        ctx.strokeStyle = color
        ctx.lineWidth = Math.max(0.8, sizePx * 0.12)
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(px - arm, py)
        ctx.lineTo(px + arm, py)
        ctx.moveTo(px, py - arm)
        ctx.lineTo(px, py + arm)
        ctx.stroke()
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(px, py, Math.max(0.6, sizePx * 0.1), 0, TAU)
        ctx.fill()
        break
      }
      case 'embers': {
        // soft glow then bright core
        const g = ctx.createRadialGradient(px, py, 0, px, py, r * 2.6)
        g.addColorStop(0, withAlpha(color, 0.5))
        g.addColorStop(1, withAlpha(color, 0))
        ctx.globalAlpha = baseAlpha * 0.6
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(px, py, r * 2.6, 0, TAU)
        ctx.fill()
        ctx.globalAlpha = baseAlpha
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(px, py, r, 0, TAU)
        ctx.fill()
        break
      }
      case 'snow':
      default: {
        const gr = r * 1.5
        const g = ctx.createRadialGradient(px, py, 0, px, py, gr)
        g.addColorStop(0, withAlpha(color, 1))
        g.addColorStop(0.45, withAlpha(color, 0.55))
        g.addColorStop(1, withAlpha(color, 0))
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(px, py, gr, 0, TAU)
        ctx.fill()
        break
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Grain                                                               */
/* ------------------------------------------------------------------ */

const grainCache = new Map<string, HTMLCanvasElement>()

function grainTile(seed: string, variant: string): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const key = `${seed}|${variant}`
  const hit = grainCache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const g = c.getContext('2d')
  if (!g) return null
  const strength = variant === 'heavy' ? 150 : variant === 'film' ? 95 : 55
  const img = g.createImageData(128, 128)
  const rnd = mulberry32(hashString(`grain|${seed}|${variant}`))
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, Math.round(128 + (rnd() - 0.5) * strength)))
    d[i] = v
    d[i + 1] = v
    d[i + 2] = v
    d[i + 3] = 255
  }
  g.putImageData(img, 0, 0)
  if (grainCache.size > 24) grainCache.clear()
  grainCache.set(key, c)
  return c
}

function drawGrain(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  intensity: number,
  draw: Extract<OverlayDraw, { kind: 'grain' }>,
  seed: string,
  seedNum: number
): void {
  const tile = grainTile(seed, draw.variant)
  if (!tile) return
  const mul = draw.variant === 'heavy' ? 0.5 : draw.variant === 'film' ? 0.3 : 0.18
  ctx.globalAlpha = clamp01(mul * draw.amount * intensity)
  ctx.globalCompositeOperation = draw.variant === 'film' ? 'overlay' : 'source-over'
  // per-frame offset quantized to 24 fps — deterministic tile jitter
  const frame = Math.floor(time * 24)
  const ox = hash01(hashInt(seedNum, frame * 2 + 1)) * 128
  const oy = hash01(hashInt(seedNum, frame * 2 + 2)) * 128
  const pat = ctx.createPattern(tile, 'repeat')
  if (!pat) return
  ctx.save()
  ctx.translate(-ox, -oy)
  ctx.fillStyle = pat
  ctx.fillRect(0, 0, w + 128, h + 128)
  ctx.restore()
}

/* ------------------------------------------------------------------ */
/* Vignette                                                            */
/* ------------------------------------------------------------------ */

function drawVignette(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  intensity: number,
  draw: Extract<OverlayDraw, { kind: 'vignette' }>
): void {
  const base = clamp01(draw.amount * intensity)
  if (base <= 0.001) return
  const cine = draw.variant === 'cine'
  const maxA = clamp01(base * (cine ? 1.5 : draw.variant === 'strong' ? 1.25 : 1))
  const cx = w / 2
  const cy = h / 2
  const outer = Math.hypot(w, h) * 0.62
  const inner = Math.min(w, h) * (cine ? 0.12 : 0.26)
  const g = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer)
  const f = Math.min(0.95, Math.max(0.05, draw.feather))
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(f, `rgba(0,0,0,${(maxA * 0.35).toFixed(3)})`)
  g.addColorStop(1, `rgba(0,0,0,${maxA.toFixed(3)})`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  if (cine) {
    // cine: extra slight flat dark tint on top of the corner falloff
    ctx.fillStyle = `rgba(0,0,0,${Math.min(0.14, maxA * 0.16).toFixed(3)})`
    ctx.fillRect(0, 0, w, h)
  }
}

/* ------------------------------------------------------------------ */
/* Scanlines                                                           */
/* ------------------------------------------------------------------ */

function drawScanlines(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  intensity: number,
  draw: Extract<OverlayDraw, { kind: 'scanlines' }>,
  seedNum: number
): void {
  const alpha = clamp01(draw.amount * intensity)
  if (alpha <= 0.002) return
  const spacing = Math.max(2, Math.round(draw.spacing))
  const lineH = Math.max(1, Math.round(spacing * 0.38))
  const vhs = draw.variant === 'vhs'
  const bandH = Math.max(spacing * 5, 26)
  ctx.fillStyle = '#000000'
  ctx.globalAlpha = alpha
  for (let y = 0; y < h; y += spacing) {
    let dx = 0
    if (vhs) {
      // deterministic per-band horizontal jitter, re-rolled ~10x/sec
      const band = Math.floor(y / bandH)
      const j = hash01(hashInt(seedNum, band * 61 + Math.floor(time * 10)))
      dx = (j - 0.5) * 3 * alpha
    }
    ctx.fillRect(dx - 2, y, w + 4, lineH)
  }
  if (vhs) {
    // faint brighter band drifting down the frame
    const bandY = wrap01(time * 0.11) * (h + 120) - 60
    const g = ctx.createLinearGradient(0, bandY, 0, bandY + 120)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.5, `rgba(255,255,255,${(0.07 * alpha).toFixed(3)})`)
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.globalAlpha = 1
    ctx.fillStyle = g
    ctx.fillRect(0, bandY, w, 120)
  }
  ctx.globalAlpha = 1
}

/* ------------------------------------------------------------------ */
/* Light leaks                                                         */
/* ------------------------------------------------------------------ */

function drawLeak(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  intensity: number,
  draw: Extract<OverlayDraw, { kind: 'leak' }>,
  seedNum: number
): void {
  const amt = clamp01(draw.amount * intensity)
  if (amt <= 0.002) return
  ctx.globalCompositeOperation = safeBlend(draw.blend, 'screen')
  const hue = ((draw.hue % 360) + 360) % 360
  const col = (a: number): string => `hsla(${hue.toFixed(1)},92%,60%,${a.toFixed(3)})`
  const diag = Math.hypot(w, h)
  const a0 = amt * 0.85
  const blob = (cx: number, cy: number, radius: number, a: number): void => {
    if (a <= 0.003) return
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
    g.addColorStop(0, col(a))
    g.addColorStop(0.55, col(a * 0.45))
    g.addColorStop(1, col(0))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }
  switch (draw.variant) {
    case 'sweep': {
      const cx = wrap01(time * 0.09) * 1.3 * w - 0.15 * w
      const cy = h * (0.5 + Math.sin(time * 0.23) * 0.22)
      blob(cx, cy, diag * 0.42, a0)
      blob(cx - w * 0.35, cy + h * 0.18, diag * 0.3, a0 * 0.4)
      break
    }
    case 'flicker': {
      let f = 0.65 + 0.35 * valueNoise(time * 14, seedNum)
      if (hash01(hashInt(seedNum, Math.floor(time * 11) + 909)) < 0.08) f *= 0.4
      blob(w * 1.02, -h * 0.04, diag * 0.5, a0 * f)
      blob(-w * 0.02, h * 1.04, diag * 0.5, a0 * f * 0.85)
      break
    }
    case 'beam': {
      ctx.save()
      ctx.translate(w / 2, h / 2)
      ctx.rotate(-0.55 + Math.sin(time * 0.12) * 0.35)
      const g = ctx.createLinearGradient(-w * 0.6, 0, w * 0.6, 0)
      g.addColorStop(0, col(0))
      g.addColorStop(0.42, col(0))
      g.addColorStop(0.5, col(a0))
      g.addColorStop(0.58, col(0))
      g.addColorStop(1, col(0))
      ctx.fillStyle = g
      ctx.fillRect(-w, -h, w * 2, h * 2)
      ctx.restore()
      break
    }
    case 'corner':
    default:
      blob(w * 1.02, -h * 0.04, diag * 0.5, a0)
      blob(-w * 0.02, h * 1.04, diag * 0.5, a0 * 0.85)
      break
  }
}

/* ------------------------------------------------------------------ */
/* Flash                                                               */
/* ------------------------------------------------------------------ */

function flashCurve(t: number, speed: number, variant: string): number {
  const sp = Math.max(0.05, speed)
  if (variant === 'pulse') {
    const s = 0.5 + 0.5 * Math.sin(t * sp * Math.PI * 2)
    return s * s
  }
  // strobe: square-ish pulse — on ~14% of the period with a slight decay
  const period = 1 / sp
  const phase = (t % period) / period
  if (phase < 0.14) return 1 - (phase / 0.14) * 0.35
  return 0
}

function drawFlash(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  intensity: number,
  draw: Extract<OverlayDraw, { kind: 'flash' }>
): void {
  const a = clamp01(flashCurve(time, draw.speed, draw.variant) * clamp01(draw.amount * intensity))
  if (a <= 0.004) return
  ctx.globalAlpha = a
  ctx.fillStyle = draw.variant === 'pulse' ? '#fff6e2' : '#ffffff'
  ctx.fillRect(0, 0, w, h)
}
