import type { ChromaKey, Clip, ColorGrade, EasingType, Filters, Keyframe, KeyframeProperty, LutData, Project } from './types'

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
 * contract (missing keys, out-of-range values, NaN).
 */
export function normalizeColorGrade(input: unknown): ColorGrade {
  const src = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const out = {} as Record<keyof ColorGrade, number>
  for (const key of Object.keys(GRADE_RANGE_TABLE) as (keyof ColorGrade)[]) {
    const [min, max] = GRADE_RANGE_TABLE[key]
    const v = Number(src[key])
    const neutral = key === 'vibrance' ? 1 : 0
    out[key] = Number.isFinite(v) ? clamp(v, min, max) : neutral
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
  opts: { chroma?: ChromaKey; grade?: ColorGrade; lut?: LutData | null; lutIntensity?: number }
): boolean {
  const chroma = opts.chroma?.enabled ? opts.chroma : null
  const grade = opts.grade
  const hasGrade = !!grade && (grade.temperature !== 0 || grade.tint !== 0 || grade.shadows !== 0 || grade.highlights !== 0 || grade.vibrance !== 1)
  const lut = opts.lut && opts.lut.table.length ? opts.lut : null
  const lutMix = lut ? clamp(opts.lutIntensity ?? 1, 0, 1) : 0
  if (!chroma && !hasGrade && !lut) return false

  const d = img.data
  const keyRgb = chroma ? hexToRgb(chroma.color) : [0, 255, 0]
  const similarity = chroma ? clamp(chroma.similarity, 0, 1) : 0
  const smoothness = chroma ? clamp(chroma.smoothness, 0.001, 1) : 0
  // thresholds in squared euclidean space (0..441 max distance)
  const simDist = similarity * 220
  const smoothDist = Math.max(1, smoothness * 160)
  const temp = grade ? grade.temperature : 0
  const tint = grade ? grade.tint : 0
  const shadows = grade ? grade.shadows : 0
  const highlights = grade ? grade.highlights : 0
  const vibrance = grade ? grade.vibrance : 1
  const lutSize = lut?.size ?? 0
  const lutMax = lutSize - 1
  const lutTable = lut?.table

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
        d[i + 3] = Math.round(d[i + 3] * ((dist - simDist) / smoothDist))
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

    d[i] = r
    d[i + 1] = g
    d[i + 2] = b
  }
  return true
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
