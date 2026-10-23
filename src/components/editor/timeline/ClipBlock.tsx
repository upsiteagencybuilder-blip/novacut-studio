'use client'

/**
 * NovaCut Studio — ClipBlock
 * The interaction core of the timeline: per-kind rendering plus MOVE /
 * TRIM-START / TRIM-END pointer drags with live store updates (coalesced
 * history keys), snapping to playhead & clip edges, cross-track moves and a
 * floating drag tooltip.
 */
import { useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Type } from 'lucide-react'
import { MIN_CLIP_DURATION, TRACK_HEIGHT } from '@/lib/editor/constants'
import { stickerGlyph, stickerName } from '@/lib/editor/sticker-render'
import { useEditor } from '@/lib/editor/store'
import { clamp, formatShortTime, formatTimecode, snapTime } from '@/lib/editor/utils'
import type { Clip, ClipKind, Track } from '@/lib/editor/types'
import { cn } from '@/lib/utils'

/** Lane hit result returned by the Timeline geometry lookup */
export interface LaneHit {
  trackId: string
}

/** Broadcast while a clip drag is active (used for drop-target highlighting) */
export interface ClipDragInfo {
  clipId: string
  kind: ClipKind
}

interface ClipBlockProps {
  clip: Clip
  /** owning track — kind compatibility + locked/hidden state */
  track: Track
  /** px per second */
  zoom: number
  selected: boolean
  fps: number
  /** returns the compatible lane under a screen Y coordinate, or null */
  findLaneAt: (clientY: number, kind: ClipKind) => LaneHit | null
  onDragChange: (drag: ClipDragInfo | null) => void
  onHoverTrack: (trackId: string | null) => void
  /** snapped x position in lane px (for the amber guide line), or null */
  onSnapLine: (x: number | null) => void
}

type DragMode = 'move' | 'trim-start' | 'trim-end'

interface DragOrigin {
  start: number
  duration: number
  trimStart: number
  speed: number
  sourceDuration: number
  trackId: string
}

/** frozen positions of every other selected clip, captured once at group-drag start */
interface GroupOrigin {
  id: string
  start: number
  trackId: string
}

const DRAG_THRESHOLD_PX = 2

export function ClipBlock({
  clip,
  track,
  zoom,
  selected,
  fps,
  findLaneAt,
  onDragChange,
  onHoverTrack,
  onSnapLine,
}: ClipBlockProps) {
  const [dragMode, setDragMode] = useState<DragMode | null>(null)
  const [tip, setTip] = useState<string | null>(null)

  // drag bookkeeping lives in refs so pointermove stays allocation-free
  const activeRef = useRef(false)
  const startedRef = useRef(false)
  const modeRef = useRef<DragMode>('move')
  const startXRef = useRef(0)
  const origRef = useRef<DragOrigin | null>(null)
  const hoverLaneRef = useRef<string | null>(null)
  const groupOrigRef = useRef<GroupOrigin[] | null>(null)
  /** was the clip already inside the selection when the pointer went down? */
  const wasSelectedRef = useRef(false)
  /** touch: deferred replace-select (tap) vs long-press additive select */
  const longPressRef = useRef<number | null>(null)
  const pendingSelectRef = useRef(false)

  const asset = useEditor((s) => (clip.mediaId ? s.media.find((m) => m.id === clip.mediaId) : undefined))
  const razorMode = useEditor((s) => s.toolMode === 'razor')

  const isMedia = clip.kind === 'video' || clip.kind === 'audio'
  const widthPx = Math.max(clip.duration * zoom, 8)

  /* ---------------- drag plumbing ---------------- */

  const beginDrag = (e: ReactPointerEvent<HTMLDivElement>, mode: DragMode) => {
    e.stopPropagation()
    e.preventDefault()
    if (e.button !== 0 || track.locked) return
    const st0 = useEditor.getState()
    wasSelectedRef.current = st0.selectedClipIds.includes(clip.id)
    if (!wasSelectedRef.current) {
      // clip outside the current selection → select (or toggle into) it.
      // Touch defers the decision: tap = replace-select, long-press = ADD to
      // the multi-selection, drag = replace-select then move.
      if (e.pointerType === 'touch') {
        pendingSelectRef.current = true
        longPressRef.current = window.setTimeout(() => {
          longPressRef.current = null
          if (!activeRef.current || startedRef.current) return
          pendingSelectRef.current = false
          useEditor.getState().selectClip(clip.id, true)
        }, 380)
      } else {
        st0.selectClip(clip.id, e.shiftKey || e.ctrlKey || e.metaKey)
      }
    }
    // if the clip was already selected the WHOLE selection is kept — dragging
    // a member of a multi-selection must never collapse it to one clip
    e.currentTarget.setPointerCapture(e.pointerId)
    activeRef.current = true
    startedRef.current = false
    modeRef.current = mode
    startXRef.current = e.clientX
    hoverLaneRef.current = null
    origRef.current = {
      start: clip.start,
      duration: clip.duration,
      trimStart: clip.trimStart,
      speed: clip.speed,
      sourceDuration: clip.sourceDuration,
      trackId: clip.trackId,
    }
    // group-move: freeze the other selected clips' positions once, at drag start
    const st = useEditor.getState()
    groupOrigRef.current =
      st.selectedClipIds.includes(clip.id) && st.selectedClipIds.length > 1
        ? st.project.clips
            .filter((c) => st.selectedClipIds.includes(c.id) && c.id !== clip.id)
            .map((c) => ({ id: c.id, start: c.start, trackId: c.trackId }))
        : null
    setDragMode(mode)
    onDragChange({ clipId: clip.id, kind: clip.kind })
    document.body.style.userSelect = 'none'
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // blade (razor) tool: click splits the clip at the clicked position — no drag
    const st = useEditor.getState()
    if (st.toolMode === 'razor') {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      const rect = e.currentTarget.getBoundingClientRect()
      const t = clip.start + (e.clientX - rect.left) / zoom
      if (t > clip.start + 0.04 && t < clip.start + clip.duration - 0.04) {
        st.splitClip(clip.id, t)
      }
      return
    }
    const attr = (e.target as HTMLElement).closest('[data-drag]')?.getAttribute('data-drag')
    beginDrag(e, attr === 'trim-start' || attr === 'trim-end' ? attr : 'move')
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const orig = origRef.current
    if (!activeRef.current || !orig) return
    if (!startedRef.current) {
      if (Math.abs(e.clientX - startXRef.current) < DRAG_THRESHOLD_PX) return
      startedRef.current = true
      if (longPressRef.current !== null) {
        window.clearTimeout(longPressRef.current)
        longPressRef.current = null
      }
      if (pendingSelectRef.current) {
        // real drag on a touch pointer that hadn't been selected yet
        pendingSelectRef.current = false
        useEditor.getState().selectClip(clip.id)
      }
    }
    const st = useEditor.getState()
    const dx = (e.clientX - startXRef.current) / zoom

    // beat-sync markers AND user markers act as snap targets while visible
    if (modeRef.current === 'move') {
      let newStart = Math.max(0, orig.start + dx)
      let snappedPx: number | null = null
      if (st.snapEnabled) {
        const targets: number[] = [0, st.currentTime]
        for (const c of st.project.clips) {
          if (c.id === clip.id) continue
          targets.push(c.start, c.start + c.duration)
        }
        if (st.showBeatMarkers && st.beatMarkers.length > 0) targets.push(...st.beatMarkers)
        if (st.userMarkers.length > 0) targets.push(...st.userMarkers)
        const snap = snapTime(newStart, targets, 8, zoom)
        if (snap.snapped) {
          newStart = snap.value
          snappedPx = snap.value * zoom
        }
      }
      const hit = findLaneAt(e.clientY, clip.kind)
      hoverLaneRef.current = hit?.trackId ?? null
      onHoverTrack(hoverLaneRef.current)
      st.moveClip(clip.id, newStart, hoverLaneRef.current ?? orig.trackId, `move-${clip.id}`)
      // group-move: shift every other selected clip by the SAME delta the primary
      // clip actually moved (including its snap), keeping their own tracks
      if (groupOrigRef.current) {
        const groupDx = newStart - orig.start
        for (const g of groupOrigRef.current) {
          st.moveClip(g.id, Math.max(0, g.start + groupDx), g.trackId, `move-${clip.id}`)
        }
      }
      onSnapLine(snappedPx)
      setTip(`${formatTimecode(newStart, fps)} · ${formatShortTime(clip.duration)}`)
      return
    }

    if (modeRef.current === 'trim-start') {
      // media clips cannot reveal frames before the source start;
      // text/sticker/image can only grow until start hits 0
      const minStart = isMedia
        ? Math.max(0, orig.start - orig.trimStart / orig.speed)
        : Math.max(0, orig.start - orig.duration + MIN_CLIP_DURATION)
      const newStart = clamp(orig.start + dx, minStart, orig.start + orig.duration - MIN_CLIP_DURATION)
      const delta = newStart - orig.start
      const newDuration = orig.duration - delta
      const newTrimStart = Math.max(0, orig.trimStart + delta * orig.speed)
      st.trimClip(
        clip.id,
        isMedia
          ? { start: newStart, trimStart: newTrimStart, duration: newDuration }
          : { start: newStart, duration: newDuration },
        `trim-${clip.id}`,
      )
      setTip(`${formatTimecode(newStart, fps)} · ${formatShortTime(newDuration)}`)
      return
    }

    // trim-end
    const maxDuration = isMedia ? (orig.sourceDuration - orig.trimStart) / orig.speed : 3600
    const newDuration = clamp(orig.duration + dx, MIN_CLIP_DURATION, maxDuration)
    st.trimClip(clip.id, { duration: newDuration }, `trim-${clip.id}`)
    setTip(`${formatTimecode(clip.start, fps)} · ${formatShortTime(newDuration)}`)
  }

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!activeRef.current) return
    if (longPressRef.current !== null) {
      window.clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
    // touch tap on an unselected clip (no long-press, no drag) → select it
    if (!startedRef.current && pendingSelectRef.current) {
      pendingSelectRef.current = false
      useEditor.getState().selectClip(clip.id)
    }
    pendingSelectRef.current = false
    // modifier-click on an already-selected clip with no drag movement →
    // toggle it back OFF (deselect from the multi-selection)
    if (!startedRef.current && wasSelectedRef.current && (e.shiftKey || e.ctrlKey || e.metaKey)) {
      useEditor.getState().selectClip(clip.id, true)
    }
    activeRef.current = false
    startedRef.current = false
    wasSelectedRef.current = false
    origRef.current = null
    groupOrigRef.current = null
    hoverLaneRef.current = null
    const el = e.currentTarget
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    setDragMode(null)
    setTip(null)
    onDragChange(null)
    onHoverTrack(null)
    onSnapLine(null)
    document.body.style.userSelect = ''
  }

  /* ---------------- visuals ---------------- */

  const kindBorderBg =
    clip.kind === 'audio'
      ? 'border-emerald-500/30 bg-emerald-950/60'
      : clip.kind === 'text'
        ? 'border-orange-500/30 bg-orange-950/50'
        : clip.kind === 'sticker'
          ? 'border-yellow-500/30 bg-yellow-950/40'
          : 'border-(--nc-line) bg-(--nc-scrim)'

  return (
    <div
      data-drag="move"
      data-clip-id={clip.id}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={cn(
        'absolute touch-none select-none',
        track.locked
          ? 'pointer-events-none cursor-default'
          : razorMode
            ? 'cursor-crosshair'
            : 'cursor-grab',
        dragMode === 'move' && 'cursor-grabbing',
      )}
      style={{
        left: clip.start * zoom,
        top: 4,
        width: widthPx,
        height: TRACK_HEIGHT - 10,
        zIndex: dragMode ? 30 : selected ? 20 : 10,
      }}
    >
      <div
        className={cn(
          'nc-clip relative h-full w-full overflow-hidden rounded-lg border',
          kindBorderBg,
          selected && 'nc-clip-selected ring-2 ring-(--nc-accent-400) shadow-[0_0_16px_var(--nc-accent-glow)]',
        )}
      >
        {/* filmstrip background for video / image */}
        {asset && (clip.kind === 'video' || clip.kind === 'image') && (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${asset.thumbnail})`,
              backgroundSize: 'auto 100%',
              backgroundRepeat: 'repeat-x',
              backgroundPosition: `${-clip.trimStart * clip.speed * zoom}px center`,
            }}
          />
        )}
        {(clip.kind === 'video' || clip.kind === 'image') && (
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(to right, rgba(0,0,0,0.55), transparent 45%)' }}
          />
        )}

        {/* waveform for audio */}
        {clip.kind === 'audio' && <Waveform peaks={asset?.peaks} widthPx={widthPx} />}

        {/* label row */}
        {clip.kind === 'text' ? (
          <div className="flex items-center gap-1 px-1.5 pt-1">
            <Type className="size-3 shrink-0 text-(--nc-texttrack)" />
            <span className="truncate text-[10px] font-medium text-(--nc-clip-ink)">
              {clip.textStyle?.content || clip.name}
            </span>
          </div>
        ) : clip.kind === 'sticker' ? (
          <div className="flex items-center gap-1.5 px-1.5 pt-1">
            <span className="text-base leading-none">{stickerGlyph(clip.sticker)}</span>
            <span className="truncate text-[10px] font-medium text-(--nc-clip-ink)">{stickerName(clip.sticker)}</span>
          </div>
        ) : (
          <div className="truncate px-1.5 pt-1 text-[10px] font-medium text-(--nc-clip-ink)">{clip.name}</div>
        )}

        {/* duration badge */}
        <div className="absolute bottom-0.5 left-1.5 text-[9px] tabular-nums text-(--nc-clip-ink-soft)">
          {formatShortTime(clip.duration)}
        </div>

        {/* fade in / out overlays */}
        {clip.fadeIn > 0 && (
          <div
            className="pointer-events-none absolute bottom-0 left-0 top-[3px]"
            style={{
              width: Math.min(clip.fadeIn * zoom, widthPx),
              background: 'linear-gradient(to right, rgba(0,0,0,0.72), transparent)',
            }}
          />
        )}
        {clip.fadeOut > 0 && (
          <div
            className="pointer-events-none absolute bottom-0 right-0 top-[3px]"
            style={{
              width: Math.min(clip.fadeOut * zoom, widthPx),
              background: 'linear-gradient(to left, rgba(0,0,0,0.72), transparent)',
            }}
          />
        )}

        {/* label color strip */}
        <div className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: clip.color }} />

        {/* trim handles (revealed by .nc-clip hover/selected CSS) */}
        <div
          data-drag="trim-start"
          className="nc-clip-handle absolute left-0 top-0 h-full w-2 cursor-ew-resize rounded-l-lg bg-(--nc-clip-handle)"
        />
        <div
          data-drag="trim-end"
          className="nc-clip-handle absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r-lg bg-(--nc-clip-handle)"
        />
      </div>

      {/* floating drag tooltip */}
      {tip && (
        <div className="pointer-events-none absolute -top-7 left-0 z-50 whitespace-nowrap rounded-md border border-(--nc-line) bg-(--nc-scrim-strong) px-2 py-1 font-mono text-[10px] text-white shadow-lg">
          {tip}
        </div>
      )}
    </div>
  )
}

/** SVG waveform bars from normalized peaks (0..1); sine placeholder when absent */
function Waveform({ peaks, widthPx }: { peaks?: number[]; widthPx: number }) {
  const bars = useMemo(() => {
    const n = clamp(Math.floor(widthPx / 3), 6, 240)
    return Array.from({ length: n }, (_, i) => {
      if (peaks && peaks.length > 0) {
        const v = peaks[Math.min(peaks.length - 1, Math.floor((i / n) * peaks.length))] ?? 0
        return clamp(Math.abs(v), 0.06, 1) * 100
      }
      return (0.35 + 0.3 * Math.sin(i * 0.9)) * 100
    })
  }, [peaks, widthPx])

  return (
    <div className="pointer-events-none absolute inset-x-0 top-[20%] h-[60%]">
      <svg width="100%" height="100%" viewBox={`0 0 ${bars.length} 100`} preserveAspectRatio="none" className="block">
        {bars.map((h, i) => (
          <rect key={i} x={i + 0.2} y={50 - h / 2} width={0.6} height={h} className="fill-(--nc-audio)" opacity={0.8} />
        ))}
      </svg>
    </div>
  )
}

export default ClipBlock
