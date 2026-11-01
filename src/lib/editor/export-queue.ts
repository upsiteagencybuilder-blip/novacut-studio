'use client'

/**
 * Day 56 — Export queue: multiple jobs, background rendering, cancel.
 *
 * The engine is a single instance recording the live canvas in real time, so
 * jobs run strictly ONE AT A TIME (honest queue, not parallel encoders):
 *  - queue any number of jobs from the export dialog with a full settings
 *    snapshot (resolution · fps · bitrate · format · audio · burn-in · caption
 *    skip · watermark · branding kit · file name);
 *  - the processor runs in the background — the dialog (and even the whole
 *    editor surface) can be used while it drains, driven by module-level
 *    zustand state, not component state;
 *  - queued jobs can be removed, the RENDERING job can be cancelled (the
 *    MediaRecorder aborts, the processor moves on), finished jobs can be
 *    cleared, and done jobs keep a re-downloadable blob URL;
 *  - each job temporarily applies its own canvas size + fps and restores the
 *    project's real canvas/fps (and pre-branding timeline) afterwards.
 */
import { create } from 'zustand'
import { toast } from 'sonner'
import { buildBrandedTimeline, ensureImageLoaded, type BrandingKit, type WatermarkPosition } from './branding'
import { extensionForMime, isExporting, startExport } from './exporter'
import { formatBytes } from './utils'
import { useEditor } from './store'

export type QueueJobStatus = 'queued' | 'rendering' | 'done' | 'failed' | 'cancelled'

export interface QueueJobSettings {
  width: number
  height: number
  fps: number
  bitrate: number
  format: 'webm' | 'mp4'
  audioKbps: number
  burnIn: boolean
  skipCaptions: boolean
  watermark: { url: string; position: WatermarkPosition; scale: number; opacity: number } | null
  branding: BrandingKit
  fileName: string
}

export interface QueueJob {
  id: string
  label: string
  createdAt: number
  status: QueueJobStatus
  progress: number
  settings: QueueJobSettings
  resultUrl?: string
  resultExt?: string
  sizeBytes?: number
  error?: string
}

interface QueueState {
  jobs: QueueJob[]
  autoDownload: boolean
  add: (job: QueueJob) => void
  remove: (id: string) => void
  update: (id: string, patch: Partial<QueueJob>) => void
  clearFinished: () => void
  setAutoDownload: (v: boolean) => void
}

export const useExportQueue = create<QueueState>((set) => ({
  jobs: [],
  autoDownload: true,
  add: (job) => set((s) => ({ jobs: [...s.jobs, job] })),
  remove: (id) => set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) })),
  update: (id, patch) => set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) })),
  clearFinished: () => set((s) => {
    for (const j of s.jobs) {
      if ((j.status === 'done' || j.status === 'failed' || j.status === 'cancelled') && j.resultUrl) {
        URL.revokeObjectURL(j.resultUrl)
      }
    }
    return { jobs: s.jobs.filter((j) => j.status === 'queued' || j.status === 'rendering') }
  }),
  setAutoDownload: (v) => set({ autoDownload: v }),
}))

export function queueSummary(s: QueueJobSettings): string {
  return `${s.width}×${s.height} · ${s.fps}fps · ${s.format.toUpperCase()} · ${Math.round(s.bitrate / 1_000_000)} Mbps`
}

let uidCounter = 0
export function makeQueueJob(settings: QueueJobSettings): QueueJob {
  uidCounter += 1
  return {
    id: `qjob_${Date.now().toString(36)}_${uidCounter}`,
    label: settings.fileName || 'novacut-export',
    createdAt: Date.now(),
    status: 'queued',
    progress: 0,
    settings,
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function triggerDownload(url: string, fileName: string, ext: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = `${fileName}.${ext}`
  document.body.appendChild(a)
  a.click()
  a.remove()
}

async function runJob(job: QueueJob) {
  const settings = job.settings
  // preload the watermark (a job queued earlier may reference an image that is
  // only decodable while its blob URL is alive — fail THIS job, not the queue)
  if (settings.watermark) {
    await ensureImageLoaded(settings.watermark.url)
  }

  const before = useEditor.getState()
  const originalProject = before.project
  const origCanvas = { w: before.project.canvasWidth, h: before.project.canvasHeight, fps: before.project.fps }

  // apply the job's canvas + fps, then the transient branding timeline
  before.setCanvasSize(settings.width, settings.height)
  before.setFps(settings.fps)
  const state = useEditor.getState()
  const branded = buildBrandedTimeline(state.project, state.media, settings.branding)
  if (branded) useEditor.setState({ project: branded.project })

  try {
    const result = await startExport({
      fps: settings.fps,
      videoBitsPerSecond: settings.bitrate,
      format: settings.format,
      audioBitsPerSecond: settings.audioKbps * 1000,
      burnIn: settings.burnIn ? 'timecode' : undefined,
      skipCaptions: settings.skipCaptions,
      watermark: settings.watermark,
      onProgress: (p) => useExportQueue.getState().update(job.id, { progress: p }),
    })
    const url = URL.createObjectURL(result.blob)
    useExportQueue.getState().update(job.id, {
      status: 'done',
      progress: 1,
      resultUrl: url,
      resultExt: extensionForMime(result.mimeType),
      sizeBytes: result.blob.size,
    })
    toast.success(`Queue export done — ${job.label} · ${formatBytes(result.blob.size)}`)
    if (useExportQueue.getState().autoDownload) triggerDownload(url, settings.fileName, extensionForMime(result.mimeType))
    if (!result.audioIncluded) {
      toast.warning(`${job.label} exported WITHOUT audio — the audio engine could not start in this environment`, {
        duration: 8000,
      })
    }
  } finally {
    // restore the pre-job state — only when the user did NOT edit the timeline
    // mid-render (editing while the engine records corrupts the render anyway)
    const s = useEditor.getState()
    if (branded && s.project === branded.project) {
      useEditor.setState({ project: originalProject })
      useEditor.getState().setCurrentTime(0)
    } else if (branded) {
      toast.warning(`"${job.label}" rendered while you were editing — the branding overlay was kept in the timeline`, {
        duration: 8000,
      })
    }
    s.setCanvasSize(origCanvas.w, origCanvas.h)
    s.setFps(origCanvas.fps)
  }
}

let pumping = false

/** Process queued jobs strictly one at a time; waits out any direct export first. */
export async function pumpQueue(): Promise<void> {
  if (pumping) return
  pumping = true
  try {
    for (;;) {
      // yield while a direct export (or another recorder session) owns the engine
      while (useEditor.getState().exportState.phase === 'recording' || isExporting()) {
        await sleep(300)
      }
      const next = useExportQueue.getState().jobs.find((j) => j.status === 'queued')
      if (!next) break
      useExportQueue.getState().update(next.id, { status: 'rendering', progress: 0 })
      try {
        await runJob(next)
      } catch (err) {
        const e = err as DOMException
        if (e?.name === 'AbortError') {
          useExportQueue.getState().update(next.id, { status: 'cancelled' })
        } else {
          useExportQueue.getState().update(next.id, {
            status: 'failed',
            error: e instanceof Error ? e.message : 'Queue export failed',
          })
          toast.error(`Queue export failed — ${next.label}: ${e instanceof Error ? e.message : 'unknown error'}`)
        }
      }
    }
  } finally {
    pumping = false
  }
}
