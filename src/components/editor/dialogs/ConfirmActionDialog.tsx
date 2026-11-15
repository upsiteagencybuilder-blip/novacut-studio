'use client'

/**
 * NovaCut Studio — UX60 Phase 5 (Days 35-36): impact-preview confirmation
 * dialog for destructive actions.
 *
 * The store holds a `pendingConfirm` (title + honest impact lines + the real
 * action). This dialog renders it and runs the action ONLY on a real Confirm
 * tap — Escape / Cancel / backdrop dismiss simply drop the request. Nothing
 * is simulated: every line is computed from live state at request time.
 */
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useEditor } from '@/lib/editor/store'

export function ConfirmActionDialog() {
  const pending = useEditor((s) => s.pendingConfirm)
  if (!pending) return null
  return (
    <Dialog open onOpenChange={(o) => !o && useEditor.getState().resolveConfirm(false)}>
      <DialogContent
        className="max-h-[85vh] overflow-hidden p-0 sm:max-w-sm"
        data-nc-confirm-dialog
        onEscapeKeyDown={(e) => {
          e.preventDefault()
          useEditor.getState().resolveConfirm(false)
        }}
      >
        <DialogHeader className="border-b border-(--nc-line) px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            {pending.title}
          </DialogTitle>
          <DialogDescription className="text-[11px]">This affects your project — the impact is listed below.</DialogDescription>
        </DialogHeader>

        <ul className="space-y-1.5 px-4 py-3" data-nc-confirm-impact>
          {pending.lines.map((line, i) => (
            <li key={i} className="flex items-start gap-2 text-[11px] leading-snug text-foreground/85">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/70" />
              {line}
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between gap-2 border-t border-(--nc-line) px-4 py-2.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-3 text-xs"
            data-nc-confirm-cancel
            onClick={() => useEditor.getState().resolveConfirm(false)}
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            Keep everything
          </Button>
          <Button size="sm" variant="destructive" className="h-8 px-3 text-xs" data-nc-confirm-ok onClick={() => useEditor.getState().resolveConfirm(true)}>
            {pending.confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
