'use client'

/**
 * NovaCut Studio — Timeline toolbar
 * Edit actions (split / duplicate / delete), snap toggle, beat-sync markers
 * (detect / show-hide / clear), project duration chip and the zoom group.
 */
import { useState } from 'react'
import {
  AudioWaveform,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Magnet,
  Maximize2,
  Scissors,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Toggle } from '@/components/ui/toggle'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { detectBeats } from '@/lib/effects/beat-detect'
import { HEADER_WIDTH } from '@/lib/editor/constants'
import { useEditor } from '@/lib/editor/store'
import { formatTimecode, projectDuration } from '@/lib/editor/utils'
import { cn } from '@/lib/utils'

export interface TimelineToolbarProps {
  className?: string
}

const TOOL_BTN = 'h-8 w-8 text-foreground/65 hover:text-foreground'

export function TimelineToolbar({ className }: TimelineToolbarProps) {
  const project = useEditor((s) => s.project)
  const currentTime = useEditor((s) => s.currentTime)
  const zoom = useEditor((s) => s.zoom)
  const snapEnabled = useEditor((s) => s.snapEnabled)
  const selectedIds = useEditor((s) => s.selectedClipIds)
  const beatMarkers = useEditor((s) => s.beatMarkers)
  const beatBpm = useEditor((s) => s.beatBpm)
  const showBeatMarkers = useEditor((s) => s.showBeatMarkers)
  const [detecting, setDetecting] = useState(false)

  const duration = projectDuration(project)
  const fps = project.fps
  const hasSelection = selectedIds.length > 0
  // mirror the store's splitAtPlayhead target logic so the button enables exactly when a split can happen
  const canSplit = selectedIds.length
    ? project.clips.some((c) => selectedIds.includes(c.id) && currentTime > c.start && currentTime < c.start + c.duration)
    : project.clips.some((c) => currentTime > c.start + 0.08 && currentTime < c.start + c.duration - 0.08)

  const setZoom = (z: number) => useEditor.getState().setZoom(z)

  const fitZoom = () => {
    const el = document.getElementById('nc-timeline-scroll')
    if (!el) return
    // lane area = container minus header column; keep 40px breathing room
    setZoom(Math.max(8, (el.clientWidth - HEADER_WIDTH - 40) / Math.max(duration, 1)))
  }

  return (
    <div
      className={cn(
        'flex h-11 shrink-0 items-center gap-1 border-b border-(--nc-line) bg-(--nc-chrome) px-2',
        className,
      )}
    >
      {/* left group — edit actions */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={TOOL_BTN}
            disabled={!canSplit}
            aria-label="Split at playhead"
            onClick={() => useEditor.getState().splitAtPlayhead()}
          >
            <Scissors className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Split at playhead (S)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={TOOL_BTN}
            disabled={!hasSelection}
            aria-label="Duplicate selected clip"
            onClick={() => {
              if (selectedIds[0]) useEditor.getState().duplicateClip(selectedIds[0])
            }}
          >
            <Copy className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Duplicate (D)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(TOOL_BTN, 'hover:bg-rose-500/10 hover:text-rose-400')}
            disabled={!hasSelection}
            aria-label="Delete selected clips"
            onClick={() => useEditor.getState().deleteSelected()}
          >
            <Trash2 className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Delete (Del)</TooltipContent>
      </Tooltip>

      <div className="mx-1.5 h-5 w-px shrink-0 bg-(--nc-panel-strong)" />

      {/* snap toggle */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            size="sm"
            pressed={snapEnabled}
            onPressedChange={() => useEditor.getState().toggleSnap()}
            aria-label="Toggle snapping"
            className={cn(
              'h-8 w-8 px-0',
              snapEnabled
                ? 'nc-gradient text-white hover:opacity-90'
                : 'text-foreground/65 hover:bg-(--nc-panel-strong) hover:text-foreground',
            )}
          >
            <Magnet className="size-4" />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent side="bottom">Snapping</TooltipContent>
      </Tooltip>

      {/* beat-sync markers (detect / show-hide / clear) */}
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(TOOL_BTN, 'relative w-9', beatMarkers.length > 0 && showBeatMarkers && 'text-emerald-300 hover:text-emerald-200')}
                disabled={detecting}
                aria-label="Beat sync markers"
              >
                {detecting ? <Loader2 className="size-4 animate-spin" /> : <AudioWaveform className="size-4" />}
                {beatBpm !== null && (
                  <span className="absolute -right-1.5 -top-1 rounded-full bg-emerald-500/90 px-1 text-[8px] font-bold leading-[13px] text-emerald-950 tabular-nums">
                    {Math.round(beatBpm)}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">Beat sync — detect beats for snapping</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="nc-glass-strong border-(--nc-line)">
          <DropdownMenuItem disabled={detecting} onClick={() => void detectBeatsFromSelection(setDetecting)}>
            <AudioWaveform className="mr-2 size-3.5" />
            Detect beats (selected clip)
          </DropdownMenuItem>
          <DropdownMenuItem disabled={beatMarkers.length === 0} onClick={() => useEditor.getState().toggleShowBeatMarkers()}>
            {showBeatMarkers ? <EyeOff className="mr-2 size-3.5" /> : <Eye className="mr-2 size-3.5" />}
            {showBeatMarkers ? 'Hide beat markers' : 'Show beat markers'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={beatMarkers.length === 0}
            className="text-rose-300 focus:text-rose-200"
            onClick={() => {
              useEditor.getState().clearBeatMarkers()
              toast('Beat markers cleared')
            }}
          >
            <Trash2 className="mr-2 size-3.5" />
            Clear beat markers
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex-1" />

      {/* duration chip */}
      <div className="flex items-center gap-1.5 rounded-md border border-(--nc-line) bg-(--nc-panel) px-2 py-1">
        <Clock3 className="size-3.5 text-fuchsia-300/80" />
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatTimecode(duration, fps)}
        </span>
      </div>

      <div className="mx-1.5 h-5 w-px shrink-0 bg-(--nc-panel-strong)" />

      {/* zoom group */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={TOOL_BTN}
            aria-label="Zoom out"
            onClick={() => setZoom(zoom / 1.3)}
          >
            <ZoomOut className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Zoom out (-)</TooltipContent>
      </Tooltip>

      <Slider
        className="w-[100px]"
        min={8}
        max={300}
        step={1}
        value={[zoom]}
        aria-label="Timeline zoom"
        onValueChange={(v) => setZoom(Array.isArray(v) ? (v[0] ?? zoom) : zoom)}
      />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={TOOL_BTN}
            aria-label="Zoom in"
            onClick={() => setZoom(zoom * 1.3)}
          >
            <ZoomIn className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Zoom in (+)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(TOOL_BTN, 'w-9')}
            aria-label="Fit timeline"
            onClick={fitZoom}
          >
            <Maximize2 className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Fit project</TooltipContent>
      </Tooltip>
    </div>
  )
}

/* ---------------- beat detection ---------------- */

/**
 * Detects beats on the selected audio/video clip and stores them as
 * timeline markers. Kept outside the component so the handler stays stable.
 */
async function detectBeatsFromSelection(setDetecting: (v: boolean) => void): Promise<void> {
  const st = useEditor.getState()
  const clip = st.project.clips.find((c) => c.id === st.selectedClipIds[0])
  if (!clip || (clip.kind !== 'audio' && clip.kind !== 'video')) {
    toast('Select an audio or video clip first — beats are detected from its audio')
    return
  }
  const asset = st.media.find((m) => m.id === clip.mediaId)
  if (!asset) {
    toast.error('Source media for this clip was not found')
    return
  }
  setDetecting(true)
  try {
    const res = await detectBeats(asset.rawBlob)
    if (res.times.length === 0) {
      st.clearBeatMarkers()
      toast('No clear beats found in this clip')
      return
    }
    st.setBeatMarkers(res.times, res.bpm)
    toast.success(
      `${res.bpm !== null ? `${Math.round(res.bpm)} BPM · ` : ''}${res.times.length} beat markers added`,
    )
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Beat detection failed')
  } finally {
    setDetecting(false)
  }
}

export default TimelineToolbar
