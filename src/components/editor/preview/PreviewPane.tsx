'use client'

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  Maximize,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useEditor } from '@/lib/editor/store'
import { estimateClipRect, getEngine, type ClipBounds } from '@/lib/editor/engine'
import { CANVAS_PRESETS } from '@/lib/editor/constants'
import { clamp, formatTimecode, projectDuration } from '@/lib/editor/utils'
import { toast } from 'sonner'
import { useEngineBridge } from '@/hooks/useEngineBridge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'

type DragState =
  | { mode: 'move'; startX: number; startY: number; origX: number; origY: number }
  | { mode: 'scale'; centerX: number; centerY: number; origDist: number; origScale: number }

/** corner handles: tailwind position classes + resize cursor */
const CORNER_HANDLES = [
  'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
  'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
  'left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize',
  'right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize',
] as const

const timeVisible = (start: number, duration: number, t: number): boolean =>
  t >= start - 1e-6 && t < start + duration - 1e-6

export function PreviewPane() {
  const project = useEditor((s) => s.project)
  const currentTime = useEditor((s) => s.currentTime)
  const isPlaying = useEditor((s) => s.isPlaying)
  const selectedClipIds = useEditor((s) => s.selectedClipIds)
  const masterVolume = useEditor((s) => s.masterVolume)
  const masterMuted = useEditor((s) => s.masterMuted)
  const mediaVersion = useEditor((s) => s.mediaVersion)
  const updateClip = useEditor((s) => s.updateClip)
  const setCurrentTime = useEditor((s) => s.setCurrentTime)
  const togglePlay = useEditor((s) => s.togglePlay)
  const frameStep = useEditor((s) => s.frameStep)
  const setMasterVolume = useEditor((s) => s.setMasterVolume)
  const toggleMasterMuted = useEditor((s) => s.toggleMasterMuted)
  const setCanvasSize = useEditor((s) => s.setCanvasSize)
  const addTextClip = useEditor((s) => s.addTextClip)

  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<DragState | null>(null)

  // ---- Day 13 compare split (original ⇔ graded) ----
  const [compare, setCompare] = useState(false)
  const [split, setSplit] = useState(0.5)
  const splitDragRef = useRef(false)
  const toggleCompare = () => {
    const next = !compare
    setCompare(next)
    getEngine().setCompareSplit(next ? split : null)
  }
  const applySplitFromEvent = (clientX: number) => {
    const stage = wrapperRef.current
    if (!stage) return
    const r = stage.getBoundingClientRect()
    const v = clamp((clientX - r.left) / r.width, 0.02, 0.98)
    setSplit(v)
    getEngine().setCompareSplit(v)
  }

  // The ONLY component allowed to mount the engine bridge.
  useEngineBridge(canvasRef)

  const { canvasWidth, canvasHeight, fps } = project
  const duration = projectDuration(project)

  /* -------- deterministic stage fitting (ResizeObserver → exact px) -------- */
  const [fit, setFit] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const compute = () => {
      const cw = el.clientWidth
      const ch = el.clientHeight
      if (!cw || !ch) return
      const s = Math.min(cw / canvasWidth, ch / canvasHeight)
      setFit({ w: Math.max(48, Math.floor(canvasWidth * s)), h: Math.max(48, Math.floor(canvasHeight * s)) })
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [canvasWidth, canvasHeight])

  const mediaMap = useMemo(() => useEditor.getState().getMediaMap(), [mediaVersion])

  /* -------- empty-stage hint -------- */
  const visualClipCount = project.clips.filter((c) => c.kind !== 'audio').length
  const hasVisual = project.clips.some((c) => {
    if (c.kind === 'audio') return false
    const track = project.tracks.find((tr) => tr.id === c.trackId)
    if (track?.hidden) return false
    return timeVisible(c.start, c.duration, currentTime)
  })

  /* -------- selection overlay -------- */
  const selectedId = selectedClipIds.length === 1 ? selectedClipIds[0] : null
  const selectedClip = selectedId ? project.clips.find((c) => c.id === selectedId) : undefined
  const showOverlay = Boolean(
    !isPlaying &&
      selectedClip &&
      // compounds move/scale from their contents (open one to transform it)
      selectedClip.kind !== 'audio' &&
      selectedClip.kind !== 'nested' &&
      timeVisible(selectedClip.start, selectedClip.duration, currentTime)
  )
  // Engine bounds reflect the last rendered frame; estimate is the fallback.
  const bounds: ClipBounds | null =
    showOverlay && selectedClip
      ? getEngine().getClipBounds(selectedClip.id) ?? estimateClipRect(selectedClip, project, mediaMap)
      : null

  const beginMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!selectedClip) return
    e.preventDefault()
    dragRef.current = {
      mode: 'move',
      startX: e.clientX,
      startY: e.clientY,
      origX: selectedClip.transform.x,
      origY: selectedClip.transform.y,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const beginScale = (e: React.PointerEvent<HTMLDivElement>) => {
    const wrapper = wrapperRef.current
    if (!selectedClip || !bounds || !wrapper) return
    e.preventDefault()
    e.stopPropagation()
    const box = wrapper.getBoundingClientRect()
    const centerX = box.left + (bounds.x / canvasWidth) * box.width
    const centerY = box.top + (bounds.y / canvasHeight) * box.height
    dragRef.current = {
      mode: 'scale',
      centerX,
      centerY,
      origDist: Math.max(4, Math.hypot(e.clientX - centerX, e.clientY - centerY)),
      origScale: selectedClip.transform.scale,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    const wrapper = wrapperRef.current
    if (!d || !wrapper || !selectedClip) return
    const box = wrapper.getBoundingClientRect()
    if (d.mode === 'move') {
      // transform.x/y are fractions of canvas w/h; the wrapper is the canvas in display px
      const dx = (e.clientX - d.startX) / box.width
      const dy = (e.clientY - d.startY) / box.height
      updateClip(
        selectedClip.id,
        { transform: { x: clamp(d.origX + dx, -1, 1), y: clamp(d.origY + dy, -1, 1) } },
        'move-x'
      )
    } else {
      const dist = Math.hypot(e.clientX - d.centerX, e.clientY - d.centerY)
      const scale = clamp(d.origScale * (dist / d.origDist), 0.05, 5)
      updateClip(selectedClip.id, { transform: { scale } }, 'scale-drag')
    }
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null
    const el = e.currentTarget
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
  }

  /** double-click the canvas → drop a text clip exactly there (text tool) */
  const handleStageDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = wrapperRef.current?.getBoundingClientRect()
    if (!box || box.width < 2 || box.height < 2) return
    // ignore double-clicks that start on the selection overlay handles
    if ((e.target as HTMLElement).closest('[data-nc-selection]')) return
    const x = Math.round((clamp(((e.clientX - box.left) / box.width) * 2 - 1, -1, 1)) * 1000) / 1000
    const y = Math.round((clamp(((e.clientY - box.top) / box.height) * 2 - 1, -1, 1)) * 1000) / 1000
    addTextClip(undefined, { x, y })
    toast('Text placed — style it in Properties')
  }

  /* -------- transport -------- */
  const presetId =
    CANVAS_PRESETS.find((p) => p.width === canvasWidth && p.height === canvasHeight)?.id ?? '16:9'

  const toggleFullscreen = () => {
    const el = rootRef.current
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined)
    } else {
      el.requestFullscreen().catch(() => undefined)
    }
  }

  const volumeMuted = masterMuted || masterVolume === 0

  return (
    <div ref={rootRef} className="flex h-full min-w-0 flex-col">
      {/* ---------------- canvas stage ---------------- */}
      <div className="nc-checker relative flex min-h-0 flex-1 items-center justify-center p-4">
        <div ref={stageRef} className="flex h-full w-full items-center justify-center">
          <div
            ref={wrapperRef}
            className="nc-stage relative overflow-hidden rounded-lg"
            style={{ width: fit.w || undefined, height: fit.h || undefined }}
            onDoubleClick={handleStageDoubleClick}
          >
            <canvas ref={canvasRef} className="block h-full w-full" />

            {bounds && (
              <div
                data-nc-selection
                className="absolute touch-none rounded-[2px] border-2 border-fuchsia-400"
                style={{
                  left: `${((bounds.x - bounds.w / 2) / canvasWidth) * 100}%`,
                  top: `${((bounds.y - bounds.h / 2) / canvasHeight) * 100}%`,
                  width: `${(bounds.w / canvasWidth) * 100}%`,
                  height: `${(bounds.h / canvasHeight) * 100}%`,
                  transform: `rotate(${bounds.rotation}deg)`,
                  transformOrigin: 'center',
                }}
                onPointerDown={beginMove}
                onPointerMove={onDragMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                {CORNER_HANDLES.map((cls) => (
                  <div
                    key={cls}
                    className={`nc-gradient absolute h-3 w-3 rounded-full border border-white ${cls}`}
                    onPointerDown={beginScale}
                    onPointerMove={onDragMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  />
                ))}
              </div>
            )}

            {!hasVisual && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="rounded-full bg-(--nc-scrim) px-3 py-1 text-xs text-muted-foreground backdrop-blur-sm">
                  {visualClipCount === 0
                    ? 'Add media to start'
                    : 'Nothing at the playhead — drag it over a clip'}
                </span>
              </div>
            )}

            {/* compare split divider (Day 13): drag to sweep the original⇔graded cut */}
            {compare && (
              <div
                data-nc-compare-handle
                role="slider"
                aria-label="Compare split position"
                aria-valuemin={2}
                aria-valuemax={98}
                aria-valuenow={Math.round(split * 100)}
                className="absolute inset-y-0 z-20 w-6 -translate-x-1/2 cursor-ew-resize touch-none"
                style={{ left: `${split * 100}%` }}
                onPointerDown={(e) => {
                  splitDragRef.current = true
                  ;(e.target as Element).setPointerCapture?.(e.pointerId)
                  applySplitFromEvent(e.clientX)
                }}
                onPointerMove={(e) => {
                  if (splitDragRef.current) applySplitFromEvent(e.clientX)
                }}
                onPointerUp={() => {
                  splitDragRef.current = false
                }}
                onPointerCancel={() => {
                  splitDragRef.current = false
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* ---------------- transport ---------------- */}
      <div className="nc-glass flex h-14 shrink-0 items-center gap-2 border-t border-(--nc-line) px-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Go to start (Home)"
          aria-label="Go to start"
          onClick={() => setCurrentTime(0)}
        >
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Previous frame (←)"
          aria-label="Previous frame"
          onClick={() => frameStep(-1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="nc-gradient nc-glow h-10 w-10 rounded-full text-white hover:opacity-90"
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          onClick={togglePlay}
        >
          {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Next frame (→)"
          aria-label="Next frame"
          onClick={() => frameStep(1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Go to end (End)"
          aria-label="Go to end"
          onClick={() => setCurrentTime(projectDuration(project))}
        >
          <SkipForward className="h-4 w-4" />
        </Button>

        <div className="ml-1 flex items-baseline gap-1 font-mono text-xs tabular-nums">
          <span className="text-foreground">{formatTimecode(currentTime, fps)}</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-muted-foreground">{formatTimecode(duration, fps)}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${compare ? 'bg-fuchsia-500/20 text-fuchsia-300' : 'text-muted-foreground hover:text-foreground'}`}
            title={compare ? 'Exit compare split' : 'Compare split: original ⇔ graded'}
            aria-label={compare ? 'Exit compare split' : 'Compare split view'}
            aria-pressed={compare}
            data-nc-compare-toggle
            onClick={toggleCompare}
          >
            <Columns2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title={volumeMuted ? 'Unmute' : 'Mute'}
            aria-label={volumeMuted ? 'Unmute master volume' : 'Mute master volume'}
            onClick={toggleMasterMuted}
          >
            {volumeMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
          <Slider
            className="w-20"
            min={0}
            max={1}
            step={0.01}
            value={[masterMuted ? 0 : masterVolume]}
            onValueChange={(v) => setMasterVolume(v[0] ?? 0)}
            aria-label="Master volume"
          />

          <Select
            value={presetId}
            onValueChange={(v) => {
              const preset = CANVAS_PRESETS.find((p) => p.id === v)
              if (preset) setCanvasSize(preset.width, preset.height)
            }}
          >
            <SelectTrigger size="sm" className="h-8 w-[110px] text-xs" title="Canvas format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CANVAS_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="Fullscreen"
            aria-label="Toggle fullscreen preview"
            onClick={toggleFullscreen}
          >
            <Maximize className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

export default PreviewPane
