'use client'

/**
 * NovaCut Studio — Day 72: the command palette.
 *
 * Every command in this palette dispatches to a REAL live feature — dialogs,
 * tool panels, tool modes and canvas presets. Nothing "planned" is listed:
 * the palette can only reach things that actually run. ⌘K / Ctrl+K opens it.
 */

import type { DialogName } from './types'
import { useEditor } from './store'

export interface PaletteCommand {
  id: string
  title: string
  hint: string
  group: string
  run: () => void
}

interface CommandSource {
  kind: 'dialog' | 'panel' | 'tool' | 'canvas'
}

const DIALOGS: { name: DialogName; title: string }[] = [
  { name: 'export', title: 'Export video' },
  { name: 'projects', title: 'Open projects & templates' },
  { name: 'history', title: 'Open edit history' },
  { name: 'versions', title: 'Open version history' },
  { name: 'mixer', title: 'Open audio mixer' },
  { name: 'shortcuts', title: 'Open keyboard shortcuts' },
  { name: 'storage', title: 'Open storage manager' },
  { name: 'theme', title: 'Open theme studio' },
  { name: 'account', title: 'Open account & device link' },
  { name: 'feedback', title: 'Send feedback' },
]

const PANELS: { tab: string; title: string }[] = [
  { tab: 'media', title: 'Media panel' },
  { tab: 'text', title: 'Text & titles panel' },
  { tab: 'stickers', title: 'Stickers panel' },
  { tab: 'effects', title: 'Effects panel' },
  { tab: 'audio', title: 'Audio panel' },
  { tab: 'ai', title: 'AI panel' },
  { tab: 'pro', title: 'Pro toolkit panel' },
]

const TOOL_MODES: { mode: 'select' | 'razor' | 'ripple' | 'roll'; title: string }[] = [
  { mode: 'select', title: 'Tool: Select' },
  { mode: 'razor', title: 'Tool: Blade (razor)' },
  { mode: 'ripple', title: 'Tool: Ripple edit' },
  { mode: 'roll', title: 'Tool: Roll edit' },
]

const CANVAS_PRESETS: { w: number; h: number; label: string }[] = [
  { w: 1280, h: 720, label: 'Canvas: 720p landscape (16:9)' },
  { w: 1920, h: 1080, label: 'Canvas: 1080p landscape (16:9)' },
  { w: 1080, h: 1920, label: 'Canvas: vertical (9:16)' },
  { w: 1080, h: 1080, label: 'Canvas: square (1:1)' },
  { w: 1080, h: 1350, label: 'Canvas: portrait 4:5' },
]

/** build the full command list against the live store */
export function buildCommands(): PaletteCommand[] {
  const cmds: PaletteCommand[] = []
  const open = useEditor.getState().openDialog

  for (const d of DIALOGS) {
    cmds.push({
      id: `dialog-${d.name}`,
      title: d.title,
      hint: 'Dialog',
      group: 'Dialogs',
      run: () => open(d.name),
    })
  }
  for (const p of PANELS) {
    cmds.push({
      id: `panel-${p.tab}`,
      title: p.title,
      hint: 'Panel',
      group: 'Panels',
      run: () => useEditor.getState().setPanelTab(p.tab as never),
    })
  }
  for (const t of TOOL_MODES) {
    cmds.push({
      id: `tool-${t.mode}`,
      title: t.title,
      hint: 'Tool',
      group: 'Tools',
      run: () => useEditor.getState().setToolMode(t.mode),
    })
  }
  for (const c of CANVAS_PRESETS) {
    cmds.push({
      id: `canvas-${c.w}x${c.h}`,
      title: c.label,
      hint: `${c.w}×${c.h}`,
      group: 'Canvas',
      run: () => useEditor.getState().setCanvasSize(c.w, c.h),
    })
  }

  // deep links that live outside the dialog/panel tables
  cmds.push({
    id: 'action-templates',
    title: 'Browse templates',
    hint: 'Projects → Templates',
    group: 'Templates',
    run: () => {
      try {
        sessionStorage.setItem('nc.projectsTab', 'templates')
      } catch {
        /* private mode */
      }
      open('projects')
    },
  })

  return cmds
}

/** filter as you type: score on title + hint, stable order */
export function filterCommands(cmds: PaletteCommand[], query: string): PaletteCommand[] {
  const q = query.trim().toLowerCase()
  if (!q) return cmds
  return cmds.filter((c) => c.title.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q))
}
