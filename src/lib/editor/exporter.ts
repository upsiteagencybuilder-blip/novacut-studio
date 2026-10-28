'use client'

/**
 * Real-time export via MediaRecorder: canvas.captureStream + mixed audio.
 * The timeline plays through once while recording, then the blob is ready for download.
 */
import { getEngine } from './engine'
import { encodeMp3, encodeWav, measureIntegratedLufs, renderProjectAudio } from './audio-mix'
import type { MediaAssetRuntime, Project } from './types'

export interface ExportOptions {
  fps: number
  videoBitsPerSecond: number
  /** preferred container: 'webm' | 'mp4' — falls back to what the browser supports */
  format?: 'webm' | 'mp4'
  /** audio track bitrate for the recorded file (default 128 kbps) */
  audioBitsPerSecond?: number
  /** burn a running timecode into the picture (review copies) */
  burnIn?: 'timecode'
  onProgress?: (progress: number) => void
}

export interface ExportResult {
  blob: Blob
  mimeType: string
  durationMs: number
}

let activeRecorder: MediaRecorder | null = null
let cancelled = false

/** All export-capable mime types this browser supports (best first per format) */
export function supportedExportMimeTypes(): { mime: string; format: 'webm' | 'mp4' }[] {
  if (typeof MediaRecorder === 'undefined') return []
  const all: { mime: string; format: 'webm' | 'mp4' }[] = [
    { mime: 'video/webm;codecs=vp9,opus', format: 'webm' },
    { mime: 'video/webm;codecs=vp8,opus', format: 'webm' },
    { mime: 'video/webm', format: 'webm' },
    { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', format: 'mp4' },
    { mime: 'video/mp4', format: 'mp4' },
  ]
  return all.filter((c) => MediaRecorder.isTypeSupported(c.mime))
}

function pickMimeType(preferred?: 'webm' | 'mp4'): string {
  const supported = supportedExportMimeTypes()
  if (preferred) {
    const match = supported.find((c) => c.format === preferred)
    if (match) return match.mime
  }
  return supported[0]?.mime ?? 'video/webm'
}

export function extensionForMime(mime: string): string {
  return mime.includes('mp4') ? 'mp4' : 'webm'
}

export function isExporting(): boolean {
  return activeRecorder !== null && activeRecorder.state === 'recording'
}

export function cancelExport(): void {
  if (activeRecorder && activeRecorder.state !== 'inactive') {
    cancelled = true
    activeRecorder.stop()
  }
}

export async function startExport(opts: ExportOptions): Promise<ExportResult> {
  const engine = getEngine()
  const stream = engine.beginExport(opts.fps, { burnIn: opts.burnIn })
  if (!stream) throw new Error('Canvas is not ready for export')
  if (!stream.getVideoTracks().length) throw new Error('No video track available')

  const mimeType = pickMimeType(opts.format)
  const chunks: BlobPart[] = []
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: opts.videoBitsPerSecond,
    audioBitsPerSecond: opts.audioBitsPerSecond ?? 128000,
  })
  activeRecorder = recorder
  cancelled = false
  const startedAt = performance.now()
  const duration = engine.duration

  return new Promise<ExportResult>((resolve, reject) => {
    const cleanup = () => {
      activeRecorder = null
      engine.endExport()
      for (const track of stream.getTracks()) {
        if (track.kind === 'video') track.stop()
      }
    }

    const progressTimer = setInterval(() => {
      if (duration > 0) opts.onProgress?.(Math.min(0.999, engine.currentTime / duration))
    }, 120)

    const endWatch = setInterval(() => {
      const done = !engine.isPlaying && engine.currentTime >= duration - 0.06
      if (!cancelled && !done) return
      clearInterval(endWatch)
      clearInterval(progressTimer)
      opts.onProgress?.(1)
      setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop()
      }, 350)
    }, 100)

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }
    recorder.onerror = () => {
      clearInterval(endWatch)
      clearInterval(progressTimer)
      cleanup()
      reject(new Error('Recording failed — try a lower quality setting.'))
    }
    recorder.onstop = () => {
      cleanup()
      if (cancelled) {
        reject(new DOMException('Export cancelled', 'AbortError'))
        return
      }
      resolve({
        blob: new Blob(chunks, { type: mimeType }),
        mimeType,
        durationMs: performance.now() - startedAt,
      })
    }

    // start from the beginning, let the first frame settle, then roll
    engine.seekTo(0)
    recorder.start(250)
    setTimeout(() => engine.play(), 150)
  })
}

export interface AudioExportOptions {
  sampleRate: 44100 | 48000
  channels: 1 | 2
  /** 'wav' renders instantly (offline mixdown); 'mp3' encodes with lame */
  format: 'wav' | 'mp3'
  /** MP3 bitrate — ignored for WAV */
  mp3Kbps?: 128 | 192 | 320
  /** Day 30 — normalize the mix to this integrated LUFS target (two-pass; null = off) */
  loudnessTarget?: number | null
  onProgress?: (p: number) => void
}

export interface AudioExportResult {
  blob: Blob
  mimeType: string
  extension: 'wav' | 'mp3'
  durationSec: number
  /** Day 30 — measured integrated LUFS of the exported mix (null when skipped) */
  lufs?: number | null
  /** master trim applied by the loudness two-pass (dB) */
  loudnessGainDb?: number
}

/**
 * Render the project's full audio mix OFFLINE (faster than real time) and
 * encode it as WAV or MP3. Uses the same per-clip FX chains, volumes, fades,
 * mute/solo and auto-duck the preview plays with. MP3 always renders at
 * 44.1 kHz (the lame encoder's reliable rate) to guarantee correct pitch.
 */
export async function exportProjectAudio(
  project: Project,
  mediaMap: Map<string, MediaAssetRuntime>,
  opts: AudioExportOptions
): Promise<AudioExportResult> {
  const render = (masterGainDb: number) =>
    renderProjectAudio(project, mediaMap, {
      sampleRate: opts.format === 'mp3' ? 44100 : opts.sampleRate,
      channels: opts.channels,
      masterGainDb,
      onProgress: opts.onProgress,
    })
  let buffer = await render(0)
  // Day 30 — loudness normalize: measure the integrated LUFS of the mix,
  // apply the shortfall as a master trim (±24 dB), re-render, re-measure.
  let lufs: number | null = null
  let loudnessGainDb = 0
  if (opts.loudnessTarget != null) {
    const measured = measureIntegratedLufs(buffer)
    if (Number.isFinite(measured)) {
      loudnessGainDb = Math.max(-24, Math.min(24, opts.loudnessTarget - measured))
      if (Math.abs(loudnessGainDb) > 0.05) buffer = await render(loudnessGainDb)
      lufs = +measureIntegratedLufs(buffer).toFixed(2)
    }
  }
  opts.onProgress?.(0.96)
  if (opts.format === 'mp3') {
    const blob = await encodeMp3(buffer, opts.mp3Kbps ?? 192)
    opts.onProgress?.(1)
    return { blob, mimeType: 'audio/mpeg', extension: 'mp3', durationSec: buffer.duration, lufs, loudnessGainDb }
  }
  const blob = encodeWav(buffer)
  opts.onProgress?.(1)
  return { blob, mimeType: 'audio/wav', extension: 'wav', durationSec: buffer.duration, lufs, loudnessGainDb }
}
