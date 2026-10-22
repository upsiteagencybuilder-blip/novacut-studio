'use client'

/**
 * NovaCut Studio — central Zustand store.
 * Single source of truth for project, media, playback & UI state.
 * All components read/write through this store.
 */
import { create } from 'zustand'
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
  type StickerRequest,
  type TextPreset,
} from './constants'
import { baseValueForProperty, clamp, formatTimecode, landingTime, normalizeColorGrade, normalizeFilters, projectDuration, round2, uid } from './utils'
import * as db from './db'

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
  /** true once copy/cut has stashed at least one clip (enables Paste UI) */
  hasClipboard: boolean
  /** user-placed timeline markers in seconds (Shift+M) — view state, not project state */
  userMarkers: number[]

  /* ---------- lifecycle ---------- */
  init: () => Promise<void>
  newProject: (name?: string) => void
  openProject: (id: string) => Promise<void>
  loadDemoProject: () => Promise<void>
  saveNow: () => Promise<void>
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
  addClipFromMediaId: (mediaId: string) => void
  addTextClip: (preset?: TextPreset, at?: { x: number; y: number }) => void
  addStickerClip: (req: StickerRequest) => void
  updateClip: (id: string, patch: ClipPatch, history?: boolean | string) => void
  /** strip a transition between two adjacent clips (fades + wipe mask + iris keys), one undo step */
  removeTransition: (outgoingId: string, incomingId: string) => void
  moveClip: (id: string, start: number, trackId: string | null, history?: boolean | string) => void
  trimClip: (id: string, opts: { start?: number; trimStart?: number; duration?: number }, history?: boolean | string) => void
  splitClip: (id: string, time: number) => void
  splitAtPlayhead: () => void
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
  selectClip: (id: string | null, additive?: boolean) => void
  /** copy selected clips to the internal clipboard (Ctrl+C) */
  copySelected: () => void
  /** copy then delete in one history step (Ctrl+X) */
  cutSelected: () => void
  /** paste clipboard clips starting at the playhead (Ctrl+V) */
  pasteAtPlayhead: () => void
  /** select every clip in the project (Ctrl+A) */
  selectAll: () => void
  /** drop a user marker at the playhead (Shift+M) — returns true when a new marker was added */
  addMarkerAtPlayhead: () => boolean
  /** remove the user marker nearest the playhead (within 0.5s) — returns true when removed */
  removeMarkerAtPlayhead: () => boolean
  clearUserMarkers: () => void

  /* ---------- keyframes ---------- */
  addKeyframeAtPlayhead: (clipId: string, property: KeyframeProperty) => void
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
  toggleShowBeatMarkers: () => void
  setPanelTab: (tab: PanelTab) => void
  /** which card group is open inside the AI panel (deep-link target) */
  aiSubTab: AiSubTab
  setAiSubTab: (tab: AiSubTab) => void
  openDialog: (d: DialogName) => void

  /* ---------- export ---------- */
  setExportState: (patch: Partial<ExportState>) => void
  resetExport: () => void

  /* ---------- history ---------- */
  pushHistory: (key?: string) => void
  undo: () => void
  redo: () => void
}

const HISTORY_LIMIT = 60
let lastHistoryKey: string | null = null
let lastHistoryTime = 0
let savingTimer: ReturnType<typeof setTimeout> | null = null
let suppressSave = false
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
  beatBpm: null,
  showBeatMarkers: true,
  panelTab: 'media',
  aiSubTab: 'assistant',
  activeDialog: null,
  exportState: { phase: 'idle', progress: 0 },
  autosave: 'idle',
  past: [],
  future: [],
  hasClipboard: false,
  userMarkers: [],
  importing: false,

  /* ================= lifecycle ================= */

  init: async () => {
    try {
      const [assets, lastId, projects] = await Promise.all([
        db.listAssets(),
        db.getKV<string>('lastProjectId'),
        db.listProjects(),
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
      set({ media, project, ready: true, currentTime: land })
      setTimeout(() => (suppressSave = false), 0)
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
      // autosave subscription (runs once)
      useEditor.subscribe((state, prev) => {
        if (state.project !== prev.project && !suppressSave) {
          if (savingTimer) clearTimeout(savingTimer)
          set({ autosave: 'saving' })
          savingTimer = setTimeout(async () => {
            try {
              await db.saveProject(get().project)
              await db.setKV('lastProjectId', get().project.id)
              set({ autosave: 'saved' })
            } catch {
              set({ autosave: 'error' })
            }
          }, 650)
        }
      })
    } catch (e) {
      console.error('init failed', e)
      set({ ready: true })
    }
  },

  newProject: (name) => {
    const p = createDefaultProject(name)
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
    } catch {
      set({ autosave: 'error' })
    }
  },

  setProjectName: (name) => {
    set((s) => ({ project: withUpdatedAt({ ...s.project, name }) }))
  },

  setCanvasSize: (width, height) => {
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
        createdAt: asset.createdAt,
      },
      asset.rawBlob
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
  },

  addClipFromMediaId: (mediaId) => {
    const s = get()
    const asset = s.media.find((m) => m.id === mediaId)
    if (!asset) return
    const clip = createClipFromMedia(s.project, asset)
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
    s.addClip(clip)
  },

  addStickerClip: (req) => {
    const s = get()
    const clip = createStickerClip(s.project, req, undefined, round2(s.currentTime))
    s.addClip(clip)
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
  },

  splitAtPlayhead: () => {
    const s = get()
    const t = s.currentTime
    const targets = s.selectedClipIds.length
      ? s.project.clips.filter((c) => s.selectedClipIds.includes(c.id) && t > c.start && t < c.start + c.duration)
      : s.project.clips.filter((c) => t > c.start + 0.08 && t < c.start + c.duration - 0.08)
    for (const c of targets) s.splitClip(c.id, t)
  },

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
      // decode the embedded audio track straight from the source blob
      const { decodeSource } = await import('../effects/voice')
      const { encodeWav16BitStereo } = await import('../effects/audio-render')
      const buffer = await decodeSource(source.rawBlob)
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
    get().pushHistory()
    set((s) => ({
      project: withUpdatedAt({ ...s.project, clips: s.project.clips.filter((c) => c.id !== id) }),
      selectedClipIds: s.selectedClipIds.filter((cid) => cid !== id),
    }))
  },

  deleteSelected: () => {
    const s = get()
    if (!s.selectedClipIds.length) return
    s.pushHistory()
    set((st) => ({
      project: withUpdatedAt({ ...st.project, clips: st.project.clips.filter((c) => !st.selectedClipIds.includes(c.id)) }),
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
    return clips.length
  },

  duplicateClip: (id) => {
    const s = get()
    const clip = s.project.clips.find((c) => c.id === id)
    if (!clip) return
    const copy: Clip = { ...JSON.parse(JSON.stringify(clip)), id: uid('clip_'), start: round2(clip.start + clip.duration) }
    s.addClip(copy)
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

  copySelected: () => {
    const s = get()
    if (!s.selectedClipIds.length) return
    clipboardClips = s.project.clips
      .filter((c) => s.selectedClipIds.includes(c.id))
      .map((c) => JSON.parse(JSON.stringify(c)) as Clip)
      .sort((a, b) => a.start - b.start)
    if (clipboardClips.length) set({ hasClipboard: true })
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
  },

  selectAll: () => {
    set((s) => ({ selectedClipIds: s.project.clips.map((c) => c.id) }))
  },

  addMarkerAtPlayhead: () => {
    const t = round2(get().currentTime)
    let added = false
    set((s) => {
      if (s.userMarkers.some((m) => Math.abs(m - t) < 0.05)) return s
      added = true
      return { userMarkers: [...s.userMarkers, t].sort((a, b) => a - b) }
    })
    return added
  },

  removeMarkerAtPlayhead: () => {
    const t = get().currentTime
    let removed = false
    set((s) => {
      if (!s.userMarkers.length) return s
      const nearest = s.userMarkers.reduce((best, m) =>
        Math.abs(m - t) < Math.abs(best - t) ? m : best,
      )
      if (Math.abs(nearest - t) > 0.5) return s
      removed = true
      return { userMarkers: s.userMarkers.filter((m) => m !== nearest) }
    })
    return removed
  },

  clearUserMarkers: () => set({ userMarkers: [] }),

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
  setBeatMarkers: (times, bpm) => set({ beatMarkers: times, beatBpm: bpm, showBeatMarkers: true }),
  clearBeatMarkers: () => set({ beatMarkers: [], beatBpm: null }),
  toggleShowBeatMarkers: () => set((s) => ({ showBeatMarkers: !s.showBeatMarkers })),
  setPanelTab: (tab) => set({ panelTab: tab }),
  setAiSubTab: (tab) => set({ aiSubTab: tab }),
  openDialog: (d) => set({ activeDialog: d }),

  /* ================= export ================= */

  setExportState: (patch) => set((s) => ({ exportState: { ...s.exportState, ...patch } })),
  resetExport: () => set({ exportState: { phase: 'idle', progress: 0 } }),

  /* ================= history ================= */

  pushHistory: (key) => {
    const s = get()
    if (typeof key === 'string') {
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
      future: [],
    }))
  },

  undo: () => {
    const s = get()
    if (!s.past.length) return
    const prev = s.past[s.past.length - 1]
    set((st) => ({
      past: st.past.slice(0, -1),
      future: [cloneProject(st.project), ...st.future.slice(0, HISTORY_LIMIT - 1)],
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
      past: [...st.past.slice(-HISTORY_LIMIT + 1), cloneProject(st.project)],
      project: next,
      selectedClipIds: st.selectedClipIds.filter((id) => next.clips.some((c) => c.id === id)),
    }))
  },
}))

/* debug/testing handle — lets QA tools drive the store from the console */
if (typeof window !== 'undefined') {
  ;(window as unknown as { __ncStore?: typeof useEditor }).__ncStore = useEditor
}
