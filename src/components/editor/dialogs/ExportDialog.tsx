'use client'

/**
 * Export dialog — Pro edition.
 * Platform preset grid (resizes the canvas), quality/fps/format selects,
 * custom resolution, estimated size and the real-time recording flow.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  Download,
  MonitorPlay,
  PauseCircle,
  Settings2,
  TriangleAlert,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { useEditor } from '@/lib/editor/store'
import { cancelExport, extensionForMime, startExport, supportedExportMimeTypes } from '@/lib/editor/exporter'
import { EXPORT_PRESETS, EXPORT_QUALITY_PRESETS } from '@/lib/editor/constants'
import { formatBytes, formatTimecode, projectDuration } from '@/lib/editor/utils'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type ExportFormat = 'webm' | 'mp4'

export function ExportDialog() {
  const open = useEditor((s) => s.activeDialog === 'export')
  const exportState = useEditor((s) => s.exportState)
  const resetExport = useEditor((s) => s.resetExport)
  const openDialog = useEditor((s) => s.openDialog)
  const project = useEditor((s) => s.project)

  const [presetId, setPresetId] = useState<string | null>(null)
  const [bitrate, setBitrate] = useState<number>(12_000_000)
  const [format, setFormat] = useState<ExportFormat>('webm')
  const [showCustom, setShowCustom] = useState(false)
  const [customW, setCustomW] = useState('')
  const [customH, setCustomH] = useState('')
  const [lastMime, setLastMime] = useState('video/webm')

  const duration = projectDuration(project)
  const phase = exportState.phase
  const fps = project.fps

  // browser-supported export containers (client-only API, safe fallback list)
  const supported = useMemo(() => supportedExportMimeTypes(), [])
  const webmLabel = supported.some((c) => c.format === 'webm' && c.mime.includes('vp9')) ? 'WebM (VP9)' : 'WebM (VP8)'
  const formatOptions: { format: ExportFormat; label: string; supported: boolean }[] = [
    { format: 'webm', label: webmLabel, supported: supported.some((c) => c.format === 'webm') },
    { format: 'mp4', label: 'MP4 (H.264)', supported: supported.some((c) => c.format === 'mp4') },
  ]
  const qualityId = EXPORT_QUALITY_PRESETS.find((q) => q.bitrate === bitrate)?.id ?? 'custom'
  const selectedMime =
    supported.find((c) => c.format === format)?.mime ?? (format === 'mp4' ? 'video/mp4' : 'video/webm')
  const estimatedBytes = (bitrate * duration) / 8
  const fpsOptions = useMemo(
    () => Array.from(new Set([24, 30, 60, fps])).sort((a, b) => a - b),
    [fps]
  )

  // always start paused — the export loop drives the playhead itself
  useEffect(() => {
    if (open) useEditor.getState().pause()
  }, [open])

  const handlePreset = (id: string) => {
    const preset = EXPORT_PRESETS.find((p) => p.id === id)
    if (!preset) return
    const store = useEditor.getState()
    setPresetId(preset.id)
    setBitrate(preset.bitrate)
    store.setCanvasSize(preset.width, preset.height)
    store.setFps(preset.fps)
  }

  const toggleCustom = () => {
    if (!showCustom) {
      setCustomW(String(project.canvasWidth))
      setCustomH(String(project.canvasHeight))
    }
    setShowCustom(!showCustom)
  }

  const applyCustom = () => {
    const w = Math.round(Number(customW))
    const h = Math.round(Number(customH))
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 16 || h < 16 || w > 7680 || h > 4320) {
      toast.error('Enter a resolution between 16 × 16 and 7680 × 4320')
      return
    }
    useEditor.getState().setCanvasSize(w, h)
    setPresetId(null)
  }

  const handleStart = async () => {
    const store = useEditor.getState()
    // free any previous result blob before recording a new one
    if (store.exportState.url) URL.revokeObjectURL(store.exportState.url)
    store.pause()
    store.setExportState({ phase: 'recording', progress: 0 })
    try {
      const result = await startExport({
        fps,
        videoBitsPerSecond: bitrate,
        format,
        onProgress: (p) => useEditor.getState().setExportState({ progress: p }),
      })
      setLastMime(result.mimeType)
      useEditor.getState().setExportState({
        phase: 'done',
        url: URL.createObjectURL(result.blob),
        sizeBytes: result.blob.size,
        durationMs: result.durationMs,
      })
    } catch (err) {
      const e = err as DOMException
      if (e.name === 'AbortError') {
        useEditor.getState().setExportState({ phase: 'cancelled' })
      } else {
        useEditor
          .getState()
          .setExportState({ phase: 'error', error: e instanceof Error ? e.message : 'Export failed' })
      }
    }
  }

  const handleClose = (o: boolean) => {
    if (o) return
    if (useEditor.getState().exportState.phase === 'recording') cancelExport()
    openDialog(null)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4 text-fuchsia-400" />
            Export video
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            Rendered locally in your browser — nothing uploads.
            <Badge
              variant="outline"
              className="gap-1 border-emerald-400/40 bg-emerald-500/10 px-1.5 py-0 text-[9px] font-medium text-emerald-300"
            >
              <BadgeCheck className="h-3 w-3" />
              Watermark-free · 100% local
            </Badge>
          </DialogDescription>
        </DialogHeader>

        {/* ---------------- idle / preparing: settings ---------------- */}
        {(phase === 'idle' || phase === 'preparing') && (
          <div className="space-y-4">
            {/* platform presets */}
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Platform presets</Label>
              <div className="grid grid-cols-2 gap-2">
                {EXPORT_PRESETS.map((p) => {
                  const selected = presetId === p.id
                  return (
                    <div
                      key={p.id}
                      className={cn(
                        'rounded-xl p-px transition-colors',
                        selected ? 'nc-gradient' : 'bg-(--nc-panel-strong) hover:bg-(--nc-line-strong)'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => handlePreset(p.id)}
                        className="w-full rounded-[11px] bg-(--nc-sheet) px-3 py-2 text-left transition-colors hover:bg-(--nc-panel-strong)"
                      >
                        <span className={cn('block text-xs font-semibold', selected && 'nc-gradient-text')}>
                          {p.label}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-muted-foreground">
                          {p.width}×{p.height} · {p.sub}
                        </span>
                      </button>
                    </div>
                  )
                })}
              </div>
              {presetId && (
                <p className="flex items-center gap-1.5 text-[11px] text-fuchsia-300">
                  <MonitorPlay className="h-3.5 w-3.5" />
                  Canvas resized to match platform
                </p>
              )}
            </div>

            {/* quality + format */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Quality</Label>
                <Select
                  value={qualityId}
                  onValueChange={(v) => {
                    const q = EXPORT_QUALITY_PRESETS.find((item) => item.id === v)
                    if (q) setBitrate(q.bitrate)
                  }}
                >
                  <SelectTrigger className="h-9 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPORT_QUALITY_PRESETS.map((q) => (
                      <SelectItem key={q.id} value={q.id} className="text-xs">
                        {q.label} · {Math.round(q.bitrate / 1_000_000)} Mbps
                      </SelectItem>
                    ))}
                    {qualityId === 'custom' && (
                      <SelectItem value="custom" disabled className="text-xs">
                        Custom · {Math.round(bitrate / 1_000_000)} Mbps
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Format</Label>
                <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
                  <SelectTrigger className="h-9 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {formatOptions.map((f) => (
                      <SelectItem key={f.format} value={f.format} disabled={!f.supported} className="text-xs">
                        {f.label}
                        {!f.supported && ' — not supported'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* resolution + frame rate */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Resolution</Label>
                <div className="flex h-9 items-center rounded-md border border-(--nc-line) bg-(--nc-panel) px-3 font-mono text-xs text-muted-foreground">
                  {project.canvasWidth} × {project.canvasHeight}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Frame rate</Label>
                <Select value={String(fps)} onValueChange={(v) => useEditor.getState().setFps(Number(v))}>
                  <SelectTrigger className="h-9 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {fpsOptions.map((f) => (
                      <SelectItem key={f} value={String(f)} className="text-xs">
                        {f} fps
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* custom resolution (collapsible) */}
            <div>
              <button
                type="button"
                onClick={toggleCustom}
                className="flex h-7 w-fit items-center gap-1.5 rounded-lg bg-(--nc-panel) px-2 text-[11px] text-muted-foreground transition hover:bg-(--nc-panel-strong) hover:text-foreground"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Custom resolution
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showCustom && 'rotate-180')} />
              </button>
              {showCustom && (
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    inputMode="numeric"
                    value={customW}
                    onChange={(e) => setCustomW(e.target.value)}
                    placeholder="Width"
                    aria-label="Custom width"
                    className="h-8 w-20 border-(--nc-line) bg-(--nc-panel) text-center font-mono text-xs"
                  />
                  <span className="text-xs text-muted-foreground">×</span>
                  <Input
                    inputMode="numeric"
                    value={customH}
                    onChange={(e) => setCustomH(e.target.value)}
                    placeholder="Height"
                    aria-label="Custom height"
                    className="h-8 w-20 border-(--nc-line) bg-(--nc-panel) text-center font-mono text-xs"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 border border-fuchsia-400/40 px-3 text-xs text-fuchsia-300 hover:bg-fuchsia-500/10 hover:text-fuchsia-200"
                    onClick={applyCustom}
                  >
                    Apply
                  </Button>
                </div>
              )}
            </div>

            {/* summary */}
            <div className="nc-glass space-y-1.5 rounded-xl px-3 py-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Estimated length</span>
                <span className="font-mono tabular-nums">{formatTimecode(duration, fps)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Estimated size</span>
                <span className="font-mono tabular-nums">{formatBytes(estimatedBytes)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">File</span>
                <span className="truncate font-mono text-[11px]">
                  {project.name || 'novacut-export'}.{extensionForMime(selectedMime)}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <p className="text-[11px] leading-relaxed text-amber-200">
                Keep this tab visible and in the foreground while exporting — browsers pause hidden tabs.
              </p>
            </div>

            {duration <= 0 && (
              <p className="text-[11px] text-rose-300">Timeline is empty — add some clips before exporting.</p>
            )}

            <Button
              variant="ghost"
              disabled={duration <= 0}
              onClick={() => void handleStart()}
              className="nc-gradient nc-glow-hover h-10 w-full rounded-xl font-semibold text-white hover:opacity-90"
            >
              <Download className="h-4 w-4" />
              Start export
            </Button>
          </div>
        )}

        {/* ---------------- recording: live progress ---------------- */}
        {(phase === 'recording' || phase === 'finalizing') && (
          <div className="space-y-4 py-2">
            <div className="text-center">
              <div className="nc-gradient-text text-3xl font-bold tabular-nums">
                {Math.round(exportState.progress * 100)}%
              </div>
              <p className="mt-1.5 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
                </span>
                Recording in real time…
              </p>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-(--nc-panel-strong)">
              <div
                className="nc-gradient h-full rounded-full transition-all"
                style={{ width: `${Math.max(2, exportState.progress * 100)}%` }}
              />
            </div>

            <div className="flex items-center justify-between font-mono text-xs tabular-nums text-muted-foreground">
              <span>{formatTimecode(duration * exportState.progress, fps)}</span>
              <span>{formatTimecode(duration, fps)}</span>
            </div>

            <Button
              variant="outline"
              className="h-9 w-full border-rose-500/40 text-xs text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
              onClick={cancelExport}
            >
              Cancel export
            </Button>
          </div>
        )}

        {/* ---------------- done: result ---------------- */}
        {phase === 'done' && (
          <div className="space-y-3">
            <div className="text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
              <p className="mt-2 font-bold">Export complete!</p>
              <div className="mt-2 flex items-center justify-center gap-2">
                <span className="rounded-md border border-(--nc-line) bg-(--nc-panel) px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {formatBytes(exportState.sizeBytes ?? 0)}
                </span>
                <span className="rounded-md border border-(--nc-line) bg-(--nc-panel) px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {((exportState.durationMs ?? 0) / 1000).toFixed(1)}s
                </span>
                <span className="rounded-md border border-(--nc-line) bg-(--nc-panel) px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {extensionForMime(lastMime).toUpperCase()}
                </span>
              </div>
            </div>

            {exportState.url && (
              <video
                src={exportState.url}
                controls
                className="mt-1 max-h-56 w-full rounded-lg border border-(--nc-line)"
              />
            )}

            <Button asChild className="nc-gradient h-10 w-full rounded-xl font-semibold text-white hover:opacity-90">
              <a href={exportState.url} download={`${project.name || 'novacut-export'}.${extensionForMime(lastMime)}`}>
                <Download className="h-4 w-4" />
                Download video
              </a>
            </Button>

            <Button
              variant="ghost"
              className="h-9 w-full text-xs text-muted-foreground hover:text-foreground"
              onClick={resetExport}
            >
              Export again
            </Button>
          </div>
        )}

        {/* ---------------- error ---------------- */}
        {phase === 'error' && (
          <div className="space-y-3 py-2 text-center">
            <XCircle className="mx-auto h-10 w-10 text-rose-400" />
            <p className="font-semibold">Export failed</p>
            <p className="text-xs text-muted-foreground">
              {exportState.error ?? 'Something went wrong while recording.'}
            </p>
            <Button
              variant="ghost"
              className="nc-gradient h-10 w-full rounded-xl font-semibold text-white hover:opacity-90"
              onClick={resetExport}
            >
              Try again
            </Button>
          </div>
        )}

        {/* ---------------- cancelled ---------------- */}
        {phase === 'cancelled' && (
          <div className="space-y-3 py-2 text-center">
            <PauseCircle className="mx-auto h-10 w-10 text-yellow-400" />
            <p className="font-semibold">Export cancelled</p>
            <p className="text-xs text-muted-foreground">The recording was stopped before finishing.</p>
            <Button
              variant="ghost"
              className="nc-gradient h-10 w-full rounded-xl font-semibold text-white hover:opacity-90"
              onClick={resetExport}
            >
              Start again
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default ExportDialog
