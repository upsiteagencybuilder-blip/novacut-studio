'use client'

/**
 * NovaCut Studio — Timeline
 * Bottom editor section: toolbar row, single-scroll lane area with sticky
 * header column + ruler, clip lanes, draggable playhead with scrubbing,
 * snapping guide line, playback auto-follow and the empty-state hint.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { ArrowLeft, AudioLines, Blend, Boxes, Copy, Eye, EyeOff, Film, Layers, Lock, LockOpen, Plus, Trash2, Volume2, VolumeX, X } from 'lucide-react'
import { toast } from 'sonner'
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
import { openCompound } from '@/lib/editor/nested'
import { transitionPairsForTrack } from '@/lib/editor/transitionBridge'
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
  // a compound carries its own children on their own tracks — any lane takes it
  if (kind === 'nested') return true
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
  const userMarkers = useEditor((s) => s.userMarkers)
  const toolMode = useEditor((s) => s.toolMode)
  const inPoint = useEditor((s) => s.inPoint)
  const outPoint = useEditor((s) => s.outPoint)
  // the compound being edited (open = children materialized as top-level clips)
  const session = useEditor((s) => openCompound(s.project))

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

  /* ---------------- marquee (rubber-band) selection ---------------- */

  const marqueeRef = useRef<{ additive: boolean; base: string[]; startX: number; startY: number } | null>(null)
  const [marqueeRect, setMarqueeRect] = useState<{ l: number; t: number; w: number; h: number } | null>(null)

  const beginMarquee = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const st = useEditor.getState()
    const additive = e.shiftKey || e.ctrlKey || e.metaKey
    marqueeRef.current = { additive, base: additive ? st.selectedClipIds : [], startX: e.clientX, startY: e.clientY }
    // plain click on empty lane still clears the selection
    if (!additive) st.selectClip(null)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const moveMarquee = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const m = marqueeRef.current
    if (!m) return
    const l = Math.min(m.startX, e.clientX)
    const t = Math.min(m.startY, e.clientY)
    const w = Math.abs(e.clientX - m.startX)
    const h = Math.abs(e.clientY - m.startY)
    // below the drag threshold → treat as a plain click, no rect yet
    if (w < 3 && h < 3) return
    setMarqueeRect({ l, t, w, h })
    const hits: string[] = []
    document.querySelectorAll<HTMLElement>('[data-clip-id]').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.left < l + w && r.right > l && r.top < t + h && r.bottom > t) hits.push(el.dataset.clipId!)
    })
    // inside a compound session only the members are selectable
    const open = useEditor.getState().project.clips.find((c) => c.kind === 'nested' && c.nested?.open)
    const selectable = open ? hits.filter((id) => open.nested?.memberIds?.includes(id)) : hits
    const merged = m.additive ? Array.from(new Set([...m.base, ...selectable])) : selectable
    const st = useEditor.getState()
    if (merged.length !== st.selectedClipIds.length || merged.some((id) => !st.selectedClipIds.includes(id))) {
      st.setSelection(merged)
    }
  }, [])

  const endMarquee = useCallback(() => {
    marqueeRef.current = null
    setMarqueeRect(null)
  }, [])

  const emptyHintTrackId =
    project.clips.length === 0
      ? (project.tracks.find((t) => t.kind === 'video')?.id ?? project.tracks[0]?.id ?? null)
      : null

  return (
    <TooltipProvider delayDuration={350}>
      <div className="flex h-full min-h-0 flex-col">
        <TimelineToolbar />

        {/* compound session breadcrumb — "inside the compound" indicator + exit */}
        {session && (
          <div
            data-nc-compound-bar
            className="flex h-9 shrink-0 items-center gap-2 border-b border-violet-400/30 bg-violet-950/40 px-3"
          >
            <button
              type="button"
              data-nc-compound-exit
              aria-label="Exit compound — back to the main timeline"
              onClick={() => {
                const n = session.nested?.memberIds?.length ?? 0
                const ok = useEditor.getState().exitNestedSession()
                if (ok) toast.success(`Compound saved — ${n} clip${n === 1 ? '' : 's'} packed inside`)
              }}
              className="flex h-6 items-center gap-1 rounded-full border border-violet-400/40 bg-violet-400/10 px-2 text-[11px] font-medium text-violet-200 transition hover:bg-violet-400/20"
            >
              <ArrowLeft className="size-3.5" />
              Main timeline
            </button>
            <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-violet-100/90">
              <Layers className="size-3.5 shrink-0 text-violet-300" />
              <span className="truncate font-medium">{session.name}</span>
              <span className="shrink-0 text-violet-200/60">
                — editing {session.nested?.memberIds?.length ?? 0} clip{(session.nested?.memberIds?.length ?? 0) === 1 ? '' : 's'} inside
              </span>
            </span>
            <span className="ml-auto hidden shrink-0 text-[10px] text-violet-200/50 sm:block">
              add / split / trim freely — exiting repacks everything
            </span>
          </div>
        )}

        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollRef}
            id="nc-timeline-scroll"
            className={cn('absolute inset-0 overflow-auto', dragInfo && 'cursor-grabbing select-none', toolMode === 'razor' && 'cursor-crosshair')}
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
                <Ruler
                  zoom={zoom}
                  width={laneWidth}
                  onScrubDown={beginScrub}
                  beatMarkers={showBeatMarkers ? beatMarkers : EMPTY_BEATS}
                  userMarkers={userMarkers}
                />
              </div>

              {/* track rows */}
              {project.tracks.map((track) => {
                // the OPEN compound is "away" — its materialized children render instead
                const clips = clipsOnTrack(project, track.id).filter((c) => !(c.kind === 'nested' && c.nested?.open))
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
                      sessionIds={session?.nested?.memberIds ?? null}
                      registerLane={registerLane}
                      findLaneAt={findLaneAt}
                      onDragChange={handleDragChange}
                      onHoverTrack={handleHoverTrack}
                      onSnapLine={handleSnapLine}
                      onMarqueeStart={beginMarquee}
                      onMarqueeMove={moveMarquee}
                      onMarqueeEnd={endMarquee}
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

              {/* user markers — accent guides across the lanes */}
              {userMarkers.length > 0 && (
                <div
                  className="pointer-events-none absolute z-[7]"
                  style={{ left: HEADER_WIDTH, right: 0, top: RULER_HEIGHT, bottom: 0 }}
                  aria-hidden
                >
                  {userMarkers.map((t, i) => (
                    <div
                      key={i}
                      className="absolute bottom-0 top-0 w-px bg-(--nc-accent-400)/20 shadow-[0_0_4px_var(--nc-accent-glow)]"
                      style={{ left: t * zoom }}
                    />
                  ))}
                </div>
              )}

              {/* In/Out work-area band — amber range across the lanes */}
              {inPoint !== null && outPoint !== null && outPoint > inPoint && (
                <div
                  className="pointer-events-none absolute z-[8]"
                  style={{ left: HEADER_WIDTH, right: 0, top: RULER_HEIGHT, bottom: 0 }}
                  aria-hidden
                >
                  <div
                    className="absolute inset-y-0 border-x border-amber-400/50 bg-amber-400/[0.07]"
                    style={{ left: inPoint * zoom, width: Math.max(1, (outPoint - inPoint) * zoom) }}
                  />
                </div>
              )}

              {/* In / Out ruler flags */}
              {inPoint !== null && (
                <div
                  className="pointer-events-none absolute z-[31] flex items-center"
                  style={{ left: HEADER_WIDTH + inPoint * zoom, top: 0, height: RULER_HEIGHT }}
                  aria-hidden
                >
                  <div className="absolute left-0 top-0 h-full w-px bg-amber-400/70" />
                  <span className="absolute left-0.5 top-[3px] rounded-sm bg-amber-400 px-1 text-[8px] font-bold leading-[12px] text-amber-950">
                    IN
                  </span>
                </div>
              )}
              {outPoint !== null && (
                <div
                  className="pointer-events-none absolute z-[31] flex items-center"
                  style={{ left: HEADER_WIDTH + outPoint * zoom, top: 0, height: RULER_HEIGHT }}
                  aria-hidden
                >
                  <div className="absolute left-0 top-0 h-full w-px bg-amber-400/70" />
                  <span className="absolute -left-[22px] top-[3px] rounded-sm bg-amber-400 px-1 text-[8px] font-bold leading-[12px] text-amber-950">
                    OUT
                  </span>
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

          {/* batch-selection badge — floating over the tracks while 2+ clips selected */}
          {selectedIds.length > 1 && (
            <div
              role="toolbar"
              aria-label={`${selectedIds.length} clips selected — batch actions`}
              data-nc-batch-badge
              className="absolute bottom-2 left-1/2 z-[46] flex -translate-x-1/2 items-center gap-1 rounded-full border border-fuchsia-400/40 bg-(--nc-panel-strong)/95 py-1 pr-1 pl-3 shadow-lg backdrop-blur"
            >
              <span className="text-[11px] font-medium tabular-nums text-fuchsia-200">{selectedIds.length} selected</span>
              {!session && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 rounded-full px-2 text-[11px] text-violet-200 hover:text-violet-100"
                  onClick={() => {
                    const n = selectedIds.length
                    if (useEditor.getState().groupSelectedClips()) toast.success(`Grouped ${n} clips into a compound`)
                    else toast('Compounds cannot nest — select plain clips only')
                  }}
                >
                  <Boxes className="size-3" />
                  Group
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 rounded-full px-2 text-[11px] text-foreground/80 hover:text-foreground"
                onClick={() => {
                  const n = selectedIds.length
                  useEditor.getState().duplicateSelected()
                  toast.success(`${n} clips duplicated`)
                }}
              >
                <Copy className="size-3" />
                Duplicate
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Delete ${selectedIds.length} selected clips`}
                className="h-7 w-7 rounded-full p-0 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
                onClick={() => {
                  const n = selectedIds.length
                  useEditor.getState().deleteSelected()
                  toast(`${n} clips deleted`)
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Clear selection"
                className="h-7 w-7 rounded-full p-0 text-muted-foreground hover:text-foreground"
                onClick={() => useEditor.getState().selectClip(null)}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          )}

          {/* marquee rubber-band rect (viewport space → escapes timeline scroll clipping) */}
          {marqueeRect && (
            <div
              data-nc-marquee
              aria-hidden
              className="pointer-events-none fixed z-[47] rounded-sm border border-fuchsia-300/70 bg-fuchsia-400/15"
              style={{ left: marqueeRect.l, top: marqueeRect.t, width: marqueeRect.w, height: marqueeRect.h }}
            />
          )}
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
  /** active compound session member ids — non-members render dimmed + inert */
  sessionIds: string[] | null
  registerLane: (trackId: string, el: HTMLDivElement | null) => void
  findLaneAt: (clientY: number, kind: ClipKind) => { trackId: string } | null
  onDragChange: (d: ClipDragInfo | null) => void
  onHoverTrack: (trackId: string | null) => void
  onSnapLine: (x: number | null) => void
  onMarqueeStart: (e: ReactPointerEvent<HTMLDivElement>) => void
  onMarqueeMove: (e: ReactPointerEvent<HTMLDivElement>) => void
  onMarqueeEnd: () => void
}

function TrackLane({
  track,
  clips,
  zoom,
  fps,
  selectedIds,
  isDropTarget,
  emptyHint,
  sessionIds,
  registerLane,
  findLaneAt,
  onDragChange,
  onHoverTrack,
  onSnapLine,
  onMarqueeStart,
  onMarqueeMove,
  onMarqueeEnd,
}: TrackLaneProps) {
  return (
    <div
      ref={(el) => {
        registerLane(track.id, el)
      }}
      onPointerDown={onMarqueeStart}
      onPointerMove={onMarqueeMove}
      onPointerUp={onMarqueeEnd}
      onPointerCancel={onMarqueeEnd}
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
          interactive={!sessionIds || sessionIds.includes(clip.id)}
          findLaneAt={findLaneAt}
          onDragChange={onDragChange}
          onHoverTrack={onHoverTrack}
          onSnapLine={onSnapLine}
        />
      ))}

      {/* transition chips at armed clip boundaries (true crossfades / wipe masks) */}
      <TransitionChips clips={clips} zoom={zoom} />

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

/* ---------------- transition chips ---------------- */

/**
 * Small badge at each armed transition boundary (adjacent clips where the
 * engine bridges a true crossfade or wipe). Click → select the outgoing clip
 * and open the effects panel on the Transitions category; ✕ removes the
 * transition (clears fades/wipe/iris keys, one undo step).
 */
function TransitionChips({ clips, zoom }: { clips: Clip[]; zoom: number }) {
  const pairs = useMemo(() => transitionPairsForTrack(clips), [clips])
  if (!pairs.length) return null
  return (
    <>
      {pairs.map((p) => {
        const out = clips.find((c) => c.id === p.outgoingId)
        if (!out) return null
        const x = (out.start + out.duration) * zoom
        return (
          <div
            key={`${p.outgoingId}-${p.incomingId}`}
            className="group/chip absolute z-[7] flex -translate-x-1/2 -translate-y-1/2 items-center"
            style={{ left: x, top: '50%' }}
          >
            <button
              type="button"
              aria-label={`Transition: ${(p.window * 1000).toFixed(0)}ms crossfade or wipe — click to browse transitions`}
              title={`Transition · ${(p.window).toFixed(2)}s — click to browse, ✕ to remove`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                const st = useEditor.getState()
                st.selectClip(p.outgoingId)
                // deep-link into the Transitions category — the flag covers the
                // race where the effects panel mounts after this click
                ;(window as unknown as { __ncEffectsCategoryRequest?: string }).__ncEffectsCategoryRequest = 'transition'
                st.setPanelTab('effects')
                window.dispatchEvent(new CustomEvent('nc-effects-category', { detail: 'transition' }))
              }}
              className="flex h-6 min-w-6 items-center justify-center rounded-full border border-fuchsia-400/50 bg-(--nc-panel) text-fuchsia-300 shadow-sm transition hover:scale-110 hover:border-fuchsia-300 hover:bg-(--nc-panel-strong)"
            >
              <Blend className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Remove transition"
              title="Remove transition (resets keyframes on both clips)"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                useEditor.getState().removeTransition(p.outgoingId, p.incomingId)
                toast('Transition removed')
              }}
              className="ml-0.5 hidden h-6 w-6 items-center justify-center rounded-full border border-rose-400/50 bg-(--nc-panel) text-rose-300 shadow-sm transition hover:bg-(--nc-panel-strong) group-hover/chip:flex"
            >
              <X className="size-3" />
            </button>
          </div>
        )
      })}
    </>
  )
}

/* ---------------- ruler ---------------- */

function Ruler({
  zoom,
  width,
  onScrubDown,
  beatMarkers,
  userMarkers,
}: {
  zoom: number
  width: number
  onScrubDown: (e: ReactPointerEvent<HTMLDivElement>) => void
  beatMarkers: number[]
  userMarkers: number[]
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

  const visibleUserMarkers = useMemo(
    () => userMarkers.filter((t) => t * zoom <= width + 8),
    [userMarkers, zoom, width],
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

      {/* user markers: accent bookmark flags hanging from the ruler top */}
      {visibleUserMarkers.map((t, i) => (
        <div
          key={`marker-${i}`}
          className="absolute top-0 -translate-x-1/2"
          style={{ left: t * zoom }}
        >
          <div className="size-[7px] rotate-45 rounded-[1px] bg-(--nc-accent-400) shadow-[0_0_6px_var(--nc-accent-glow)]" />
          <div className="mx-auto h-[9px] w-px bg-(--nc-accent-400)/70" />
        </div>
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
