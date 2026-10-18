'use client'

/**
 * Keyboard shortcuts cheat-sheet dialog, driven by the store's activeDialog.
 */
import { Keyboard } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SHORTCUTS } from '@/lib/editor/constants'
import { useEditor } from '@/lib/editor/store'

/** Render "Ctrl + Shift + Z / Ctrl + Y" as a row of <kbd> chips */
function KeyChips({ keys }: { keys: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {keys.split('/').map((part, i) => (
        <kbd
          key={`${i}-${part.trim()}`}
          className="rounded border border-(--nc-line) bg-(--nc-panel-strong) px-1.5 py-0.5 font-mono text-[10px] text-foreground/90"
        >
          {part.trim()}
        </kbd>
      ))}
    </span>
  )
}

export function ShortcutsDialog() {
  const open = useEditor((s) => s.activeDialog === 'shortcuts')
  const openDialog = useEditor((s) => s.openDialog)

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) openDialog(null)
      }}
    >
      <DialogContent className="nc-glass-strong max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Keyboard className="size-4 text-fuchsia-300" />
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription>Edit at the speed of thought.</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto pr-1">
          {SHORTCUTS.map((s) => (
            <div key={s.action} className="flex items-center justify-between gap-4 py-1.5 text-xs">
              <span className="text-muted-foreground">{s.action}</span>
              <KeyChips keys={s.keys} />
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
