'use client'

/**
 * NovaCut Studio — Timeline toolbar
 * Edit actions (split / duplicate / delete), snap toggle, beat-sync markers
 * (detect / show-hide / clear), project duration chip and the zoom group.
 */
import { useState } from 'react'
import {
  ArrowLeftRight,
  AudioLines,
  AudioWaveform,
  Bookmark,
  Braces,
  ChevronsLeftRight,
  ChevronsRight,
  ChevronDown,
  Clock3,
  Copy,
  CopyPlus,
  Eye,
  EyeOff,
  ClipboardPaste,
  Slice,
  Loader2,
  Magnet,
  Maximize2,
  MoveHorizontal,
  Scissors,
  Snowflake,
  StepBack,
  StepForward,
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
  const hasClipboard = useEditor((s) => s.hasClipboard)
  const userMarkers = useEditor((s) => s.userMarkers)
  const beatMarkers = useEditor((s) => s.beatMarkers)
  const beatBpm = useEditor((s) => s.beatBpm)
  const showBeatMarkers = useEditor((s) => s.showBeatMarkers)
  const toolMode = useEditor((s) => s.toolMode)
  const inPoint = useEditor((s) => s.inPoint)
  const outPoint = useEditor((s) => s.outPoint)
  const [detecting, setDetecting] = useState(false)

  const duration = projectDuration(project)
  const fps = project.fps
  const hasSelection = selectedIds.length > 0
  // mirror the store's splitAtPlayhead target logic so the button enables exactly when a split can happen
  const canSplit = selectedIds.length
    ? project.clips.some((c) => selectedIds.includes(c.id) && currentTime > c.start && currentTime < c.start + c.duration)
    : project.clips.some((c) => currentTime > c.start + 0.08 && currentTime < c.start + c.duration - 0.08)
  // mirror the store's insertFreezeFrame target logic — any video/image under the playhead works
  const canFreeze = project.clips.some(
    (c) => (c.kind === 'video' || c.kind === 'image') && currentTime >= c.start && currentTime < c.start + c.duration,
  )
  // mirror the store's extractAudioFromVideo target logic — selected video OR video under the playhead
  const canExtract = project.clips.some(
    (c) => c.kind === 'video' && (selectedIds.includes(c.id) || (currentTime >= c.start && currentTime < c.start + c.duration)),
  )

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
      {/* left group — clipboard actions */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={TOOL_BTN}
            disabled={!hasSelection}
            aria-label="Copy selected clips"
            onClick={() => {
              useEditor.getState().copySelected()
              toast(`${selectedIds.length} clip${selectedIds.length > 1 ? 's' : ''} copied`)
            }}
          >
            <Copy className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Copy (Ctrl+C)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={TOOL_BTN}
            disabled={!hasSelection}
            aria-label="Cut selected clips"
            onClick={() => {
              useEditor.getState().cutSelected()
              toast('Clip cut to clipboard')
            }}
          >
            <Slice className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Cut (Ctrl+X)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={TOOL_BTN}
            disabled={!hasClipboard}
            aria-label="Paste clips at playhead"
            onClick={() => {
              const before = useEditor.getState().project.clips.length
              useEditor.getState().pasteAtPlayhead()
              const added = useEditor.getState().project.clips.length - before
              if (added > 0) toast.success(`${added} clip${added > 1 ? 's' : ''} pasted at playhead`)
            }}
          >
            <ClipboardPaste className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Paste at playhead (Ctrl+V)</TooltipContent>
      </Tooltip>

      <div className="mx-1.5 h-5 w-px shrink-0 bg-(--nc-panel-strong)" />

      {/* edit actions */}
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

      {/* freeze frame — capture the current frame as a 3s still, ripple-inserted */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={TOOL_BTN}
            disabled={!canFreeze}
            aria-label="Insert freeze frame at playhead"
            onClick={async () => {
              const ok = await useEditor.getState().insertFreezeFrame()
              if (ok) toast.success('Freeze frame inserted ❄️ — 3s still, clips ripple right')
              else toast('Move the playhead over a video or image clip')
            }}
          >
            <Snowflake className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Freeze frame at playhead</TooltipContent>
      </Tooltip>

      {/* extract audio — detach the video soundtrack into an editable audio clip */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={TOOL_BTN}
            disabled={!canExtract}
            aria-label="Extract audio from video clip"
            onClick={async () => {
              const res = await useEditor.getState().extractAudioFromVideo()
              if (res === 'ok') toast.success('Audio extracted — new clip on the audio track, video sound muted')
              else if (res === 'no-audio') toast.error('This video has no audio track to extract')
              else toast('Select a video clip or move the playhead over one')
            }}
          >
            <AudioLines className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Extract audio from video</TooltipContent>
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
            <CopyPlus className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Duplicate (D)</TooltipContent>
      </Tooltip>

      {/* delete split-button — plain delete, or ripple delete via the chevron menu */}
      <div className="flex items-center">
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(TOOL_BTN, '-ml-1.5 w-4 min-w-0 px-0')}
              disabled={!hasSelection}
              aria-label="More delete options"
            >
              <ChevronDown className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="nc-glass-strong border-(--nc-line)">
            <DropdownMenuItem
              className="text-rose-300 focus:text-rose-200"
              onClick={() => {
                useEditor.getState().rippleDeleteSelected()
                toast('Clips removed — gap closed (ripple delete)')
              }}
            >
              <Trash2 className="mr-2 size-3.5" />
              Ripple delete — close the gap (Shift+Del)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

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

      {/* user markers — add / remove / clear */}
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(TOOL_BTN, 'relative w-9', userMarkers.length > 0 && 'text-(--nc-accent-300) hover:text-(--nc-accent-200)')}
                aria-label="Timeline markers"
              >
                <Bookmark className="size-4" />
                {userMarkers.length > 0 && (
                  <span className="absolute -right-1.5 -top-1 rounded-full bg-(--nc-accent-400) px-1 text-[8px] font-bold leading-[13px] text-white tabular-nums">
                    {userMarkers.length}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">Markers — drop & jump points (Shift+M)</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="nc-glass-strong border-(--nc-line)">
          <DropdownMenuItem onClick={() => useEditor.getState().addMarkerAtPlayhead()}>
            <Bookmark className="mr-2 size-3.5" />
            Add marker at playhead (Shift+M)
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={userMarkers.length === 0}
            onClick={() => useEditor.getState().removeMarkerAtPlayhead()}
          >
            <Bookmark className="mr-2 size-3.5 opacity-50" />
            Remove marker at playhead
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={userMarkers.length === 0}
            className="text-rose-300 focus:text-rose-200"
            onClick={() => {
              useEditor.getState().clearUserMarkers()
              toast('All markers cleared')
            }}
          >
            <Trash2 className="mr-2 size-3.5" />
            Clear all markers
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
          <DropdownMenuItem
            disabled={beatMarkers.length === 0 || !hasSelection}
            onClick={() => {
              const n = alignSelectedClipsToBeats()
              if (n > 0) toast.success(`${n} clip${n === 1 ? '' : 's'} aligned to beats`)
            }}
          >
            <Magnet className="mr-2 size-3.5" />
            Align selected clips to beats
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

      {/* ---- pro cluster: blade tool / in-out / edit-point navigation ---- */}

      {/* blade (razor) tool — click a clip to split at the click position */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            size="sm"
            pressed={toolMode === 'razor'}
            onPressedChange={() => useEditor.getState().setToolMode(toolMode === 'razor' ? 'select' : 'razor')}
            aria-label="Blade tool"
            className={cn(
              'h-8 w-8 px-0',
              toolMode === 'razor'
                ? 'nc-gradient text-white hover:opacity-90'
                : 'text-foreground/65 hover:bg-(--nc-panel-strong) hover:text-foreground',
            )}
          >
            <Scissors className="size-4" />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent side="bottom">Blade tool (B) — click a clip to cut it · Esc exits</TooltipContent>
      </Tooltip>

      {/* ---- pro trim modes: ripple / roll / slip / slide (G / N / Y / U) ---- */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            size="sm"
            pressed={toolMode === 'ripple'}
            onPressedChange={() => {
              const next = toolMode === 'ripple' ? 'select' : 'ripple'
              useEditor.getState().setToolMode(next)
              toast(next === 'ripple' ? 'Ripple edit — drags close the gap' : 'Select tool', { duration: 1400 })
            }}
            aria-label="Ripple edit tool"
            className={cn(
              'h-8 w-8 px-0',
              toolMode === 'ripple'
                ? 'nc-gradient text-white hover:opacity-90'
                : 'text-foreground/65 hover:bg-(--nc-panel-strong) hover:text-foreground',
            )}
          >
            <ChevronsRight className="size-4" />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent side="bottom">Ripple edit (G) — move or trim a clip, same-track followers close the gap</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            size="sm"
            pressed={toolMode === 'roll'}
            onPressedChange={() => {
              const next = toolMode === 'roll' ? 'select' : 'roll'
              useEditor.getState().setToolMode(next)
              toast(next === 'roll' ? 'Roll edit — drag the cut between adjacent clips' : 'Select tool', { duration: 1400 })
            }}
            aria-label="Roll edit tool"
            className={cn(
              'h-8 w-8 px-0',
              toolMode === 'roll'
                ? 'nc-gradient text-white hover:opacity-90'
                : 'text-foreground/65 hover:bg-(--nc-panel-strong) hover:text-foreground',
            )}
          >
            <ChevronsLeftRight className="size-4" />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent side="bottom">Roll edit (N) — drag a cut between adjacent clips; total length unchanged</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            size="sm"
            pressed={toolMode === 'slip'}
            onPressedChange={() => {
              const next = toolMode === 'slip' ? 'select' : 'slip'
              useEditor.getState().setToolMode(next)
              toast(next === 'slip' ? 'Slip — drag a clip body to slide its media window' : 'Select tool', { duration: 1400 })
            }}
            aria-label="Slip tool"
            className={cn(
              'h-8 w-8 px-0',
              toolMode === 'slip'
                ? 'nc-gradient text-white hover:opacity-90'
                : 'text-foreground/65 hover:bg-(--nc-panel-strong) hover:text-foreground',
            )}
          >
            <MoveHorizontal className="size-4" />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent side="bottom">Slip (Y) — drag a clip body to slide its source in/out without moving the clip</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            size="sm"
            pressed={toolMode === 'slide'}
            onPressedChange={() => {
              const next = toolMode === 'slide' ? 'select' : 'slide'
              useEditor.getState().setToolMode(next)
              toast(next === 'slide' ? 'Slide — neighbors absorb the move' : 'Select tool', { duration: 1400 })
            }}
            aria-label="Slide tool"
            className={cn(
              'h-8 w-8 px-0',
              toolMode === 'slide'
                ? 'nc-gradient text-white hover:opacity-90'
                : 'text-foreground/65 hover:bg-(--nc-panel-strong) hover:text-foreground',
            )}
          >
            <ArrowLeftRight className="size-4" />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent side="bottom">Slide (U) — drag a clip between its neighbors; they stretch to absorb it</TooltipContent>
      </Tooltip>

      {/* In / Out points — mark, go-to, clear, lift, extract */}
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  TOOL_BTN,
                  'relative w-9',
                  (inPoint !== null || outPoint !== null) && 'text-amber-300 hover:text-amber-200',
                )}
                aria-label="In and Out points"
              >
                <Braces className="size-4" />
                {(inPoint !== null || outPoint !== null) && (
                  <span className="absolute -right-1.5 -top-1 rounded-full bg-amber-400 px-1 text-[8px] font-bold leading-[13px] text-amber-950 tabular-nums">
                    {inPoint !== null && outPoint !== null ? 'IO' : inPoint !== null ? 'I' : 'O'}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">In / Out points (I / O) — range edits</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="nc-glass-strong border-(--nc-line)">
          <DropdownMenuItem onClick={() => useEditor.getState().markIn()}>
            <Braces className="mr-2 size-3.5" />
            Mark In at playhead (I)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => useEditor.getState().markOut()}>
            <Braces className="mr-2 size-3.5 opacity-60" />
            Mark Out at playhead (O)
          </DropdownMenuItem>
          <DropdownMenuItem disabled={inPoint === null} onClick={() => inPoint !== null && useEditor.getState().setCurrentTime(inPoint)}>
            <StepBack className="mr-2 size-3.5" />
            Go to In (Shift+I)
          </DropdownMenuItem>
          <DropdownMenuItem disabled={outPoint === null} onClick={() => outPoint !== null && useEditor.getState().setCurrentTime(outPoint)}>
            <StepForward className="mr-2 size-3.5" />
            Go to Out (Shift+O)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={inPoint === null || outPoint === null}
            onClick={() => {
              if (useEditor.getState().liftInOut()) toast.success('Range lifted — gap kept')
              else toast('Mark In (I) and Out (O) first')
            }}
          >
            <Scissors className="mr-2 size-3.5 opacity-60" />
            Lift range — keep gap (')
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={inPoint === null || outPoint === null}
            onClick={() => {
              if (useEditor.getState().extractInOut()) toast.success('Range extracted — gap closed')
              else toast('Mark In (I) and Out (O) first')
            }}
          >
            <Slice className="mr-2 size-3.5" />
            Extract range — close gap (;)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={inPoint === null && outPoint === null}
            className="text-rose-300 focus:text-rose-200"
            onClick={() => {
              useEditor.getState().clearInOut()
              toast('In & Out points cleared')
            }}
          >
            <Trash2 className="mr-2 size-3.5" />
            Clear In & Out (Ctrl+Shift+X)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* jump between edit points (clip edges + markers) */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={TOOL_BTN}
            aria-label="Previous edit point"
            onClick={() => useEditor.getState().jumpEdit(-1)}
          >
            <StepBack className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Previous edit point (↑)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={TOOL_BTN}
            aria-label="Next edit point"
            onClick={() => useEditor.getState().jumpEdit(1)}
          >
            <StepForward className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Next edit point (↓)</TooltipContent>
      </Tooltip>

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
 * Detects beats for the timeline: from the selected audio/video clip, or —
 * when the selection is empty or carries no audio — auto-picked from the
 * longest audio clip on an audio track (the music bed), so one tap works.
 */
async function detectBeatsFromSelection(setDetecting: (v: boolean) => void): Promise<void> {
  const st = useEditor.getState()
  let clip = st.project.clips.find((c) => c.id === st.selectedClipIds[0])
  let autoPicked = false
  if (!clip || (clip.kind !== 'audio' && clip.kind !== 'video')) {
    // auto-pick: prefer dedicated audio clips (music), fall back to any video audio
    const audioClips = st.project.clips.filter((c) => c.kind === 'audio').sort((a, b) => b.duration - a.duration)
    clip = audioClips[0] ?? st.project.clips.filter((c) => c.kind === 'video').sort((a, b) => b.duration - a.duration)[0]
    autoPicked = clip !== undefined
    if (clip) st.selectClip(clip.id, false)
  }
  if (!clip || (clip.kind !== 'audio' && clip.kind !== 'video')) {
    toast('Add an audio or video clip first — beats are detected from its audio')
    return
  }
  const asset = st.media.find((m) => m.id === clip.mediaId)
  if (!asset) {
    toast.error('Source media for this clip was not found')
    return
  }
  const target = clip
  setDetecting(true)
  try {
    const res = await detectBeats(asset.rawBlob)
    if (res.times.length === 0) {
      st.clearBeatMarkers()
      toast('No clear beats found in this clip')
      return
    }
    // beats are detected in SOURCE time — map them to TIMELINE time so the
    // ruler guides and snap targets land exactly where the beats are audible:
    // timeline = clip.start + (sourceT - inPoint) / speed (in-point beats dropped)
    const shifted = res.times
      .map((t) => target.start + (t - target.trimStart) / (target.speed || 1))
      .filter((t) => t >= 0)
    st.setBeatMarkers(shifted, res.bpm)
    toast.success(
      `${res.bpm !== null ? `${Math.round(res.bpm)} BPM · ` : ''}${res.times.length} beat markers added${autoPicked ? ` — from ${target.name}` : ''}`,
    )
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Beat detection failed')
  } finally {
    setDetecting(false)
  }
}

/**
 * Quantizes the start of every selected clip to its nearest beat marker
 * (tolerance = half the median beat gap, capped at 0.6 s) so cuts land on
 * the music. Returns how many clips actually moved.
 */
function alignSelectedClipsToBeats(): number {
  const st = useEditor.getState()
  const beats = st.beatMarkers
  if (beats.length < 2) {
    toast('Detect beats first — then clips can align to them')
    return 0
  }
  // tolerance = half the median inter-beat gap (capped) so nothing jumps absurdly
  const gaps: number[] = []
  for (let i = 1; i < beats.length; i++) gaps.push(beats[i]! - beats[i - 1]!)
  gaps.sort((a, b) => a - b)
  const tolerance = Math.min(0.6, (gaps[Math.floor(gaps.length / 2)] ?? 0.5) / 2)

  let moved = 0
  for (const clip of st.project.clips) {
    if (!st.selectedClipIds.includes(clip.id)) continue
    let best = beats[0]!
    let bestDist = Infinity
    for (const b of beats) {
      const d = Math.abs(b - clip.start)
      if (d < bestDist) {
        bestDist = d
        best = b
      }
    }
    if (bestDist > tolerance || bestDist < 0.005) continue
    st.moveClip(clip.id, Math.max(0, best), clip.trackId, `beat-align-${clip.id}`)
    moved++
  }
  if (moved === 0) toast('Selected clips are already on the beat grid')
  return moved
}

export default TimelineToolbar
