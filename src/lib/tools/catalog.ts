import type { ProTool, ToolSection, ToolSectionId } from './types'
import { ROLES_TOOLS } from './sections/roles'
import { TIMELINE_TOOLS } from './sections/timeline'
import { PANELS_TOOLS } from './sections/panels'
import { COLOR_TOOLS } from './sections/color'
import { VFX_TOOLS } from './sections/vfx'
import { SOUND_TOOLS } from './sections/sound'
import { MOTION_TOOLS } from './sections/motion'
import { TRANSITIONS_TOOLS } from './sections/transitions'
import { AI_TOOLS } from './sections/ai'
import { LIBRARIES_TOOLS } from './sections/libraries'
import { FILTERS_TOOLS } from './sections/filters'
import { DELIVERY_TOOLS } from './sections/delivery'

/**
 * Pro Toolkit catalog — aggregates the 12 section files.
 *
 * Section order is the browsing order used by the UI: roles first (the
 * industry credit roll), then the working sections from timeline to delivery.
 */

export const PRO_SECTIONS: ToolSection[] = [
  { id: 'roles', label: 'Roles', emoji: '🎬', blurb: 'The full credit roll of a professional post-production pipeline' },
  { id: 'timeline', label: 'Timeline', emoji: '✂️', blurb: 'Editing tools, trimming, speed, markers and track control' },
  { id: 'panels', label: 'Panels', emoji: '🖥️', blurb: 'Monitors, inspectors and workspaces from every pro NLE' },
  { id: 'color', label: 'Color', emoji: '🎨', blurb: 'Primaries, curves, qualifiers, LUTs and scopes' },
  { id: 'vfx', label: 'VFX', emoji: '✨', blurb: 'Keying, roto, tracking, blending, animation and 3D' },
  { id: 'sound', label: 'Sound', emoji: '🎚️', blurb: 'EQ, dynamics, restoration, mixing and loudness post' },
  { id: 'motion', label: 'Motion', emoji: '🔤', blurb: 'Typography, titles and animated text systems' },
  { id: 'transitions', label: 'Transitions', emoji: '🔀', blurb: 'Dissolves, wipes, 3D moves and stylized cuts' },
  { id: 'ai', label: 'AI', emoji: '🤖', blurb: 'Captions, voice, cleanup and generative helpers' },
  { id: 'libraries', label: 'Libraries', emoji: '📚', blurb: 'Project media, stock, music, SFX and sticker packs' },
  { id: 'filters', label: 'Filters', emoji: '🪄', blurb: 'Blur, generate, distort, stylize and overlay packs' },
  { id: 'delivery', label: 'Delivery', emoji: '📦', blurb: 'Formats, codecs, export settings and platform presets' },
]

export const PRO_CATALOG: ProTool[] = [
  ...ROLES_TOOLS,
  ...TIMELINE_TOOLS,
  ...PANELS_TOOLS,
  ...COLOR_TOOLS,
  ...VFX_TOOLS,
  ...SOUND_TOOLS,
  ...MOTION_TOOLS,
  ...TRANSITIONS_TOOLS,
  ...AI_TOOLS,
  ...LIBRARIES_TOOLS,
  ...FILTERS_TOOLS,
  ...DELIVERY_TOOLS,
]

export const PRO_CATALOG_TOTAL: number = PRO_CATALOG.length

interface CatalogCounts {
  total: number
  live: number
  beta: number
  planned: number
  role: number
  bySection: Record<ToolSectionId, number>
}

let memo: CatalogCounts | null = null

/** Status + per-section counts over the whole catalog (computed once). */
export function catalogCounts(): CatalogCounts {
  if (memo) return memo
  const bySection: Record<ToolSectionId, number> = {
    roles: 0,
    timeline: 0,
    panels: 0,
    color: 0,
    vfx: 0,
    sound: 0,
    motion: 0,
    transitions: 0,
    ai: 0,
    libraries: 0,
    filters: 0,
    delivery: 0,
  }
  let live = 0
  let beta = 0
  let planned = 0
  let role = 0
  for (const tool of PRO_CATALOG) {
    bySection[tool.section]++
    if (tool.status === 'live') live++
    else if (tool.status === 'beta') beta++
    else if (tool.status === 'planned') planned++
    else role++
  }
  memo = { total: PRO_CATALOG.length, live, beta, planned, role, bySection }
  return memo
}

/** Number of catalog entries in one section. */
export function sectionCount(id: ToolSectionId): number {
  return catalogCounts().bySection[id]
}
