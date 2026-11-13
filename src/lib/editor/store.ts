'use client'

/**
 * NovaCut Studio — central Zustand store.
 * Single source of truth for project, media, playback & UI state.
 * All components read/write through this store.
 */
import type { EditTemplate } from '../templates'
import { getTaskTemplate, type TaskTemplate } from '../task-templates'
import { getSmartDefaultCanvas, getSmartDefaultFont, getSmartDefaultPanelTab, loadSmartDefaults, recordCanvas, recordPanelTab } from './smart-defaults'
import { create } from 'zustand'
import { toast } from 'sonner'
import type {
  CaptionSegment,
  ChromaKey,
  Clip,
  ColorGrade,
  ExportState,
  Filters,
  Keyframe,
  KeyframeProperty,
  MediaAssetRuntime,
  PanelTab,
  AiSubTab,
  DialogName,
  Project,
  StickerStyle,
  TextStyle,
  TimelineMarker,
  Track,
  TrackKind,
  Transform,
  VersionSnapshot,
} from './types'
import {
  buildCaptionClips,
  createClipFromMedia,
  createDefaultProject,
  createStickerClip,
  createTextClip,
  createTrack,
  DEFAULT_CHROMA_KEY,
  DEFAULT_COLOR_GRADE,
  DEFAULT_FILTERS,
  DEFAULT_TRANSFORM,
  MIN_CLIP_DURATION,
  MARKER_COLORS,
  type StickerRequest,
  type TextPreset,
} from './constants'
import { isNestedClip, openCompound } from './nested'
import { detectAutoKey, autoKeyPatch } from './bg-detect'
import { baseValueForProperty, clamp, formatTimecode, landingTime, normalizeColorGrade, normalizeFilters, projectDuration, round2, uid } from './utils'
import * as db from './db'

/**
 * UX60 Day 3-4 — options for a brand-new project from the use-case canvas
 * picker: canvas size + a target-length marker pin dropped on the timeline.
 */
export interface NewProjectOpts {
  width?: number
  height?: number
  /** drops an amber "Ns target" marker pin at this timeline second */
  targetDuration?: number
}

/** Panel-friendly patch type: nested objects accept partials */
export type ClipPatch = Partial<Omit<Clip, 'transform' | 'filters' | 'textStyle' | 'sticker' | 'chromaKey' | 'colorGrade'>> & {
  transform?: Partial<Transform>
  filters?: Partial<Filters>
  textStyle?: Partial<TextStyle>
  sticker?: Partial<StickerStyle>
  chromaKey?: Partial<ChromaKey>
  colorGrade?: Partial<ColorGrade>
}

interface EditorStore {
  /* ---------- state ---------- */
  ready: boolean
  project: Project
  media: MediaAssetRuntime[]
  /** bumped whenever media list changes so engine/mediaMap consumers re-derive */
  mediaVersion: number
  selectedClipIds: string[]
  currentTime: number
  isPlaying: boolean
  masterVolume: number
  masterMuted: boolean
  /** timeline px per second */
  zoom: number
  snapEnabled: boolean
  /** beat-sync marker times (seconds) from the last detection */
  beatMarkers: number[]
  /** detected tempo, null before any detection */
  beatBpm: number | null
  /** beat markers visible on the timeline (also gates snap-to-beat) */
  showBeatMarkers: boolean
  panelTab: PanelTab
  activeDialog: DialogName
  exportState: ExportState
  autosave: 'idle' | 'saving' | 'saved' | 'error'
  past: Project[]
  future: Project[]
  importing: boolean
  /** UX60 Day 7-8 — true once a video export completed on this device (checklist step, persisted) */
  hasExported: boolean
  /** true once copy/cut has stashed at least one clip (enables Paste UI) */
  hasClipboard: boolean
  /** stashed look/feel of a source clip for Paste Attributes (Day 09) — null until copied */
  copiedAttributes: { attrs: Partial<Clip>; from: string } | null
  /* ---------- nested (compound) clips ---------- */
  /** pack every selected clip into a single compound block (Ctrl+G) */
  groupSelectedClips: () => boolean
  /** dissolve the selected compound back onto the timeline (Ctrl+Shift+G) */
  ungroupSelectedClip: () => boolean
  /** double-click a compound — materialize its children for editing (a session) */
  enterNestedClip: (id: string) => boolean
  /** leave the compound session — repack members into the container */
  exitNestedSession: () => boolean
  /** session-internal: register newly created clip ids as compound members (no-op outside a session) */
  joinSession: (ids: string[]) => void

  /* ---------- lifecycle ---------- */
  init: () => Promise<void>
  newProject: (name?: string, opts?: NewProjectOpts) => void
  /** UX60 Day 7-8 — flip the checklist's "exported once" step (persisted per device) */
  markExported: () => void
  openProject: (id: string) => Promise<void>
  loadDemoProject: () => Promise<void>
  saveNow: () => Promise<void>
  /** Day 60 — suspend autosave around a transient project swap; unpausing flushes the real state */
  pauseAutosave: (on: boolean) => void
  setProjectName: (name: string) => void
  setCanvasSize: (width: number, height: number) => void
  setFps: (fps: number) => void
  setProjectBackground: (color: string) => void

  /* ---------- media ---------- */
  setImporting: (v: boolean) => void
  addMediaAsset: (asset: MediaAssetRuntime) => void
  removeMediaAsset: (id: string) => Promise<void>
  getMediaMap: () => Map<string, MediaAssetRuntime>

  /* ---------- clips ---------- */
  addClip: (clip: Clip, opts?: { select?: boolean }) => void
  /** `at` (seconds) drops the clip at that timeline time (e.g. the playhead); default appends at the track end */
  addClipFromMediaId: (mediaId: string, at?: number) => void
  addTextClip: (preset?: TextPreset, at?: { x: number; y: number }) => void
  /** Day 68 — rebuild the timeline from a built-in template scaffold (undoable in ONE step) */
  applyTemplate: (t: EditTemplate) => boolean
  /** UX60 Phase 3 — apply a FULL PRE-CUT task template (styled slots + styled titles + guided steps) and start the step-by-step walkthrough; ONE undo step */
  applyTaskTemplate: (t: TaskTemplate) => boolean
  /* ---------- guided workflows (UX60 Phase 3, Days 19-20) ---------- */
  /** active step-by-step walkthrough — null when not guiding */
  guided: { templateId: string; templateName: string; step: number } | null
  /** (re)start the guided walkthrough for a task template */
  startGuided: (templateId: string) => void
  setGuidedStep: (step: number) => void
  endGuided: () => void
  addStickerClip: (req: StickerRequest) => void
  /** Day 11 — insert an adjustment layer (invisible FX carrier) at the playhead on the top overlay track */
  addAdjustmentLayer: () => boolean
  /**
   * Day 18 — one-tap auto background removal: samples the composite frame,
   * detects the dominant border color and applies a tuned chroma key in one
   * undo step. Returns a toast-ready result or null when nothing is sampled.
   */
  autoRemoveBackground: (id?: string) => { ok: boolean; color?: string; confidence?: number }
  updateClip: (id: string, patch: ClipPatch, history?: boolean | string) => void
  /** strip a transition between two adjacent clips (fades + wipe mask + iris keys), one undo step */
  removeTransition: (outgoingId: string, incomingId: string) => void
  moveClip: (id: string, start: number, trackId: string | null, history?: boolean | string) => void
  trimClip: (id: string, opts: { start?: number; trimStart?: number; duration?: number }, history?: boolean | string) => void
  splitClip: (id: string, time: number) => void
  splitAtPlayhead: () => void
  /* ---------- smart assistance (UX60 Phase 2) ---------- */
  /** one-click beat cut — slices video/image clips at the detected beat grid (stride 1 | 2 | 4), ONE undo step; returns cut count */
  splitClipsAtBeats: (stride?: number) => number
  /** highlight analysis result — null until analyzed, cleared on apply/dismiss */
  highlightSuggest: import('../effects/highlight').HighlightAnalysis | null
  analyzingHighlights: boolean
  /** on-device silence scan over the timeline's audio-carrying clips → suggestion card */
  analyzeHighlightsForTimeline: () => Promise<number>
  /** apply every keep-range in ONE undo step; returns changed clip count */
  applyHighlightSuggestions: () => number
  /** one-tap dismiss of the suggestion card */
  dismissHighlightSuggestions: () => void
  /** per-clip silence ranges in SOURCE time (seconds) — mapped to timeline live so they survive moves/trims */
  silenceHints: Record<string, import('../effects/highlight').SilenceRange[]>
  /** clip ids currently being scanned (spinner/avoid double work) */
  silenceHintsLoading: string[]
  /** analyze one clip's audio → silence ranges in SOURCE time (cached per id) */
  computeSilenceHints: (clipId: string) => Promise<void>
  /** drop cached hints — all, or one clip's (recompute via computeSilenceHints) */
  clearSilenceHints: (clipId?: string) => void
  /** swap a clip's media source keeping its timeline slot (position + duration) */
  replaceClipMedia: (clipId: string, mediaId: string) => boolean
  /** capture the current frame as a 3s still and ripple-insert it at the playhead */
  insertFreezeFrame: () => Promise<boolean>
  /** detach a video clip's soundtrack into an editable audio clip on the audio track ('no-video' = no target, 'no-audio' = silent source) */
  extractAudioFromVideo: () => Promise<'ok' | 'no-video' | 'no-audio' | 'failed'>
  deleteClip: (id: string) => void
  deleteSelected: () => void
  rippleDeleteSelected: () => void
  duplicateClip: (id: string) => void
  duplicateSelected: () => void
  selectClip: (id: string | null, additive?: boolean) => void
  setSelection: (ids: string[]) => void
  /** copy selected clips to the internal clipboard (Ctrl+C) */
  copySelected: () => void
  /** stash FX/motion/transform of a clip (default: first selection) for Paste Attributes (Ctrl+Alt+V) */
  copyAttributes: (id?: string) => boolean
  /** apply stashed attributes onto one or many clips (default: selection) — returns target count */
  pasteAttributes: (id?: string) => number
  /** copy then delete in one history step (Ctrl+X) */
  cutSelected: () => void
  /** paste clipboard clips starting at the playhead (Ctrl+V) */
  pasteAtPlayhead: () => void
  /** select every clip in the project (Ctrl+A) */
  selectAll: () => void
  /** drop a colored labeled marker at the playhead (Shift+M) — returns true when a new marker was added */
  addMarkerAtPlayhead: () => boolean
  /** remove the marker nearest the playhead (within 0.5s) — returns true when removed */
  removeMarkerAtPlayhead: () => void
  /** rename/recolor/move a marker by id (history: label defaults true) */
  updateMarker: (id: string, patch: { t?: number; label?: string; color?: string }, history?: boolean | string) => void
  /** delete one marker by id (undoable) */
  removeMarker: (id: string) => void
  /** clear every marker (undoable) */
  clearMarkers: () => void
  /** jump to the previous/next MARKER only ([ / ] keys) — returns true when moved */
  jumpMarker: (dir: 1 | -1) => boolean

  /* ---------- pro tools (blade / in-out / shuttle / ripple trims) ---------- */
  /**
   * active timeline tool: 'select' (default), 'razor', or one of the four pro
   * trim modes — 'ripple' (drags close the gap), 'roll' (move the cut between
   * adjacent clips), 'slip' (slide the media window under a fixed clip) and
   * 'slide' (move a clip while its neighbors absorb the shift)
   */
  toolMode: 'select' | 'razor' | 'ripple' | 'roll' | 'slip' | 'slide'
  setToolMode: (mode: 'select' | 'razor' | 'ripple' | 'roll' | 'slip' | 'slide') => void
  /** JKL shuttle rate: 0 = stopped, ±1 / ±2 / ±4 (negative = reverse playback) */
  jklRate: number
  /** J / K / L shuttle transport (pro NLE standard) */
  jklAction: (key: 'j' | 'k' | 'l') => void
  /** session In point (seconds) — null = unset */
  inPoint: number | null
  /** session Out point (seconds) — null = unset */
  outPoint: number | null
  /** mark the In point at the playhead (I) — drops a stale Out that sits at/before it */
  markIn: () => void
  /** mark the Out point at the playhead (O) — drops a stale In that sits at/after it */
  markOut: () => void
  /** clear both In & Out points (Ctrl+Shift+X) */
  clearInOut: () => void
  /** jump to the previous/next edit point (clip edges + markers) — returns true when moved */
  jumpEdit: (dir: 1 | -1) => boolean
  /** nudge every selected clip's start by `delta` seconds in ONE undo step */
  nudgeSelected: (delta: number) => void
  /** Q — trim the clip straddling the playhead to end AT the playhead, ripple same-track followers left */
  rippleTrimEndToPlayhead: () => boolean
  /** W — trim the straddling clip's head to the playhead, or pull the next clip's start back to it (ripple) */
  rippleTrimStartToPlayhead: () => boolean
  /** Lift — remove the [in,out] range from every track, leaving gaps (needs In & Out marks) */
  liftInOut: () => boolean
  /** Extract — Lift + ripple every track's later clips left to close the gap (needs In & Out marks) */
  extractInOut: () => boolean
  /** zoom so the whole project fits the visible timeline (Shift+Z) */
  zoomFit: () => void

  /* ---------- keyframes ---------- */
  addKeyframeAtPlayhead: (clipId: string, property: KeyframeProperty) => void
  addKeyframeAt: (clipId: string, property: KeyframeProperty, time: number, value: number) => void
  updateKeyframe: (clipId: string, kfId: string, patch: Partial<Keyframe>, history?: boolean | string) => void
  removeKeyframe: (clipId: string, kfId: string) => void

  /* ---------- captions ---------- */
  addCaptionClips: (segments: CaptionSegment[]) => number

  /* ---------- tracks ---------- */
  addTrack: (kind: TrackKind) => void
  updateTrack: (id: string, patch: Partial<Track>, history?: boolean | string) => void
  removeTrack: (id: string) => void
  setTrackVolume: (id: string, volume: number, history?: boolean | string) => void
  /** solo a track — other tracks are silenced during playback (solo again to unsolo) */
  setTrackSolo: (id: string, solo: boolean) => void

  /* ---------- versions ---------- */
  versions: VersionSnapshot[]
  versionsLoaded: boolean
  loadVersions: () => Promise<void>
  saveVersion: (name?: string) => Promise<void>
  restoreVersion: (id: string) => Promise<void>
  deleteVersion: (id: string) => Promise<void>

  /* ---------- playback ---------- */
  setCurrentTime: (t: number) => void
  play: () => void
  pause: () => void
  togglePlay: () => void
  frameStep: (dir: 1 | -1) => void
  setMasterVolume: (v: number) => void
  toggleMasterMuted: () => void

  /* ---------- view / dialogs ---------- */
  setZoom: (z: number) => void
  toggleSnap: () => void
  setBeatMarkers: (times: number[], bpm: number | null) => void
  clearBeatMarkers: () => void
  /** Day 26 — convert detected beats into real timeline marker pins (one undo); returns count added */
  addBeatMarkersToTimeline: (stride?: number) => number
  toggleShowBeatMarkers: () => void
  setPanelTab: (tab: PanelTab) => void

  /* ---------- preview monitor overlays (guides & grids suite) ---------- */
  /** SMPTE action-safe (93%) + title-safe (90%) rectangles over the preview */
  monitorSafe: boolean
  /** rule-of-thirds grid + center crosshair over the preview */
  monitorThirds: boolean
  /** canvas-edge pixel rulers (top + left) over the preview */
  monitorRulers: boolean
  /** zebra stripes painted where luma crosses the threshold (exposure tool) */
  monitorZebra: boolean
  /** zebra threshold as luma fraction 0.5..1 (1 = 100 IRE clip check) */
  zebraThreshold: number
  /** false-color exposure bands painted over the preview (exposure tool) */
  monitorFalseColor: boolean
  /** draggable non-printing composition guides over the preview */
  monitorGuides: boolean
  /** guide positions as canvas fractions (0..1) — session-scoped, non-printing */
  guides: { v: number[]; h: number[] }
  /** deep-link target — turn one overlay on (idempotent) */
  setMonitor: (key: 'safe' | 'thirds' | 'rulers' | 'zebra' | 'falsecolor' | 'guides', on: boolean) => void
  /** Monitor popover toggle */
  toggleMonitor: (key: 'safe' | 'thirds' | 'rulers' | 'zebra' | 'falsecolor' | 'guides') => void
  /** zebra threshold (luma fraction, clamped 0.5..1) */
  setZebraThreshold: (v: number) => void
  /** append a composition guide (pos = canvas fraction 0..1, default center) */
  addGuide: (axis: 'v' | 'h', pos?: number) => void
  /** drag target — reposition one guide (clamped 0.02..0.98) */
  moveGuide: (axis: 'v' | 'h', index: number, pos: number) => void
  /** double-click target — remove one guide */
  removeGuide: (axis: 'v' | 'h', index: number) => void
  /** popover target — remove all guides */
  clearGuides: () => void
  /** which card group is open inside the AI panel (deep-link target) */
  aiSubTab: AiSubTab
  setAiSubTab: (tab: AiSubTab) => void
  openDialog: (d: DialogName) => void

  /* ---------- export ---------- */
  setExportState: (patch: Partial<ExportState>) => void
  resetExport: () => void

  /* ---------- history ---------- */
  pushHistory: (key?: string) => void
  /** Day 65 — human-readable labels for the past stack (parallel to `past`) */
  historyPast: { label: string; at: number }[]
  /** Day 65 — labels for the redo stack (parallel to `future`) */
  historyFuture: { label: string; at: number }[]
  /** Day 65 — undo N steps at once (History panel jump-back) */
  undoSteps: (n: number) => void
  /** Day 65 — redo N steps at once (History panel jump-forward) */
  redoSteps: (n: number) => void
  /** Day 31 — returns the current past-stack length; call BEFORE a multi-step group */
  beginHistoryGroup: () => number
  /**
   * Day 31 — collapse every history entry pushed since beginHistoryGroup into
   * ONE undo step (the earliest in-group snapshot = the pre-group state), so a
   * whole multi-action plan reverts with a single undo. No-op when nothing
   * was pushed during the group (or when the group pushed nothing new).
   */
  endHistoryGroup: (before: number) => void
  undo: () => void
  redo: () => void
}

export const HISTORY_LIMIT = 150
let lastHistoryKey: string | null = null
let lastHistoryTime = 0
let savingTimer: ReturnType<typeof setTimeout> | null = null
let suppressSave = false
/** Day 60 — true while a transient project overlay (export branding) is live */
let autosavePaused = false
/** warn about quota only once per session — repeated toasts would be noise */
let storageWarned = false

function surfaceStorageError(err: unknown) {
  const e = err as { name?: string; code?: number }
  const quota = e?.name === 'QuotaExceededError' || e?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e?.code === 22
  if (quota && !storageWarned) {
    storageWarned = true
    toast.error('Local storage is FULL — saving stopped. Free space in Projects → Storage.', { duration: 10000 })
  }
}
/** internal copy/cut clipboard — session scope, deep-cloned clips */
let clipboardClips: Clip[] = []

function cloneProject(p: Project): Project {
  return JSON.parse(JSON.stringify(p)) as Project
}

function withUpdatedAt(p: Project): Project {
  return { ...p, updatedAt: Date.now() }
}

/** Repair persisted color data into the strict Filters/ColorGrade contracts. */
function normalizeProjectColor(p: Project): Project {
  return {
    ...p,
    clips: p.clips.map((c) => {
      const filters = normalizeFilters(c.filters)
      const grade = c.colorGrade ? normalizeColorGrade(c.colorGrade) : c.colorGrade
      if (filters === c.filters && grade === c.colorGrade) return c
      return { ...c, filters, colorGrade: grade }
    }),
  }
}

/**
 * Lift/Extract engine — remove the [from,to) range from every track.
 * - clips fully inside are deleted
 * - clips straddling the left edge are trimmed to end at `from`
 * - clips straddling the right edge are trimmed to start at `to` (source position advanced)
 * - clips containing the range are split into two around it
 * extract=true also shifts every same-track clip starting at/after `to` left by `range`
 * so the hole closes across ALL tracks in one step.
 */
function exciseRange(clips: Clip[], from: number, to: number, extract: boolean, range = to - from): Clip[] {
  const out: Clip[] = []
  for (const orig of clips) {
    const c = JSON.parse(JSON.stringify(orig)) as Clip
    const start = c.start
    const end = c.start + c.duration
    // compounds are untouchable containers: never trimmed/split/deleted here —
    // only the extract shift applies (moving one whole is always safe)
    if (c.kind === 'nested') {
      if (extract && start >= to - 0.001) c.start = Math.max(0, round2(start - range))
      out.push(c)
      continue
    }
    if (end <= from + 0.001 || start >= to - 0.001) {
      // outside the range — only move when extracting and the clip sits after it
      if (extract && start >= to - 0.001) c.start = Math.max(0, round2(start - range))
      out.push(c)
      continue
    }
    const fullyInside = start >= from - 0.001 && end <= to + 0.001
    if (fullyInside) continue // removed entirely
    const straddlesLeft = start < from - 0.001 && end > from
    const straddlesRight = start < to && end > to + 0.001
    if (straddlesLeft && !straddlesRight) {
      // keep only the head, ending at `from`
      c.duration = round2(from - start)
      out.push(c)
      continue
    }
    if (!straddlesLeft && straddlesRight) {
      // keep only the tail, starting at `to`
      const cut = to - start
      c.start = round2(to - (extract ? range : 0))
      c.duration = round2(end - to)
      c.trimStart = round2(c.trimStart + cut * c.speed)
      out.push(c)
      continue
    }
    // the clip spans the whole range — split into head + tail
    const headDur = round2(from - start)
    const tail: Clip = { ...c, id: uid('clip_'), start: round2(to - (extract ? range : 0)), duration: round2(end - to), trimStart: round2(c.trimStart + (to - start) * c.speed), fadeIn: 0 }
    c.duration = headDur
    c.fadeOut = 0
    out.push(c, tail)
  }
  return out
}

/**
 * Pick the clip a playhead-trim (Q/W) should act on.
 * Selection wins; otherwise a straddling clip — preferring VISUAL tracks over
 * audio (a full-length music bed must not steal the trim from the clip the
 * user is visually parked inside). Falls back to audio when it's all there is.
 */
function pickTrimTarget(clips: Clip[], selectedIds: string[], t: number): Clip | null {
  const straddles = (c: Clip) => c.kind !== 'nested' && t > c.start + 0.05 && t < c.start + c.duration - 0.05
  const isVisual = (c: Clip) => c.kind !== 'audio' && c.kind !== 'nested'
  const selStraddle = clips.find((c) => selectedIds.includes(c.id) && straddles(c))
  if (selStraddle) return selStraddle
  const visual = clips.find((c) => straddles(c) && isVisual(c))
  if (visual) return visual
  // playhead sitting ON a visual edit boundary → don't steal the trim for a
  // full-length music bed; W should pull the next visual clip instead (Q no-ops)
  const onVisualBoundary = clips.some((c) => isVisual(c) && Math.abs(c.start - t) < 0.06)
  if (onVisualBoundary) return null
  return clips.find((c) => straddles(c)) ?? null
}

function applyClipPatch(project: Project, id: string, patch: ClipPatch): Project {
  return {
    ...project,
    clips: project.clips.map((c) => {
      if (c.id !== id) return c
      const next: Clip = {
        ...c,
        ...(patch as Partial<Clip>),
      }
      if (patch.transform) next.transform = { ...c.transform, ...patch.transform }
      if (patch.filters) next.filters = normalizeFilters({ ...c.filters, ...patch.filters })
      if (patch.textStyle) next.textStyle = { ...c.textStyle!, ...patch.textStyle }
      if (patch.sticker) next.sticker = { ...c.sticker!, ...patch.sticker }
      if (patch.chromaKey) next.chromaKey = { ...(c.chromaKey ?? { enabled: false, color: '#00b140', similarity: 0.32, smoothness: 0.12 }), ...patch.chromaKey }
      if (patch.colorGrade) next.colorGrade = normalizeColorGrade({ ...(c.colorGrade ?? { temperature: 0, tint: 0, shadows: 0, highlights: 0, vibrance: 1 }), ...patch.colorGrade })
      // audio FX — object patches merge over the previous recipe; null clears
      if (patch.audioFx !== undefined) {
        next.audioFx = patch.audioFx === null ? null : { ...(c.audioFx ?? {}), ...patch.audioFx }
      }
      return next
    }),
  }
}

export const useEditor = create<EditorStore>((set, get) => ({
  ready: false,
  project: createDefaultProject(),
  media: [],
  mediaVersion: 0,
  selectedClipIds: [],
  currentTime: 0,
  isPlaying: false,
  masterVolume: 1,
  masterMuted: false,
  zoom: 70,
  snapEnabled: true,
  beatMarkers: [],
  /* smart assistance (UX60 Phase 2) */
  highlightSuggest: null,
  analyzingHighlights: false,
  silenceHints: {},
  silenceHintsLoading: [],
  beatBpm: null,
  showBeatMarkers: true,
  toolMode: 'select',
  jklRate: 0,
  inPoint: null,
  outPoint: null,
  panelTab: 'media',
  guided: null,
  monitorSafe: false,
  monitorThirds: false,
  monitorRulers: false,
  monitorZebra: false,
  zebraThreshold: 1,
  monitorFalseColor: false,
  monitorGuides: false,
  guides: { v: [], h: [] },
  aiSubTab: 'assistant',
  activeDialog: null,
  exportState: { phase: 'idle', progress: 0 },
  autosave: 'idle',
  past: [],
  historyPast: [],
  future: [],
  historyFuture: [],
  hasClipboard: false,
  copiedAttributes: null,
  importing: false,
  hasExported: false,

  /* ================= lifecycle ================= */

  init: async () => {
    try {
      const [assets, lastId, projects, exportedKV] = await Promise.all([
        db.listAssets(),
        db.getKV<string>('lastProjectId'),
        db.listProjects(),
        db.getKV<boolean>('hasExported'),
      ])
      const media: MediaAssetRuntime[] = assets.map(({ meta, blob }) => ({
        ...meta,
        objectUrl: URL.createObjectURL(blob),
        rawBlob: blob,
      }))
      let project: Project | undefined
      if (lastId) project = projects.find((p) => p.id === lastId)
      if (!project && projects.length) project = projects.sort((a, b) => b.updatedAt - a.updatedAt)[0]
      if (!project) project = createDefaultProject()
      project = normalizeProjectColor(project)
      suppressSave = true
      // land on a frame that actually shows content (never greet with a black canvas)
      const land = landingTime(project)
      set({ media, project, ready: true, currentTime: land, hasExported: exportedKV === true })
      setTimeout(() => (suppressSave = false), 0)
      // UX60 Phase 3 (Days 23-24) — smart defaults: load remembered prefs from
      // KV and restore the last panel tab. Canvas/font/preset defaults are read
      // synchronously from the engine cache when they're needed (newProject /
      // addTextClip / export dialog) — never forced onto an open project.
      void loadSmartDefaults().then(() => {
        const tab = getSmartDefaultPanelTab()
        if (tab && useEditor.getState().ready) {
          set({ panelTab: tab as PanelTab })
        }
      })
      // Day 63 — startup budget probe: measure from navigation start to the
      // moment the editor is fully hydrated (project + media restored).
      // The number is honest: measured on THIS device, kept for the Storage
      // panel and exposed on window for tests.
      if (typeof window !== 'undefined' && performance.mark) {
        try {
          performance.mark('novacut:ready')
          const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
          const t0 = nav?.startTime ?? 0
          const mark = performance.getEntriesByName('novacut:ready')[0]
          const startupMs = mark ? Math.round(mark.startTime - t0) : Math.round(performance.now())
          ;(window as unknown as { __ncStartupMs?: number }).__ncStartupMs = startupMs
          void db.setKV('lastStartupMs', { ms: startupMs, at: Date.now() }).catch(() => undefined)
        } catch {
          /* performance API unavailable — skip */
        }
      }
      // manifest app-shortcut actions (?action=new|demo|export)
      if (typeof window !== 'undefined') {
        const action = new URLSearchParams(window.location.search).get('action')
        if (action === 'new') {
          get().newProject()
          void db.setKV('onboarded', true)
        } else if (action === 'demo') {
          void get().loadDemoProject()
        }
        // 'export' is handled in EditorShell once ready
      }
      // autosave subscription (runs once). Day 60 hardening: the subscription is
      // PAUSED around transient project swaps (export branding overlay) so the
      // temporary timeline never lands in IndexedDB, and quota failures surface
      // honestly instead of looping silently.
      useEditor.subscribe((state, prev) => {
        if (state.project !== prev.project && !suppressSave && !autosavePaused) {
          if (savingTimer) clearTimeout(savingTimer)
          set({ autosave: 'saving' })
          savingTimer = setTimeout(async () => {
            try {
              await db.saveProject(get().project)
              await db.setKV('lastProjectId', get().project.id)
              set({ autosave: 'saved' })
            } catch (err) {
              set({ autosave: 'error' })
              surfaceStorageError(err)
            }
          }, 650)
        }
      })
    } catch (e) {
      console.error('init failed', e)
      set({ ready: true })
    }
  },

  newProject: (name, opts) => {
    const p = createDefaultProject(name)
    // UX60 Day 3-4 — use-case canvas picker: apply the intent's canvas + target pin
    if (opts?.width) p.canvasWidth = opts.width
    if (opts?.height) p.canvasHeight = opts.height
    if (opts?.width && opts?.height) {
      // explicit picker choice becomes the remembered default
      recordCanvas(opts.width, opts.height)
    } else {
      // UX60 Phase 3 — smart defaults: no explicit choice → last canvas wins
      const c = getSmartDefaultCanvas()
      if (c) {
        p.canvasWidth = c.width
        p.canvasHeight = c.height
      }
    }
    if (opts?.targetDuration && opts.targetDuration > 0) {
      p.markers = [
        { id: uid('mkr_'), t: opts.targetDuration, label: `${opts.targetDuration}s target`, color: '#f59e0b' },
      ]
    }
    suppressSave = true
    set({
      project: p,
      selectedClipIds: [],
      past: [],
      future: [],
      currentTime: 0,
      isPlaying: false,
    })
    db.saveProject(p).then(() => db.setKV('lastProjectId', p.id)).finally(() => (suppressSave = false))
  },

  markExported: () => {
    if (get().hasExported) return
    set({ hasExported: true })
    void db.setKV('hasExported', true).catch(() => undefined)
  },

  openProject: async (id) => {
    const p = await db.getProject(id)
    if (!p) return
    suppressSave = true
    set({ project: p, selectedClipIds: [], past: [], future: [], currentTime: 0, isPlaying: false })
    await db.setKV('lastProjectId', id)
    suppressSave = false
  },

  loadDemoProject: async () => {
    const { buildDemoProject } = await import('./demo')
    const { project, newAssets } = await buildDemoProject(get().media)
    suppressSave = true
    set((s) => ({
      project,
      media: [...newAssets, ...s.media],
      mediaVersion: s.mediaVersion + 1,
      selectedClipIds: [],
      past: [],
      future: [],
      // land on a frame where the demo is fully visible (intro clips fade in,
      // so t=0 would greet the user with a black canvas)
      currentTime: landingTime(project),
      isPlaying: false,
    }))
    await db.saveProject(project)
    await db.setKV('lastProjectId', project.id)
    suppressSave = false
  },

  saveNow: async () => {
    try {
      await db.saveProject(get().project)
      await db.setKV('lastProjectId', get().project.id)
      set({ autosave: 'saved' })
    } catch (err) {
      set({ autosave: 'error' })
      surfaceStorageError(err)
    }
  },

  /** Day 60 — suspend autosave around a transient project swap; unpausing flushes the real state */
  pauseAutosave: (on) => {
    autosavePaused = on
    if (!on) {
      if (savingTimer) clearTimeout(savingTimer)
      void get().saveNow()
    }
  },

  setProjectName: (name) => {
    set((s) => ({ project: withUpdatedAt({ ...s.project, name }) }))
  },

  setCanvasSize: (width, height) => {
    // UX60 Phase 3 — smart defaults: remember the canvas the user chose
    recordCanvas(width, height)
    get().pushHistory('canvas-size')
    set((s) => ({ project: withUpdatedAt({ ...s.project, canvasWidth: width, canvasHeight: height }) }))
  },

  setFps: (fps) => {
    get().pushHistory('fps')
    set((s) => ({ project: withUpdatedAt({ ...s.project, fps: clamp(fps, 12, 60) }) }))
  },

  setProjectBackground: (color) => {
    set((s) => ({ project: withUpdatedAt({ ...s.project, backgroundColor: color }) }))
  },

  /* ================= media ================= */

  setImporting: (v) => set({ importing: v }),

  addMediaAsset: (asset) => {
    set((s) => ({
      media: [asset, ...s.media],
      mediaVersion: s.mediaVersion + 1,
    }))
    db.putAsset(
      {
        id: asset.id,
        name: asset.name,
        kind: asset.kind,
        mimeType: asset.mimeType,
        size: asset.size,
        duration: asset.duration,
        width: asset.width,
        height: asset.height,
        thumbnail: asset.thumbnail,
        thumbs: asset.thumbs,
        peaks: asset.peaks,
        rms: asset.rms,
        peakLevel: asset.peakLevel,
        createdAt: asset.createdAt,
      },
      asset.rawBlob as Blob
    ).catch((e) => console.error('asset save failed', e))
  },

  removeMediaAsset: async (id) => {
    const s = get()
    const asset = s.media.find((m) => m.id === id)
    if (asset) URL.revokeObjectURL(asset.objectUrl)
    get().pushHistory()
    set((st) => ({
      media: st.media.filter((m) => m.id !== id),
      mediaVersion: st.mediaVersion + 1,
      project: withUpdatedAt({ ...st.project, clips: st.project.clips.filter((c) => c.mediaId !== id) }),
      selectedClipIds: st.selectedClipIds.filter((cid) => !st.project.clips.some((c) => c.id === cid && c.mediaId === id)),
    }))
    // a deleted LUT asset must not serve stale pixels from the engine cache
    if (asset?.kind === 'lut') {
      const { getEngine } = await import('./engine')
      getEngine().invalidateLutCache(id)
    }
    await db.deleteAsset(id).catch(() => undefined)
  },

  getMediaMap: () => {
    const map = new Map<string, MediaAssetRuntime>()
    for (const m of get().media) map.set(m.id, m)
    return map
  },

  /* ================= clips ================= */

  addClip: (clip, opts) => {
    get().pushHistory()
    set((s) => ({
      project: withUpdatedAt({ ...s.project, clips: [...s.project.clips, clip] }),
      selectedClipIds: opts?.select === false ? s.selectedClipIds : [clip.id],
    }))
    // a clip added while a compound session is open belongs to the compound
    get().joinSession([clip.id])
  },

  addClipFromMediaId: (mediaId, at) => {
    const s = get()
    const asset = s.media.find((m) => m.id === mediaId)
    if (!asset) return
    const clip = createClipFromMedia(s.project, asset, undefined, typeof at === 'number' ? Math.max(0, at) : undefined)
    s.addClip(clip)
  },

  addTextClip: (preset, at) => {
    const s = get()
    // `at` places the clip at a canvas position (fraction offset from center)
    const merged: TextPreset | undefined = at
      ? {
          ...(preset ?? { id: 'custom', name: 'Custom', preview: '', style: {} }),
          transform: { ...(preset?.transform ?? {}), x: at.x, y: at.y },
        }
      : preset
    const clip = createTextClip(s.project, merged, undefined, round2(s.currentTime))
    // UX60 Phase 3 — smart defaults: a remembered font becomes the default for
    // NEW text clips. An explicit preset font always wins over the memory.
    if (!merged?.style?.fontFamily) {
      const sdFont = getSmartDefaultFont()
      if (sdFont) clip.textStyle = { ...clip.textStyle!, fontFamily: sdFont }
    }
    s.addClip(clip)
  },

  /**
   * Day 68 — apply a built-in template: rebuilds the timeline as a scaffold
   * of REAL clips. Media slots become text placeholder clips rendered ON the
   * preview ("drop media here" is literally what you see — honest by
   * design), overlays become editable text clips, the music slot becomes a
   * silent audio clip waiting for a source. Canvas size + fps follow the
   * template. One undo step restores the previous edit entirely.
   */
  applyTemplate: (t) => {
    const s = get()
    if (s.project.clips.some((c) => c.kind === 'nested' && c.nested?.open)) return false
    s.pushHistory('template-apply')

    // resolve tracks: first video track hosts slots; first overlay hosts overlays; first audio hosts music
    let tracks = [...s.project.tracks]
    const videoTrack = tracks.find((tr) => tr.kind === 'video') ?? tracks[0]
    let overlayTrack = tracks.find((tr) => tr.kind === 'overlay')
    if (!overlayTrack) {
      overlayTrack = { id: uid('track_'), name: 'Overlay', kind: 'overlay', muted: false, locked: false, hidden: false }
      tracks = [overlayTrack, ...tracks]
    }
    const audioTrack = tracks.find((tr) => tr.kind === 'audio')

    const clips: Clip[] = []
    let cursor = 0

    // media slots — honest text placeholders ON the video track
    for (const slot of t.slots) {
      if (slot.kind === 'music') continue
      const clip = createTextClip(s.project, undefined, videoTrack.id, round2(cursor))
      clips.push({
        ...clip,
        name: slot.name,
        duration: slot.duration,
        start: round2(cursor),
        color: t.accent,
        textStyle: {
          ...clip.textStyle!,
          content: slot.kind === 'image' ? '%IMG% '.replace('%IMG%', '🖼') + slot.name : '%PLAY% '.replace('%PLAY%', '▶') + slot.name,
          fontSize: Math.max(18, Math.round(t.canvas.height * 0.035)),
          align: 'center',
        },
      })
      cursor += slot.duration
    }

    // overlays — real editable text clips
    for (const o of t.overlays ?? []) {
      const clip = createTextClip(s.project, undefined, overlayTrack.id, round2(o.start))
      clips.push({
        ...clip,
        name: o.text.slice(0, 24),
        duration: o.duration,
        start: round2(o.start),
        textStyle: { ...clip.textStyle!, content: o.text, fontSize: Math.max(22, Math.round(t.canvas.height * 0.06)) },
      })
    }

    // music slot — silent audio clip awaiting a source
    const music = t.slots.find((slot) => slot.kind === 'music')
    if (music && audioTrack) {
      clips.push({
        id: uid('clip_'),
        trackId: audioTrack.id,
        kind: 'audio',
        name: music.name,
        start: 0,
        duration: music.duration,
        trimStart: 0,
        sourceDuration: 3600,
        speed: 1,
        volume: 0.8,
        muted: false,
        fadeIn: 0.5,
        fadeOut: 1,
        transform: { ...DEFAULT_TRANSFORM },
        filters: { ...DEFAULT_FILTERS },
        motion: 'none',
        motionIntensity: 0.35,
        color: '#10b981',
      })
    }

    suppressSave = true
    set((st) => ({
      project: withUpdatedAt({
        ...st.project,
        tracks,
        clips,
        canvasWidth: t.canvas.width,
        canvasHeight: t.canvas.height,
        fps: t.fps,
      }),
      currentTime: 0,
      selectedClipIds: [],
      past: [...st.past.slice(-HISTORY_LIMIT + 1), cloneProject(st.project)],
      historyPast: [...st.historyPast.slice(-HISTORY_LIMIT + 1), { label: 'template-apply', at: Date.now() }],
      future: [],
      historyFuture: [],
    }))
    setTimeout(() => (suppressSave = false), 0)
    return true
  },

  /**
   * UX60 Phase 3 (Days 17-18) — apply a FULL PRE-CUT task template. Unlike
   * applyTemplate (honest bare structure), every slot arrives pre-timed with
   * motion, fades and a tuned look, titles arrive pre-styled (gradient fills,
   * animations, background pills), and applying starts the step-by-step
   * guided walkthrough automatically. ONE undo step restores the old edit.
   */
  applyTaskTemplate: (t) => {
    const s = get()
    if (s.project.clips.some((c) => c.kind === 'nested' && c.nested?.open)) return false
    s.pushHistory('task-template-apply')

    let tracks = [...s.project.tracks]
    const videoTrack = tracks.find((tr) => tr.kind === 'video') ?? tracks[0]
    let overlayTrack = tracks.find((tr) => tr.kind === 'overlay')
    if (!overlayTrack) {
      overlayTrack = { id: uid('track_'), name: 'Overlay', kind: 'overlay', muted: false, locked: false, hidden: false }
      tracks = [overlayTrack, ...tracks]
    }
    const audioTrack = tracks.find((tr) => tr.kind === 'audio')

    const clips: Clip[] = []
    let cursor = 0

    // media slots — pre-cut placeholders: motion, fades, look and timing set
    for (const slot of t.slots) {
      const clip = createTextClip(s.project, undefined, videoTrack.id, round2(cursor))
      clips.push({
        ...clip,
        name: slot.name,
        duration: slot.duration,
        start: round2(cursor),
        motion: slot.motion,
        motionIntensity: slot.motionIntensity,
        fadeIn: slot.fadeIn,
        fadeOut: slot.fadeOut,
        filters: { ...DEFAULT_FILTERS, ...(slot.filters ?? {}) },
        color: t.accent,
        textStyle: {
          ...clip.textStyle!,
          content: (slot.kind === 'image' ? '\u{1F5BC} ' : '\u25B6 ') + slot.name,
          fontSize: Math.max(18, Math.round(t.canvas.height * 0.035)),
          align: 'center',
        },
      })
      cursor += slot.duration
    }

    // titles — fully styled text clips (gradient, animation, pills…)
    for (const o of t.overlays) {
      const clip = createTextClip(s.project, undefined, overlayTrack.id, round2(o.start))
      clips.push({
        ...clip,
        name: o.text.slice(0, 24),
        duration: o.duration,
        start: round2(o.start),
        textStyle: {
          ...clip.textStyle!,
          ...o.style,
          content: o.text,
          fontSize: o.style.fontSize ?? Math.max(24, Math.round(t.canvas.height * 0.07)),
        },
      })
    }

    // music slot — silent audio clip awaiting the user's track (timed + faded)
    if (t.music && audioTrack) {
      clips.push({
        id: uid('clip_'),
        trackId: audioTrack.id,
        kind: 'audio',
        name: t.music.name,
        start: 0,
        duration: t.music.duration,
        trimStart: 0,
        sourceDuration: 3600,
        speed: 1,
        volume: 0.8,
        muted: false,
        fadeIn: 0.5,
        fadeOut: 1,
        transform: { ...DEFAULT_TRANSFORM },
        filters: { ...DEFAULT_FILTERS },
        motion: 'none',
        motionIntensity: 0.35,
        color: '#10b981',
      })
    }

    suppressSave = true
    set((st) => ({
      project: withUpdatedAt({
        ...st.project,
        tracks,
        clips,
        canvasWidth: t.canvas.width,
        canvasHeight: t.canvas.height,
        fps: t.fps,
      }),
      currentTime: 0,
      selectedClipIds: [],
      past: [...st.past.slice(-HISTORY_LIMIT + 1), cloneProject(st.project)],
      historyPast: [...st.historyPast.slice(-HISTORY_LIMIT + 1), { label: 'task-template-apply', at: Date.now() }],
      future: [],
      historyFuture: [],
      // guided walkthrough starts with the apply — the banner appears instantly
      guided: { templateId: t.id, templateName: t.name, step: 0 },
    }))
    setTimeout(() => (suppressSave = false), 0)
    return true
  },

  /* ---------- guided workflows (UX60 Phase 3, Days 19-20) ---------- */

  startGuided: (templateId) => {
    const t = getTaskTemplate(templateId)
    if (!t) return
    set({ guided: { templateId, templateName: t.name, step: 0 } })
  },

  setGuidedStep: (step) => {
    set((st) => (st.guided ? { guided: { ...st.guided, step: Math.max(0, Math.min(4, step)) } } : {}))
  },

  endGuided: () => set({ guided: null }),

  addStickerClip: (req) => {
    const s = get()
    const clip = createStickerClip(s.project, req, undefined, round2(s.currentTime))
    s.addClip(clip)
  },

  /**
   * Day 11 — adjustment layer: an invisible clip that carries filters / color
   * grade / LUT and applies them to every visible clip BELOW its track while
   * its time range is active. Placed at the playhead on the FIRST overlay
   * track (topmost), 4s long. Returns false when a compound session is open
   * (adjustment layers cannot live inside compounds — preview limitation).
   */
  addAdjustmentLayer: () => {
    const s = get()
    if (s.project.clips.some((c) => c.kind === 'nested' && c.nested?.open)) return false
    let tracks = s.project.tracks
    let trackId = tracks.find((t) => t.kind === 'overlay')?.id
    if (!trackId) {
      get().addTrack('overlay')
      tracks = get().project.tracks
      trackId = tracks.find((t) => t.kind === 'overlay')?.id
      // addTrack pushed its own history entry — drop the duplicate by
      // piggybacking on it (no extra push before addClip below)
    }
    if (!trackId) return false
    const clip: Clip = {
      id: uid('clip_'),
      trackId,
      kind: 'adjustment',
      name: 'Adjustment',
      start: round2(s.currentTime),
      duration: 4,
      trimStart: 0,
      sourceDuration: 3600,
      speed: 1,
      volume: 0,
      muted: true,
      fadeIn: 0,
      fadeOut: 0,
      transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
      filters: { ...DEFAULT_FILTERS },
      motion: 'none',
      motionIntensity: 0.5,
      colorGrade: { ...DEFAULT_COLOR_GRADE },
      color: '#f97316',
    }
    s.addClip(clip)
    return true
  },

  /**
   * Day 18 — one-tap background removal: sample the composite frame through
   * the engine, detect the dominant border color, and apply a tuned chroma
   * key in ONE undo step. Honest chroma-based detection (see bg-detect.ts) —
   * works best on solid backdrops; everything stays editable after.
   */
  autoRemoveBackground: (id) => {
    const s = get()
    const target = id ?? s.selectedClipIds[0]
    const clip = s.project.clips.find((c) => c.id === target)
    if (!clip || (clip.kind !== 'video' && clip.kind !== 'image')) return { ok: false }
    // import lazily to keep the engine out of the store's import graph head
    const engine = (window as unknown as { __ncEngineInstance?: { sampleFrame: (n: number) => Uint8ClampedArray | null } }).__ncEngineInstance
    const px = engine?.sampleFrame(128)
    if (!px || px.length < 64) return { ok: false }
    const result = detectAutoKey(px, 128)
    const patch = autoKeyPatch(result)
    s.updateClip(clip.id, { chromaKey: patch }, true)
    return { ok: true, color: result.color, confidence: result.confidence }
  },

  updateClip: (id, patch, history) => {
    if (history === true) get().pushHistory()
    else if (typeof history === 'string') get().pushHistory(history)
    set((s) => ({ project: withUpdatedAt(applyClipPatch(s.project, id, patch)) }))
  },

  /**
   * Remove a transition between two adjacent clips: clears both clips' fades,
   * the incoming wipe mask + its iris keys, and resets the transition's
   * transform keyframes (transitions REPLACE keyframes when applied, so
   * removal resets them — disclosed in the effects panel). One undo step.
   */
  removeTransition: (outgoingId, incomingId) => {
    get().pushHistory(`transition-remove-${outgoingId}-${incomingId}`)
    set((s) => ({
      project: withUpdatedAt({
        ...s.project,
        clips: s.project.clips.map((c) => {
          if (c.id === outgoingId) return { ...c, fadeOut: 0, keyframes: [] }
          if (c.id === incomingId) {
            return {
              ...c,
              fadeIn: 0,
              wipe: null,
              keyframes: (c.keyframes ?? []).filter((k) => k.property !== 'iris'),
            }
          }
          return c
        }),
      }),
    }))
  },

  moveClip: (id, start, trackId, history) => {
    if (history === true) get().pushHistory()
    else if (typeof history === 'string') get().pushHistory(history)
    // UX60 Phase 2 — silence hints live in SOURCE time and are mapped live by
    // consumers, so they stay truthful through moves AND trims (no invalidation)
    set((s) => ({
      project: withUpdatedAt({
        ...s.project,
        clips: s.project.clips.map((c) =>
          c.id === id ? { ...c, start: Math.max(0, round2(start)), trackId: trackId ?? c.trackId } : c
        ),
      }),
    }))
  },

  trimClip: (id, opts, history) => {
    if (history === true) get().pushHistory()
    else if (typeof history === 'string') get().pushHistory(history)
    // UX60 Phase 2 — source-time hints survive geometry changes (mapped live)
    set((s) => ({
      project: withUpdatedAt({
        ...s.project,
        clips: s.project.clips.map((c) => {
          if (c.id !== id) return c
          const next = { ...c }
          if (opts.start !== undefined) next.start = Math.max(0, round2(opts.start))
          if (opts.duration !== undefined) next.duration = Math.max(0.1, round2(opts.duration))
          if (opts.trimStart !== undefined) next.trimStart = Math.max(0, round2(opts.trimStart))
          return next
        }),
      }),
    }))
  },

  splitClip: (id, time) => {
    const s = get()
    const clip = s.project.clips.find((c) => c.id === id)
    if (!clip) return
    if (clip.kind === 'nested') return // compounds split from inside — enter first
    const local = time - clip.start
    if (local <= 0.08 || local >= clip.duration - 0.08) return
    const leftDur = round2(local)
    const rightDur = round2(clip.duration - local)
    const rightClip: Clip = {
      ...JSON.parse(JSON.stringify(clip)),
      id: uid('clip_'),
      start: round2(clip.start + local),
      duration: rightDur,
      trimStart: round2(clip.trimStart + local * clip.speed),
      fadeIn: 0,
    }
    s.pushHistory()
    set((st) => ({
      project: withUpdatedAt({
        ...st.project,
        clips: [...st.project.clips.map((c) => (c.id === id ? { ...c, duration: leftDur, fadeOut: 0 } : c)), rightClip],
      }),
      selectedClipIds: [rightClip.id],
    }))
    // the split's right half stays a compound member when inside a session
    get().joinSession([rightClip.id])
  },

  splitAtPlayhead: () => {
    const s = get()
    const t = s.currentTime
    const targets = s.selectedClipIds.length
      ? s.project.clips.filter((c) => s.selectedClipIds.includes(c.id) && t > c.start && t < c.start + c.duration)
      : s.project.clips.filter((c) => t > c.start + 0.08 && t < c.start + c.duration - 0.08)
    for (const c of targets) s.splitClip(c.id, t)
  },

  /* ================= smart assistance (UX60 Phase 2) ================= */

  // Days 9–10 — one-click beat cut: rebuild every targeted video/image clip as
  // beat-aligned pieces in ONE undo step. Semantics mirror CapCut's flow:
  //   visual clips selected  → cut exactly those
  //   music (audio) selected → cut every visual clip ON the music grid
  //   nothing selected       → cut every visual clip
  // Interior pieces drop their fades so the music stays tight; first/last
  // keep their outer fade.
  splitClipsAtBeats: (stride = 1) => {
    const s = get()
    const step = Math.max(1, Math.floor(stride))
    const beats = s.beatMarkers.filter((_, i) => i % step === 0)
    if (!beats.length) return 0
    const selected = s.selectedClipIds
    const selectedVisual = selected.length
      ? s.project.clips.filter((c) => selected.includes(c.id) && (c.kind === 'video' || c.kind === 'image'))
      : []
    const selectionHasMusic = selected.some((id) => s.project.clips.find((c) => c.id === id)?.kind === 'audio')
    const targets =
      selectedVisual.length > 0
        ? selectedVisual
        : selected.length === 0 || selectionHasMusic
          ? s.project.clips.filter((c) => c.kind === 'video' || c.kind === 'image')
          : []
    if (!targets.length) return 0
    const EPS = 0.08
    const newClips: Clip[] = []
    const joinedIds: string[] = []
    let cuts = 0
    for (const clip of s.project.clips) {
      if (!targets.some((t) => t.id === clip.id)) {
        newClips.push(clip)
        continue
      }
      const inner = beats.filter((b) => b > clip.start + EPS && b < clip.start + clip.duration - EPS)
      if (inner.length === 0) {
        newClips.push(clip)
        continue
      }
      let pieceStart = clip.start
      let pieceTrim = clip.trimStart
      let pieces = 0
      for (let i = 0; i <= inner.length; i++) {
        const cutAt = i < inner.length ? inner[i]! : clip.start + clip.duration
        const dur = round2(cutAt - pieceStart)
        if (dur < MIN_CLIP_DURATION) {
          // sliver — merge into the next piece by advancing the window
          pieceStart = cutAt
          pieceTrim = round2(clip.trimStart + (pieceStart - clip.start) * clip.speed)
          continue
        }
        const isFirst = pieces === 0 && Math.abs(pieceStart - clip.start) < 1e-6
        const isLast = i === inner.length
        const piece: Clip = {
          ...JSON.parse(JSON.stringify(clip)),
          id: isFirst ? clip.id : uid('clip_'),
          start: round2(pieceStart),
          duration: dur,
          trimStart: pieceTrim,
          fadeIn: isFirst ? clip.fadeIn : 0,
          fadeOut: isLast ? clip.fadeOut : 0,
        }
        if (!isFirst) joinedIds.push(piece.id)
        newClips.push(piece)
        pieces++
        pieceStart = cutAt
        pieceTrim = round2(clip.trimStart + (pieceStart - clip.start) * clip.speed)
      }
      cuts += Math.max(0, pieces - 1)
    }
    if (cuts === 0) return 0
    s.pushHistory('beat-cut')
    set((st) => ({ project: withUpdatedAt({ ...st.project, clips: newClips }) }))
    if (joinedIds.length) get().joinSession(joinedIds)
    return cuts
  },

  // Days 11–12 — on-device silence scan → highlight suggestions (bounded work)
  analyzeHighlightsForTimeline: async () => {
    const s = get()
    if (s.analyzingHighlights) return 0
    set({ analyzingHighlights: true, highlightSuggest: null })
    try {
      const { analyzeHighlights } = await import('../effects/highlight')
      const { ensureAssetReady } = await import('./memory-manager')
      const resolveBlob = async (clip: Clip): Promise<Blob | null> => {
        if (clip.kind !== 'video' && clip.kind !== 'audio') return null
        const asset = get().media.find((m) => m.id === clip.mediaId)
        if (!asset) return null
        const ready = await ensureAssetReady(asset.id)
        return ready?.rawBlob ?? null
      }
      const res = await analyzeHighlights(s.project.clips, resolveBlob)
      set({ highlightSuggest: res, analyzingHighlights: false })
      return res.suggestions.length
    } catch {
      set({ analyzingHighlights: false })
      return 0
    }
  },

  // one undo step — replaces each suggested clip with its keep-range pieces
  applyHighlightSuggestions: () => {
    const s = get()
    const sug = s.highlightSuggest
    if (!sug || sug.suggestions.length === 0) return 0
    const newClips: Clip[] = []
    const joinedIds: string[] = []
    let changed = 0
    for (const clip of s.project.clips) {
      const cs = sug.suggestions.find((x) => x.clipId === clip.id)
      if (!cs || cs.ranges.length === 0) {
        newClips.push(clip)
        continue
      }
      const speed = clip.speed || 1
      let pieceStart = clip.start
      let pieces = 0
      for (let i = 0; i < cs.ranges.length; i++) {
        const r = cs.ranges[i]!
        const dur = round2((r.end - r.start) / speed)
        if (dur < MIN_CLIP_DURATION) continue
        const isFirst = pieces === 0
        const isLast = i === cs.ranges.length - 1
        const piece: Clip = {
          ...JSON.parse(JSON.stringify(clip)),
          id: isFirst ? clip.id : uid('clip_'),
          start: round2(pieceStart),
          duration: dur,
          trimStart: round2(r.start),
          fadeIn: isFirst ? clip.fadeIn : 0,
          fadeOut: isLast ? clip.fadeOut : 0,
        }
        if (!isFirst) joinedIds.push(piece.id)
        newClips.push(piece)
        pieces++
        pieceStart += dur
      }
      if (pieces > 0) changed++
      else newClips.push(clip) // every range was a sliver — keep the original
    }
    if (changed === 0) return 0
    s.pushHistory('highlight-apply')
    set((st) => ({
      project: withUpdatedAt({ ...st.project, clips: newClips }),
      highlightSuggest: null,
      silenceHints: {}, // geometry changed across the board — hints recompute on selection
    }))
    if (joinedIds.length) get().joinSession(joinedIds)
    return changed
  },

  dismissHighlightSuggestions: () => set({ highlightSuggest: null }),

  // Days 13–14 — silence ranges for one clip, cached in SOURCE time (mapped
  // to timeline time live by consumers so trims/moves never invalidate them)
  computeSilenceHints: async (clipId) => {
    const s = get()
    const clip = s.project.clips.find((c) => c.id === clipId)
    if (!clip || (clip.kind !== 'video' && clip.kind !== 'audio')) return
    if (s.silenceHints[clipId] || s.silenceHintsLoading.includes(clipId)) return
    set((st) => ({ silenceHintsLoading: [...st.silenceHintsLoading, clipId] }))
    try {
      const { detectSilenceRanges } = await import('../effects/highlight')
      const { ensureAssetReady } = await import('./memory-manager')
      const asset = get().media.find((m) => m.id === clip.mediaId)
      if (!asset) return
      const ready = await ensureAssetReady(asset.id)
      if (!ready?.rawBlob) return
      const ranges = await detectSilenceRanges(ready.rawBlob)
      if (ranges.length > 0) set((st) => ({ silenceHints: { ...st.silenceHints, [clipId]: ranges } }))
    } catch {
      // honest fallback: no hints — trimming still works exactly as before
    } finally {
      set((st) => ({ silenceHintsLoading: st.silenceHintsLoading.filter((id) => id !== clipId) }))
    }
  },

  clearSilenceHints: (clipId) =>
    set((st) => {
      if (!clipId) return { silenceHints: {} }
      if (!st.silenceHints[clipId]) return st
      const next = { ...st.silenceHints }
      delete next[clipId]
      return { silenceHints: next }
    }),

  replaceClipMedia: (clipId, mediaId) => {
    const s = get()
    const clip = s.project.clips.find((c) => c.id === clipId)
    const asset = s.media.find((m) => m.id === mediaId)
    if (!clip || !asset || clip.mediaId === mediaId) return false
    // keep the same media family: audio stays audio, visual stays visual
    if (clip.kind === 'audio' && asset.kind !== 'audio') return false
    if (clip.kind !== 'audio' && asset.kind === 'audio') return false
    s.pushHistory()
    const isImage = asset.kind === 'image' || asset.kind === 'lut'
    const sourceDuration = isImage ? 3600 : Math.max(0.2, asset.duration)
    // keep the slot: same start, duration clamped to the new source length
    const duration = Math.min(clip.duration, sourceDuration)
    const trimStart = Math.min(clip.trimStart, Math.max(0, sourceDuration - duration))
    set((st) => ({
      project: withUpdatedAt({
        ...st.project,
        clips: st.project.clips.map((c) =>
          c.id === clipId
            ? {
                ...c,
                mediaId,
                name: asset.name,
                kind: isImage ? 'image' : asset.kind === 'audio' ? 'audio' : 'video',
                sourceDuration,
                duration,
                trimStart,
                // source-dependent state resets — the new media starts clean
                speed: 1,
                reverse: false,
                crop: null,
              }
            : c
        ),
      }),
    }))
    return true
  },

  insertFreezeFrame: async () => {
    const s = get()
    const t = s.currentTime
    const visuals = s.project.clips.filter((c) => c.kind === 'video' || c.kind === 'image')
    const target =
      visuals.find((c) => s.selectedClipIds.includes(c.id) && t > c.start && t < c.start + c.duration) ??
      visuals.find((c) => t >= c.start && t < c.start + c.duration)
    if (!target) return false
    const { getEngine } = await import('./engine')
    const cap = getEngine().captureFrame()
    if (!cap) return false
    const blob = await cap.blob
    if (!blob) return false
    const asset: MediaAssetRuntime = {
      id: uid('asset_'),
      name: `Freeze ${formatTimecode(t, s.project.fps)}`,
      kind: 'image',
      mimeType: 'image/png',
      size: blob.size,
      duration: 0,
      width: s.project.canvasWidth,
      height: s.project.canvasHeight,
      thumbnail: cap.dataUrl,
      createdAt: Date.now(),
      objectUrl: URL.createObjectURL(blob),
      rawBlob: blob,
    }
    s.pushHistory()
    const freezeDur = 3
    const trackId = target.trackId
    let clips = [...s.project.clips]
    // split the target at the playhead when strictly inside it
    const local = t - target.start
    if (local > 0.08 && local < target.duration - 0.08) {
      const leftDur = round2(local)
      const rightDur = round2(target.duration - local)
      const rightClip: Clip = {
        ...JSON.parse(JSON.stringify(target)),
        id: uid('clip_'),
        start: round2(target.start + local),
        duration: rightDur,
        trimStart: round2(target.trimStart + local * target.speed),
        fadeIn: 0,
      }
      clips = clips.map((c) => (c.id === target.id ? { ...c, duration: leftDur, fadeOut: 0 } : c))
      clips.push(rightClip)
    }
    const stillClip = createClipFromMedia(s.project, asset, trackId, round2(t))
    stillClip.duration = freezeDur
    // ripple: same-track clips at/after the playhead slide right by the still's length
    clips = clips.map((c) =>
      c.trackId === trackId && c.start >= t - 0.001 && c.id !== stillClip.id ? { ...c, start: round2(c.start + freezeDur) } : c
    )
    clips.push(stillClip)
    set((st) => ({
      media: [asset, ...st.media],
      mediaVersion: st.mediaVersion + 1,
      project: withUpdatedAt({ ...st.project, clips }),
      selectedClipIds: [stillClip.id],
    }))
    db.putAsset(
      {
        id: asset.id,
        name: asset.name,
        kind: asset.kind,
        mimeType: asset.mimeType,
        size: asset.size,
        duration: asset.duration,
        width: asset.width,
        height: asset.height,
        thumbnail: asset.thumbnail,
        createdAt: asset.createdAt,
      },
      blob
    ).catch((e) => console.error('freeze asset save failed', e))
    return true
  },

  extractAudioFromVideo: async () => {
    const s = get()
    const t = s.currentTime
    const videos = s.project.clips.filter((c) => c.kind === 'video')
    const target =
      videos.find((c) => s.selectedClipIds.includes(c.id)) ??
      videos.find((c) => t >= c.start && t < c.start + c.duration)
    if (!target) return 'no-video'
    const source = s.media.find((m) => m.id === target.mediaId)
    if (!source) return 'no-video'
    try {
      // Day 62 — rehydrate an evicted asset before decoding
      const { ensureAssetReady } = await import('./memory-manager')
      const ready = await ensureAssetReady(source.id)
      if (!ready?.rawBlob) return 'no-video'
      // decode the embedded audio track straight from the source blob
      const { decodeSource } = await import('../effects/voice')
      const { encodeWav16BitStereo } = await import('../effects/audio-render')
      const buffer = await decodeSource(ready.rawBlob)
      if (!buffer.length) return 'no-audio'
      // slice exactly the clip's trimmed source window (respects speed)
      const sr = buffer.sampleRate
      const from = Math.min(Math.max(0, buffer.length - 1), Math.max(0, Math.round(target.trimStart * sr)))
      const len = Math.max(1, Math.min(buffer.length - from, Math.round(target.duration * target.speed * sr)))
      let ctx: BaseAudioContext
      try {
        ctx = new OfflineAudioContext(1, 2, sr)
      } catch {
        ctx = new AudioContext()
      }
      const win = ctx.createBuffer(Math.min(2, buffer.numberOfChannels), len, sr)
      for (let c = 0; c < win.numberOfChannels; c++) {
        win.copyToChannel(buffer.getChannelData(c).subarray(from, from + len), c)
      }
      const wav = encodeWav16BitStereo(win, 1)
      const { importFiles } = await import('./importer')
      const assets = await importFiles([new File([wav], `audio-${target.id}.wav`, { type: 'audio/wav' })])
      if (assets.length === 0 || !assets[0]) return 'failed'
      const audioAsset = assets[0]
      get().addMediaAsset(audioAsset)
      // find or create an unlocked audio track
      const st = get()
      let audioTrack =
        st.project.tracks.find((tr) => tr.kind === 'audio' && !tr.locked) ??
        st.project.tracks.find((tr) => tr.kind === 'audio')
      if (!audioTrack) {
        get().addTrack('audio')
        audioTrack = get().project.tracks.find((tr) => tr.kind === 'audio')
      }
      if (!audioTrack) return 'failed'
      const audioClip = createClipFromMedia(get().project, audioAsset, audioTrack.id, round2(target.start))
      audioClip.name = `Audio · ${target.name}`
      // addClip pushes the history snapshot; the mute patch below has no history
      // flag, so ONE undo reverts the extracted clip + the video mute together
      get().addClip(audioClip)
      get().updateClip(target.id, { volume: 0, muted: true })
      return 'ok'
    } catch (e) {
      // decodeAudioData rejects on video files that carry no audio track
      console.error('extractAudioFromVideo failed', e)
      return 'no-audio'
    }
  },

  deleteClip: (id) => {
    const s = get()
    // the open compound container can't be deleted while its session runs —
    // exit first (the members are ordinary clips and delete normally)
    if (s.project.clips.some((c) => c.id === id && c.kind === 'nested' && c.nested?.open)) return
    get().pushHistory()
    set((st) => ({
      project: withUpdatedAt({ ...st.project, clips: st.project.clips.filter((c) => c.id !== id) }),
      selectedClipIds: s.selectedClipIds.filter((cid) => cid !== id),
    }))
  },

  deleteSelected: () => {
    const s = get()
    if (!s.selectedClipIds.length) return
    s.pushHistory()
    set((st) => ({
      project: withUpdatedAt({
        ...st.project,
        clips: st.project.clips.filter((c) => !st.selectedClipIds.includes(c.id) && !(c.kind === 'nested' && c.nested?.open)),
      }),
      selectedClipIds: [],
    }))
  },

  rippleDeleteSelected: () => {
    const s = get()
    if (!s.selectedClipIds.length) return
    s.pushHistory()
    set((st) => {
      const removed = st.project.clips.filter((c) => st.selectedClipIds.includes(c.id))
      // deep-clone survivors so we never mutate state objects in place
      const clips: Clip[] = st.project.clips
        .filter((c) => !st.selectedClipIds.includes(c.id))
        .map((c) => JSON.parse(JSON.stringify(c)) as Clip)
      // close gaps: shift later clips on the same track left by the removed clip's span
      for (const gone of removed) {
        const gap = gone.duration
        for (const c of clips) {
          if (c.trackId === gone.trackId && c.start >= gone.start - 0.001) {
            c.start = Math.max(0, round2(c.start - gap))
          }
        }
      }
      return { project: withUpdatedAt({ ...st.project, clips }), selectedClipIds: [] }
    })
  },

  /* ================= keyframes ================= */

  addKeyframeAtPlayhead: (clipId, property) => {
    const s = get()
    const clip = s.project.clips.find((c) => c.id === clipId)
    if (!clip) return
    const tLocal = round2(clamp(s.currentTime - clip.start, 0, clip.duration))
    const existing = (clip.keyframes ?? []).find((k) => k.property === property && Math.abs(k.time - tLocal) < 0.05)
    if (existing) return
    // value: the property's CURRENT base value (what the user just set via the
    // sliders). Interpolating existing keys here would silently ignore the edit
    // the user made right before pressing the diamond.
    const value = baseValueForProperty(clip, property)
    const kf: Keyframe = { id: uid('kf_'), property, time: tLocal, value, easing: 'easeInOut' }
    get().pushHistory()
    set((st) => ({
      project: withUpdatedAt({
        ...st.project,
        clips: st.project.clips.map((c) => (c.id === clipId ? { ...c, keyframes: [...(c.keyframes ?? []), kf] } : c)),
      }),
    }))
  },

  addKeyframeAt: (clipId, property, time, value) => {
    const s = get()
    const clip = s.project.clips.find((c) => c.id === clipId)
    if (!clip) return
    const tLocal = round2(clamp(time, 0, clip.duration))
    const existing = (clip.keyframes ?? []).find((k) => k.property === property && Math.abs(k.time - tLocal) < 0.05)
    get().pushHistory('kf-add')
    if (existing) {
      // same slot: update the value instead of stacking two keys on one frame
      set((st) => ({
        project: withUpdatedAt({
          ...st.project,
          clips: st.project.clips.map((c) =>
            c.id === clipId
              ? { ...c, keyframes: (c.keyframes ?? []).map((k) => (k.id === existing.id ? { ...k, value } : k)) }
              : c
          ),
        }),
      }))
      return
    }
    const kf: Keyframe = { id: uid('kf_'), property, time: tLocal, value, easing: 'easeInOut' }
    set((st) => ({
      project: withUpdatedAt({
        ...st.project,
        clips: st.project.clips.map((c) => (c.id === clipId ? { ...c, keyframes: [...(c.keyframes ?? []), kf] } : c)),
      }),
    }))
  },

  updateKeyframe: (clipId, kfId, patch, history) => {
    if (history === true) get().pushHistory()
    else if (typeof history === 'string') get().pushHistory(history)
    set((st) => ({
      project: withUpdatedAt({
        ...st.project,
        clips: st.project.clips.map((c) =>
          c.id === clipId
            ? { ...c, keyframes: (c.keyframes ?? []).map((k) => (k.id === kfId ? { ...k, ...patch } : k)) }
            : c
        ),
      }),
    }))
  },

  removeKeyframe: (clipId, kfId) => {
    get().pushHistory()
    set((st) => ({
      project: withUpdatedAt({
        ...st.project,
        clips: st.project.clips.map((c) =>
          c.id === clipId ? { ...c, keyframes: (c.keyframes ?? []).filter((k) => k.id !== kfId) } : c
        ),
      }),
    }))
  },

  /* ================= captions ================= */

  addCaptionClips: (segments) => {
    if (!segments.length) return 0
    const s = get()
    const clips = buildCaptionClips(s.project, segments)
    s.pushHistory()
    set((st) => ({
      project: withUpdatedAt({ ...st.project, clips: [...st.project.clips, ...clips] }),
    }))
    get().joinSession(clips.map((c) => c.id))
    return clips.length
  },

  duplicateClip: (id) => {
    const s = get()
    const clip = s.project.clips.find((c) => c.id === id)
    if (!clip) return
    const copy: Clip = { ...JSON.parse(JSON.stringify(clip)), id: uid('clip_'), start: round2(clip.start + clip.duration) }
    s.addClip(copy)
  },

  duplicateSelected: () => {
    const s = get()
    const sel = s.project.clips.filter((c) => s.selectedClipIds.includes(c.id))
    if (!sel.length) return
    s.pushHistory()
    const selStart = Math.min(...sel.map((c) => c.start))
    const selEnd = Math.max(...sel.map((c) => c.start + c.duration))
    const offset = selEnd - selStart
    const copies = sel.map((c) => ({
      ...(JSON.parse(JSON.stringify(c)) as Clip),
      id: uid('clip_'),
      start: round2(c.start + offset),
    }))
    set((st) => ({
      project: withUpdatedAt({ ...st.project, clips: [...st.project.clips, ...copies] }),
      selectedClipIds: copies.map((c) => c.id),
    }))
    get().joinSession(copies.map((c) => c.id))
  },

  /* ================= nested (compound) clips ================= */

  groupSelectedClips: () => {
    const s = get()
    if (openCompound(s.project)) return false // no compounds inside compounds
    const sel = s.project.clips.filter((c) => s.selectedClipIds.includes(c.id))
    if (sel.length < 2) return false
    if (sel.some((c) => c.kind === 'nested')) return false
    // adjustment layers cannot live inside compounds (their FX resolve against
    // TOP-LEVEL tracks at render time; nesting would silently change scope)
    if (sel.some((c) => c.kind === 'adjustment')) return false
    const minStart = Math.min(...sel.map((c) => c.start))
    const end = Math.max(...sel.map((c) => c.start + c.duration))
    const span = round2(end - minStart)
    if (span < MIN_CLIP_DURATION) return false
    // the container sits on the most prominent selected track (video first)
    const anchor = sel.find((c) => c.kind === 'video') ?? sel.find((c) => c.kind !== 'audio') ?? sel[0]
    // children keep their own tracks & styles; starts become relative offsets
    const children: Clip[] = sel.map((c) => ({
      ...(JSON.parse(JSON.stringify(c)) as Clip),
      id: uid('clip_'),
      start: round2(c.start - minStart),
    }))
    const compoundIndex = s.project.clips.filter((c) => c.kind === 'nested').length + 1
    const compound: Clip = {
      id: uid('clip_'),
      trackId: anchor.trackId,
      kind: 'nested',
      name: `Compound ${compoundIndex}`,
      start: minStart,
      duration: span,
      trimStart: 0,
      sourceDuration: 3600,
      speed: 1,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
      transform: { ...DEFAULT_TRANSFORM },
      filters: { ...DEFAULT_FILTERS },
      motion: 'none',
      motionIntensity: 0.35,
      keyframes: [],
      blendMode: 'source-over',
      chromaKey: { ...DEFAULT_CHROMA_KEY },
      colorGrade: { ...DEFAULT_COLOR_GRADE },
      nested: { children },
      color: '#a78bfa',
    }
    s.pushHistory()
    set((st) => ({
      project: withUpdatedAt({
        ...st.project,
        clips: [...st.project.clips.filter((c) => !st.selectedClipIds.includes(c.id)), compound],
      }),
      selectedClipIds: [compound.id],
    }))
    return true
  },

  ungroupSelectedClip: () => {
    const s = get()
    if (openCompound(s.project)) return false // exit the session first
    if (s.selectedClipIds.length !== 1) return false
    const clip = s.project.clips.find((c) => c.id === s.selectedClipIds[0])
    if (!clip || !isNestedClip(clip)) return false
    s.pushHistory()
    const restored: Clip[] = clip.nested!.children.map((ch) => ({
      ...(JSON.parse(JSON.stringify(ch)) as Clip),
      start: round2(clip.start + ch.start),
    }))
    set((st) => ({
      project: withUpdatedAt({
        ...st.project,
        clips: [...st.project.clips.filter((c) => c.id !== clip.id), ...restored],
      }),
      selectedClipIds: restored.map((c) => c.id),
    }))
    return true
  },

  enterNestedClip: (id) => {
    const s = get()
    if (openCompound(s.project)) return false // one compound at a time (honest scope)
    const clip = s.project.clips.find((c) => c.id === id)
    if (!clip || !isNestedClip(clip)) return false
    s.pushHistory()
    const materialized: Clip[] = clip.nested!.children.map((ch) => ({
      ...(JSON.parse(JSON.stringify(ch)) as Clip),
      id: uid('clip_'),
      start: round2(clip.start + ch.start),
    }))
    const ids = materialized.map((c) => c.id)
    const t0 = clip.start
    const t1 = clip.start + clip.duration
    set((st) => ({
      project: withUpdatedAt({
        ...st.project,
        clips: [
          ...st.project.clips.map((c) =>
            c.id === clip.id ? { ...c, nested: { ...c.nested!, open: true, memberIds: ids } } : c
          ),
          ...materialized,
        ],
      }),
      selectedClipIds: [],
      currentTime: clamp(s.currentTime, t0, Math.max(t0, t1)),
      isPlaying: false,
    }))
    return true
  },

  exitNestedSession: () => {
    const s = get()
    const compound = openCompound(s.project)
    if (!compound) return false
    s.pushHistory()
    const memberIds = compound.nested?.memberIds ?? []
    const members = s.project.clips.filter((c) => memberIds.includes(c.id))
    if (!members.length) {
      // everything inside was deleted — the empty compound goes with it
      set((st) => ({
        project: withUpdatedAt({ ...st.project, clips: st.project.clips.filter((c) => c.id !== compound.id) }),
        selectedClipIds: [],
      }))
      return true
    }
    const minStart = Math.min(...members.map((c) => c.start))
    const end = Math.max(...members.map((c) => c.start + c.duration))
    const span = round2(Math.max(end - minStart, MIN_CLIP_DURATION))
    const packed: Clip = {
      ...compound,
      start: round2(minStart),
      duration: span,
      nested: {
        children: members.map((m) => ({
          ...(JSON.parse(JSON.stringify(m)) as Clip),
          start: round2(m.start - minStart),
        })),
        open: false,
        memberIds: [],
      },
    }
    set((st) => ({
      project: withUpdatedAt({
        ...st.project,
        clips: [...st.project.clips.filter((c) => c.id !== compound.id && !memberIds.includes(c.id)), packed],
      }),
      selectedClipIds: [packed.id],
    }))
    return true
  },

  joinSession: (ids) => {
    if (!ids.length) return
    set((st) => {
      const compound = openCompound(st.project)
      if (!compound) return st
      return {
        project: withUpdatedAt({
          ...st.project,
          clips: st.project.clips.map((c) =>
            c.id === compound.id ? { ...c, nested: { ...c.nested!, memberIds: [...(c.nested?.memberIds ?? []), ...ids] } } : c
          ),
        }),
      }
    })
  },

  selectClip: (id, additive) => {
    if (id === null) {
      set({ selectedClipIds: [] })
      return
    }
    set((s) => {
      if (additive) {
        return {
          selectedClipIds: s.selectedClipIds.includes(id)
            ? s.selectedClipIds.filter((c) => c !== id)
            : [...s.selectedClipIds, id],
        }
      }
      return { selectedClipIds: [id] }
    })
  },

  setSelection: (ids) => {
    set({ selectedClipIds: ids })
  },

  copySelected: () => {
    const s = get()
    if (!s.selectedClipIds.length) return
    clipboardClips = s.project.clips
      .filter((c) => s.selectedClipIds.includes(c.id))
      .map((c) => JSON.parse(JSON.stringify(c)) as Clip)
      .sort((a, b) => a.start - b.start)
    if (clipboardClips.length) set({ hasClipboard: true })
  },

  copyAttributes: (id) => {
    const s = get()
    const sourceId = id ?? s.selectedClipIds[0]
    if (!sourceId) return false
    const clip = s.project.clips.find((c) => c.id === sourceId)
    if (!clip) return false
    // pick every look/feel group — paste filters by target kind
    const attrs: Partial<Clip> = JSON.parse(
      JSON.stringify({
        transform: clip.transform,
        filters: clip.filters,
        colorGrade: clip.colorGrade,
        lutId: clip.lutId,
        lutIntensity: clip.lutIntensity,
        motion: clip.motion,
        motionIntensity: clip.motionIntensity,
        blendMode: clip.blendMode,
        chromaKey: clip.chromaKey,
        crop: clip.crop,
        fit: clip.fit,
        mask: clip.mask,
        overlay: clip.overlay,
        vision: clip.vision,
        audioFx: clip.audioFx,
        fadeIn: clip.fadeIn,
        fadeOut: clip.fadeOut,
        keyframes: clip.keyframes,
        textStyle: clip.textStyle,
        sticker: clip.sticker,
      }),
    )
    set({ copiedAttributes: { attrs, from: clip.name } })
    return true
  },

  pasteAttributes: (id) => {
    const s = get()
    const stash = s.copiedAttributes
    if (!stash) return 0
    const targets = (id ? [id] : s.selectedClipIds).filter(Boolean)
    if (!targets.length) return 0
    s.pushHistory('paste-attrs')
    let count = 0
    set((st) => ({
      project: withUpdatedAt({
        ...st.project,
        clips: st.project.clips.map((c) => {
          if (!targets.includes(c.id)) return c
          count++
          const a = stash.attrs
          const next: Clip = { ...c }
          // universal groups
          if (a.transform) next.transform = { ...a.transform }
          if (a.filters) next.filters = { ...a.filters }
          if (a.colorGrade !== undefined) next.colorGrade = a.colorGrade ? { ...a.colorGrade } : undefined
          if (a.lutId !== undefined) next.lutId = a.lutId
          if (a.lutIntensity !== undefined) next.lutIntensity = a.lutIntensity
          if (a.motion !== undefined) next.motion = a.motion
          if (a.motionIntensity !== undefined) next.motionIntensity = a.motionIntensity
          if (a.blendMode !== undefined) next.blendMode = a.blendMode
          if (a.overlay !== undefined) next.overlay = a.overlay ? { ...a.overlay } : null
          if (a.vision !== undefined) next.vision = a.vision ? { ...a.vision } : null
          if (a.audioFx !== undefined) next.audioFx = a.audioFx ? { ...a.audioFx } : null
          if (a.fadeIn !== undefined) next.fadeIn = a.fadeIn
          if (a.fadeOut !== undefined) next.fadeOut = a.fadeOut
          if (a.keyframes) next.keyframes = JSON.parse(JSON.stringify(a.keyframes)).map((k: Keyframe) => ({ ...k, id: uid('kf_') }))
          // kind-gated groups — text style only onto text, sticker art only onto stickers
          if (a.textStyle && c.kind === 'text') next.textStyle = { ...a.textStyle }
          if (a.sticker && c.kind === 'sticker') next.sticker = { ...a.sticker }
          // crop/fit/mask are meaningless for audio
          if (c.kind !== 'audio') {
            if (a.crop !== undefined) next.crop = a.crop ? { ...a.crop } : null
            if (a.fit !== undefined) next.fit = a.fit
            if (a.mask !== undefined) next.mask = a.mask ? { ...a.mask } : null
          }
          if (a.chromaKey !== undefined && (c.kind === 'video' || c.kind === 'image')) {
            next.chromaKey = a.chromaKey ? { ...a.chromaKey } : undefined
          }
          return next
        }),
      }),
    }))
    return count
  },

  cutSelected: () => {
    const s = get()
    if (!s.selectedClipIds.length) return
    s.copySelected()
    s.deleteSelected()
  },

  pasteAtPlayhead: () => {
    const s = get()
    if (!clipboardClips.length) return
    const offset = round2(s.currentTime - clipboardClips[0].start)
    const trackIds = new Set(s.project.tracks.map((tr) => tr.id))
    const clones = clipboardClips.map((c) => {
      const copy: Clip = { ...JSON.parse(JSON.stringify(c)), id: uid('clip_') }
      copy.start = Math.max(0, round2(copy.start + offset))
      // original track may have been deleted since the copy — fall back to a compatible one
      if (!trackIds.has(copy.trackId)) {
        const fallback =
          copy.kind === 'audio'
            ? s.project.tracks.find((tr) => tr.kind === 'audio')
            : s.project.tracks.find((tr) => tr.kind === 'video' || tr.kind === 'overlay')
        if (fallback) copy.trackId = fallback.id
      }
      return copy
    })
    s.pushHistory()
    set((st) => ({
      project: withUpdatedAt({ ...st.project, clips: [...st.project.clips, ...clones] }),
      selectedClipIds: clones.map((c) => c.id),
    }))
    get().joinSession(clones.map((c) => c.id))
  },

  selectAll: () => {
    set((s) => ({ selectedClipIds: s.project.clips.map((c) => c.id) }))
  },

  addMarkerAtPlayhead: () => {
    const s = get()
    const t = round2(s.currentTime)
    const existing = s.project.markers ?? []
    if (existing.some((m) => Math.abs(m.t - t) < 0.05)) return false
    s.pushHistory('marker-add')
    const marker: TimelineMarker = {
      id: uid('mk_'),
      t,
      label: `Marker ${existing.length + 1}`,
      color: MARKER_COLORS[existing.length % MARKER_COLORS.length],
    }
    set((st) => ({ project: withUpdatedAt({ ...st.project, markers: [...(st.project.markers ?? []), marker] }) }))
    return true
  },

  removeMarkerAtPlayhead: () => {
    const s = get()
    const existing = s.project.markers ?? []
    if (!existing.length) return
    const t = s.currentTime
    const nearest = existing.reduce((best, m) => (Math.abs(m.t - t) < Math.abs(best.t - t) ? m : best))
    if (Math.abs(nearest.t - t) > 0.5) return
    s.pushHistory('marker-del')
    set((st) => ({ project: withUpdatedAt({ ...st.project, markers: (st.project.markers ?? []).filter((m) => m.id !== nearest.id) }) }))
  },

  updateMarker: (id, patch, history = 'marker-edit') => {
    if (history === true) get().pushHistory()
    else if (typeof history === 'string') get().pushHistory(history)
    set((st) => ({
      project: withUpdatedAt({
        ...st.project,
        markers: (st.project.markers ?? []).map((m) =>
          m.id === id
            ? {
                ...m,
                ...(patch.t !== undefined ? { t: Math.max(0, round2(patch.t)) } : null),
                ...(patch.label !== undefined ? { label: patch.label } : null),
                ...(patch.color !== undefined ? { color: patch.color } : null),
              }
            : m,
        ),
      }),
    }))
  },

  removeMarker: (id) => {
    get().pushHistory('marker-del')
    set((st) => ({ project: withUpdatedAt({ ...st.project, markers: (st.project.markers ?? []).filter((m) => m.id !== id) }) }))
  },

  clearMarkers: () => {
    if (!(get().project.markers ?? []).length) return
    get().pushHistory('marker-clear')
    set((st) => ({ project: withUpdatedAt({ ...st.project, markers: [] }) }))
  },

  jumpMarker: (dir) => {
    const s = get()
    const ms = (s.project.markers ?? []).map((m) => round2(m.t))
    const t = s.currentTime
    const candidates = ms.filter((p) => (dir === 1 ? p > t + 0.02 : p < t - 0.02)).sort((a, b) => a - b)
    const target = dir === 1 ? candidates[0] : candidates[candidates.length - 1]
    if (target === undefined) return false
    s.setCurrentTime(target)
    return true
  },

  /* ================= pro tools ================= */

  setToolMode: (mode) => set({ toolMode: mode }),

  jklAction: (key) => {
    const s = get()
    if (key === 'k') {
      set({ isPlaying: false, jklRate: 0 })
      return
    }
    if (key === 'l') {
      // L: play forward — first press 1×, again 2×, again 4× (capped); from reverse restarts at 1×
      if (!s.isPlaying || s.jklRate <= 0) set({ isPlaying: true, jklRate: 1 })
      else set({ jklRate: Math.min(4, s.jklRate * 2) })
      return
    }
    // J: reverse — first press -1×, again -2×, again -4×; from forward restarts at -1×
    if (!s.isPlaying || s.jklRate >= 0) set({ isPlaying: true, jklRate: -1 })
    else set({ jklRate: Math.max(-4, s.jklRate * 2) })
  },

  markIn: () => {
    const t = round2(get().currentTime)
    set((s) => ({ inPoint: t, outPoint: s.outPoint !== null && s.outPoint <= t ? null : s.outPoint }))
  },

  markOut: () => {
    const t = round2(get().currentTime)
    set((s) => ({ outPoint: t, inPoint: s.inPoint !== null && s.inPoint >= t ? null : s.inPoint }))
  },

  clearInOut: () => set({ inPoint: null, outPoint: null }),

  jumpEdit: (dir) => {
    const s = get()
    const pts = new Set<number>()
    for (const c of s.project.clips) {
      pts.add(round2(c.start))
      pts.add(round2(c.start + c.duration))
    }
    for (const m of s.project.markers ?? []) pts.add(round2(m.t))
    const t = s.currentTime
    const candidates = [...pts].filter((p) => (dir === 1 ? p > t + 0.02 : p < t - 0.02)).sort((a, b) => a - b)
    const target = dir === 1 ? candidates[0] : candidates[candidates.length - 1]
    if (target === undefined) return false
    s.setCurrentTime(target)
    return true
  },

  nudgeSelected: (delta) => {
    const s = get()
    if (!s.selectedClipIds.length || delta === 0) return
    s.pushHistory()
    set((st) => ({
      project: withUpdatedAt({
        ...st.project,
        clips: st.project.clips.map((c) =>
          st.selectedClipIds.includes(c.id) ? { ...c, start: Math.max(0, round2(c.start + delta)) } : c,
        ),
      }),
    }))
  },

  rippleTrimEndToPlayhead: () => {
    const s = get()
    const t = s.currentTime
    const target = pickTrimTarget(s.project.clips, s.selectedClipIds, t)
    if (!target) return false
    const cut = t - target.start
    const removed = target.duration - cut
    if (removed < 0.05) return false
    s.pushHistory()
    set((st) => ({
      project: withUpdatedAt({
        ...st.project,
        clips: st.project.clips.map((c) => {
          if (c.id === target.id) return { ...c, duration: round2(cut) }
          if (c.trackId === target.trackId && c.start >= target.start + target.duration - 0.001) {
            return { ...c, start: Math.max(0, round2(c.start - removed)) }
          }
          return c
        }),
      }),
    }))
    return true
  },

  rippleTrimStartToPlayhead: () => {
    const s = get()
    const t = s.currentTime
    const target = pickTrimTarget(s.project.clips, s.selectedClipIds, t)
    if (target) {
      const trimmed = t - target.start
      if (trimmed < 0.05) return false
      s.pushHistory()
      set((st) => ({
        project: withUpdatedAt({
          ...st.project,
          clips: st.project.clips.map((c) =>
            c.id === target.id
              ? {
                  ...c,
                  start: round2(t),
                  duration: round2(c.duration - trimmed),
                  trimStart: round2(c.trimStart + trimmed * c.speed),
                }
              : c
          ),
        }),
      }))
      return true
    }
    // nothing under the playhead — pull the next clip (selected clip's track when one
    // is selected, else the earliest VISUAL clip after the playhead, then any track)
    const sel = s.project.clips.find((c) => s.selectedClipIds.includes(c.id))
    const after = s.project.clips
      .filter((c) => c.start > t + 0.02 && (!sel || c.trackId === sel.trackId))
      .sort((a, b) => a.start - b.start)
    const first = after.find((c) => c.kind !== 'audio') ?? after[0]
    if (!first) return false
    const delta = t - first.start
    s.pushHistory()
    set((st) => ({
      project: withUpdatedAt({
        ...st.project,
        clips: st.project.clips.map((c) =>
          c.trackId === first.trackId && c.start >= first.start - 0.001
            ? { ...c, start: Math.max(0, round2(c.start + delta)) }
            : c
        ),
      }),
    }))
    return true
  },

  liftInOut: () => {
    const s = get()
    const { inPoint, outPoint } = s
    if (inPoint === null || outPoint === null || outPoint - inPoint < 0.05) return false
    s.pushHistory()
    set((st) => ({
      project: withUpdatedAt({ ...st.project, clips: exciseRange(st.project.clips, inPoint, outPoint, false) }),
      selectedClipIds: [],
    }))
    return true
  },

  extractInOut: () => {
    const s = get()
    const { inPoint, outPoint } = s
    if (inPoint === null || outPoint === null || outPoint - inPoint < 0.05) return false
    const range = outPoint - inPoint
    s.pushHistory()
    set((st) => ({
      project: withUpdatedAt({ ...st.project, clips: exciseRange(st.project.clips, inPoint, outPoint, true, range) }),
      selectedClipIds: [],
    }))
    return true
  },

  zoomFit: () => {
    if (typeof document === 'undefined') return
    const el = document.getElementById('nc-timeline-scroll')
    const dur = projectDuration(get().project)
    if (!el || dur <= 0) return
    set({ zoom: clamp((el.clientWidth - 180 - 40) / dur, 8, 400) })
  },

  /* ================= tracks ================= */

  addTrack: (kind) => {
    get().pushHistory()
    set((s) => {
      const count = s.project.tracks.filter((t) => t.kind === kind).length + 1
      const labels: Record<TrackKind, string> = { video: 'Video', overlay: 'Overlay', audio: 'Audio' }
      const track = createTrack(kind, `${labels[kind]} ${count}`)
      const tracks = [...s.project.tracks]
      // overlay tracks go on top, audio at bottom
      if (kind === 'overlay') tracks.unshift(track)
      else if (kind === 'video') {
        const firstAudioIdx = tracks.findIndex((t) => t.kind === 'audio')
        tracks.splice(firstAudioIdx === -1 ? tracks.length : firstAudioIdx, 0, track)
      } else tracks.push(track)
      return { project: withUpdatedAt({ ...s.project, tracks }) }
    })
  },

  updateTrack: (id, patch, history) => {
    if (history === true) get().pushHistory()
    else if (typeof history === 'string') get().pushHistory(history)
    set((s) => ({
      project: withUpdatedAt({ ...s.project, tracks: s.project.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }),
    }))
  },

  removeTrack: (id) => {
    const s = get()
    const track = s.project.tracks.find((t) => t.id === id)
    if (!track || s.project.tracks.length <= 1) return
    s.pushHistory()
    set((st) => ({
      project: withUpdatedAt({
        ...st.project,
        tracks: st.project.tracks.filter((t) => t.id !== id),
        clips: st.project.clips.filter((c) => c.trackId !== id),
      }),
      selectedClipIds: [],
    }))
  },

  setTrackVolume: (id, volume, history) => {
    if (history === true) get().pushHistory()
    else if (typeof history === 'string') get().pushHistory(history)
    set((s) => ({
      project: withUpdatedAt({
        ...s.project,
        tracks: s.project.tracks.map((t) => (t.id === id ? { ...t, volume: clamp(volume, 0, 1.5) } : t)),
      }),
    }))
  },

  setTrackSolo: (id, solo) => {
    get().pushHistory()
    set((s) => ({
      project: withUpdatedAt({
        ...s.project,
        // solo is exclusive — soloing one track clears every other solo flag
        tracks: s.project.tracks.map((t) => ({ ...t, solo: t.id === id ? solo : false })),
      }),
    }))
  },

  /* ================= versions ================= */

  versions: [],
  versionsLoaded: false,

  loadVersions: async () => {
    try {
      const versions = await db.listVersions(get().project.id)
      set({ versions: versions.sort((a, b) => b.createdAt - a.createdAt), versionsLoaded: true })
    } catch {
      set({ versionsLoaded: true })
    }
  },

  saveVersion: async (name) => {
    const s = get()
    const snapshot: VersionSnapshot = {
      id: uid('ver_'),
      projectId: s.project.id,
      name: name?.trim() || `Version ${new Date().toLocaleString()}`,
      createdAt: Date.now(),
      project: cloneProject(s.project),
    }
    await db.putVersion(snapshot)
    set((st) => ({ versions: [snapshot, ...st.versions].slice(0, 30) }))
  },

  restoreVersion: async (id) => {
    const snap = get().versions.find((v) => v.id === id)
    if (!snap) return
    const restored = cloneProject(snap.project)
    get().pushHistory()
    suppressSave = true
    set({ project: restored, selectedClipIds: [], past: [], future: [], currentTime: 0, isPlaying: false })
    await db.saveProject(restored)
    suppressSave = false
  },

  deleteVersion: async (id) => {
    await db.deleteVersion(id)
    set((st) => ({ versions: st.versions.filter((v) => v.id !== id) }))
  },

  /* ================= playback ================= */

  setCurrentTime: (t) => {
    const dur = projectDuration(get().project)
    const next = clamp(t, 0, Math.max(dur, 0.0001))
    set({ currentTime: next })
  },

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),

  frameStep: (dir) => {
    const s = get()
    const step = 1 / s.project.fps
    s.setCurrentTime(s.currentTime + dir * step)
  },

  setMasterVolume: (v) => set({ masterVolume: clamp(v, 0, 1), masterMuted: v === 0 ? get().masterMuted : false }),
  toggleMasterMuted: () => set((s) => ({ masterMuted: !s.masterMuted })),

  /* ================= view ================= */

  setZoom: (z) => set({ zoom: clamp(z, 8, 400) }),
  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
  // zoomFit lives with the pro-tools cluster above (needs the project duration)
  setBeatMarkers: (times, bpm) => set({ beatMarkers: times, beatBpm: bpm, showBeatMarkers: true }),
  clearBeatMarkers: () => set({ beatMarkers: [], beatBpm: null }),

  // Day 26 — detected beats become REAL timeline markers (Day 08 pins:
  // colored, labeled, jumpable, project-persisted). Stride thins the grid
  // (1 = every beat, 2 = half notes, 4 = downbeats). One undoable step.
  addBeatMarkersToTimeline: (stride) => {
    const s = get()
    const beats = s.beatMarkers
    if (!beats.length) return 0
    const n = Math.max(1, Math.floor(stride ?? 1))
    const existing = s.project.markers ?? []
    const added: TimelineMarker[] = []
    beats.forEach((t, i) => {
      if (i % n !== 0) return
      if (existing.some((m) => Math.abs(m.t - t) < 0.05)) return
      if (added.some((m) => Math.abs(m.t - t) < 0.05)) return
      added.push({
        id: uid('mk_'),
        t: round2(t),
        label: `♪ Beat ${i + 1}`,
        color: MARKER_COLORS[(existing.length + added.length) % MARKER_COLORS.length],
      })
    })
    if (!added.length) return 0
    s.pushHistory('beat-markers')
    set((st) => ({ project: withUpdatedAt({ ...st.project, markers: [...(st.project.markers ?? []), ...added] }) }))
    return added.length
  },
  toggleShowBeatMarkers: () => set((s) => ({ showBeatMarkers: !s.showBeatMarkers })),
  setPanelTab: (tab) => {
    // UX60 Phase 3 — smart defaults: remember the tab the user actually works in
    recordPanelTab(tab)
    set({ panelTab: tab })
  },
  setMonitor: (key, on) =>
    set(
      key === 'safe' ? { monitorSafe: on }
      : key === 'thirds' ? { monitorThirds: on }
      : key === 'rulers' ? { monitorRulers: on }
      : key === 'zebra' ? { monitorZebra: on }
      : key === 'falsecolor' ? { monitorFalseColor: on }
      : // guides deep link — seed one vertical + one horizontal on first enable
        on && !useEditor.getState().monitorGuides && useEditor.getState().guides.v.length === 0 && useEditor.getState().guides.h.length === 0
        ? { monitorGuides: true, guides: { v: [1 / 3], h: [1 / 3] } }
        : { monitorGuides: on },
    ),
  toggleMonitor: (key) =>
    set((s) => {
      if (key === 'safe') return { monitorSafe: !s.monitorSafe }
      if (key === 'thirds') return { monitorThirds: !s.monitorThirds }
      if (key === 'rulers') return { monitorRulers: !s.monitorRulers }
      if (key === 'zebra') return { monitorZebra: !s.monitorZebra }
      if (key === 'falsecolor') return { monitorFalseColor: !s.monitorFalseColor }
      // guides — seed one vertical + one horizontal on first enable so the tool is visible immediately
      if (s.guides.v.length === 0 && s.guides.h.length === 0)
        return { monitorGuides: !s.monitorGuides, guides: { v: [1 / 3], h: [1 / 3] } }
      return { monitorGuides: !s.monitorGuides }
    }),
  setZebraThreshold: (v) => set({ zebraThreshold: clamp(v, 0.5, 1) }),
  addGuide: (axis, pos) =>
    set((s) => ({
      guides:
        axis === 'v'
          ? { ...s.guides, v: [...s.guides.v, clamp(pos ?? 0.5, 0.02, 0.98)] }
          : { ...s.guides, h: [...s.guides.h, clamp(pos ?? 0.5, 0.02, 0.98)] },
    })),
  moveGuide: (axis, index, pos) =>
    set((s) => ({
      guides:
        axis === 'v'
          ? { ...s.guides, v: s.guides.v.map((p, i) => (i === index ? clamp(pos, 0.02, 0.98) : p)) }
          : { ...s.guides, h: s.guides.h.map((p, i) => (i === index ? clamp(pos, 0.02, 0.98) : p)) },
    })),
  removeGuide: (axis, index) =>
    set((s) => ({
      guides:
        axis === 'v'
          ? { ...s.guides, v: s.guides.v.filter((_, i) => i !== index) }
          : { ...s.guides, h: s.guides.h.filter((_, i) => i !== index) },
    })),
  clearGuides: () => set({ guides: { v: [], h: [] } }),
  setAiSubTab: (tab) => set({ aiSubTab: tab }),
  openDialog: (d) => set({ activeDialog: d }),

  /* ================= export ================= */

  setExportState: (patch) => set((s) => ({ exportState: { ...s.exportState, ...patch } })),
  resetExport: () => set({ exportState: { phase: 'idle', progress: 0 } }),

  /* ================= history ================= */

  beginHistoryGroup: () => get().past.length,

  endHistoryGroup: (before) => {
    const base = Math.max(0, Math.floor(before))
    set((st) => {
      // nothing pushed inside the group → nothing to collapse
      if (st.past.length <= base) return {}
      // keep pre-group entries + the FIRST in-group snapshot (pre-group state)
      return {
        past: st.past.slice(0, base + 1),
        future: [],
        historyPast: st.historyPast.slice(0, base + 1),
        historyFuture: [],
      }
    })
    lastHistoryKey = null
    lastHistoryTime = 0
  },

  pushHistory: (key) => {
    const s = get()
    let label = 'edit'
    if (typeof key === 'string') {
      label = key
      const now = Date.now()
      if (key === lastHistoryKey && now - lastHistoryTime < 900) {
        lastHistoryTime = now
        return
      }
      lastHistoryKey = key
      lastHistoryTime = now
    } else {
      lastHistoryKey = null
      lastHistoryTime = 0
    }
    set((st) => ({
      past: [...st.past.slice(-HISTORY_LIMIT + 1), cloneProject(st.project)],
      historyPast: [...st.historyPast.slice(-HISTORY_LIMIT + 1), { label, at: Date.now() }],
      future: [],
      historyFuture: [],
    }))
  },

  undo: () => {
    const s = get()
    if (!s.past.length) return
    const prev = s.past[s.past.length - 1]
    set((st) => ({
      past: st.past.slice(0, -1),
      historyPast: st.historyPast.slice(0, -1),
      future: [cloneProject(st.project), ...st.future.slice(0, HISTORY_LIMIT - 1)],
      historyFuture: [{ label: st.historyPast[st.historyPast.length - 1]?.label ?? 'edit', at: Date.now() }, ...st.historyFuture.slice(0, HISTORY_LIMIT - 1)],
      project: prev,
      selectedClipIds: st.selectedClipIds.filter((id) => prev.clips.some((c) => c.id === id)),
    }))
  },

  redo: () => {
    const s = get()
    if (!s.future.length) return
    const next = s.future[0]
    set((st) => ({
      future: st.future.slice(1),
      historyFuture: st.historyFuture.slice(1),
      past: [...st.past.slice(-HISTORY_LIMIT + 1), cloneProject(st.project)],
      historyPast: [...st.historyPast.slice(-HISTORY_LIMIT + 1), { label: st.historyFuture[0]?.label ?? 'edit', at: Date.now() }],
      project: next,
      selectedClipIds: st.selectedClipIds.filter((id) => next.clips.some((c) => c.id === id)),
    }))
  },

  undoSteps: (n) => {
    const count = Math.max(0, Math.min(Math.floor(n), get().past.length))
    for (let i = 0; i < count; i++) get().undo()
  },

  redoSteps: (n) => {
    const count = Math.max(0, Math.min(Math.floor(n), get().future.length))
    for (let i = 0; i < count; i++) get().redo()
  },
}))

/* debug/testing handle — lets QA tools drive the store from the console */
if (typeof window !== 'undefined') {
  ;(window as unknown as { __ncStore?: typeof useEditor }).__ncStore = useEditor
}
