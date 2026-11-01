'use client'

/**
 * NovaCut Studio — Day 71: editable keyboard shortcuts.
 *
 * The default bindings stay exactly as they shipped (the full original
 * handler runs below, untouched). ON TOP sits an override layer:
 *  - `ACTIONS` lists the customizable actions with their default combos
 *  - users rebind them in the Shortcuts dialog; overrides persist in
 *    localStorage (`novacut.shortcuts`)
 *  - a rebound combo is resolved BEFORE the defaults, so `Ctrl+Alt+U` can
 *    become Undo — and honest conflict detection keeps one combo = one action
 */

import { toast } from 'sonner'
import { useEditor } from './store'
import { formatTimecode } from './utils'
import { projectDuration } from './utils'

export interface ShortcutAction {
  id: string
  label: string
  defaultCombo: string
}

/** customizable actions (everything else keeps its shipped binding) */
export const ACTIONS: ShortcutAction[] = [
  { id: 'undo', label: 'Undo', defaultCombo: 'mod+z' },
  { id: 'redo', label: 'Redo', defaultCombo: 'mod+shift+z' },
  { id: 'save', label: 'Save project now', defaultCombo: 'mod+s' },
  { id: 'export', label: 'Open export', defaultCombo: 'mod+e' },
  { id: 'copy', label: 'Copy selected clips', defaultCombo: 'mod+c' },
  { id: 'cut', label: 'Cut selected clips', defaultCombo: 'mod+x' },
  { id: 'paste', label: 'Paste at playhead', defaultCombo: 'mod+v' },
  { id: 'paste-attrs', label: 'Paste attributes (FX)', defaultCombo: 'mod+alt+v' },
  { id: 'select-all', label: 'Select all clips', defaultCombo: 'mod+a' },
  { id: 'split', label: 'Split clip at playhead', defaultCombo: 'mod+k' },
  { id: 'duplicate', label: 'Duplicate selected', defaultCombo: 'mod+d' },
  { id: 'toggle-play', label: 'Play / Pause', defaultCombo: 'space' },
]

const STORE_KEY = 'novacut.shortcuts'

/** normalize a KeyboardEvent into a canonical combo string */
export function comboFromEvent(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('mod')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')
  let key = e.key.toLowerCase()
  if (key === ' ') key = 'space'
  if (key === 'escape') key = 'esc'
  parts.push(key)
  return parts.join('+')
}

export function prettyCombo(combo: string): string {
  return combo
    .split('+')
    .map((p) => {
      if (p === 'mod') return 'Ctrl'
      if (p === 'alt') return 'Alt'
      if (p === 'shift') return 'Shift'
      if (p === 'space') return 'Space'
      if (p === 'arrowleft') return '←'
      if (p === 'arrowright') return '→'
      if (p === 'arrowup') return '↑'
      if (p === 'arrowdown') return '↓'
      if (p === 'esc') return 'Esc'
      if (p === 'enter') return 'Enter'
      if (p === 'tab') return 'Tab'
      return p.length === 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1)
    })
    .join(' + ')
}

export function getOverrides(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {}
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    return {}
  }
}

export function setOverride(id: string, combo: string) {
  if (typeof localStorage === 'undefined') return
  const all = getOverrides()
  if (combo === ACTIONS.find((a) => a.id === id)?.defaultCombo) delete all[id]
  else all[id] = combo
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(all))
  } catch {
    /* private mode — binding stays for this session only */
  }
}

export function resetOverrides() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(STORE_KEY)
  } catch {
    /* ignore */
  }
}

/** the combo an action currently binds to (override ?? default) */
export function bindingFor(id: string): string {
  return getOverrides()[id] ?? ACTIONS.find((a) => a.id === id)?.defaultCombo ?? ''
}

/** which action a combo currently triggers, or null — includes defaults */
export function actionForCombo(combo: string): string | null {
  for (const a of ACTIONS) if (bindingFor(a.id) === combo) return a.id
  return null
}

/** actions whose current binding collides with the given combo (excluding id) */
export function conflictsFor(combo: string, exceptId?: string): ShortcutAction[] {
  return ACTIONS.filter((a) => a.id !== exceptId && bindingFor(a.id) === combo)
}

type Exec = (s: ReturnType<typeof import('./store').useEditor.getState>, e: KeyboardEvent) => void

/** executors for the customizable actions — same behavior as the defaults */
export const EXECUTORS: Record<string, Exec> = {
  undo: (s) => s.undo(),
  redo: (s) => s.redo(),
  save: (s) => {
    void s.saveNow()
    toast.success('Project saved')
  },
  export: (s) => {
    s.pause()
    s.openDialog('export')
  },
  copy: (s) => {
    if (s.selectedClipIds.length) {
      s.copySelected()
      toast(`${s.selectedClipIds.length} clip${s.selectedClipIds.length > 1 ? 's' : ''} copied`)
    }
  },
  cut: (s) => {
    if (s.selectedClipIds.length) {
      s.cutSelected()
      toast('Clip cut to clipboard')
    }
  },
  paste: (s) => {
    if (s.hasClipboard) {
      const before = s.project.clips.length
      s.pasteAtPlayhead()
      const added = useEditor.getState().project.clips.length - before
      if (added > 0) toast.success(`${added} clip${added > 1 ? 's' : ''} pasted at playhead`)
    }
  },
  'paste-attrs': (s) => {
    if (!s.copiedAttributes) {
      toast('Copy FX from a clip first (Properties → Copy FX)')
      return
    }
    const n = s.pasteAttributes()
    if (n > 0) toast.success(`Attributes pasted onto ${n} clip${n > 1 ? 's' : ''}`)
    else toast('Select a clip to paste onto')
  },
  'select-all': (s) => s.selectAll(),
  split: (s) => {
    s.splitAtPlayhead()
    toast.success('Clip split ✂️')
  },
  duplicate: (s) => {
    if (s.selectedClipIds.length > 1) {
      const n = s.selectedClipIds.length
      s.duplicateSelected()
      toast.success(`${n} clips duplicated`)
    } else {
      const id = s.selectedClipIds[0]
      if (id) s.duplicateClip(id)
    }
  },
  'toggle-play': (s) => s.togglePlay(),
}

/**
 * Override layer — runs BEFORE the built-in handler. Returns true when a
 * CUSTOM binding consumed the event. Combos equal to any shipped default
 * always fall through to the original handler, so stock behavior can never
 * be shadowed by accident.
 */
export function runOverrideLayer(e: KeyboardEvent): boolean {
  const combo = comboFromEvent(e)
  const isDefaultCombo = ACTIONS.some((a) => a.defaultCombo === combo)
  if (isDefaultCombo) return false
  const id = actionForCombo(combo)
  if (!id) return false
  const exec = EXECUTORS[id]
  if (!exec) return false
  e.preventDefault()
  exec(useEditor.getState(), e)
  return true
}
