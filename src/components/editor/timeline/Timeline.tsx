'use client'

/**
 * NovaCut Studio — Timeline
 * Bottom editor section: toolbar row, single-scroll lane area with sticky
 * header column + ruler, clip lanes, draggable playhead with scrubbing,
 * snapping guide line, playback auto-follow and the empty-state hint.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { AudioLines, Eye, EyeOff, Film, Layers, Lock, LockOpen, Plus, Volume2, VolumeX, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { HEADER_WIDTH, RULER_HEIGHT, TRACK_HEIGHT } from '@/lib/editor/constants'
import { useEditor } from '@/lib/editor/store'
import { clipsOnTrack, formatShortTime, projectDuration } from '@/lib/editor/utils'
import type { Clip, ClipKind, Track } from '@/lib/editor/types'
import { cn } from '@/lib/utils'
import { ClipBlock, type ClipDragInfo } from './ClipBlock'
import { TimelineToolbar } from './TimelineToolbar'

const RULER_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60]

/** stable empty reference so Ruler's memo doesn't churn when beats are hidden */
const EMPTY_BEATS: number[] = []

const HEADER_BTN =
  'flex size-5 shrink-0 items-center justify-center rounded text-foreground/40 transition-colors hover:bg-(--nc-panel-strong) hover:text-foreground/90 disabled:pointer-events-none disabled:opacity-40'

/** clip kind → track kind compatibility (locked tracks never accept drops) */
function isCompatible(kind: ClipKind, track: Track): boolean {
  if (track.locked) return false
  return kind === 'audio' ? track.kind === 'audio' : track.kind === 'video' || track.kind === 'overlay'
}

export function Timeline() {
  const project = useEditor((s) => s.project)
  const currentTime = useEditor((s) => s.currentTime)
  const zoom = useEditor((s) => s.zoom)
  const isPlaying = useEditor((s) => s.isPlaying)
  const selectedIds = useEditor((s) => s.selectedClipIds)
  const beatMarkers = useEditor((s) => s.beatMarkers)
  const showBeatMarkers = useEditor((s) => s.showBeatMarkers)

  const scrollRef = useRef<HTMLDivElement>(null)
  const laneEls = useRef(new Map<string, HTMLDivElement>())
  const zoomRef = useRef(zoom)

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  const [viewportW, setViewportW] = useState(0)
  const [dragInfo, setDragInfo] = useState<ClipDragInfo | null>(null)
  const [hoverTrackId, setHoverTrackId] = useState<string | null>(null)
  const [snapLineX, setSnapLineX] = useState<number | null>(null)

  const duration = projectDuration(project)
  const laneWidth = Math.max(duration * zoom + 400, viewportW - HEADER_WIDTH)
  const contentWidth = HEADER_WIDTH + laneWidth

  /* measure the scroll viewport so lanes always fill it */
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => setViewportW(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* auto-follow: keep the playhead visible during playback */
  useEffect(() => {
    if (!isPlaying) return
    const el = scrollRef.current
    if (!el) return
    const x = HEADER_WIDTH + currentTime * zoom
    if (x < el.scrollLeft + 80 || x > el.scrollLeft + el.clientWidth - 80) {
      el.scrollLeft = Math.max(0, x - el.clientWidth * 0.3)
    }
  }, [currentTime, isPlaying, zoom])

  const registerLane = useCallback((trackId: string, el: HTMLDivElement | null) => {
    if (el) laneEls.current.set(trackId, el)
    else laneEls.current.delete(trackId)
  }, [])

  const findLaneAt = useCallback((clientY: number, kind: ClipKind): { trackId: string } | null => {
    const st = useEditor.getState()
    for (const track of st.project.tracks) {
      const el = laneEls.current.get(track.id)
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (clientY >= r.top && clientY < r.bottom) {
        return isCompatible(kind, track) ? { trackId: track.id } : null
      }
    }
    return null
  }, [])

  const seekFromClientX = useCallback((clientX: number) => {
    const el = scrollRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    useEditor.getState().setCurrentTime((clientX - rect.left + el.scrollLeft - HEADER_WIDTH) / zoomRef.current)
  }, [])

  /* shared scrub drag for the ruler and the playhead handle */
  const beginScrub = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      const el = e.currentTarget
      el.setPointerCapture(e.pointerId)
      document.body.style.userSelect = 'none'
      seekFromClientX(e.clientX)
      const onMove = (ev: PointerEvent) => seekFromClientX(ev.clientX)
      const onUp = (ev: PointerEvent) => {
        el.removeEventListener('pointermove', onMove)
        el.removeEventListener('pointerup', onUp)
        el.removeEventListener('pointercancel', onUp)
        if (el.hasPointerCapture(ev.pointerId)) el.releasePointerCapture(ev.pointerId)
        document.body.style.userSelect = ''
      }
      el.addEventListener('pointermove', onMove)
      el.addEventListener('pointerup', onUp)
      el.addEventListener('pointercancel', onUp)
    },
    [seekFromClientX],
  )

  const handleDragChange = useCallback((d: ClipDragInfo | null) => {
    setDragInfo(d)
    if (!d) {
      setHoverTrackId(null)
      setSnapLineX(null)
    }
  }, [])
  const handleHoverTrack = useCallback((id: string | null) => setHoverTrackId(id), [])
  const handleSnapLine = useCallback((x: number | null) => setSnapLineX(x), [])

  const emptyHintTrackId =
    project.clips.length === 0
      ? (project.tracks.find((t) => t.kind === 'video')?.id ?? project.tracks[0]?.id ?? null)
      : null

  return (
    <TooltipProvider delayDuration={350}>
      <div className="flex h-full min-h-0 flex-col">
        <TimelineToolbar />

        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollRef}
            id="nc-timeline-scroll"
            className={cn('absolute inset-0 overflow-auto', dragInfo && 'cursor-grabbing select-none')}
          >
            <div className="relative" style={{ width: contentWidth }}>
              {/* ruler row with sticky add-track corner */}
              <div className="sticky top-0 z-30 flex" style={{ height: RULER_HEIGHT }}>
                <div
                  className="sticky left-0 z-40 flex shrink-0 items-center border-b border-r border-(--nc-line) bg-(--nc-chrome) px-2"
                  style={{ width: HEADER_WIDTH }}
                >
                  <AddTrackMenu />
                </div>
                <Ruler zoom={zoom} width={laneWidth} onScrubDown={beginScrub} beatMarkers={showBeatMarkers ? beatMarkers : EMPTY_BEATS} />
              </div>

              {/* track rows */}
              {project.tracks.map((track) => {
                const clips = clipsOnTrack(project, track.id)
                const isDropTarget = dragInfo !== null && hoverTrackId === track.id && isCompatible(dragInfo.kind, track)
                return (
                  <div key={track.id} className="group/trow flex" style={{ height: TRACK_HEIGHT }}>
                    <TrackHeader track={track} canRemove={project.tracks.length > 1} />
                    <TrackLane
                      track={track}
                      clips={clips}
                      zoom={zoom}
                      fps={project.fps}
                      selectedIds={selectedIds}
                      isDropTarget={isDropTarget}
                      emptyHint={emptyHintTrackId === track.id}
                      registerLane={registerLane}
                      findLaneAt={findLaneAt}
                      onDragChange={handleDragChange}
                      onHoverTrack={handleHoverTrack}
                      onSnapLine={handleSnapLine}
                    />
                  </div>
                )
              })}

              {/* beat-sync markers — faint guides across the lanes */}
              {showBeatMarkers && beatMarkers.length > 0 && (
                <div
                  className="pointer-events-none absolute z-[6]"
                  style={{ left: HEADER_WIDTH, right: 0, top: RULER_HEIGHT, bottom: 0 }}
                  aria-hidden
                >
                  {beatMarkers.map((t, i) => (
                    <div
                      key={i}
                      className="absolute bottom-0 top-0 w-px bg-emerald-400/12"
                      style={{ left: t * zoom }}
                    />
                  ))}
                </div>
              )}

              {/* snapping guide line */}
              {snapLineX !== null && (
                <div
                  className="pointer-events-none absolute inset-y-0 z-[44] w-px bg-(--nc-warn-400) shadow-[0_0_6px_var(--nc-warn-glow)]"
                  style={{ left: HEADER_WIDTH + snapLineX }}
                />
              )}

              {/* playhead (moves with scroll — lives inside the content) */}
              <div
                className="pointer-events-none absolute inset-y-0 z-[45]"
                style={{ left: HEADER_WIDTH + currentTime * zoom }}
              >
                <div className="absolute inset-y-0 left-0 w-px bg-(--nc-accent-400) shadow-[0_0_7px_var(--nc-playhead-glow)]" />
                <div
                  onPointerDown={beginScrub}
                  className="nc-gradient pointer-events-auto absolute -left-[6px] top-0 h-[15px] w-[13px] cursor-ew-resize rounded-[4px] shadow-[0_1px_4px_rgba(0,0,0,0.6)]"
                >
                  <div className="absolute left-1/2 top-[4px] h-[6px] w-px -translate-x-1/2 bg-white/85" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}

/* ---------------- track header ---------------- */

function TrackHeader({ track, canRemove }: { track: Track; canRemove: boolean }) {
  const KindIcon = track.kind === 'video' ? Film : track.kind === 'overlay' ? Layers : AudioLines
  const patch = (p: Partial<Track>) => useEditor.getState().updateTrack(track.id, p, `track-${track.id}`)
  const iconClass = 'size-[13px]'

  return (
    <div
      className={cn(
        'sticky left-0 z-20 flex shrink-0 items-center gap-1 border-b border-r border-(--nc-line) px-2',
        track.kind === 'audio' ? 'bg-(--nc-audio-950)' : 'bg-(--nc-chrome)',
      )}
      style={{ width: HEADER_WIDTH }}
    >
      <KindIcon className={cn('size-[14px] shrink-0', track.kind === 'audio' ? 'text-emerald-400/70' : 'text-fuchsia-300/60')} />
      <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/80">{track.name}</span>

      <button
        type="button"
        aria-label={track.muted ? 'Unmute track' : 'Mute track'}
        onClick={() => patch({ muted: !track.muted })}
        className={cn(HEADER_BTN, track.muted && 'text-rose-400')}
      >
        {track.muted ? <VolumeX className={iconClass} /> : <Volume2 className={iconClass} />}
      </button>

      {track.kind !== 'audio' && (
        <button
          type="button"
          aria-label={track.hidden ? 'Show track' : 'Hide track'}
          onClick={() => patch({ hidden: !track.hidden })}
          className={cn(HEADER_BTN, track.hidden && 'text-fuchsia-400')}
        >
          {track.hidden ? <EyeOff className={iconClass} /> : <Eye className={iconClass} />}
        </button>
      )}

      <button
        type="button"
        aria-label={track.locked ? 'Unlock track' : 'Lock track'}
        onClick={() => patch({ locked: !track.locked })}
        className={cn(HEADER_BTN, track.locked && 'text-yellow-400')}
      >
        {track.locked ? <Lock className={iconClass} /> : <LockOpen className={iconClass} />}
      </button>

      <button
        type="button"
        aria-label="Remove track"
        disabled={!canRemove}
        onClick={() => useEditor.getState().removeTrack(track.id)}
        className={cn(HEADER_BTN, 'opacity-0 group-hover/trow:opacity-100 hover:text-rose-400')}
      >
        <X className={iconClass} />
      </button>
    </div>
  )
}

/* ---------------- track lane ---------------- */

interface TrackLaneProps {
  track: Track
  clips: Clip[]
  zoom: number
  fps: number
  selectedIds: string[]
  isDropTarget: boolean
  emptyHint: boolean
  registerLane: (trackId: string, el: HTMLDivElement | null) => void
  findLaneAt: (clientY: number, kind: ClipKind) => { trackId: string } | null
  onDragChange: (d: ClipDragInfo | null) => void
  onHoverTrack: (trackId: string | null) => void
  onSnapLine: (x: number | null) => void
}

function TrackLane({
  track,
  clips,
  zoom,
  fps,
  selectedIds,
  isDropTarget,
  emptyHint,
  registerLane,
  findLaneAt,
  onDragChange,
  onHoverTrack,
  onSnapLine,
}: TrackLaneProps) {
  return (
    <div
      ref={(el) => {
        registerLane(track.id, el)
      }}
      onPointerDown={() => useEditor.getState().selectClip(null)}
      className={cn(
        'nc-timeline-bg relative h-full min-w-0 flex-1 border-b border-(--nc-line)',
        track.hidden && 'opacity-40',
        isDropTarget && 'z-10 bg-fuchsia-400/5 ring-1 ring-inset ring-fuchsia-400/40',
      )}
    >
      {clips.map((clip) => (
        <ClipBlock
          key={clip.id}
          clip={clip}
          track={track}
          zoom={zoom}
          fps={fps}
          selected={selectedIds.includes(clip.id)}
          findLaneAt={findLaneAt}
          onDragChange={onDragChange}
          onHoverTrack={onHoverTrack}
          onSnapLine={onSnapLine}
        />
      ))}

      {/* locked tracks: subtle stripes under the (non-interactive) clips */}
      {track.locked && clips.length > 0 && (
        <div className="nc-checker pointer-events-none absolute inset-0 z-[5] opacity-50" />
      )}

      {emptyHint && (
        <div className="absolute inset-2 flex items-center justify-center">
          <div className="flex h-full w-full max-w-xl items-center justify-center gap-2 rounded-xl border border-dashed border-(--nc-line-strong) text-[11px] text-muted-foreground">
            <Film className="size-3.5 shrink-0" />
            Import media, then click + or drag clips here
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------------- ruler ---------------- */

function Ruler({
  zoom,
  width,
  onScrubDown,
  beatMarkers,
}: {
  zoom: number
  width: number
  onScrubDown: (e: ReactPointerEvent<HTMLDivElement>) => void
  beatMarkers: number[]
}) {
  const step = RULER_STEPS.find((s) => s * zoom >= 64) ?? 60

  const ticks = useMemo(() => {
    const out: { x: number; major: boolean; label: string }[] = []
    const majorGap = step * zoom
    const count = Math.ceil(width / majorGap)
    for (let i = 0; i <= count; i++) {
      const x = i * majorGap
      out.push({ x, major: true, label: formatShortTime(i * step) })
      for (let j = 1; j < 5; j++) {
        const mx = x + (majorGap / 5) * j
        if (mx <= width) out.push({ x: mx, major: false, label: '' })
      }
    }
    return out
  }, [step, zoom, width])

  const visibleBeats = useMemo(
    () => beatMarkers.filter((t) => t * zoom <= width + 8),
    [beatMarkers, zoom, width],
  )

  return (
    <div
      onPointerDown={onScrubDown}
      className="relative h-full min-w-0 flex-1 cursor-ew-resize overflow-hidden border-b border-(--nc-line) bg-(--nc-panel-soft)"
    >
      {ticks.map((t, i) =>
        t.major ? (
          <div key={i} className="absolute bottom-0 h-[10px] w-px bg-foreground/25" style={{ left: t.x }}>
            <span className="absolute left-1 top-[-18px] font-mono text-[9px] leading-none text-foreground/40">
              {t.label}
            </span>
          </div>
        ) : (
          <div key={i} className="absolute bottom-0 h-[5px] w-px bg-(--nc-panel-strong)" style={{ left: t.x }} />
        ),
      )}

      {/* beat-sync markers: emerald diamonds just above the tick baseline */}
      {visibleBeats.map((t, i) => (
        <div
          key={`beat-${i}`}
          className="absolute bottom-[6px] size-[5px] -translate-x-1/2 rotate-45 rounded-[1px] bg-emerald-400 shadow-[0_0_5px_var(--nc-audio-300)]"
          style={{ left: t * zoom }}
        />
      ))}
    </div>
  )
}

/* ---------------- add-track dropdown ---------------- */

function AddTrackMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-[11px] text-foreground/70 hover:text-foreground">
          <Plus className="size-3.5" />
          Track
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="nc-glass-strong border-(--nc-line)">
        <DropdownMenuItem onClick={() => useEditor.getState().addTrack('video')}>
          <Film className="mr-2 size-3.5" /> Video track
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => useEditor.getState().addTrack('overlay')}>
          <Layers className="mr-2 size-3.5" /> Overlay track
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => useEditor.getState().addTrack('audio')}>
          <AudioLines className="mr-2 size-3.5" /> Audio track
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default Timeline
