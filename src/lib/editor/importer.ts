/**
 * Media import pipeline: File → { asset, blob }
 * Extracts duration, dimensions, thumbnails and audio waveform peaks fully client-side.
 * Also imports Adobe .cube LUT files as color-grade assets.
 */
import type { LutData, MediaAsset, MediaAssetRuntime } from './types'
import { mediaKindFromType, parseCubeLut, uid } from './utils'

const THUMB_W = 160
const THUMB_H = 90
const MAX_THUMBS = 6

function loadImageBitmap(url: string): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
        draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      })
    }
    img.onerror = reject
    img.src = url
  })
}

function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/jpeg', 0.72)
}

function makeThumbCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = THUMB_W
  canvas.height = THUMB_H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#12121c'
  ctx.fillRect(0, 0, THUMB_W, THUMB_H)
  return { canvas, ctx }
}

async function importImage(file: File, objectUrl: string): Promise<{ width: number; height: number; thumbnail: string; thumbs: string[] }> {
  const { width, height, draw } = await loadImageBitmap(objectUrl)
  const { canvas, ctx } = makeThumbCanvas()
  // cover-fit into thumb
  const scale = Math.max(THUMB_W / width, THUMB_H / height)
  const dw = width * scale
  const dh = height * scale
  draw(ctx, dw, dh)
  return { width, height, thumbnail: canvasToDataUrl(canvas), thumbs: [canvasToDataUrl(canvas)] }
}

async function importVideo(file: File, objectUrl: string): Promise<{ duration: number; width: number; height: number; thumbnail: string; thumbs: string[] }> {
  const video = document.createElement('video')
  video.preload = 'auto'
  video.muted = true
  video.src = objectUrl

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve()
    video.onerror = () => reject(new Error('Failed to read video metadata'))
    setTimeout(() => resolve(), 8000) // don't hang forever
  })

  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 5
  const width = video.videoWidth || 1280
  const height = video.videoHeight || 720

  const thumbs: string[] = []
  const { canvas, ctx } = makeThumbCanvas()
  const sampleCount = Math.min(MAX_THUMBS, Math.max(1, Math.floor(duration)))
  for (let i = 0; i < sampleCount; i++) {
    const t = (duration * (i + 0.5)) / sampleCount
    const ok = await new Promise<boolean>((resolve) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked)
        resolve(true)
      }
      video.addEventListener('seeked', onSeeked)
      video.currentTime = Math.min(t, Math.max(0, duration - 0.05))
      setTimeout(() => resolve(false), 2500)
    })
    if (!ok) break
    const scale = Math.max(THUMB_W / width, THUMB_H / height)
    ctx.drawImage(video, (THUMB_W - width * scale) / 2, (THUMB_H - height * scale) / 2, width * scale, height * scale)
    thumbs.push(canvasToDataUrl(canvas))
  }
  return { duration, width, height, thumbnail: thumbs[0] ?? '', thumbs }
}

/** Day 29 — shared audio analysis: per-bucket peaks + RMS + true peak level */
interface AudioMeta {
  peaks: number[]
  rms: number[]
  peakLevel: number
}

/**
 * Decode a media file's audio track and analyze it. Works for audio files AND
 * video containers with an audio track (Chrome decodes mp4/AAC via
 * decodeAudioData). Returns null when there is no decodable audio.
 */
async function analyzeMediaAudio(file: File): Promise<AudioMeta | null> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioCtx()
    const buffer = await ctx.decodeAudioData(arrayBuffer)
    const channel = buffer.getChannelData(0)
    const buckets = 1200
    const block = Math.max(1, Math.floor(channel.length / buckets))
    const peaks: number[] = []
    const rms: number[] = []
    let truePeak = 0
    for (let i = 0; i < buckets; i++) {
      let max = 0
      let sum = 0
      let n = 0
      const start = i * block
      for (let j = 0; j < block; j++) {
        const v = Math.abs(channel[start + j] ?? 0)
        if (v > max) max = v
        sum += v * v
        n++
        if (v > truePeak) truePeak = v
      }
      peaks.push(Math.min(1, max))
      rms.push(Math.min(1, n ? Math.sqrt(sum / n) : 0))
    }
    ctx.close().catch(() => undefined)
    return { peaks, rms, peakLevel: truePeak }
  } catch {
    return null
  }
}

async function importAudio(file: File, objectUrl: string): Promise<{ duration: number; peaks: number[]; rms: number[]; peakLevel: number }> {
  const temp = document.createElement('audio')
  temp.preload = 'metadata'
  temp.src = objectUrl
  const duration = await new Promise<number>((resolve) => {
    temp.onloadedmetadata = () => resolve(Number.isFinite(temp.duration) && temp.duration > 0 ? temp.duration : 10)
    temp.onerror = () => resolve(10)
    setTimeout(() => resolve(10), 6000)
  })

  const meta = await analyzeMediaAudio(file)
  return { duration, peaks: meta?.peaks ?? [], rms: meta?.rms ?? [], peakLevel: meta?.peakLevel ?? 0 }
}

/** Parse & import a .cube LUT file as a lut asset */
async function importLut(file: File): Promise<MediaAssetRuntime> {
  const text = await file.text()
  const lutData: LutData = parseCubeLut(text)
  // build a small gradient thumbnail so the library shows a hint of the look
  const { canvas, ctx } = makeThumbCanvas()
  const size = lutData.size
  const rows = 8
  for (let y = 0; y < THUMB_H; y++) {
    for (let x = 0; x < THUMB_W; x++) {
      const r = Math.floor((x / THUMB_W) * (size - 1))
      const g = Math.floor((y / THUMB_H) * (size - 1))
      const b = Math.floor((((x + y) % rows) / rows) * (size - 1))
      const idx = (b * size * size + g * size + r) * 3
      ctx.fillStyle = `rgb(${Math.round(lutData.table[idx] * 255)},${Math.round(lutData.table[idx + 1] * 255)},${Math.round(lutData.table[idx + 2] * 255)})`
      ctx.fillRect(x, y, 1, 1)
    }
  }
  const thumbnail = canvasToDataUrl(canvas)
  return {
    id: uid('lut_'),
    name: file.name.replace(/\.cube$/i, ''),
    kind: 'lut',
    mimeType: 'text/plain',
    size: file.size,
    duration: 0,
    width: 0,
    height: 0,
    thumbnail,
    thumbs: [thumbnail],
    lutData,
    createdAt: Date.now(),
    objectUrl: URL.createObjectURL(file),
    rawBlob: file,
  }
}

/** Main entry: import a user file → runtime asset ready for store */
export async function importFile(file: File): Promise<MediaAssetRuntime | null> {
  const isLut = /\.cube$/i.test(file.name)
  const kind = isLut ? 'lut' : mediaKindFromType(file.type, file.name)
  if (!kind) return null
  if (kind === 'lut') {
    try {
      return await importLut(file)
    } catch (e) {
      console.error('LUT import failed', e)
      return null
    }
  }
  const objectUrl = URL.createObjectURL(file)

  try {
    let meta: Pick<MediaAsset, 'duration' | 'width' | 'height' | 'thumbnail' | 'thumbs' | 'peaks' | 'rms' | 'peakLevel'> = {
      duration: 0,
      width: 0,
      height: 0,
      thumbnail: '',
      thumbs: [],
    }
    if (kind === 'image') {
      const r = await importImage(file, objectUrl)
      meta = { duration: 0, ...r }
    } else if (kind === 'video') {
      const r = await importVideo(file, objectUrl)
      meta = { ...r }
      // Day 29 — analyze the video's audio track too (waveform + normalize)
      const am = await analyzeMediaAudio(file)
      if (am) {
        meta.peaks = am.peaks
        meta.rms = am.rms
        meta.peakLevel = am.peakLevel
      }
    } else {
      const r = await importAudio(file, objectUrl)
      meta = { duration: r.duration, width: 0, height: 0, thumbnail: '', thumbs: [], peaks: r.peaks, rms: r.rms, peakLevel: r.peakLevel }
    }

    const asset: MediaAssetRuntime = {
      id: uid('med_'),
      name: file.name,
      kind,
      mimeType: file.type || `${kind}/unknown`,
      size: file.size,
      createdAt: Date.now(),
      objectUrl,
      rawBlob: file,
      ...meta,
    }
    return asset
  } catch (e) {
    console.error('import failed', e)
    URL.revokeObjectURL(objectUrl)
    return null
  }
}

/** Import multiple files with progress callback */
export async function importFiles(files: File[], onProgress?: (done: number, total: number) => void): Promise<MediaAssetRuntime[]> {
  const out: MediaAssetRuntime[] = []
  let done = 0
  for (const f of files) {
    const asset = await importFile(f)
    if (asset) out.push(asset)
    done++
    onProgress?.(done, files.length)
  }
  return out
}

/** Fetch a URL (e.g. bundled sample) and turn it into an asset */
export async function importFromUrl(url: string, name: string): Promise<MediaAssetRuntime | null> {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const file = new File([blob], name, { type: blob.type })
    return importFile(file)
  } catch {
    return null
  }
}
