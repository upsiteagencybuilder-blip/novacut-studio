'use client'

/**
 * NovaCut Studio — Day 65: visual History panel.
 *
 * Every edit pushes a labeled snapshot; this panel shows the undo/redo
 * stacks as one readable timeline (redo entries on top, current state in
 * the middle, undo history below). Click any entry to jump straight to it
 * (batched undo/redo). Labels come from the actions themselves — the panel
 * never guesses what happened. Depth is disclosed honestly (150 steps).
 */
import { useEffect, useMemo, useRef } from 'react'
import { CornerDownRight, History, Redo2, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useEditor } from '@/lib/editor/store'
import { HISTORY_LIMIT } from '@/lib/editor/store'

/** human label for a history key (keys are kebab ids used across the app) */
function prettyLabel(key: string): string {
  const map: Record<string, string> = {
    edit: 'Edit',
    'marker-edit': 'Marker renamed',
    'marker-drag': 'Marker moved',
    'marker-add': 'Marker added',
    'marker-remove': 'Marker removed',
    'clip-move': 'Clip moved',
    'clip-trim': 'Clip trimmed',
    'clip-split': 'Clip split',
    'clip-delete': 'Clip deleted',
    'clip-add': 'Clip added',
    'clip-duplicate': 'Clip duplicated',
    'track-add': 'Track added',
    'track-remove': 'Track removed',
    'track-patch': 'Track updated',
    'text-edit': 'Text edited',
    'color-grade': 'Color adjusted',
    'filter-apply': 'Filter applied',
    'transition-add': 'Transition armed',
    'transition-remove': 'Transition removed',
    'audio-fx': 'Audio effect changed',
    'keyframe-edit': 'Keyframe changed',
    'nested-pack': 'Compound packed',
    'nested-exit': 'Compound unpacked',
    'project-new': 'New project',
    'project-load': 'Project loaded',
    'demo-load': 'Demo loaded',
    'media-import': 'Media imported',
    'media-remove': 'Media removed',
    'caption-add': 'Caption added',
    'speed-change': 'Speed changed',
    'crop-change': 'Crop changed',
    'volume-change': 'Volume changed',
    'paste-clipboard': 'Pasted clips',
    'razor-cut': 'Razor cut',
  }
  if (map[key]) return map[key]
  return key
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function relTime(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

export function HistoryPanelDialog() {
  const open = useEditor((s) => s.activeDialog === 'history')
  const historyPast = useEditor((s) => s.historyPast)
  const historyFuture = useEditor((s) => s.historyFuture)
  const listRef = useRef<HTMLDivElement>(null)

  // entries oldest→newest; the panel renders newest-first
  const past = useMemo(() => historyPast.map((h, i) => ({ ...h, steps: historyPast.length - i })), [historyPast])
  const future = useMemo(() => historyFuture.map((h, i) => ({ ...h, steps: i + 1 })), [historyFuture])

  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: 0 })
  }, [open])

  const jumpBack = (steps: number) => {
    const st = useEditor.getState()
    st.undoSteps(steps)
    toast(`Jumped back ${steps} step${steps === 1 ? '' : 's'}`)
  }
  const jumpForward = (steps: number) => {
    const st = useEditor.getState()
    st.redoSteps(steps)
    toast(`Re-applied ${steps} step${steps === 1 ? '' : 's'}`)
  }

  if (!open) return null

  return (
    <Dialog open onOpenChange={(o) => !o && useEditor.getState().openDialog(null)}>
      <DialogContent className="max-h-[85vh] overflow-hidden p-0 sm:max-w-md" data-nc-history-dialog>
        <DialogHeader className="border-b border-(--nc-line) px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <History className="h-4 w-4 text-amber-400" />
            Edit history
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            {past.length} undoable · {future.length} re-doable · depth {HISTORY_LIMIT} steps. Click any entry to jump there.
          </DialogDescription>
        </DialogHeader>

        <div ref={listRef} className="max-h-[60vh] space-y-1 overflow-y-auto px-3 py-3" data-nc-history-list>
          {/* redo stack — re-appliable future */}
          {future.length > 0 && (
            <p className="flex items-center gap-1.5 px-1 pb-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Redo2 className="h-3 w-3" /> Re-doable
            </p>
          )}
          {future.map((h) => (
            <button
              key={`f-${h.at}-${h.steps}`}
              type="button"
              onClick={() => jumpForward(h.steps)}
              className="flex w-full items-center gap-2 rounded-lg border border-dashed border-(--nc-line) px-2.5 py-1.5 text-left text-[11px] text-muted-foreground transition hover:border-amber-400/40 hover:bg-amber-400/5 hover:text-foreground"
            >
              <CornerDownRight className="h-3 w-3 shrink-0 opacity-50" />
              <span className="min-w-0 flex-1 truncate">{prettyLabel(h.label)}</span>
              <span className="shrink-0 text-[9px] opacity-60">+{h.steps}</span>
            </button>
          ))}

          {/* current state */}
          <div
            className="flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-2.5 py-2 text-[11px] font-medium text-foreground"
            data-nc-history-current
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
            Current state
          </div>

          {/* undo stack — newest first */}
          {past.length > 0 && (
            <p className="flex items-center gap-1.5 px-1 pt-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Undo2 className="h-3 w-3" /> Undo history
            </p>
          )}
          {past.map((h) => (
            <button
              key={`p-${h.at}-${h.steps}`}
              type="button"
              data-nc-history-entry
              onClick={() => jumpBack(h.steps)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11px] text-foreground/80 transition hover:bg-(--nc-panel-strong) hover:text-foreground"
            >
              <span className="min-w-0 flex-1 truncate">{prettyLabel(h.label)}</span>
              <span className="shrink-0 text-[9px] text-muted-foreground/60">{relTime(h.at)}</span>
              <span className="shrink-0 rounded bg-(--nc-panel-strong) px-1 text-[9px] text-muted-foreground">−{h.steps}</span>
            </button>
          ))}

          {past.length === 0 && future.length === 0 && (
            <p className="px-1 py-6 text-center text-[11px] text-muted-foreground">
              No edits yet — every change you make lands here as one undoable step.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-(--nc-line) px-4 py-2.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[10px]"
            disabled={!past.length}
            onClick={() => {
              useEditor.getState().undo()
              toast('Undid last step')
            }}
          >
            <Undo2 className="mr-1 h-3 w-3" />
            Undo last
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[10px]"
            disabled={!future.length}
            onClick={() => {
              useEditor.getState().redo()
              toast('Redid step')
            }}
          >
            <Redo2 className="mr-1 h-3 w-3" />
            Redo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
