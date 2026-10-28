import type { ChromaKey, Clip, ColorGrade, CurvePoint, EasingType, Filters, Keyframe, KeyframeProperty, LutData, Project, RampEase, SpeedRampPoint } from './types'

export function uid(prefix = ''): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/** Total timeline duration = end of the last clip */
export function projectDuration(project: Project): number {
  let d = 0
  for (const c of project.clips) d = Math.max(d, c.start + c.duration)
  return d
}

export function clipsOnTrack(project: Project, trackId: string): Clip[] {
  return project.clips.filter((c) => c.trackId === trackId).sort((a, b) => a.start - b.start)
}

/**
 * Pick a playhead position that shows actual content when a project opens.
 * If t=0 only intersects fully transparent clips (long fade-ins or intro text
 * animations), land just past the longest intro so users never meet a black
 * preview on first paint.
 */
export function landingTime(project: Project): number {
  const covering = project.clips.filter((c) => {
    if (c.kind === 'audio') return false
    const track = project.tracks.find((tr) => tr.id === c.trackId)
    return !track?.hidden && c.start <= 0.001 && c.start + c.duration > 0.001
  })
  if (covering.length === 0) return 0

  let invisibleFor = 0
  for (const c of covering) {
    invisibleFor = Math.max(invisibleFor, c.fadeIn)
    if (c.kind === 'text' && c.textStyle) {
      const a = c.textStyle.animation
      if (a === 'fadeIn' || a === 'pop' || a === 'slideUp' || a === 'wipe') {
        invisibleFor = Math.max(invisibleFor, Math.max(0.5, c.textStyle.animationDuration))
      }
    }
  }
  return invisibleFor > 0.05 ? Math.min(invisibleFor + 0.2, projectDuration(project)) : 0
}

/** mm:ss:ff style timecode */
export function formatTimecode(t: number, fps = 30): string {
  const safe = Math.max(0, t)
  const m = Math.floor(safe / 60)
  const s = Math.floor(safe % 60)
  const f = Math.floor((safe - Math.floor(safe)) * fps)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(m)}:${pad(s)}.${pad(f)}`
}

/** short "1:23" style for badges */
export function formatShortTime(t: number): string {
  const safe = Math.max(0, Math.floor(t))
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

/** Build a canvas ctx.filter string from Filters. Skips default values for speed. */
export function buildFilterString(f: Filters): string {
  const parts: string[] = []
  if (f.brightness !== 1) parts.push(`brightness(${f.brightness})`)
  if (f.contrast !== 1) parts.push(`contrast(${f.contrast})`)
  if (f.saturation !== 1) parts.push(`saturate(${f.saturation})`)
  if (f.hue !== 0) parts.push(`hue-rotate(${f.hue}deg)`)
  if (f.blur > 0) parts.push(`blur(${f.blur}px)`)
  if (f.sepia > 0) parts.push(`sepia(${f.sepia})`)
  if (f.grayscale > 0) parts.push(`grayscale(${f.grayscale})`)
  if (f.invert > 0) parts.push(`invert(${f.invert})`)
  return parts.length ? parts.join(' ') : 'none'
}

/* ---------------- filter / grade normalization ---------------- */

/** Clamped ranges of the Filters contract (mirrors the sliders + preset generator). */
const FILTER_RANGE_TABLE = {
  brightness: [0, 2],
  contrast: [0, 2],
  saturation: [0, 2],
  hue: [-180, 180],
  blur: [0, 20],
  sepia: [0, 1],
  grayscale: [0, 1],
  invert: [0, 1],
} as const

/** Clamped ranges of the ColorGrade contract. */
const GRADE_RANGE_TABLE = {
  temperature: [-1, 1],
  tint: [-1, 1],
  shadows: [-1, 1],
  highlights: [-1, 1],
  vibrance: [0, 2],
} as const

/**
 * Coerce persisted/patched filter data into the strict Filters contract —
 * repairs hand-edited or legacy JSON (missing keys, out-of-range values, NaN).
 */
export function normalizeFilters(input: unknown): Filters {
  const src = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const out = {} as Record<keyof Filters, number>
  for (const key of Object.keys(FILTER_RANGE_TABLE) as (keyof Filters)[]) {
    const [min, max] = FILTER_RANGE_TABLE[key]
    const v = Number(src[key])
    const neutral = key === 'brightness' || key === 'contrast' || key === 'saturation' ? 1 : 0
    out[key] = Number.isFinite(v) ? clamp(v, min, max) : neutral
  }
  return out
}

/**
 * Coerce persisted/patched color-grade data into the strict ColorGrade
 * contract (missing keys, out-of-range values, NaN). Curves sanitize
 * per channel: finite + clamped points, sorted by x, dropped when < 2.
 */
export function normalizeColorGrade(input: unknown): ColorGrade {
  const src = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const out = {
    temperature: 0,
    tint: 0,
    shadows: 0,
    highlights: 0,
    vibrance: 1,
  } as ColorGrade
  for (const key of Object.keys(GRADE_RANGE_TABLE) as (keyof typeof GRADE_RANGE_TABLE)[]) {
    const [min, max] = GRADE_RANGE_TABLE[key]
    const v = Number(src[key])
    const neutral = key === 'vibrance' ? 1 : 0
    out[key] = Number.isFinite(v) ? clamp(v, min, max) : neutral
  }
  const rawCurves = (src.curves ?? null) as Partial<Record<'rgb' | 'r' | 'g' | 'b', unknown>> | null
  if (rawCurves && typeof rawCurves === 'object') {
    const curves: NonNullable<ColorGrade['curves']> = {}
    let any = false
    for (const ch of ['rgb', 'r', 'g', 'b'] as const) {
      const arr = Array.isArray(rawCurves[ch]) ? (rawCurves[ch] as unknown[]) : []
      const pts: CurvePoint[] = []
      for (const p of arr) {
        const o = (typeof p === 'object' && p !== null ? p : {}) as Record<string, unknown>
        const x = Number(o.x)
        const y = Number(o.y)
        if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x: clamp(x, 0, 1), y: clamp(y, 0, 1) })
      }
      if (pts.length >= 1) {
        // >=1 kept: single points are in-progress drafts (engine treats <2 as
        // identity); they survive so the second click completes the pair
        curves[ch] = pts.sort((a, b) => a.x - b.x)
        any = true
      }
    }
    if (any) out.curves = curves
  }
  // Day 13 — sanitize the lift/gamma/gain wheels
  for (const w of ['lift', 'gamma', 'gain'] as const) {
    const raw = src[w] as Record<string, unknown> | undefined
    if (raw && typeof raw === 'object') {
      const wheel = {
        r: clamp(Number.isFinite(Number(raw.r)) ? Number(raw.r) : 0, -1, 1),
        g: clamp(Number.isFinite(Number(raw.g)) ? Number(raw.g) : 0, -1, 1),
        b: clamp(Number.isFinite(Number(raw.b)) ? Number(raw.b) : 0, -1, 1),
      }
      if (wheel.r !== 0 || wheel.g !== 0 || wheel.b !== 0) out[w] = wheel
    }
  }
  return out
}

export function easeInOut(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
}

export function easeOutBack(p: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2)
}

export function easeIn(p: number): number {
  return p * p
}

export function easeOut(p: number): number {
  return 1 - Math.pow(1 - p, 2)
}

export function easeBounce(p: number): number {
  const n1 = 7.5625
  const d1 = 2.75
  if (p < 1 / d1) return n1 * p * p
  if (p < 2 / d1) return n1 * (p -= 1.5 / d1) * p + 0.75
  if (p < 2.5 / d1) return n1 * (p -= 2.25 / d1) * p + 0.9375
  return n1 * (p -= 2.625 / d1) * p + 0.984375
}

/** Back-in: pulls slightly negative before accelerating (anticipation) */
export function easeBackIn(p: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return c3 * p * p * p - c1 * p * p
}

/** Back-out: overshoots past the target then settles back */
export function easeBackOut(p: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  const q = p - 1
  return 1 + c3 * q * q * q + c1 * q * q
}

/** Elastic-out: damped spring oscillation around the target value */
export function easeElastic(p: number): number {
  if (p <= 0) return 0
  if (p >= 1) return 1
  const c4 = (2 * Math.PI) / 3
  return Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * c4) + 1
}

/** Hold (step): keeps the previous key's value until the next key is reached */
export function easeHold(p: number): number {
  return p >= 1 ? 1 : 0
}

export function applyEasing(p: number, easing: EasingType): number {
  const x = clamp(p, 0, 1)
  switch (easing) {
    case 'easeIn':
      return easeIn(x)
    case 'easeOut':
      return easeOut(x)
    case 'easeInOut':
      return easeInOut(x)
    case 'bounce':
      return easeBounce(x)
    case 'backIn':
      return easeBackIn(x)
    case 'backOut':
      return easeBackOut(x)
    case 'elastic':
      return easeElastic(x)
    case 'hold':
      return easeHold(x)
    default:
      return x
  }
}

/* ---------------- Keyframes ---------------- */

export const KEYFRAME_PROPERTIES: { id: KeyframeProperty; label: string; min: number; max: number; step: number; unit?: string }[] = [
  { id: 'x', label: 'Position X', min: -1, max: 1, step: 0.01 },
  { id: 'y', label: 'Position Y', min: -1, max: 1, step: 0.01 },
  { id: 'scale', label: 'Scale', min: 0.1, max: 4, step: 0.01 },
  { id: 'rotation', label: 'Rotation', min: -180, max: 180, step: 1, unit: '°' },
  { id: 'opacity', label: 'Opacity', min: 0, max: 1, step: 0.01 },
  { id: 'volume', label: 'Volume', min: 0, max: 1, step: 0.01 },
  { id: 'maskX', label: 'Mask X', min: -1, max: 1, step: 0.01 },
  { id: 'maskY', label: 'Mask Y', min: -1, max: 1, step: 0.01 },
  { id: 'maskScale', label: 'Mask Scale', min: 0.1, max: 4, step: 0.01 },
]

function keyframesFor(clip: Clip, property: KeyframeProperty): Keyframe[] {
  return (clip.keyframes ?? []).filter((k) => k.property === property).sort((a, b) => a.time - b.time)
}

/** Evaluate a keyframed property at local time; returns null when the clip has no keys for it */
export function evaluateKeyframeProperty(clip: Clip, property: KeyframeProperty, tLocal: number): number | null {
  const keys = keyframesFor(clip, property)
  if (!keys.length) return null
  if (keys.length === 1 || tLocal <= keys[0].time) return keys[0].value
  if (tLocal >= keys[keys.length - 1].time) return keys[keys.length - 1].value
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]
    const b = keys[i + 1]
    if (tLocal >= a.time && tLocal <= b.time) {
      const span = b.time - a.time
      const p = span <= 0 ? 1 : (tLocal - a.time) / span
      return a.value + (b.value - a.value) * applyEasing(p, a.easing)
    }
  }
  return keys[keys.length - 1].value
}

/** Base (non-keyframed) value used when capturing a new key */
export function baseValueForProperty(clip: Clip, property: KeyframeProperty): number {
  switch (property) {
    case 'x':
      return clip.transform.x
    case 'y':
      return clip.transform.y
    case 'scale':
      return clip.transform.scale
    case 'rotation':
      return clip.transform.rotation
    case 'opacity':
      return clip.transform.opacity
    case 'volume':
      return clip.kind === 'text' || clip.kind === 'sticker' ? 0 : clip.volume
    case 'iris':
      // wipe mask progress — 1 = fully revealed (no clipping)
      return 1
    case 'maskX':
      return clip.mask?.x ?? 0
    case 'maskY':
      return clip.mask?.y ?? 0
    case 'maskScale':
      return 1
  }
}

/* ---------------- .cube LUT parsing ---------------- */

export function parseCubeLut(text: string): LutData {
  let size = 0
  let title: string | undefined
  const rows: number[][] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const [kw, ...rest] = line.split(/\s+/)
    if (kw === 'TITLE') {
      title = rest.join(' ').replace(/^"|"$/g, '')
      continue
    }
    if (kw === 'LUT_3D_SIZE') {
      size = parseInt(rest[0], 10)
      continue
    }
    if (kw === 'LUT_1D_SIZE' || kw === 'DOMAIN_MIN' || kw === 'DOMAIN_MAX') continue
    const nums = [kw, ...rest].map(Number)
    if (nums.length >= 3 && nums.every((n) => Number.isFinite(n))) rows.push([nums[0], nums[1], nums[2]])
  }
  if (!size || size < 2) {
    // infer size from row count
    const inferred = Math.round(Math.cbrt(rows.length))
    if (inferred < 2 || Math.pow(inferred, 3) !== rows.length) throw new Error('Unsupported or corrupt .cube file')
    size = inferred
  }
  if (rows.length !== size * size * size) throw new Error(`Expected ${size * size * size} LUT rows, found ${rows.length}`)
  const table: number[] = new Array(rows.length * 3)
  for (let i = 0; i < rows.length; i++) {
    table[i * 3] = rows[i][0]
    table[i * 3 + 1] = rows[i][1]
    table[i * 3 + 2] = rows[i][2]
  }
  return { size, table, title }
}

/* ---------------- Unified pixel effects (chroma + grade + LUT) ---------------- */

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!m) return [0, 255, 0]
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

/**
 * Process one ImageData in-place: chroma key → color grade → LUT.
 * Returns true when any effect was applied.
 */
export function applyPixelEffects(
  img: ImageData,
  opts: {
    chroma?: ChromaKey
    grade?: ColorGrade
    lut?: LutData | null
    lutIntensity?: number
    /** second LUT chained AFTER the first (adjustment-layer stack, Day 11) */
    lut2?: LutData | null
    lut2Intensity?: number
  }
): boolean {
  const chroma = opts.chroma?.enabled ? opts.chroma : null
  const grade = opts.grade
  const curves = grade?.curves
  const hasCurves = !!curves && [curves.rgb, curves.r, curves.g, curves.b].some((c) => (c?.length ?? 0) >= 2)
  const lift = grade?.lift
  const gammaW = grade?.gamma
  const gainW = grade?.gain
  const hasWheels =
    (!!lift && (lift.r !== 0 || lift.g !== 0 || lift.b !== 0)) ||
    (!!gammaW && (gammaW.r !== 0 || gammaW.g !== 0 || gammaW.b !== 0)) ||
    (!!gainW && (gainW.r !== 0 || gainW.g !== 0 || gainW.b !== 0))
  const hasGrade =
    !!grade &&
    (grade.temperature !== 0 || grade.tint !== 0 || grade.shadows !== 0 || grade.highlights !== 0 || grade.vibrance !== 1 || hasCurves || hasWheels)
  const lut = opts.lut && opts.lut.table.length ? opts.lut : null
  const lutMix = lut ? clamp(opts.lutIntensity ?? 1, 0, 1) : 0
  const lut2 = opts.lut2 && opts.lut2.table.length ? opts.lut2 : null
  const lut2Mix = lut2 ? clamp(opts.lut2Intensity ?? 1, 0, 1) : 0
  if (!chroma && !hasGrade && !lut && !lut2) return false

  const d = img.data
  const keyRgb = chroma ? hexToRgb(chroma.color) : [0, 255, 0]
  const similarity = chroma ? clamp(chroma.similarity, 0, 1) : 0
  const smoothness = chroma ? clamp(chroma.smoothness, 0.001, 1) : 0
  // thresholds in squared euclidean space (0..441 max distance)
  const simDist = similarity * 220
  const smoothDist = Math.max(1, smoothness * 160)
  // Day 17 — spill suppression + edge shaping
  const spill = chroma ? clamp(chroma.spill ?? 0, 0, 1) : 0
  const edgeGamma = chroma ? 2 * clamp(chroma.edge ?? 0.5, 0, 1) : 1 // 0.5 → neutral
  // key channel index (the dominant channel of the key color) drives spill
  const keyChan = keyRgb[0] >= keyRgb[1] && keyRgb[0] >= keyRgb[2] ? 0 : keyRgb[1] >= keyRgb[2] ? 1 : 2
  const temp = grade ? grade.temperature : 0
  const tint = grade ? grade.tint : 0
  const shadows = grade ? grade.shadows : 0
  const highlights = grade ? grade.highlights : 0
  const vibrance = grade ? grade.vibrance : 1
  const lutSize = lut?.size ?? 0
  const lutMax = lutSize - 1
  const lutTable = lut?.table
  const lut2Size = lut2?.size ?? 0
  const lut2Max = lut2Size - 1
  const lut2Table = lut2?.table
  // Day 12 — RGB curves: 256-entry 8-bit LUTs per channel, applied after grade
  const rgbLut = hasCurves ? buildCurveLut(curves!.rgb) : null
  const rLut = hasCurves ? buildCurveLut(curves!.r) : null
  const gLut = hasCurves ? buildCurveLut(curves!.g) : null
  const bLut = hasCurves ? buildCurveLut(curves!.b) : null

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue
    let r = d[i]
    let g = d[i + 1]
    let b = d[i + 2]

    if (chroma) {
      const dr = r - keyRgb[0]
      const dg = g - keyRgb[1]
      const db = b - keyRgb[2]
      const dist = Math.sqrt(dr * dr + dg * dg + db * db)
      if (dist <= simDist) {
        d[i + 3] = 0
        continue
      } else if (dist < simDist + smoothDist) {
        let a = d[i + 3] * ((dist - simDist) / smoothDist)
        // Day 17 — edge shaping: gamma on the partial-key ramp (soften/harden)
        if (edgeGamma !== 1) a = 255 * Math.pow(a / 255, edgeGamma)
        d[i + 3] = Math.round(a)
      }
      // Day 17 — spill suppression: clamp the key channel toward the other
      // two wherever the pixel survived the key (hair/edge fringes)
      if (spill > 0 && d[i + 3] > 0) {
        const px = [r, g, b]
        const kv = px[keyChan]
        const others = keyChan === 0 ? Math.max(px[1], px[2]) : keyChan === 1 ? Math.max(px[0], px[2]) : Math.max(px[0], px[1])
        const excess = kv - others
        if (excess > 0) px[keyChan] = kv - excess * spill
        r = px[0]
        g = px[1]
        b = px[2]
      }
    }

    if (hasGrade) {
      // temperature: warm pushes r up / b down
      if (temp !== 0) {
        r = clamp(r + temp * 34, 0, 255)
        b = clamp(b - temp * 34, 0, 255)
      }
      if (tint !== 0) {
        g = clamp(g - tint * 26, 0, 255)
        r = clamp(r + tint * 10, 0, 255)
      }
      // shadows / highlights (luminance-masked curves)
      const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
      if (shadows !== 0) {
        const m = Math.pow(1 - l, 2)
        const delta = shadows * 46 * m
        r = clamp(r + delta, 0, 255)
        g = clamp(g + delta, 0, 255)
        b = clamp(b + delta, 0, 255)
      }
      if (highlights !== 0) {
        const m = Math.pow(l, 2)
        const delta = highlights * 46 * m
        r = clamp(r + delta, 0, 255)
        g = clamp(g + delta, 0, 255)
        b = clamp(b + delta, 0, 255)
      }
      // Day 13 — lift/gamma/gain color wheels (same luminance masks as the
      // shadows/highlights sliders, but per-channel pushes)
      if (hasWheels) {
        if (lift) {
          const m = Math.pow(1 - l, 2)
          r = clamp(r + lift.r * 42 * m, 0, 255)
          g = clamp(g + lift.g * 42 * m, 0, 255)
          b = clamp(b + lift.b * 42 * m, 0, 255)
        }
        if (gammaW) {
          const m = 4 * l * (1 - l) // bell curve peaking at midtones
          r = clamp(r + gammaW.r * 36 * m, 0, 255)
          g = clamp(g + gammaW.g * 36 * m, 0, 255)
          b = clamp(b + gammaW.b * 36 * m, 0, 255)
        }
        if (gainW) {
          const m = Math.pow(l, 2)
          r = clamp(r + gainW.r * 42 * m, 0, 255)
          g = clamp(g + gainW.g * 42 * m, 0, 255)
          b = clamp(b + gainW.b * 42 * m, 0, 255)
        }
      }
      if (vibrance !== 1) {
        const mx = Math.max(r, g, b)
        const mn = Math.min(r, g, b)
        const sat = (mx - mn) / 255
        const amt = (vibrance - 1) * (1 - sat) // boost low-sat pixels more
        const avg = (r + g + b) / 3
        r = clamp(avg + (r - avg) * (1 + amt), 0, 255)
        g = clamp(avg + (g - avg) * (1 + amt), 0, 255)
        b = clamp(avg + (b - avg) * (1 + amt), 0, 255)
      }
    }

    if (hasCurves) {
      // master curve first, then per-channel (DaVinci-style order)
      if (rgbLut) {
        r = rgbLut[Math.round(r)]
        g = rgbLut[Math.round(g)]
        b = rgbLut[Math.round(b)]
      }
      if (rLut) r = rLut[Math.round(r)]
      if (gLut) g = gLut[Math.round(g)]
      if (bLut) b = bLut[Math.round(b)]
    }

    if (lut && lutSize >= 2) {
      // cube LUT: red fastest, then green, then blue
      const ri = Math.round((r / 255) * lutMax)
      const gi = Math.round((g / 255) * lutMax)
      const bi = Math.round((b / 255) * lutMax)
      const idx = (bi * lutSize * lutSize + gi * lutSize + ri) * 3
      r = clamp(r + (lutTable![idx] * 255 - r) * lutMix, 0, 255)
      g = clamp(g + (lutTable![idx + 1] * 255 - g) * lutMix, 0, 255)
      b = clamp(b + (lutTable![idx + 2] * 255 - b) * lutMix, 0, 255)
    }

    if (lut2 && lut2Size >= 2) {
      // chained second LUT (adjustment layer on top of the clip's own)
      const ri2 = Math.round((r / 255) * lut2Max)
      const gi2 = Math.round((g / 255) * lut2Max)
      const bi2 = Math.round((b / 255) * lut2Max)
      const idx2 = (bi2 * lut2Size * lut2Size + gi2 * lut2Size + ri2) * 3
      r = clamp(r + (lut2Table![idx2] * 255 - r) * lut2Mix, 0, 255)
      g = clamp(g + (lut2Table![idx2 + 1] * 255 - g) * lut2Mix, 0, 255)
      b = clamp(b + (lut2Table![idx2 + 2] * 255 - b) * lut2Mix, 0, 255)
    }

    d[i] = r
    d[i + 1] = g
    d[i + 2] = b
  }
  return true
}

/* ---------------- RGB curves (Day 12) ---------------- */

/**
 * Evaluate a piecewise-linear 0..1 curve at x (points sorted by x, clamped ends).
 */
export function evalCurveAt(points: CurvePoint[], x: number): number {
  if (points.length === 0) return x
  if (points.length === 1) return x <= points[0].x ? points[0].y : points[0].y
  const pts = points
  if (x <= pts[0].x) return pts[0].y
  if (x >= pts[pts.length - 1].x) return pts[pts.length - 1].y
  let s = 0
  while (s < pts.length - 2 && x > pts[s + 1].x) s++
  const p0 = pts[s]
  const p1 = pts[s + 1]
  const t = p1.x - p0.x < 1e-6 ? 0 : (x - p0.x) / (p1.x - p0.x)
  return p0.y + (p1.y - p0.y) * t
}

/**
 * Build a 256-entry 8-bit LUT from normalized 0..1 control points.
 * Piecewise-linear between points; clamped outside the point range.
 * Returns null when the channel is identity (< 2 points or all y≈x).
 */
export function buildCurveLut(points?: CurvePoint[]): Uint8Array | null {
  if (!points || points.length < 2) return null
  const lut = new Uint8Array(256)
  let changed = false
  for (let i = 0; i < 256; i++) {
    const v = Math.round(clamp(evalCurveAt(points, i / 255), 0, 1) * 255)
    lut[i] = v
    if (v !== i) changed = true
  }
  return changed ? lut : null
}

/**
 * Compose two curve chains (adjustment over clip): out(x) = b(a(x)),
 * re-sampled into a 17-point piecewise-linear approximation.
 */
function composeCurves(a?: CurvePoint[], b?: CurvePoint[]): CurvePoint[] | undefined {
  if (!a?.length && !b?.length) return undefined
  if (!a?.length) return b
  if (!b?.length) return a
  const N = 16
  const pts: CurvePoint[] = []
  for (let i = 0; i <= N; i++) {
    const x = i / N
    pts.push({ x, y: clamp(evalCurveAt(b, evalCurveAt(a, x)), 0, 1) })
  }
  return pts
}

/* ---------------- FX composition (adjustment layers, Day 11) ---------------- */

/**
 * Compose the base clip's CSS filters with an adjustment layer's filters.
 * Multiplicative params (1 = neutral) add offsets; additive params sum.
 */
export function composeFilters(a: Filters, b: Filters): Filters {
  return {
    brightness: clamp(a.brightness + b.brightness - 1, 0, 2),
    contrast: clamp(a.contrast + b.contrast - 1, 0, 2),
    saturation: clamp(a.saturation + b.saturation - 1, 0, 2),
    hue: clamp(a.hue + b.hue, -180, 180),
    blur: clamp(a.blur + b.blur, 0, 20),
    sepia: clamp(a.sepia + b.sepia, 0, 1),
    grayscale: clamp(a.grayscale + b.grayscale, 0, 1),
    invert: clamp(a.invert + b.invert, 0, 1),
  }
}

/**
 * Compose the base clip's pro grade with an adjustment layer's grade.
 * Every channel adds and clamps into its own range (1 = neutral vibrance);
 * curves compose as function chains (adjustment applies AFTER the clip's own).
 */
export function composeGrades(a: ColorGrade, b: ColorGrade): ColorGrade {
  const curves: ColorGrade['curves'] = {}
  let hasCurves = false
  for (const ch of ['rgb', 'r', 'g', 'b'] as const) {
    const composed = composeCurves(a.curves?.[ch], b.curves?.[ch])
    if (composed) {
      curves[ch] = composed
      hasCurves = true
    }
  }
  const wheel = (wa?: ColorGrade['lift'], wb?: ColorGrade['lift']): ColorGrade['lift'] => {
    if (!wa && !wb) return undefined
    return {
      r: clamp((wa?.r ?? 0) + (wb?.r ?? 0), -1, 1),
      g: clamp((wa?.g ?? 0) + (wb?.g ?? 0), -1, 1),
      b: clamp((wa?.b ?? 0) + (wb?.b ?? 0), -1, 1),
    }
  }
  const lift = wheel(a.lift, b.lift)
  const gamma = wheel(a.gamma, b.gamma)
  const gain = wheel(a.gain, b.gain)
  return {
    temperature: clamp(a.temperature + b.temperature, -1, 1),
    tint: clamp(a.tint + b.tint, -1, 1),
    shadows: clamp(a.shadows + b.shadows, -1, 1),
    highlights: clamp(a.highlights + b.highlights, -1, 1),
    vibrance: clamp(a.vibrance + b.vibrance - 1, 0, 2),
    ...(hasCurves ? { curves } : {}),
    ...(lift ? { lift } : {}),
    ...(gamma ? { gamma } : {}),
    ...(gain ? { gain } : {}),
  }
}

/** RGB channel histogram (256 bins per channel) from sampled pixels */
export function computeHistogram(pixels: Uint8ClampedArray): { r: number[]; g: number[]; b: number[] } {
  const r = new Array<number>(256).fill(0)
  const g = new Array<number>(256).fill(0)
  const b = new Array<number>(256).fill(0)
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 8) continue
    r[pixels[i]]++
    g[pixels[i + 1]]++
    b[pixels[i + 2]]++
  }
  return { r, g, b }
}

/**
 * Day 15 — luma waveform: per-source-column luma distribution.
 * Returns cols×rows counts (row 0 = black at the BOTTOM when drawn flipped).
 * The caller supplies the sample's width (cols) and picks the row resolution.
 */
export function computeLumaWaveform(
  pixels: Uint8ClampedArray,
  width: number,
  rows = 48
): { cols: number; rows: number; data: Float32Array } {
  const count = pixels.length / 4
  const height = Math.max(1, Math.round(count / width))
  const cols = width
  const data = new Float32Array(cols * rows)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4
      if (pixels[i + 3] < 8) continue
      const l = (0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]) / 255
      const bin = Math.min(rows - 1, Math.floor(l * rows))
      data[x * rows + bin]++
    }
  }
  return { cols, rows, data }
}

/**
 * Magnetic dual-edge snap — the core of the magnetic timeline feel.
 * A dragged clip hunts for targets with BOTH edges: its start and its end
 * (start + duration). Whichever edge lands closer to a target wins, so a clip
 * can drop flush against a neighbor's tail even when its start is nowhere
 * near a target on its own.
 */
export function snapBothEdges(
  start: number,
  duration: number,
  targets: number[],
  thresholdPx: number,
  zoom: number,
): { start: number; snapped: boolean; edge: 'start' | 'end' | null; snapPx: number | null } {
  const head = snapTime(start, targets, thresholdPx, zoom)
  const tail = snapTime(start + duration, targets, thresholdPx, zoom)
  if (head.snapped && (!tail.snapped || Math.abs(head.value - start) <= Math.abs(tail.value - (start + duration)))) {
    return { start: head.value, snapped: true, edge: 'start', snapPx: head.value * zoom }
  }
  if (tail.snapped) {
    return { start: tail.value - duration, snapped: true, edge: 'end', snapPx: tail.value * zoom }
  }
  return { start, snapped: false, edge: null, snapPx: null }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export function snapTime(t: number, targets: number[], thresholdPx: number, zoom: number): { value: number; snapped: boolean } {
  if (!targets.length) return { value: t, snapped: false }
  const threshold = thresholdPx / zoom
  let best = t
  let bestDist = threshold
  let snapped = false
  for (const target of targets) {
    const d = Math.abs(target - t)
    if (d < bestDist) {
      bestDist = d
      best = target
      snapped = true
    }
  }
  return { value: snapped ? best : t, snapped }
}

/** Round to avoid 0.1+0.2 style drift on timeline math */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export const IMAGE_KINDS = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml']
export const AUDIO_KINDS = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/aac', 'audio/m4a', 'audio/x-m4a', 'audio/flac', 'audio/mp4']
export const VIDEO_KINDS = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska', 'video/ogg', 'video/3gpp']

export function mediaKindFromType(mime: string, name: string): 'video' | 'image' | 'audio' | null {
  if (VIDEO_KINDS.includes(mime) || mime.startsWith('video/')) return 'video'
  if (IMAGE_KINDS.includes(mime) || mime.startsWith('image/')) return 'image'
  if (AUDIO_KINDS.includes(mime) || mime.startsWith('audio/')) return 'audio'
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif'].includes(ext)) return 'image'
  if (['mp4', 'webm', 'mov', 'mkv', 'avi', '3gp'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus'].includes(ext)) return 'audio'
  return null
}

/* ---------------------------------------------- speed ramps (Day 05) */

const RAMP_EASE_FNS: Record<RampEase, (x: number) => number> = {
  linear: (x) => x,
  easeIn: (x) => x * x,
  easeOut: (x) => 1 - (1 - x) * (1 - x),
  easeInOut: (x) => (x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x)),
}

/**
 * Speed multiplier at normalized clip position `u` (0..1), evaluated on the
 * piecewise-eased ramp curve. Falls back to 1 for empty/invalid ramps.
 */
export function rampMultAt(ramp: SpeedRampPoint[], u: number): number {
  if (!ramp || ramp.length === 0) return 1
  if (ramp.length === 1) return Math.max(0.1, ramp[0].mult)
  const t = clamp(u, 0, 1)
  // before first / after last points clamp to endpoint multipliers
  if (t <= ramp[0].pos) return Math.max(0.1, ramp[0].mult)
  const last = ramp[ramp.length - 1]
  if (t >= last.pos) return Math.max(0.1, last.mult)
  for (let i = 0; i < ramp.length - 1; i++) {
    const a = ramp[i]
    const b = ramp[i + 1]
    if (t >= a.pos && t <= b.pos) {
      const span = Math.max(1e-6, b.pos - a.pos)
      const x = (t - a.pos) / span
      const e = RAMP_EASE_FNS[a.ease] ?? RAMP_EASE_FNS.linear
      return Math.max(0.1, a.mult + (b.mult - a.mult) * e(x))
    }
  }
  return Math.max(0.1, last.mult)
}

/**
 * Integral of the ramp curve over 0..1 (its mean, since the domain is width 1).
 * Used to mean-normalize so a ramp never changes the clip's consumed source span.
 */
export function rampMean(ramp: SpeedRampPoint[]): number {
  if (!ramp || ramp.length === 0) return 1
  const STEPS = 64
  let sum = 0
  for (let i = 0; i < STEPS; i++) {
    const u = (i + 0.5) / STEPS
    sum += rampMultAt(ramp, u)
  }
  return sum / STEPS
}

/**
 * Normalized cumulative source fraction consumed by timeline position `u`
 * (0..1). Multiplied by the clip's `duration × speed` it gives the absolute
 * source offset — identical total span to uniform playback because the curve
 * is mean-normalized (faster sections borrow time from slower ones).
 */
export function rampSourceFraction(ramp: SpeedRampPoint[], u: number): number {
  const mean = rampMean(ramp)
  if (mean <= 0) return clamp(u, 0, 1)
  const t = clamp(u, 0, 1)
  if (t <= 0) return 0
  if (t >= 1) return 1
  // midpoint Simpson-ish accumulation, 48 strips is plenty for playback smoothness
  const STEPS = 48
  const step = t / STEPS
  let acc = 0
  for (let i = 0; i < STEPS; i++) {
    acc += rampMultAt(ramp, (i + 0.5) * step) * step
  }
  return clamp(acc / mean, 0, 1)
}

/**
 * Instantaneous effective speed (units: source seconds per timeline second) at
 * timeline-local time `tLocal` — base speed × mean-normalized ramp multiplier.
 * Drives both <video>.playbackRate during preview and the source-time mapping.
 */
export function effectiveSpeedAt(clip: Clip, tLocal: number): number {
  const base = clamp(clip.speed || 1, 0.0625, 16)
  const ramp = clip.speedRamp
  if (!ramp || ramp.length < 2) return base
  const u = tLocal / Math.max(0.001, clip.duration)
  const mult = rampMultAt(ramp, u)
  const mean = rampMean(ramp)
  return clamp(base * (mult / mean), 0.0625, 16)
}

/** Build the default flat ramp (uniform) used when ramping is first enabled. */
export function defaultSpeedRamp(): SpeedRampPoint[] {
  return [
    { pos: 0, mult: 1, ease: 'linear' },
    { pos: 1, mult: 1, ease: 'linear' },
  ]
}

/** Curated ramp presets — multipliers are raw; evaluation mean-normalizes. */
export const SPEED_RAMP_PRESETS: { id: string; label: string; points: SpeedRampPoint[] }[] = [
  {
    id: 'hero',
    label: 'Hero',
    points: [
      { pos: 0, mult: 0.5, ease: 'easeInOut' },
      { pos: 0.5, mult: 2.5, ease: 'easeInOut' },
      { pos: 1, mult: 0.5, ease: 'linear' },
    ],
  },
  {
    id: 'bullet',
    label: 'Bullet',
    points: [
      { pos: 0, mult: 3, ease: 'easeOut' },
      { pos: 0.35, mult: 0.4, ease: 'easeInOut' },
      { pos: 1, mult: 2, ease: 'linear' },
    ],
  },
  {
    id: 'montage',
    label: 'Montage',
    points: [
      { pos: 0, mult: 1.8, ease: 'easeInOut' },
      { pos: 0.5, mult: 0.6, ease: 'easeInOut' },
      { pos: 1, mult: 1.8, ease: 'linear' },
    ],
  },
  {
    id: 'pulse',
    label: 'Pulse',
    points: [
      { pos: 0, mult: 1, ease: 'easeInOut' },
      { pos: 0.35, mult: 0.45, ease: 'easeInOut' },
      { pos: 0.65, mult: 2.2, ease: 'easeInOut' },
      { pos: 1, mult: 1, ease: 'linear' },
    ],
  },
  {
    id: 'flash-in',
    label: 'Flash In',
    points: [
      { pos: 0, mult: 3.5, ease: 'easeOut' },
      { pos: 0.25, mult: 0.6, ease: 'easeInOut' },
      { pos: 1, mult: 1, ease: 'linear' },
    ],
  },
  {
    id: 'flash-out',
    label: 'Flash Out',
    points: [
      { pos: 0, mult: 1, ease: 'easeInOut' },
      { pos: 0.75, mult: 0.6, ease: 'easeInOut' },
      { pos: 1, mult: 3.5, ease: 'linear' },
    ],
  },
]

/** HH:MM:SS,mmm — the SRT timestamp format */
function srtTimestamp(t: number): string {
  const safe = Math.max(0, t)
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = Math.floor(safe % 60)
  const ms = Math.round((safe - Math.floor(safe)) * 1000)
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`
}

/**
 * Build an .srt sidecar from the project's AI caption clips (isCaption).
 * Returns an empty string when the project has no captions.
 */
export function buildSrtFromCaptions(clips: Clip[]): string {
  const captions = clips
    .filter((c) => c.isCaption && c.kind === 'text' && (c.textStyle?.content ?? '').trim())
    .sort((a, b) => a.start - b.start)
  if (!captions.length) return ''
  return (
    captions
      .map((c, i) => {
        const start = c.start
        const end = Math.max(start + 0.2, start + c.duration)
        const text = (c.textStyle?.content ?? '').trim().replace(/\r?\n/g, '\n')
        return `${i + 1}\n${srtTimestamp(start)} --> ${srtTimestamp(end)}\n${text}`
      })
      .join('\n\n') + '\n'
  )
}

/**
 * Goertzel magnitude at one frequency over a mono slice — the shared DSP
 * measurement used by the audio QA harnesses (voice FX, EQ).
 */
export function goertzelMag(data: Float32Array, sr: number, freq: number): number {
  const k = (2 * Math.PI * freq) / sr
  const coeff = 2 * Math.cos(k)
  let s1 = 0
  let s2 = 0
  for (let i = 0; i < data.length; i++) {
    const s0 = data[i] + coeff * s1 - s2
    s2 = s1
    s1 = s0
  }
  return Math.sqrt(s1 * s1 + s2 * s2 - coeff * s1 * s2) / (data.length / 2)
}

/** Fade curve shapes (Day 28): progress x 0..1 through the fade window → gain 0..1. */
export type FadeCurve = 'linear' | 'ease' | 'hold'

/**
 * Shared fade-curve math used by the live engine, the offline mixdown and the
 * timeline wedge overlays:
 *  • linear — the classic straight ramp (previous default)
 *  • ease   — smoothstep (slow-fast-slow)
 *  • hold   — stays silent/quiet through the first 80% of the window, then a
 *             fast ramp to full (a "held" fade with a punchy release)
 */
export function fadeCurveFactor(curve: FadeCurve | undefined, x: number): number {
  const t = clamp01(x)
  if (curve === 'ease') return t * t * (3 - 2 * t)
  if (curve === 'hold') return t < 0.8 ? 0 : (t - 0.8) / 0.2
  return t
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/* ---------------- Day 29 — per-clip normalize + waveform helpers ---------------- */

/** Convert a linear level (0..1) to dBFS (−Infinity at silence). */
export function levelToDbfs(level: number): number {
  return level <= 0.00001 ? -120 : 20 * Math.log10(level)
}

/**
 * Per-clip normalize gain: when enabled, scales the clip's audio so its TRUE
 * peak (analyzed at import, asset.peakLevel) lands at −1 dBFS. Boost is
 * capped at +12 dB (×4) so a nearly-silent clip can never explode. Returns 1
 * when disabled or when no analysis is available (honest no-op).
 */
export function normalizeGainFor(
  enabled: boolean | undefined,
  asset?: { peakLevel?: number } | null
): number {
  if (!enabled) return 1
  const peak = asset?.peakLevel ?? 0
  if (peak <= 0.001) return 1
  const target = 0.891 // −1 dBFS
  return Math.min(4, target / peak)
}
