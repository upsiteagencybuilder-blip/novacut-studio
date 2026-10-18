/**
 * NovaCut Studio — Core data model
 * This file is THE contract for the whole editor. Do not break existing shapes.
 */

export type ClipKind = 'video' | 'image' | 'audio' | 'text' | 'sticker'
export type TrackKind = 'video' | 'overlay' | 'audio'
export type MediaKind = 'video' | 'image' | 'audio' | 'lut'

/** Raw media asset metadata (persisted in IndexedDB) */
export interface MediaAsset {
  id: string
  name: string
  kind: MediaKind
  mimeType: string
  size: number
  /** seconds — 0 for images */
  duration: number
  width: number
  height: number
  /** small poster dataURL */
  thumbnail: string
  /** extra sampled thumbnails (video/image), dataURLs */
  thumbs?: string[]
  /** normalized 0..1 audio peaks for waveform (audio only) */
  peaks?: number[]
  /** parsed .cube LUT data (lut assets only) */
  lutData?: LutData
  createdAt: number
}

/** Parsed 3D color lookup table */
export interface LutData {
  /** grid size N (table has N³ entries × 3 floats 0..1) */
  size: number
  /** flattened [r,g,b, r,g,b, ...] length = size³ * 3 */
  table: number[]
  /** human title from the .cube file if present */
  title?: string
}

/** Runtime asset = persisted asset + blob URL in memory (never persisted) */
export interface MediaAssetRuntime extends MediaAsset {
  objectUrl: string
  /** original blob reference so the store can persist it (never persisted in JSON) */
  rawBlob: Blob
}

export interface Transform {
  /** -1..1 fraction of canvas width, offset from center */
  x: number
  /** -1..1 fraction of canvas height, offset from center */
  y: number
  /** 0.1..5, 1 = fit (cover) */
  scale: number
  /** degrees */
  rotation: number
  /** 0..1 */
  opacity: number
}

export interface Filters {
  brightness: number // 1 = normal (0..2)
  contrast: number // 1 = normal (0..2)
  saturation: number // 1 = normal (0..2)
  hue: number // degrees (-180..180)
  blur: number // px (0..20)
  sepia: number // 0..1
  grayscale: number // 0..1
  invert: number // 0..1
}

export type MotionType = 'none' | 'zoomIn' | 'zoomOut' | 'panLeft' | 'panRight' | 'panUp' | 'panDown'

export type TextAnimation = 'none' | 'fadeIn' | 'slideUp' | 'pop' | 'typewriter' | 'wipe'
export type StickerAnimation = 'none' | 'pop' | 'float' | 'spin' | 'pulse'

/** Properties that can be keyframed */
export type KeyframeProperty = 'x' | 'y' | 'scale' | 'rotation' | 'opacity' | 'volume'
export type EasingType = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'bounce'

export interface Keyframe {
  id: string
  property: KeyframeProperty
  /** seconds relative to clip start */
  time: number
  value: number
  easing: EasingType
}

/** Green-screen removal settings */
export interface ChromaKey {
  enabled: boolean
  /** key color hex, default green */
  color: string
  /** 0..1 distance threshold */
  similarity: number
  /** 0..1 edge softness */
  smoothness: number
}

/** Pro color grade (applied per-pixel after CSS filters) */
export interface ColorGrade {
  /** -1 (cool) .. 1 (warm) */
  temperature: number
  /** -1 (green) .. 1 (magenta) */
  tint: number
  /** -1 .. 1 shadow lift/crush */
  shadows: number
  /** -1 .. 1 highlight rolloff/boost */
  highlights: number
  /** 0..2 vibrance (smart saturation), 1 = neutral */
  vibrance: number
}

export type BlendMode =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'

export interface TextStyle {
  content: string
  fontFamily: string
  /** px in canvas coordinate space */
  fontSize: number
  color: string
  bold: boolean
  italic: boolean
  align: 'left' | 'center' | 'right'
  /** null = transparent */
  background: string | null
  backgroundPadding: number
  strokeWidth: number
  strokeColor: string
  shadow: boolean
  shadowColor: string
  shadowBlur: number
  letterSpacing: number
  lineHeight: number
  animation: TextAnimation
  /** seconds */
  animationDuration: number
}

export interface StickerStyle {
  emoji: string
  /** px height in canvas space */
  size: number
  animation: StickerAnimation
}

export interface Clip {
  id: string
  trackId: string
  kind: ClipKind
  name: string
  /** media asset id when kind is video/image/audio */
  mediaId?: string
  /** timeline position (seconds) */
  start: number
  /** timeline duration (seconds) — already includes speed factor */
  duration: number
  /** source in-point (seconds) */
  trimStart: number
  /** full source length in seconds (limits trimming) — Infinity-ish for images/text */
  sourceDuration: number
  speed: number
  /** 0..1 */
  volume: number
  muted: boolean
  /** seconds */
  fadeIn: number
  fadeOut: number
  transform: Transform
  filters: Filters
  motion: MotionType
  /** Ken Burns intensity 0..1 */
  motionIntensity: number
  textStyle?: TextStyle
  sticker?: StickerStyle
  /** keyframe tracks (transform/volume), time relative to clip start */
  keyframes?: Keyframe[]
  /** canvas composite operation */
  blendMode?: BlendMode
  chromaKey?: ChromaKey
  colorGrade?: ColorGrade
  /** media asset id of an applied LUT */
  lutId?: string | null
  /** 0..1 LUT mix */
  lutIntensity?: number
  /** audio clips: lower volume automatically when video audio plays */
  autoDuck?: boolean
  /** label color chip on the timeline */
  color: string
}

export interface Track {
  id: string
  kind: TrackKind
  name: string
  muted: boolean
  hidden: boolean
  locked: boolean
  /** track fader 0..1.5 (1 = unity) */
  volume?: number
}

export interface Project {
  id: string
  name: string
  canvasWidth: number
  canvasHeight: number
  fps: number
  backgroundColor: string
  tracks: Track[]
  clips: Clip[]
  createdAt: number
  updatedAt: number
}

/* ---------- AI / captions / versions ---------- */

export interface CaptionSegment {
  /** timeline seconds */
  start: number
  end: number
  text: string
}

export interface VersionSnapshot {
  id: string
  projectId: string
  name: string
  createdAt: number
  project: Project
}

/* ---------- Export / UI state types ---------- */

export type ExportPhase = 'idle' | 'preparing' | 'recording' | 'finalizing' | 'done' | 'error' | 'cancelled'

export interface ExportState {
  phase: ExportPhase
  progress: number // 0..1
  error?: string
  url?: string
  sizeBytes?: number
  durationMs?: number
}

export type PanelTab = 'media' | 'text' | 'stickers' | 'effects' | 'audio' | 'ai'
export type DialogName = 'export' | 'projects' | 'shortcuts' | 'mixer' | 'versions' | 'theme' | null
