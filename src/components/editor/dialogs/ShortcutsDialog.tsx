'use client'

/**
 * Keyboard shortcuts cheat-sheet dialog, driven by the store's activeDialog.
 *
 * UX60 Phase 6 (Days 41–43) — adds the PRINTED SHORTCUT SHEET: a
 * print-optimized one-page table (branding + every customizable action with
 * its CURRENT binding + all fixed bindings) that is hidden on screen and
 * swapped in by `@media print` CSS when "Print sheet" calls window.print().
 * Screen readers get the dialog as before; the sheet is real DOM (census
 * verified) — not a screenshot.
 */
import { useEffect, useState } from 'react'
import { Keyboard, Pencil, Printer, RotateCcw, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SHORTCUTS } from '@/lib/editor/constants'
import { Button } from '@/components/ui/button'
import { useEditor } from '@/lib/editor/store'
import {
  ACTIONS,
  bindingFor,
  comboFromEvent,
  conflictsFor,
  prettyCombo,
  resetOverrides,
  setOverride,
  type ShortcutAction,
} from '@/lib/editor/shortcuts'
import { useLabel } from '@/lib/i18n/labels'

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

/** Day 71 — one editable shortcut row: click Edit, press the new combo */
function ShortcutRow({ action }: { action: ShortcutAction }) {
  const [editing, setEditing] = useState(false)
  const [current, setCurrent] = useState(bindingFor(action.id))
  const [changed, setChanged] = useState(bindingFor(action.id) !== action.defaultCombo)
  const l = useLabel()

  useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setEditing(false)
        return
      }
      const combo = comboFromEvent(e)
      const conflicts = conflictsFor(combo, action.id)
      if (conflicts.length) {
        toast.error(`Already used by "${conflicts[0].label}" — pick another combo`)
        return
      }
      setOverride(action.id, combo)
      setCurrent(combo)
      setChanged(combo !== action.defaultCombo)
      setEditing(false)
      toast.success(`${action.label} → ${prettyCombo(combo)}`)
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true } as EventListenerOptions)
  }, [editing, action])

  if (editing) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-lg bg-fuchsia-500/10 px-2 py-1.5 text-xs" data-nc-shortcut-capture>
        <span className="text-foreground">{l(action.label)}</span>
        <button
          type="button"
          className="flex items-center gap-1 rounded border border-fuchsia-400/50 px-1.5 py-0.5 font-mono text-[10px] text-fuchsia-200"
          onClick={() => setEditing(false)}
        >
          Press keys… <X className="size-3" />
        </button>
      </div>
    )
  }

  return (
    <div className="group flex items-center justify-between gap-4 py-1.5 text-xs" data-nc-shortcut-row={action.id}>
      <span className="text-muted-foreground">
        {l(action.label)}
        {changed && (
          <span className="ml-1.5 rounded bg-amber-400/15 px-1 text-[8px] font-semibold text-amber-300" data-nc-shortcut-custom>
            {l('custom')}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <KeyChips keys={prettyCombo(current)} />
        <button
          type="button"
          aria-label={`${l('Rebind')} ${l(action.label)}`}
          title={l('Rebind — press the new key combination')}
          data-nc-shortcut-edit={action.id}
          onClick={() => setEditing(true)}
          className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
        >
          <Pencil className="size-3 text-muted-foreground hover:text-foreground" />
        </button>
      </span>
    </div>
  )
}

/* ---------------- printable sheet (Days 41–43) ---------------- */

/**
 * Hidden on screen; `@media print` (globals.css) flips it visible and hides
 * everything else. Rendered while the dialog is open — the honest flow is
 * "open the shortcuts dialog, then Print sheet".
 */
function ShortcutPrintSheet() {
  const l = useLabel()
  const generated = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  return (
    <div className="nc-print-sheet" data-nc-print-sheet aria-hidden>
      <div className="ncps-head">
        <div className="ncps-brand">▶ NovaCut Studio</div>
        <div>
          <h1>{l('Keyboard shortcuts — printable sheet')}</h1>
          <p className="ncps-sub">
            {generated} · novacut.app — custom bindings are marked and live only on the device that set them
          </p>
        </div>
      </div>

      <h2>{l('Customizable actions')}</h2>
      <table className="ncps-table">
        <thead>
          <tr>
            <th>{l('Action')}</th>
            <th>{l('Current binding')}</th>
          </tr>
        </thead>
        <tbody>
          {ACTIONS.map((a) => {
            const custom = bindingFor(a.id) !== a.defaultCombo
            return (
              <tr key={a.id}>
                <td>
                  {l(a.label)}
                  {custom ? <span className="ncps-custom"> · {l('custom')}</span> : null}
                </td>
                <td className="ncps-keys">{prettyCombo(bindingFor(a.id))}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <h2>{l('Fixed bindings')}</h2>
      <table className="ncps-table">
        <thead>
          <tr>
            <th>{l('Keys')}</th>
            <th>{l('Action')}</th>
          </tr>
        </thead>
        <tbody>
          {SHORTCUTS.map((s) => (
            <tr key={`${s.keys}-${s.action}`}>
              <td className="ncps-keys">{s.keys}</td>
              <td>{s.action}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="ncps-foot">
        Rebind any customizable action in NovaCut → {l('Keyboard shortcuts')} ({l('Reset all')} restores the shipped bindings).
      </p>
    </div>
  )
}

export function ShortcutsDialog() {
  const open = useEditor((s) => s.activeDialog === 'shortcuts')
  const openDialog = useEditor((s) => s.openDialog)
  const [version, setVersion] = useState(0)
  const l = useLabel()

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
            {l('Keyboard shortcuts')}
          </DialogTitle>
          <DialogDescription>{l('Edit at the speed of thought.')}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto pr-1" data-nc-shortcut-list>
          {/* Day 71 — customizable actions first, each with an inline editor */}
          {ACTIONS.map((a) => (
            <ShortcutRow key={`${a.id}-${version}`} action={a} />
          ))}
          <p className="my-2 border-t border-(--nc-line) pt-2 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            {l('Fixed bindings')}
          </p>
          {SHORTCUTS.map((s) => (
            <div key={s.action} className="flex items-center justify-between gap-4 py-1.5 text-xs">
              <span className="text-muted-foreground">{s.action}</span>
              <KeyChips keys={s.keys} />
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-(--nc-line) pt-2">
          <p className="text-[10px] text-muted-foreground">{l('Custom bindings are stored on this device only.')}</p>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              data-nc-shortcuts-print
              className="h-7 px-2 text-[10px]"
              title={l('Print — a one-page sheet of every binding')}
              aria-label={l('Print sheet')}
              onClick={() => {
                toast('Opening the print dialog — the sheet covers every current binding')
                window.setTimeout(() => window.print(), 150)
              }}
            >
              <Printer className="mr-1 h-3 w-3" />
              {l('Print sheet')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              data-nc-shortcuts-reset
              className="h-7 px-2 text-[10px]"
              onClick={() => {
                resetOverrides()
                setVersion((v) => v + 1)
                toast.success(l('All shortcuts back to their shipped bindings'))
              }}
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              {l('Reset all')}
            </Button>
          </div>
        </div>
        {open && <ShortcutPrintSheet />}
      </DialogContent>
    </Dialog>
  )
}
