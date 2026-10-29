import type { ProTool } from '../types'

/**
 * Pro Toolkit — panels section.
 * Industry panels (Premiere / Resolve / AE / Filmora) mapped to the panels,
 * dialogs and pages NovaCut ships today.
 */

export const PANELS_TOOLS: ProTool[] = [
  // -------- Monitors & preview --------
  { id: 'panel-source-monitor', name: 'Source Monitor', section: 'panels', group: 'Monitors & preview', status: 'planned', desc: 'Preview and trim raw source clips before editing them in' },
  { id: 'panel-program-monitor', name: 'Program Monitor', section: 'panels', group: 'Monitors & preview', status: 'live', desc: 'Preview canvas plays the full composite with selection overlays in real time' },
  { id: 'panel-timecode-indicator', name: 'Timecode Indicator', section: 'panels', group: 'Monitors & preview', status: 'live', desc: 'Ruler labels and the scrub tooltip show timecode while dragging' },

  // -------- Editing panels --------
  { id: 'panel-timeline-panel', name: 'Timeline Panel', section: 'panels', group: 'Editing panels', status: 'live', desc: 'Multi-track timeline with drag, trim handles, snapping and playhead scrubbing' },
  { id: 'panel-effects-panel', name: 'Effects Panel', section: 'panels', group: 'Editing panels', status: 'live', desc: 'Effects browser lists 1059 effects across ten searchable categories with favorites, recents and per-effect controls', action: 'open-effects' },
  { id: 'panel-effect-controls-panel', name: 'Effect Controls Panel', section: 'panels', group: 'Editing panels', status: 'live', desc: 'Properties panel edits transforms, filters, grade, keyframes and blend modes' },
  { id: 'panel-inspector-panel', name: 'Inspector Panel', section: 'panels', group: 'Editing panels', status: 'live', desc: 'Inspector adapts its controls to the selected clip kind' },
  { id: 'panel-media-browser', name: 'Media Browser', section: 'panels', group: 'Editing panels', status: 'planned', desc: 'Browse system folders and camera cards inside the app' },
  { id: 'panel-toolbar', name: 'Toolbar', section: 'panels', group: 'Editing panels', status: 'live', desc: 'Timeline toolbar holds split, duplicate, delete, snap, beats and zoom' },

  // -------- Audio panels --------
  { id: 'panel-audio-clip-mixer', name: 'Audio Clip Mixer', section: 'panels', group: 'Audio panels', status: 'live', desc: 'Volume slider and keyframes per clip act as a clip mixer' },
  { id: 'panel-audio-track-mixer', name: 'Audio Track Mixer', section: 'panels', group: 'Audio panels', status: 'live', desc: 'Mixer dialog has per-track faders, mute switches and a live meter', action: 'open-mixer' },
  { id: 'panel-essential-sound-panel', name: 'Essential Sound Panel', section: 'panels', group: 'Audio panels', status: 'beta', desc: 'Voice FX family enhances dialogue and music tracks today' },

  // -------- Color panels --------
  { id: 'panel-lumetri-color-panel', name: 'Lumetri Color Panel', section: 'panels', group: 'Color panels', status: 'beta', desc: 'Grade sliders and 220 preset looks cover basic color work' },

  // -------- Graphics panels --------
  { id: 'panel-essential-graphics-panel', name: 'Essential Graphics Panel', section: 'panels', group: 'Graphics panels', status: 'beta', desc: 'Text panel plus properties styling stand in for graphics templates' },
  { id: 'panel-captions-panel', name: 'Captions Panel', section: 'panels', group: 'Graphics panels', status: 'beta', desc: 'AI captions create styled caption clips you can restyle' },
  { id: 'panel-composition-panel', name: 'Composition Panel', section: 'panels', group: 'Graphics panels', status: 'planned', desc: 'Dedicated layer-stack composition panel beyond timeline tracks' },
  { id: 'panel-layer-panel', name: 'Layer Panel', section: 'panels', group: 'Graphics panels', status: 'planned', desc: 'Layer hierarchy with parenting and blend organization per layer' },

  // -------- Pages & workspaces --------
  { id: 'panel-edit-page', name: 'Edit Page', section: 'panels', group: 'Pages & workspaces', status: 'live', desc: 'Main workspace combines timeline, preview, panels and properties' },
  { id: 'panel-cut-page', name: 'Cut Page', section: 'panels', group: 'Pages & workspaces', status: 'planned', desc: 'Fast dual-timeline cut workspace optimized for speed' },
  { id: 'panel-fusion-page', name: 'Fusion Page', section: 'panels', group: 'Pages & workspaces', status: 'planned', desc: 'Node-based compositing page for advanced shot work' },
  { id: 'panel-color-page', name: 'Color Page', section: 'panels', group: 'Pages & workspaces', status: 'planned', desc: 'Dedicated grading page with wheels, scopes and qualifiers' },
  { id: 'panel-fairlight-page', name: 'Fairlight Page', section: 'panels', group: 'Pages & workspaces', status: 'planned', desc: 'Full audio post page with buses, routing and meters' },
  { id: 'panel-deliver-page', name: 'Deliver Page', section: 'panels', group: 'Pages & workspaces', status: 'live', desc: 'Export dialog handles formats, quality, fps, resolution and platform presets', action: 'open-export' },
  { id: 'panel-preferences-dialogue', name: 'Preferences Dialogue', section: 'panels', group: 'Pages & workspaces', status: 'beta', desc: 'Theme studio customizes accent colors, fonts and wallpapers app-wide' },
  { id: 'panel-workspace-switcher', name: 'Workspace Switcher', section: 'panels', group: 'Pages & workspaces', status: 'planned', desc: 'Save and switch between panel layout workspaces' },
  { id: 'panel-flowgraph-panel', name: 'Flowgraph Panel', section: 'panels', group: 'Pages & workspaces', status: 'planned', desc: 'Visual flowgraph of the macro pipeline between pages' },
  { id: 'panel-node-graph-panel', name: 'Node Graph Panel', section: 'panels', group: 'Pages & workspaces', status: 'planned', desc: 'Wire effect nodes in a graph instead of a stack' },

  // -------- Project & metadata --------
  { id: 'panel-project-panel', name: 'Project Panel', section: 'panels', group: 'Project & metadata', status: 'live', desc: 'Media panel imports files and persists assets in the browser', action: 'open-media' },
  { id: 'panel-media-pool', name: 'Media Pool', section: 'panels', group: 'Project & metadata', status: 'live', desc: 'Every imported asset persists in the local media library', action: 'open-media' },
  { id: 'panel-cloud-backup', name: 'Cloud Project Backup', section: 'panels', group: 'Project & metadata', status: 'live', desc: 'Turso-backed snapshots in the projects dialog — back up, restore and manage per device', action: 'open-projects' },
  { id: 'panel-media-manifest', name: 'Media Manifest Sync', section: 'panels', group: 'Project & metadata', status: 'live', desc: 'sha-256 hash map of every referenced media file travels with cloud backups, verifiable one tap', action: 'open-projects' },
  { id: 'panel-asset-upload', name: 'Asset Upload Pipeline', section: 'panels', group: 'Project & metadata', status: 'live', desc: 'Media binaries travel with cloud backups — delta upload, server-verified sha-256 per file', action: 'open-projects' },
  { id: 'panel-cloud-versioning', name: 'Cloud Version History', section: 'panels', group: 'Project & metadata', status: 'live', desc: 'Ordinal project snapshots in the cloud (newest 20) — save, restore, delete from the versions dialog', action: 'open-versions' },
  { id: 'panel-libraries-panel', name: 'Libraries Panel', section: 'panels', group: 'Project & metadata', status: 'planned', desc: 'Shared asset libraries synced across multiple projects' },
  { id: 'panel-history-panel', name: 'History Panel', section: 'panels', group: 'Project & metadata', status: 'planned', desc: 'Undo and redo with coalesced steps ship, a history list remains roadmap' },
  { id: 'panel-info-panel', name: 'Info Panel', section: 'panels', group: 'Project & metadata', status: 'planned', desc: 'Show codec, resolution and metadata of the selection' },
  { id: 'panel-markers-panel', name: 'Markers Panel', section: 'panels', group: 'Project & metadata', status: 'planned', desc: 'List, name and navigate all timeline markers in one place' },
  { id: 'panel-metadata-panel', name: 'Metadata Panel', section: 'panels', group: 'Project & metadata', status: 'planned', desc: 'Edit clip and project metadata fields for searchability' },
  { id: 'panel-production-panel', name: 'Production Panel', section: 'panels', group: 'Project & metadata', status: 'planned', desc: 'Manage multi-project productions with shared media pools' },
  { id: 'panel-smart-bins', name: 'Smart Bins', section: 'panels', group: 'Project & metadata', status: 'planned', desc: 'Auto-collecting bins driven by metadata search rules' },
  { id: 'panel-power-bins', name: 'Power Bins', section: 'panels', group: 'Project & metadata', status: 'planned', desc: 'Global bins shared across every project in the vault' },
  { id: 'panel-project-settings-panel', name: 'Project Settings Panel', section: 'panels', group: 'Project & metadata', status: 'beta', desc: 'Canvas size and fps change through dialogs and presets today' },
]
