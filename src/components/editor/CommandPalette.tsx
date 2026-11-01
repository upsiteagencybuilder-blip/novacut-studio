'use client'

/**
 * NovaCut Studio — Day 72: the ⌘K command palette UI.
 * Keyboard-first: type to filter, ↑/↓ to move, Enter to run, Esc to close.
 * Only real, live commands are listed (see lib/command-palette.ts).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { CornerDownLeft, Search } from 'lucide-react'
import { useEditor } from '@/lib/editor/store'
import { buildCommands, filterCommands } from '@/lib/editor/command-palette'
import { cn } from '@/lib/utils'

/** Remounts on open so query/index reset without effects */
export function CommandPalette() {
  const open = useEditor((s) => s.activeDialog === 'palette')
  if (!open) return null
  return <CommandPaletteInner key="open" />
}

function CommandPaletteInner() {
  const open = useEditor((s) => s.activeDialog === 'palette')
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const commands = useMemo(() => (open ? buildCommands() : []), [open])
  const filtered = useMemo(() => filterCommands(commands, query), [commands, query])

  // reset + focus when the palette opens (mounted/unmounted by `open` anyway)
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => inputRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-nc-cmd-index="${index}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const runAt = (i: number) => {
    const cmd = filtered[i]
    if (!cmd) return
    useEditor.getState().openDialog(null)
    cmd.run()
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex items-start justify-center bg-black/55 p-4 pt-[12vh] backdrop-blur-sm"
      data-nc-palette
      onClick={() => useEditor.getState().openDialog(null)}
    >
      <div
        className="nc-glass-strong w-full max-w-lg overflow-hidden rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-(--nc-line) px-3.5 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setIndex((i) => Math.min(i + 1, filtered.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setIndex((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                runAt(index)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                useEditor.getState().openDialog(null)
              }
            }}
            placeholder="Type a command — dialogs, panels, tools, canvas…"
            aria-label="Command palette search"
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
            data-nc-palette-input
          />
          <kbd className="shrink-0 rounded border border-(--nc-line) bg-(--nc-panel-strong) px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[46vh] overflow-y-auto p-1.5" data-nc-palette-list>
          {filtered.length === 0 && (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">
              No command matches “{query}” — the palette only lists features that actually run.
            </p>
          )}
          {filtered.map((c, i) => (
            <button
              key={c.id}
              type="button"
              data-nc-cmd-index={i}
              onMouseEnter={() => setIndex(i)}
              onClick={() => runAt(i)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition',
                i === index ? 'bg-(--nc-accent-soft) text-foreground' : 'text-foreground/80 hover:bg-(--nc-panel-strong)',
              )}
            >
              <span className="min-w-0 flex-1 truncate font-medium">{c.title}</span>
              <span className="shrink-0 rounded border border-(--nc-line) px-1 text-[9px] text-muted-foreground">{c.hint}</span>
              {i === index && <CornerDownLeft className="size-3 shrink-0 text-muted-foreground" />}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-(--nc-line) px-3.5 py-2 text-[10px] text-muted-foreground">
          <span>
            {filtered.length} of {commands.length} commands — all live features
          </span>
          <span>↑↓ move · Enter run</span>
        </div>
      </div>
    </div>
  )
}
