'use client'

/**
 * Day 53 — frame-based exports: animated GIF + PNG frame sequence (.zip).
 *
 * Both walk the timeline OFFLINE: seek → settle → draw the engine canvas into
 * a sampling canvas at target size. No recording, no realtime — a 7 s project
 * at 12 fps samples ~87 frames in a few seconds.
 *
 * Honest limits (disclosed in the UI):
 * - GIF: reduced resolution + fps, per-frame 256-color quantization (gifenc).
 * - PNG sequence: full-resolution PNGs zipped with fflate; frame COUNT grows
 *   fast (duration × fps), so the estimate is shown before exporting.
 */

import { GIFEncoder, quantize, applyPalette } from 'gifenc'
import { zipSync } from 'fflate'
import { getEngine } from './engine'
import type { Project } from './types'

export interface FrameExportOptions {
  fps: number
  /** sampling width; height follows the project aspect */
  width: number
  onProgress?: (p: number) => void
}

export interface GifExportResult {
  blob: Blob
  width: number
  height: number
  frames: number
  durationMs: number
}

export interface PngSequenceResult {
  blob: Blob
  frames: number
  width: number
  height: number
  fps: number
  durationMs: number
}

function nextTick(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
}

function getEngineCanvas(): HTMLCanvasElement {
  const engine = (window as unknown as { __ncEngineInstance?: { canvas?: HTMLCanvasElement } }).__ncEngineInstance
  if (!engine?.canvas) throw new Error('Preview engine canvas unavailable')
  return engine.canvas
}

/** Even-height rounding keeps encoders happy (odd heights break some GIF demuxers). */
function evenRound(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2)
}

async function withSamplingCanvas<T>(
  width: number,
  height: number,
  fn: (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => Promise<T>
): Promise<T> {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Sampling canvas unavailable')
  return fn(c, ctx)
}

async function exportGif(project: Project, opts: FrameExportOptions): Promise<GifExportResult> {
  const engine = getEngine()
  const duration = Math.max(engine.duration, 0.1)
  const aspect = project.canvasHeight / project.canvasWidth
  const width = evenRound(Math.min(opts.width, project.canvasWidth))
  const height = evenRound(width * aspect)
  const fps = opts.fps
  const frameCount = Math.max(1, Math.round(duration * fps))
  const started = performance.now()

  const wasPlaying = engine.isPlaying
  engine.pause()

  return withSamplingCanvas(width, height, async (canvas, ctx) => {
    const gif = GIFEncoder()
    const src = getEngineCanvas()
    const delay = Math.round(1000 / fps)

    for (let i = 0; i < frameCount; i++) {
      const t = Math.min(i / fps, duration - 0.001)
      engine.seekTo(t)
      await nextTick() // settle the seek → render → rAF pipeline
      ctx.drawImage(src, 0, 0, width, height)
      const { data } = ctx.getImageData(0, 0, width, height)
      const palette = quantize(data, 256)
      const index = applyPalette(data, palette)
      gif.writeFrame(index, width, height, { palette, delay })
      opts.onProgress?.((i + 1) / frameCount)
    }
    gif.finish()

    if (wasPlaying) engine.play()
    const bytes = gif.bytes()
    return {
      blob: new Blob([bytes as unknown as BlobPart], { type: 'image/gif' }),
      width,
      height,
      frames: frameCount,
      durationMs: performance.now() - started,
    }
  })
}

async function exportPngSequence(project: Project, opts: FrameExportOptions): Promise<PngSequenceResult> {
  const engine = getEngine()
  const duration = Math.max(engine.duration, 0.1)
  const aspect = project.canvasHeight / project.canvasWidth
  const width = evenRound(Math.min(opts.width, project.canvasWidth))
  const height = evenRound(width * aspect)
  const fps = opts.fps
  const frameCount = Math.max(1, Math.round(duration * fps))
  const started = performance.now()

  const wasPlaying = engine.isPlaying
  engine.pause()

  return withSamplingCanvas(width, height, async (canvas, ctx) => {
    const files: Record<string, Uint8Array> = {}
    const src = getEngineCanvas()

    for (let i = 0; i < frameCount; i++) {
      const t = Math.min(i / fps, duration - 0.001)
      engine.seekTo(t)
      await nextTick()
      ctx.drawImage(src, 0, 0, width, height)
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png')
      )
      files[`frame_${String(i + 1).padStart(5, '0')}.png`] = new Uint8Array(await blob.arrayBuffer())
      opts.onProgress?.(((i + 1) / frameCount) * 0.95)
    }

    // zip with STORE (PNGs are already compressed — deflate would burn seconds for ~0%)
    const zipped = zipSync(files, { level: 0 })
    opts.onProgress?.(1)

    if (wasPlaying) engine.play()
    return {
      blob: new Blob([zipped as unknown as BlobPart], { type: 'application/zip' }),
      frames: frameCount,
      width,
      height,
      fps,
      durationMs: performance.now() - started,
    }
  })
}

export { exportGif, exportPngSequence }
