'use client'

/**
 * NovaCut Studio — Timeline toolbar
 * Edit actions (split / duplicate / delete), snap toggle, project duration
 * chip and the zoom group (out / slider / in / fit).
 */
import { Clock3, Copy, Magnet, Maximize2, Scissors, Trash2, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
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

export default TimelineToolbar
