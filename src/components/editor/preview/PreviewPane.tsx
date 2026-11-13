'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  Contrast,
  Crosshair,
  Frame,
  Gauge,
  Grid3x3,
  Maximize,
  Palette,
  Pause,
  Play,
  Ruler,
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
import { ContextToolbar } from './ContextToolbar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
  // ---- monitor overlays (guides & grids suite) ----
  const monitorSafe = useEditor((s) => s.monitorSafe)
  const monitorThirds = useEditor((s) => s.monitorThirds)
  const monitorRulers = useEditor((s) => s.monitorRulers)
  const monitorZebra = useEditor((s) => s.monitorZebra)
  const zebraThreshold = useEditor((s) => s.zebraThreshold)
  const monitorFalseColor = useEditor((s) => s.monitorFalseColor)
  const monitorGuides = useEditor((s) => s.monitorGuides)
  const guides = useEditor((s) => s.guides)
  const toggleMonitor = useEditor((s) => s.toggleMonitor)
  const setZebraThreshold = useEditor((s) => s.setZebraThreshold)
  const addGuide = useEditor((s) => s.addGuide)
  const moveGuide = useEditor((s) => s.moveGuide)
  const removeGuide = useEditor((s) => s.removeGuide)
  const clearGuides = useEditor((s) => s.clearGuides)

  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<DragState | null>(null)

  // ---- Day 13 compare split (original ⇔ graded) ----
  const [compare, setCompare] = useState(false)
  const [split, setSplit] = useState(0.5)
  const splitDragRef = useRef(false)

  // ---- Day 62 memory budget: preview resolution badge + honest auto-scale toast ----
  const [previewScale, setPreviewScale] = useState(1)
  const [previewAuto, setPreviewAuto] = useState(true)
  useEffect(() => {
    const engine = getEngine()
    engine.setAutoScale(true)
    setPreviewScale(engine.getRenderScale())
    setPreviewAuto(true)
    const onAuto = (e: Event) => {
      const scale = (e as CustomEvent<{ scale: number }>).detail?.scale ?? engine.getRenderScale()
      setPreviewScale(scale)
      toast(`Preview scaled to ${Math.round(scale * 100)}% for smooth playback`, {
        description: 'Set Preview quality manually to override (auto-scaling turns off).',
      })
    }
    window.addEventListener('nc-preview-autoscale', onAuto)
    return () => window.removeEventListener('nc-preview-autoscale', onAuto)
  }, [])
  const applyPreviewScale = (s: number) => {
    getEngine().setRenderScale(s)
    getEngine().setAutoScale(false)
    setPreviewScale(s)
    setPreviewAuto(false)
    toast.success(`Preview quality locked at ${Math.round(s * 100)}%`)
  }
  const resetAutoScale = () => {
    getEngine().setRenderScale(1)
    getEngine().setAutoScale(true)
    setPreviewScale(1)
    setPreviewAuto(true)
  }
  /** Day 62 — click the badge to cycle manual quality: 100% → 75% → 50% → 100% */
  const cyclePreviewScale = () => {
    const order = [1, 0.75, 0.5]
    const idx = order.findIndex((v) => Math.abs(v - previewScale) < 0.01)
    const next = order[(idx + 1) % order.length]
    if (next === 1) resetAutoScale()
    else applyPreviewScale(next)
  }
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

  /* -------- exposure overlays: zebra stripes + false color (post-v1.0.0 monitor suite) -------- */
  const exposureRef = useRef<HTMLCanvasElement>(null)
  const exposureActive = monitorZebra || monitorFalseColor
  useEffect(() => {
    if (!exposureActive) return
    const SAMPLE = 192
    const off = document.createElement('canvas')
    const offCtx = off.getContext('2d', { willReadFrequently: true })
    if (!offCtx) return
    let raf = 0
    let last = 0
    const draw = (ts: number) => {
      raf = requestAnimationFrame(draw)
      if (ts - last < 80) return // ~12 fps — plenty for an exposure judge
      last = ts
      const canvas = exposureRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx || !canvas.width || !canvas.height) return
      const dims = getEngine().getSampleDims(SAMPLE)
      const data = getEngine().sampleFrame(SAMPLE)
      if (!dims || !data) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const img = offCtx.createImageData(dims.w, dims.h)
      const px = img.data
      const n = dims.w * dims.h
      for (let i = 0, p = 0; i < n; i++, p += 4) {
        const r = data[p]
        const g = data[p + 1]
        const b = data[p + 2]
        const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
        if (monitorFalseColor) {
          // selective bands keep the picture readable: clip / near-clip / skin / mid-grey / crushed
          let band: readonly [number, number, number, number] | null = null
          if (luma >= 0.97) band = [255, 48, 48, 200]
          else if (luma >= 0.9) band = [255, 176, 0, 170]
          else if (luma >= 0.55 && luma < 0.7) band = [255, 96, 170, 150]
          else if (luma >= 0.4 && luma < 0.47) band = [0, 235, 96, 170]
          else if (luma <= 0.04) band = [64, 96, 255, 190]
          if (band) {
            px[p] = band[0]
            px[p + 1] = band[1]
            px[p + 2] = band[2]
            px[p + 3] = band[3]
          }
        }
        if (monitorZebra && luma >= zebraThreshold) {
          const x = i % dims.w
          const y = (i / dims.w) | 0
          if (((x + y) & 7) < 4) {
            px[p] = 255
            px[p + 1] = 255
            px[p + 2] = 255
            px[p + 3] = 210
          }
        }
      }
      off.width = dims.w
      off.height = dims.h
      offCtx.putImageData(img, 0, 0)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(off, 0, 0, canvas.width, canvas.height)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [exposureActive, monitorFalseColor, monitorZebra, zebraThreshold])

  /* -------- transport audio meter: 4× oversampled true peak + RMS + falling peak hold + clip lamp -------- */
  const [meterPulse, setMeterPulse] = useState(false)
  const rmsRef = useRef<HTMLDivElement>(null)
  const peakRef = useRef<HTMLDivElement>(null)
  const holdRef = useRef<HTMLDivElement>(null)
  const clipRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const toPct = (v: number) => {
      const db = 20 * Math.log10(Math.max(v, 1e-4))
      return clamp((db + 48) / 48, 0, 1) * 100 // −48 dBFS..0 dBFS → 0..100%
    }
    let raf = 0
    let last = 0
    let hold = 0 // peak-hold, in %
    let holdAt = 0
    let clipUntil = 0
    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick)
      if (ts - last < 50) return // 20 fps
      last = ts
      const engine = getEngine()
      const rms = engine.getMasterLevel()
      // true peak: 4× oversample the master time-domain frame via linear interpolation
      let peak = 0
      const td = engine.getMasterTimeData()
      if (td && td.length > 1) {
        for (let i = 0; i < td.length - 1; i++) {
          const a = td[i]
          const b = td[i + 1]
          const d = b - a
          const m0 = Math.abs(a)
          if (m0 > peak) peak = m0
          const m1 = Math.abs(a + d * 0.25)
          if (m1 > peak) peak = m1
          const m2 = Math.abs(a + d * 0.5)
          if (m2 > peak) peak = m2
          const m3 = Math.abs(a + d * 0.75)
          if (m3 > peak) peak = m3
        }
        const lastAbs = Math.abs(td[td.length - 1])
        if (lastAbs > peak) peak = lastAbs
      }
      if (peak >= hold) {
        hold = toPct(peak)
        holdAt = ts
      } else if (ts - holdAt > 900) {
        hold = Math.max(toPct(peak), hold - ((ts - holdAt - 900) / 1000) * 25) // fall 25%/s after 0.9 s
      }
      if (peak >= 0.995) clipUntil = ts + 2000
      if (rmsRef.current) rmsRef.current.style.height = `${toPct(rms)}%`
      if (peakRef.current) peakRef.current.style.bottom = `${toPct(peak)}%`
      if (holdRef.current) holdRef.current.style.bottom = `${hold}%`
      if (clipRef.current) clipRef.current.style.opacity = ts < clipUntil ? '1' : '0'
    }
    raf = requestAnimationFrame(tick)
    const onPulse = () => {
      setMeterPulse(true)
      window.setTimeout(() => setMeterPulse(false), 1600)
    }
    window.addEventListener('nc-pulse-transport-meter', onPulse)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('nc-pulse-transport-meter', onPulse)
    }
  }, [])

  /* -------- draggable composition guides (post-v1.0.0 monitor suite) -------- */
  const guideDragRef = useRef<{ axis: 'v' | 'h'; index: number; grab: number } | null>(null)
  const beginGuideDrag = (axis: 'v' | 'h', index: number, e: React.PointerEvent<HTMLDivElement>) => {
    const box = wrapperRef.current?.getBoundingClientRect()
    if (!box) return
    e.preventDefault()
    e.stopPropagation()
    const pos = axis === 'v' ? guides.v[index] : guides.h[index]
    const grab =
      axis === 'v' ? (e.clientX - box.left) / box.width - pos : (e.clientY - box.top) / box.height - pos
    guideDragRef.current = { axis, index, grab }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* synthetic pointers (tests) have no capture target */
    }
  }
  const moveGuideDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = guideDragRef.current
    const box = wrapperRef.current?.getBoundingClientRect()
    if (!d || !box) return
    const pos =
      d.axis === 'v' ? (e.clientX - box.left) / box.width - d.grab : (e.clientY - box.top) / box.height - d.grab
    moveGuide(d.axis, d.index, pos)
  }
  const endGuideDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    guideDragRef.current = null
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* synthetic pointers */
    }
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
    // ignore double-clicks that start on the selection overlay handles or the guides
    if ((e.target as HTMLElement).closest('[data-nc-selection], [data-nc-guide]')) return
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
  const anyMonitorOn =
    monitorSafe || monitorThirds || monitorRulers || monitorZebra || monitorFalseColor || monitorGuides

  return (
    <div ref={rootRef} className="flex h-full min-w-0 flex-col">
      {/* ---------------- canvas stage ---------------- */}
      <div className="nc-checker relative flex min-h-0 flex-1 items-center justify-center p-4">
        {/* UX60 Phase 2 — selection-aware quick actions, floating over the canvas */}
        <ContextToolbar />
        <div ref={stageRef} className="flex h-full w-full items-center justify-center">
          <div
            ref={wrapperRef}
            className="nc-stage relative overflow-hidden rounded-lg"
            data-nc-tour="preview"
            data-nc-guided="preview"
            style={{ width: fit.w || undefined, height: fit.h || undefined }}
            onDoubleClick={handleStageDoubleClick}
          >
            <canvas ref={canvasRef} role="img" aria-label="Program preview — live composite of the timeline at the playhead" className="block h-full w-full" />

            {/* ---- monitor overlays (guides & grids suite) — purely visual, never intercepts input ---- */}
            {monitorSafe && (
              <div data-nc-monitor-safe className="pointer-events-none absolute inset-0 z-10" aria-hidden>
                {/* SMPTE ST 2046-1: action safe 93%, title safe 90% */}
                <div className="absolute border border-dashed border-cyan-300/60" style={{ inset: '3.5%' }}>
                  <span className="absolute -top-px left-0 -translate-y-full font-mono text-[8px] tracking-wider text-cyan-300/80">
                    ACTION 93%
                  </span>
                </div>
                <div className="absolute border border-cyan-200/40" style={{ inset: '5%' }}>
                  <span className="absolute -bottom-px right-0 translate-y-full font-mono text-[8px] tracking-wider text-cyan-200/60">
                    TITLE 90%
                  </span>
                </div>
              </div>
            )}
            {monitorThirds && (
              <div data-nc-monitor-thirds className="pointer-events-none absolute inset-0 z-10" aria-hidden>
                {[33.333, 66.667].map((p) => (
                  <div key={`v${p}`} className="absolute inset-y-0 w-px bg-white/35" style={{ left: `${p}%` }} />
                ))}
                {[33.333, 66.667].map((p) => (
                  <div key={`h${p}`} className="absolute inset-x-0 h-px bg-white/35" style={{ top: `${p}%` }} />
                ))}
                {/* center crosshair */}
                <div className="absolute left-1/2 top-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 bg-white/50" />
                <div className="absolute left-1/2 top-1/2 h-px w-4 -translate-x-1/2 -translate-y-1/2 bg-white/50" />
              </div>
            )}
            {monitorRulers && (
              <div data-nc-monitor-rulers className="pointer-events-none absolute inset-0 z-10" aria-hidden>
                {/* top ruler — canvas px */}
                <div className="absolute inset-x-0 top-0 h-4 border-b border-white/25 bg-black/45 backdrop-blur-[2px]">
                  {Array.from({ length: 11 }, (_, i) => i / 10).map((p) => (
                    <div
                      key={p}
                      className="absolute top-0 w-px bg-white/45"
                      style={{ left: `${p * 100}%`, height: p % 0.5 === 0 ? '100%' : '45%' }}
                    />
                  ))}
                  {[0, 0.25, 0.5, 0.75, 1].map((p) => (
                    <span
                      key={p}
                      className="absolute top-0.5 ml-1 font-mono text-[8px] leading-none text-white/55"
                      style={{ left: `${p * 100}%` }}
                    >
                      {Math.round(p * canvasWidth)}
                    </span>
                  ))}
                </div>
                {/* left ruler — canvas px */}
                <div className="absolute inset-y-0 left-0 w-4 border-r border-white/25 bg-black/45 backdrop-blur-[2px]">
                  {Array.from({ length: 11 }, (_, i) => i / 10).map((p) => (
                    <div
                      key={p}
                      className="absolute left-0 h-px bg-white/45"
                      style={{ top: `${p * 100}%`, width: p % 0.5 === 0 ? '100%' : '45%' }}
                    />
                  ))}
                  {[0, 0.25, 0.5, 0.75, 1].map((p) => (
                    <span
                      key={p}
                      className="absolute left-0.5 mt-0.5 origin-left font-mono text-[8px] leading-none text-white/55"
                      style={{ top: `${p * 100}%` }}
                    >
                      {Math.round(p * canvasHeight)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ---- exposure overlays: zebra stripes + false color — sampled live off the composited frame ---- */}
            {exposureActive && (
              <canvas
                ref={exposureRef}
                data-nc-monitor-exposure
                width={fit.w || 640}
                height={fit.h || 360}
                className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                aria-hidden
              />
            )}

            {/* ---- draggable composition guides — amber, non-printing, session-scoped ---- */}
            {monitorGuides && (
              <div data-nc-monitor-guides className="pointer-events-none absolute inset-0 z-10">
                {guides.v.map((pos, i) => (
                  <div
                    key={`gv${i}`}
                    role="slider"
                    tabIndex={0}
                    data-nc-guide="v"
                    aria-label={`Vertical guide ${i + 1}`}
                    aria-valuemin={2}
                    aria-valuemax={98}
                    aria-valuenow={Math.round(pos * 100)}
                    className="group pointer-events-auto absolute inset-y-0 w-5 -translate-x-1/2 cursor-ew-resize touch-none outline-none"
                    style={{ left: `${pos * 100}%` }}
                    onPointerDown={(e) => beginGuideDrag('v', i, e)}
                    onPointerMove={moveGuideDrag}
                    onPointerUp={endGuideDrag}
                    onPointerCancel={endGuideDrag}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      removeGuide('v', i)
                    }}
                    onKeyDown={(e) => {
                      const step = e.shiftKey ? 0.05 : 0.01
                      if (e.key === 'ArrowLeft') {
                        e.preventDefault()
                        moveGuide('v', i, pos - step)
                      }
                      if (e.key === 'ArrowRight') {
                        e.preventDefault()
                        moveGuide('v', i, pos + step)
                      }
                    }}
                  >
                    <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-amber-300/80 transition-colors group-hover:bg-amber-200 group-focus-visible:bg-amber-200" />
                    <div className="absolute left-1/2 top-0 h-1.5 w-3 -translate-x-1/2 rounded-b bg-amber-300" />
                    <div className="absolute bottom-0 left-1/2 h-1.5 w-3 -translate-x-1/2 rounded-t bg-amber-300" />
                  </div>
                ))}
                {guides.h.map((pos, i) => (
                  <div
                    key={`gh${i}`}
                    role="slider"
                    tabIndex={0}
                    data-nc-guide="h"
                    aria-label={`Horizontal guide ${i + 1}`}
                    aria-valuemin={2}
                    aria-valuemax={98}
                    aria-valuenow={Math.round(pos * 100)}
                    className="group pointer-events-auto absolute inset-x-0 h-5 -translate-y-1/2 cursor-ns-resize touch-none outline-none"
                    style={{ top: `${pos * 100}%` }}
                    onPointerDown={(e) => beginGuideDrag('h', i, e)}
                    onPointerMove={moveGuideDrag}
                    onPointerUp={endGuideDrag}
                    onPointerCancel={endGuideDrag}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      removeGuide('h', i)
                    }}
                    onKeyDown={(e) => {
                      const step = e.shiftKey ? 0.05 : 0.01
                      if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        moveGuide('h', i, pos - step)
                      }
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        moveGuide('h', i, pos + step)
                      }
                    }}
                  >
                    <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-amber-300/80 transition-colors group-hover:bg-amber-200 group-focus-visible:bg-amber-200" />
                    <div className="absolute left-0 top-1/2 h-3 w-1.5 -translate-y-1/2 rounded-r bg-amber-300" />
                    <div className="absolute right-0 top-1/2 h-3 w-1.5 -translate-y-1/2 rounded-l bg-amber-300" />
                  </div>
                ))}
              </div>
            )}

            {/* Day 62 — live preview resolution badge (never lies about the scale) */}
            <div
              data-nc-preview-scale
              role="button"
              tabIndex={0}
              onClick={cyclePreviewScale}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') cyclePreviewScale()
              }}
              className="absolute bottom-1.5 left-1.5 z-10 flex cursor-pointer items-center gap-1 rounded-full border border-(--nc-line) bg-black/55 px-1.5 py-0.5 font-mono text-[9px] text-white/70 backdrop-blur-sm transition-colors hover:text-white"
              title={
                previewAuto
                  ? `Preview renders at ${Math.round(previewScale * 100)}% resolution (auto: drops further if playback struggles; exports are ALWAYS full resolution) — click to change`
                  : `Preview locked at ${Math.round(previewScale * 100)}% — click to cycle quality`
              }
            >
              <Gauge className="size-2.5" />
              {Math.round(previewScale * 100)}%
              {!previewAuto && (
                <button
                  type="button"
                  aria-label="Restore full preview resolution and auto-scaling"
                  onClick={resetAutoScale}
                  className="ml-0.5 text-amber-300 hover:text-amber-200"
                >
                  ·auto off
                </button>
              )}
            </div>

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

      {/* ---------------- transport (scrollable on narrow screens so no control is silently clipped) ---------------- */}
      <div className="nc-glass flex h-14 shrink-0 items-center gap-1.5 overflow-x-auto border-t border-(--nc-line) px-2 [scrollbar-width:none] sm:gap-2 sm:overflow-visible sm:px-3 [&::-webkit-scrollbar]:hidden">
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

        <div className="ml-1 flex shrink-0 items-baseline gap-1 font-mono text-xs tabular-nums">
          <span className="text-foreground">{formatTimecode(currentTime, fps)}</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-muted-foreground max-sm:hidden">{formatTimecode(duration, fps)}</span>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          {/* monitor overlays (guides, grids & exposure suite) */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 ${anyMonitorOn ? 'bg-cyan-500/20 text-cyan-300' : 'text-muted-foreground hover:text-foreground'}`}
                title="Monitor overlays: safe margins, thirds, rulers, zebra, false color, guides"
                aria-label="Monitor overlays menu"
                data-nc-monitor-toggle
              >
                <Grid3x3 className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-2">
              <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Monitor overlays
              </p>
              {([
                { key: 'safe' as const, label: 'Safe margins', icon: Frame, on: monitorSafe, attr: 'safe' },
                { key: 'thirds' as const, label: 'Thirds grid', icon: Grid3x3, on: monitorThirds, attr: 'thirds' },
                { key: 'rulers' as const, label: 'Pixel rulers', icon: Ruler, on: monitorRulers, attr: 'rulers' },
                { key: 'zebra' as const, label: 'Zebra stripes', icon: Contrast, on: monitorZebra, attr: 'zebra' },
                { key: 'falsecolor' as const, label: 'False color', icon: Palette, on: monitorFalseColor, attr: 'falsecolor' },
                { key: 'guides' as const, label: 'Drag guides', icon: Crosshair, on: monitorGuides, attr: 'guides' },
              ]).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={item.on}
                  data-nc-monitor-item={item.attr}
                  onClick={() => toggleMonitor(item.key)}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-(--nc-panel-strong)"
                >
                  <item.icon className={`h-3.5 w-3.5 ${item.on ? 'text-cyan-300' : 'text-muted-foreground'}`} />
                  <span className="flex-1">{item.label}</span>
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${item.on ? 'bg-cyan-300' : 'bg-muted-foreground/30'}`}
                    aria-hidden
                  />
                </button>
              ))}
              {monitorZebra && (
                <div className="mt-1 border-t border-(--nc-line) px-2 pb-1 pt-2" data-nc-zebra-threshold>
                  <div className="flex items-center justify-between text-[10px] font-medium text-muted-foreground">
                    <span>Zebra threshold</span>
                    <span className="font-mono text-cyan-300">{Math.round(zebraThreshold * 100)} IRE</span>
                  </div>
                  <Slider
                    className="mt-1.5"
                    min={50}
                    max={100}
                    step={1}
                    value={[Math.round(zebraThreshold * 100)]}
                    onValueChange={(v) => setZebraThreshold((v[0] ?? 100) / 100)}
                    aria-label="Zebra threshold"
                  />
                </div>
              )}
              {monitorGuides && (
                <div className="mt-1 border-t border-(--nc-line) px-2 pb-1 pt-2" data-nc-guides-controls>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      data-nc-guides-add-v
                      onClick={() => addGuide('v', 0.5)}
                      className="flex-1 cursor-pointer rounded-md border border-(--nc-line) px-2 py-1 text-[10px] font-medium text-foreground transition-colors hover:bg-(--nc-panel-strong)"
                    >
                      + Vertical
                    </button>
                    <button
                      type="button"
                      data-nc-guides-add-h
                      onClick={() => addGuide('h', 0.5)}
                      className="flex-1 cursor-pointer rounded-md border border-(--nc-line) px-2 py-1 text-[10px] font-medium text-foreground transition-colors hover:bg-(--nc-panel-strong)"
                    >
                      + Horizontal
                    </button>
                    <button
                      type="button"
                      data-nc-guides-clear
                      onClick={clearGuides}
                      className="flex-1 cursor-pointer rounded-md border border-transparent px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:text-red-300"
                    >
                      Clear
                    </button>
                  </div>
                  <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
                    Drag lines on the canvas · double-click removes · arrow keys nudge
                  </p>
                </div>
              )}
            </PopoverContent>
          </Popover>
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

          {/* true-peak master meter (always-on; pulse highlights via Pro-wall deep link) */}
          <div
            data-nc-audio-meter
            role="img"
            aria-label="Master audio meter — 4× oversampled true peak, RMS level, falling peak hold and clip lamp"
            title="Master meter: white tick = 4× oversampled true peak, bar = RMS, amber = falling peak hold, red lamp = clip"
            className={`relative h-6 w-3 shrink-0 max-sm:hidden ${meterPulse ? 'rounded-sm ring-2 ring-amber-300' : ''}`}
          >
            <div className="absolute inset-0 overflow-hidden rounded-sm border border-(--nc-line) bg-black/55">
              <div ref={rmsRef} className="absolute inset-x-0 bottom-0" style={{ height: '0%' }}>
                <div
                  className="absolute inset-x-0 bottom-0 h-6"
                  style={{ background: 'linear-gradient(to top, #34d399 0%, #34d399 60%, #fbbf24 85%, #f87171 100%)' }}
                />
              </div>
              <div ref={peakRef} className="absolute inset-x-0 h-px bg-white/90" style={{ bottom: '0%' }} />
              <div ref={holdRef} className="absolute inset-x-0 h-px bg-amber-300/80" style={{ bottom: '0%' }} />
            </div>
            <div
              ref={clipRef}
              className="absolute -top-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.9)]"
              style={{ opacity: 0 }}
            />
          </div>
          <Slider
            className="w-20 max-sm:hidden"
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
            <SelectTrigger size="sm" className="h-8 w-[110px] text-xs max-sm:hidden" title="Canvas format">
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
