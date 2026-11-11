/**
 * NovaCut Studio — smart assistance analysis (UX60 Phase 2, Days 9–16)
 *
 * Fully on-device audio understanding shared by three features:
 *  1. Highlight reel suggest (Days 11–12) — finds the dead air in every
 *     clip and proposes keep-ranges the user can apply with one tap.
 *  2. Snap-to-silence trim hints (Days 13–14) — silence boundaries that
 *     become amber ghost handles + snap targets while trimming.
 *  3. (Beat cutting reuses the store's own beat detector — beat-detect.ts.)
 *
 * No dependencies, deterministic: decode → mono RMS envelope → adaptive
 * silence threshold → merged ranges. Analysis of a 3-minute track ≈ 50 ms.
 */
import { decodeSource } from './voice'
import type { Clip } from '@/lib/editor/types'

export interface SilenceRange {
  /** seconds, source time (same space as clip.trimStart) */
  start: number
  end: number
}

/** analysis window in seconds — 120 ms gives crisp cut edges and catches sub-half-second pauses */
const WINDOW_S = 0.12
/** absolute silence floor (RMS) — protects near-silent sources from threshold collapse */
const ABS_FLOOR = 0.018
/** noise floor percentile — the quietest 20% of windows are treated as room tone */
const FLOOR_PERCENTILE = 0.2
/** adaptive threshold multiplier over the noise floor */
const FLOOR_MULT = 2.8
/** silence shorter than this is not worth cutting (speech pauses) */
const MIN_SILENCE_S = 0.35
/** keep-ranges shorter than this are dropped (jumpy result) */
const MIN_KEEP_S = 0.5
/** padding added around each keep-range so cuts don't clip syllables */
const KEEP_PAD_S = 0.12
/** a clip with less than this much removable audio is left alone */
const NOISE_RATIO_SKIP = 0.92
/** hard cap on keep-ranges per clip (bounded result) */
const MAX_RANGES = 40
/** clips analyzed per run (longest first) — bounds the decode work */
const MAX_ANALYZE_CLIPS = 6

/**
 * Mono RMS envelope at WINDOW_S resolution (averaged across channels).
 */
function rmsEnvelope(buffer: AudioBuffer): { values: Float32Array; hop: number } {
  const hop = Math.max(1, Math.floor((buffer.sampleRate * WINDOW_S) as number))
  const frames = Math.max(1, Math.floor(buffer.length / hop))
  const values = new Float32Array(frames)
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c)
    for (let f = 0; f < frames; f++) {
      let sum = 0
      const base = f * hop
      const end = Math.min(base + hop, buffer.length)
      for (let i = base; i < end; i++) sum += data[i]! * data[i]!
      values[f]! += sum / (end - base)
    }
  }
  for (let f = 0; f < frames; f++) values[f] = Math.sqrt(values[f]! / buffer.numberOfChannels)
  return { values, hop: hop / buffer.sampleRate }
}

/**
 * Detects silence ranges in a source blob (audio OR video container —
 * decodeAudioData extracts the audio track). Returns merged source-time
 * ranges whose RMS stays under an adaptive threshold for ≥ MIN_SILENCE_S.
 */
export async function detectSilenceRanges(source: Blob): Promise<SilenceRange[]> {
  const buffer = await decodeSource(source)
  const { values, hop } = rmsEnvelope(buffer)
  if (values.length === 0) return []

  // noise floor from the quietest windows
  const sorted = Float32Array.from(values).sort()
  const floor = sorted[Math.floor(sorted.length * FLOOR_PERCENTILE)] ?? 0
  const threshold = Math.max(ABS_FLOOR, floor * FLOOR_MULT)

  // collect silence runs
  const ranges: SilenceRange[] = []
  let runStart: number | null = null
  for (let f = 0; f < values.length; f++) {
    const silent = values[f]! < threshold
    const t = f * hop
    if (silent && runStart === null) runStart = t
    if (!silent && runStart !== null) {
      if (t - runStart >= MIN_SILENCE_S) ranges.push({ start: runStart, end: t })
      runStart = null
    }
  }
  if (runStart !== null && buffer.duration - runStart >= MIN_SILENCE_S) {
    ranges.push({ start: runStart, end: buffer.duration })
  }
  return ranges.map((r) => ({ start: Math.round(r.start * 1000) / 1000, end: Math.round(r.end * 1000) / 1000 }))
}

/** One clip's tighten proposal — ranges are SOURCE-time keep spans. */
export interface HighlightClipSuggestion {
  clipId: string
  clipName: string
  /** source-time keep ranges (above the silence threshold), padded & sorted */
  ranges: SilenceRange[]
  /** timeline seconds kept after applying */
  keepSeconds: number
  /** timeline seconds of dead air removed after applying */
  cutSeconds: number
}

export interface HighlightAnalysis {
  suggestions: HighlightClipSuggestion[]
  /** clips actually decoded & analyzed (capped) */
  analyzedClips: number
  /** timeline seconds kept across all suggestions */
  totalKeep: number
  /** timeline seconds of dead air removable across all suggestions */
  totalCut: number
}

/** async blob resolver the store provides (handles eviction rehydration) */
export type ResolveClipBlob = (clip: Clip) => Promise<Blob | null>

/**
 * Analyzes the timeline's video/audio clips and proposes keep-ranges for
 * each clip that carries removable dead air. Clips without usable audio
 * (images, evicted blobs) are honestly skipped.
 */
export async function analyzeHighlights(
  clips: Clip[],
  resolveBlob: ResolveClipBlob,
): Promise<HighlightAnalysis> {
  const candidates = clips
    .filter((c) => c.kind === 'video' || c.kind === 'audio')
    .sort((a, b) => b.duration - a.duration)
    .slice(0, MAX_ANALYZE_CLIPS)

  const suggestions: HighlightClipSuggestion[] = []
  let analyzedClips = 0

  for (const clip of candidates) {
    const blob = await resolveBlob(clip)
    if (!blob) continue
    let silence: SilenceRange[]
    try {
      silence = await detectSilenceRanges(blob)
    } catch {
      continue // undecodable source — skipped honestly
    }
    analyzedClips++

    const srcStart = clip.trimStart
    const srcEnd = clip.trimStart + clip.duration * (clip.speed || 1)

    // keep ranges = complement of silence inside the clip's used source span
    const keeps: SilenceRange[] = []
    let cursor = srcStart
    for (const r of silence) {
      const s = Math.max(cursor, srcStart)
      const e = Math.min(r.start, srcEnd)
      if (e - s >= MIN_KEEP_S) keeps.push({ start: s, end: e })
      cursor = Math.max(cursor, r.end)
    }
    if (cursor < srcEnd && srcEnd - cursor >= MIN_KEEP_S) keeps.push({ start: cursor, end: srcEnd })

    // pad keeps, drop slivers, cap the count
    const padded = keeps
      .map((k) => ({ start: Math.max(srcStart, k.start - KEEP_PAD_S), end: Math.min(srcEnd, k.end + KEEP_PAD_S) }))
      .filter((k) => k.end - k.start >= MIN_KEEP_S)
      .slice(0, MAX_RANGES)
    if (padded.length === 0) continue

    const keepSrc = padded.reduce((acc, k) => acc + (k.end - k.start), 0)
    const speed = clip.speed || 1
    const keepTl = keepSrc / speed
    const totalTl = clip.duration
    if (keepTl / totalTl > NOISE_RATIO_SKIP) continue // nothing meaningful to cut
    if (keepTl < MIN_KEEP_S) continue // would empty the clip — refuse

    suggestions.push({
      clipId: clip.id,
      clipName: clip.name,
      ranges: padded,
      keepSeconds: Math.round(keepTl * 100) / 100,
      cutSeconds: Math.round((totalTl - keepTl) * 100) / 100,
    })
  }

  const totalKeep = suggestions.reduce((a, s) => a + s.keepSeconds, 0)
  const totalCut = suggestions.reduce((a, s) => a + s.cutSeconds, 0)
  return {
    suggestions,
    analyzedClips,
    totalKeep: Math.round(totalKeep * 100) / 100,
    totalCut: Math.round(totalCut * 100) / 100,
  }
}
