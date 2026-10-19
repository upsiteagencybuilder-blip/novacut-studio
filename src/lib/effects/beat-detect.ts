/**
 * NovaCut Studio — beat detection
 *
 * Energy-flux onset detection for the timeline's beat-sync markers.
 * Fully on-device: decodes the clip's audio (works for audio AND video
 * containers — decodeAudioData extracts the audio track), builds a mono
 * energy envelope, then picks percussive onsets via a local adaptive
 * threshold. No dependencies, deterministic, ~50ms for a 3-minute track.
 *
 * Algorithm (classic energy-based onset detection):
 *  1. mono RMS energy per 1024-sample hop (~23ms @ 44.1kHz)
 *  2. onset flux = positive frame-to-frame energy delta
 *  3. adaptive threshold = local mean (±0.6s) × k + global floor
 *  4. peak picking with a ±2 frame local-max test and a minimum gap
 *  5. BPM from the median inter-onset interval, folded into 70..180
 */
import { decodeSource } from './voice'

export interface BeatDetection {
  /** beat times in seconds, ascending */
  times: number[]
  /** estimated tempo (rounded to 1 decimal) or null when too few beats */
  bpm: number | null
  /** source duration in seconds */
  duration: number
}

/** envelope hop in samples (~23ms at 44.1kHz) */
const HOP = 1024
/** minimum seconds between beats (≈ 230 BPM ceiling) */
const MIN_GAP = 0.26
/** local-mean multiplier for the adaptive threshold */
const THRESHOLD_K = 1.4
/** global floor added to the threshold — keeps silence from producing beats */
const FLUX_FLOOR = 1e-4
/** safety cap so very long/sparse-detection tracks never flood the DOM */
const MAX_MARKERS = 600

export async function detectBeats(source: Blob): Promise<BeatDetection> {
  const buffer = await decodeSource(source)
  const n = buffer.length
  const frames = Math.max(2, Math.floor(n / HOP))
  const fps = buffer.sampleRate / HOP

  /* 1 · mono RMS energy envelope (averaged across channels) */
  const energy = new Float32Array(frames)
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c)
    for (let f = 0; f < frames; f++) {
      let sum = 0
      const base = f * HOP
      const end = Math.min(base + HOP, n)
      for (let i = base; i < end; i++) sum += data[i] * data[i]
      energy[f] += sum / HOP
    }
  }
  for (let f = 0; f < frames; f++) energy[f] = Math.sqrt(energy[f] / buffer.numberOfChannels)

  /* 2 · onset flux — positive energy delta */
  const flux = new Float32Array(frames)
  for (let f = 1; f < frames; f++) flux[f] = Math.max(0, energy[f] - energy[f - 1])

  /* 3 · local adaptive threshold via prefix sums (window ≈ ±0.6s) */
  const win = Math.max(4, Math.round((0.6 * buffer.sampleRate) / HOP))
  const prefix = new Float64Array(frames + 1)
  for (let f = 0; f < frames; f++) prefix[f + 1] = prefix[f] + flux[f]
  const threshold = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    const lo = Math.max(0, f - win)
    const hi = Math.min(frames, f + win + 1)
    const localMean = (prefix[hi] - prefix[lo]) / (hi - lo)
    threshold[f] = THRESHOLD_K * localMean + FLUX_FLOOR
  }

  /* 4 · peak picking: above threshold, local max over ±2 frames, min gap */
  const raw: number[] = []
  const rawFlux: number[] = []
  let last = -Infinity
  for (let f = 2; f < frames - 2; f++) {
    const v = flux[f]
    if (v < threshold[f]) continue
    if (v < flux[f - 1] || v < flux[f - 2] || v < flux[f + 1] || v < flux[f + 2]) continue
    const t = f / fps
    if (t - last < MIN_GAP) continue
    raw.push(t)
    rawFlux.push(v)
    last = t
  }

  /* cap marker count — keep the strongest onsets evenly across the track */
  let times = raw
  if (raw.length > MAX_MARKERS) {
    const ranked = raw
      .map((t, i) => ({ t, strength: rawFlux[i] }))
      .sort((a, b) => b.strength - a.strength)
      .slice(0, MAX_MARKERS)
      .map((e) => e.t)
      .sort((a, b) => a - b)
    times = ranked
  }

  /* 5 · tempo from the median inter-onset interval, folded into 70..180 */
  let bpm: number | null = null
  if (times.length >= 4) {
    const gaps: number[] = []
    for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1])
    gaps.sort((a, b) => a - b)
    const median = gaps[Math.floor(gaps.length / 2)]
    if (median > 0.05) {
      let estimate = 60 / median
      while (estimate < 70) estimate *= 2
      while (estimate >= 180) estimate /= 2
      bpm = Math.round(estimate * 10) / 10
    }
  }

  return { times: times.map((t) => Math.round(t * 1000) / 1000), bpm, duration: buffer.duration }
}
