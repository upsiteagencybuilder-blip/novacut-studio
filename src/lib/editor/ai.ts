/**
 * AI suite client helpers — 100% browser-side audio processing.
 *
 * - `exportAudioSegmentWav`: renders a clip's audio range to a 16 kHz mono
 *   16-bit PCM WAV blob ready for server-side ASR.
 * - `detectSilences` / `analyzeClipSilence`: local silence detection used by
 *   the rough-cut tool (audio never leaves the device for this one).
 * - `fileToBase64` / `base64ToBlob`: payload conversion helpers.
 */
import type { MediaAssetRuntime } from './types'
import { round2 } from './utils'

/** Max audio length (seconds) accepted per ASR request */
const MAX_SEGMENT_SECONDS = 120
/** ASR target sample rate */
const TARGET_RATE = 16000
/** Analysis window for silence detection, in timeline seconds */
const ANALYSIS_WINDOW = 0.05

/** Throw a friendly error when the user is offline (AI routes need the network). */
export function requireOnline(): void {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('AI features need internet — everything else keeps working offline')
  }
}

/* ---------------- audio decoding ---------------- */

type AudioContextCtor = typeof AudioContext

function getAudioContextCtor(): AudioContextCtor {
  const ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext
  if (!ctor) throw new Error('Web Audio is not supported in this browser')
  return ctor
}

async function decodeAudioFromUrl(objectUrl: string): Promise<AudioBuffer> {
  let arrayBuffer: ArrayBuffer
  try {
    const res = await fetch(objectUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    arrayBuffer = await res.arrayBuffer()
  } catch {
    throw new Error('Could not read the clip audio — try re-importing the file')
  }
  const Ctor = getAudioContextCtor()
  const ctx = new Ctor()
  try {
    return await ctx.decodeAudioData(arrayBuffer)
  } catch {
    throw new Error('Could not decode the clip audio — this format has no decodable audio track')
  } finally {
    ctx.close().catch(() => undefined)
  }
}

/* ---------------- WAV encoding ---------------- */

function encodeWav16BitMono(samples: Float32Array, sampleRate: number): Blob {
  const dataBytes = samples.length * 2
  const buffer = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buffer)
  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeString(36, 'data')
  view.setUint32(40, dataBytes, true)
  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

/**
 * Extract the media's audio between `startSec` and `endSec` (source seconds)
 * and encode it as a 16 kHz mono 16-bit PCM WAV — the format our ASR route expects.
 * Downsampling uses simple decimation with block averaging.
 */
export async function exportAudioSegmentWav(
  media: MediaAssetRuntime,
  startSec: number,
  endSec: number
): Promise<Blob> {
  const length = endSec - startSec
  if (!(length > 0)) throw new Error('Invalid audio range on this clip')
  if (length > MAX_SEGMENT_SECONDS) {
    throw new Error(`This clip is too long for AI captions (max ${MAX_SEGMENT_SECONDS}s per request)`)
  }

  const decoded = await decodeAudioFromUrl(media.objectUrl)
  const rate = decoded.sampleRate
  const from = Math.max(0, Math.floor(startSec * rate))
  const to = Math.min(decoded.length, Math.ceil(endSec * rate))
  const frameCount = to - from
  if (frameCount <= 0) throw new Error('No audio found in the selected range')

  // mix all channels to mono
  const mono = new Float32Array(frameCount)
  for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
    const data = decoded.getChannelData(ch)
    for (let i = 0; i < frameCount; i++) mono[i] += data[from + i] / decoded.numberOfChannels
  }

  // downsample to TARGET_RATE by decimation averaging
  const ratio = rate / TARGET_RATE
  const outLength = Math.max(1, Math.floor(frameCount / ratio))
  const out = new Float32Array(outLength)
  for (let i = 0; i < outLength; i++) {
    const s0 = Math.floor(i * ratio)
    const s1 = Math.min(frameCount, Math.max(s0 + 1, Math.floor((i + 1) * ratio)))
    let sum = 0
    for (let j = s0; j < s1; j++) sum += mono[j]
    out[i] = sum / (s1 - s0)
  }

  return encodeWav16BitMono(out, TARGET_RATE)
}

/* ---------------- silence detection ---------------- */

export interface SilencePeak {
  /** timeline seconds */
  time: number
  /** 0..1 RMS level for the window starting at `time` */
  level: number
}

export interface SilenceRange {
  start: number
  end: number
}

/**
 * Pure helper: given uniform windows (`peaks[i].time` = window start), return
 * the runs of windows below `threshold` that last at least `minSilence` seconds.
 */
export function detectSilences(
  peaks: SilencePeak[],
  threshold: number,
  minSilence: number
): SilenceRange[] {
  const out: SilenceRange[] = []
  if (peaks.length === 0) return out

  let current: SilenceRange | null = null
  for (let i = 0; i < peaks.length; i++) {
    const p = peaks[i]
    // each point spans until the next point (last point reuses the previous gap)
    const next = peaks[i + 1]
    const span = next ? next.time - p.time : i > 0 ? p.time - peaks[i - 1].time : 0
    if (p.level < threshold) {
      if (!current) current = { start: p.time, end: p.time + span }
      else current.end = p.time + span
    } else if (current) {
      if (current.end - current.start >= minSilence) out.push(current)
      current = null
    }
  }
  if (current && current.end - current.start >= minSilence) out.push(current)
  return out
}

export interface SpeechSegment {
  /** clip-local timeline seconds */
  start: number
  end: number
  /** average RMS level inside the segment */
  avgLevel: number
}

export interface SilenceAnalysis {
  segments: SpeechSegment[]
  /** total seconds of raw silence detected (before padding) */
  totalSilence: number
}

/**
 * Analyze a clip's audio for silence — fully on-device.
 *
 * @param media       runtime media asset backing the clip
 * @param startSec    source in-point where the clip's audio begins (lower bound)
 * @param trimStart   clip in-point used for the timeline→source mapping
 * @param speed       clip playback speed (timeline t maps to source `trimStart + t*speed`)
 * @param durationSec clip duration in timeline seconds
 * @param opts        threshold / minimum silence / padding (seconds, applied around silences)
 * @returns speech segments (timeline coordinates relative to clip start) + total silence
 */
export async function analyzeClipSilence(
  media: MediaAssetRuntime,
  startSec: number,
  trimStart: number,
  speed: number,
  durationSec: number,
  opts: { threshold: number; minSilenceSec: number; paddingSec: number }
): Promise<SilenceAnalysis> {
  if (!(durationSec > 0)) return { segments: [], totalSilence: 0 }
  const effectiveSpeed = speed > 0 ? speed : 1

  const buffer = await decodeAudioFromUrl(media.objectUrl)
  const rate = buffer.sampleRate
  const channels: Float32Array[] = []
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) channels.push(buffer.getChannelData(ch))

  // RMS per 50ms timeline window (mapped through speed into source time)
  const windowCount = Math.ceil(durationSec / ANALYSIS_WINDOW)
  const peaks: SilencePeak[] = new Array(windowCount)
  for (let i = 0; i < windowCount; i++) {
    const t0 = i * ANALYSIS_WINDOW
    const srcStart = Math.max(trimStart + t0 * effectiveSpeed, startSec)
    const srcEnd = trimStart + (t0 + ANALYSIS_WINDOW) * effectiveSpeed
    const from = Math.max(0, Math.floor(srcStart * rate))
    const to = Math.min(buffer.length, Math.ceil(srcEnd * rate))
    let sum = 0
    let count = 0
    for (const data of channels) {
      for (let j = from; j < to; j++) {
        const v = data[j]
        sum += v * v
        count++
      }
    }
    peaks[i] = { time: round2(t0), level: count > 0 ? Math.sqrt(sum / count) : 0 }
  }

  const rawSilences = detectSilences(peaks, opts.threshold, opts.minSilenceSec)

  // Day 38 fix — the padding SHRINKS each silence range so cuts keep
  // `paddingSec` of natural room around the words (the previous expanding
  // semantics shaved `paddingSec` off every word edge — measured ±80 ms of
  // clipped speech in the E2E trace). Re-filter: a shrunk gap may drop below
  // the useful minimum.
  const padded: SilenceRange[] = rawSilences
    .map((s) => ({
      start: Math.min(s.start + opts.paddingSec, s.end),
      end: Math.max(s.end - opts.paddingSec, s.start),
    }))
    .filter((s) => s.end - s.start >= 0.16)
    .sort((a, b) => a.start - b.start)
  const merged: SilenceRange[] = []
  for (const s of padded) {
    const last = merged[merged.length - 1]
    if (last && s.start <= last.end + 0.001) last.end = Math.max(last.end, s.end)
    else merged.push({ ...s })
  }

  // speech = complement of (padded) silences within the clip
  const levelAt = (start: number, end: number): number => {
    let sum = 0
    let n = 0
    for (const p of peaks) {
      if (p.time >= start - 0.001 && p.time < end) {
        sum += p.level
        n++
      }
    }
    return n > 0 ? round2(sum / n) : 0
  }
  const segments: SpeechSegment[] = []
  let cursor = 0
  for (const s of merged) {
    if (s.start > cursor + 0.02) segments.push({ start: round2(cursor), end: round2(s.start), avgLevel: levelAt(cursor, s.start) })
    cursor = Math.max(cursor, s.end)
  }
  if (cursor < durationSec - 0.02) segments.push({ start: round2(cursor), end: round2(durationSec), avgLevel: levelAt(cursor, durationSec) })

  const totalSilence = round2(rawSilences.reduce((acc, s) => acc + (s.end - s.start), 0))
  return { segments, totalSilence }
}

/* ---------------- payload helpers ---------------- */

/** Blob/File → raw base64 (no data-URL prefix) */
export function fileToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Could not read the audio data'))
        return
      }
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(new Error('Could not read the audio data'))
    reader.readAsDataURL(blob)
  })
}

/** raw base64 → Blob with the given MIME type */
export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}

/** Detect an image format from its base64 header bytes (generation APIs vary) */
export function sniffImageMime(base64: string): 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' {
  if (base64.startsWith('/9j/')) return 'image/jpeg'
  if (base64.startsWith('iVBOR')) return 'image/png'
  if (base64.startsWith('R0lGOD')) return 'image/gif'
  if (base64.startsWith('UklGR')) return 'image/webp'
  return 'image/png'
}

/** base64 image payload → File with sniffed MIME type + matching extension */
export function imageBase64ToFile(base64: string, stem: string): File {
  const mime = sniffImageMime(base64)
  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/gif' ? 'gif' : mime === 'image/webp' ? 'webp' : 'png'
  return new File([base64ToBlob(base64, mime)], `${stem}.${ext}`, { type: mime })
}
