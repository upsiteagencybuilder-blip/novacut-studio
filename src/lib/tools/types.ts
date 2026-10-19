/**
 * Pro Toolkit catalog — contract.
 *
 * The catalog mirrors the professional post-production tool taxonomy
 * (Premiere Pro / DaVinci Resolve / After Effects / Filmora class) inside
 * NovaCut: every tool of the industry is listed, mapped to what ships today
 * (`live`), what is partially covered (`beta`) and what is on the roadmap
 * (`planned`). Industry job roles are catalogued as `role` entries —
 * the full credit roll of a professional pipeline.
 */

/** Shipment status of a catalog entry. */
export type ToolStatus =
  | 'live' // ships in NovaCut today
  | 'beta' // partially covered by an equivalent shipped feature
  | 'planned' // pro roadmap
  | 'role' // industry job role (reference entry)

/** Deep-link action executed when the user taps a live tool. */
export type ToolAction =
  | 'open-media'
  | 'open-text'
  | 'open-stickers'
  | 'open-effects'
  | 'open-audio'
  | 'open-ai'
  | 'open-mixer'
  | 'open-export'
  | 'open-theme'
  | 'open-projects'
  | 'open-versions'
  | 'open-shortcuts'

/** Top-level catalog section id. */
export type ToolSectionId =
  | 'roles'
  | 'timeline'
  | 'panels'
  | 'color'
  | 'vfx'
  | 'sound'
  | 'motion'
  | 'transitions'
  | 'ai'
  | 'libraries'
  | 'filters'
  | 'delivery'

/** A single catalog entry (tool, panel, effect or industry role). */
export interface ProTool {
  /** Unique slug, e.g. `timeline-razor-tool`. */
  id: string
  /** Canonical industry name (exactly as catalogued). */
  name: string
  /** Owning section id. */
  section: ToolSectionId
  /** Sub-group label inside the section, e.g. `Cutting & trimming`. */
  group: string
  /** Shipment status. */
  status: ToolStatus
  /** One-line English description (8–16 words), concrete and honest. */
  desc: string
  /** Deep-link for live entries (omit for planned / role). */
  action?: ToolAction
}

/** Section metadata rendered as navigation chips. */
export interface ToolSection {
  id: ToolSectionId
  label: string
  emoji: string
  blurb: string
}
