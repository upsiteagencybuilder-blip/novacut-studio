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
  /** mirror horizontally (optional — older persisted projects omit it) */
  flipX?: boolean
  /** mirror vertically (optional — older persisted projects omit it) */
  flipY?: boolean
}

/** How a media source fills the canvas (default "cover" = fill & crop) */
export type ClipFit = 'cover' | 'contain' | 'stretch'

/** Normalized source-rect crop (0..1 fractions of the natural media size) */
export interface CropRect {
  x: number
  y: number
  width: number
  height: number
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

export type MotionType =
  | 'none'
  | 'zoomIn'
  | 'zoomOut'
  | 'panLeft'
  | 'panRight'
  | 'panUp'
  | 'panDown'
  | 'rotate'
  | 'pulse'
  | 'zoomRotate'
  | 'kenBurns'

/**
 * Extended text animation set (v3 mega-effects).
 * Original six are legacy and always render; the rest are engine-rendered
 * families used by the 150 text-effect presets.
 */
export type TextAnimation =
  | 'none'
  | 'fadeIn'
  | 'slideUp'
  | 'pop'
  | 'typewriter'
  | 'wipe'
  // --- v3 mega text families ---
  | 'slideLeft'
  | 'slideRight'
  | 'slideDown'
  | 'bounceIn'
  | 'elastic'
  | 'zoomBlur'
  | 'flipX'
  | 'rotateIn'
  | 'trackingIn'
  | 'blurIn'
  | 'swing'
  // loops (animate while clip plays)
  | 'waveLoop'
  | 'shakeLoop'
  | 'neonFlicker'
  | 'glitchLoop'
  // title behaviors — scroll across the WHOLE clip duration (end credits / ticker)
  | 'roll'
  | 'crawl'
export type StickerAnimation = 'none' | 'pop' | 'float' | 'spin' | 'pulse'

/** Properties that can be keyframed */
export type KeyframeProperty = 'x' | 'y' | 'scale' | 'rotation' | 'opacity' | 'volume' | 'iris'
export type EasingType =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'bounce'
  | 'backIn'
  | 'backOut'
  | 'elastic'
  | 'hold'

/**
 * Shape-wipe masks for transitions (drawn on the INCOMING clip, animated via
 * the keyframable 'iris' property: 0 = hidden, 1 = fully revealed).
 */
export type WipeShape = 'circle' | 'box' | 'diamond' | 'cross' | 'clock' | 'barnDoors' | 'splitH' | 'splitV'

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
  | 'lighter'

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
  /** drop-shadow distance px — default 2 (older persisted projects omit it) */
  shadowDistance?: number
  /** drop-shadow angle degrees, 90 = straight down — default 90 */
  shadowAngle?: number
  letterSpacing: number
  lineHeight: number
  animation: TextAnimation
  /** seconds */
  animationDuration: number
  /** uppercase display without editing the source content */
  textTransform?: 'none' | 'uppercase'
  /** draw an underline beneath the text */
  underline?: boolean
  /** draw a line through the middle of the text */
  strike?: boolean
}

export type StickerFamily = 'emoji' | 'shape' | 'social' | 'vlog'

export interface StickerStyle {
  /** emoji glyph for family='emoji'; display glyph for shape/element tiles */
  emoji: string
  /** px height in canvas space */
  size: number
  animation: StickerAnimation
  /** sticker family — default 'emoji' (legacy clips omit it) */
  family?: StickerFamily
  /** procedural renderer id for shape/social/vlog families (see sticker-render.ts) */
  shape?: string
  /** fill color for shapes / elements (hex) */
  fill?: string
  /** stroke color for shapes / elements (hex) */
  stroke?: string
  /** stroke width in px — 0 disables outline */
  strokeWidth?: number
}

/**
 * Per-clip audio FX recipe — interpreted by the engine's WebAudio chain.
 * All fields optional; every omitted/neutral field is bypassed so the chain
 * only contains nodes the user actually asked for. Applied identically to
 * preview playback and export (the export graph shares the same nodes).
 */
export interface ClipAudioFx {
  /** stereo balance -1 (left) .. 1 (right) */
  pan?: number
  /** low-shelf gain dB -24..24 (200 Hz) */
  eqLow?: number
  /** mid peaking gain dB -24..24 (1200 Hz) */
  eqMid?: number
  /** high-shelf gain dB -24..24 (4200 Hz) */
  eqHigh?: number
  /** high-pass cutoff Hz 20..800 — 0 = off (cuts rumble/wind) */
  highPass?: number
  /** low-pass cutoff Hz 200..18000 — 0 = off (muffled/distant sound) */
  lowPass?: number
  /** dynamics compressor on/off */
  compressor?: boolean
  /** compressor intensity 0..1 — maps to threshold/ratio */
  compAmount?: number
  /** reverb wet mix 0..1 — 0 = off (convolver, generated impulse) */
  reverbMix?: number
  /** reverb room size 0.2..1 — maps to impulse length 0.4..3.2 s */
  reverbSize?: number
  /** delay (echo) wet mix 0..1 — 0 = off */
  delayMix?: number
  /** delay time seconds 0.05..0.9 */
  delayTime?: number
  /** delay feedback 0..0.85 */
  delayFeedback?: number
  /** modulation flavor — none bypasses */
  modKind?: 'none' | 'chorus' | 'flanger' | 'phaser'
  /** modulation amount 0..1 (depth/wet) */
  modAmount?: number
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
  /** play this video clip backwards (frame-stepped, audio muted) */
  reverse?: boolean
  /** how the source fills the canvas — default cover */
  fit?: ClipFit
  /** normalized crop rect, null/undefined = no crop */
  crop?: CropRect | null
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
  /** how far the audio drops while ducking (0..0.95) — ducked gain = 1 − depth; default 0.68 */
  duckDepth?: number
  /**
   * Per-clip audio FX chain (pan / EQ / filters / compressor / reverb / delay /
   * modulation) — built as WebAudio nodes by the engine for playback AND export.
   * null/undefined = untouched original sound.
   */
  audioFx?: ClipAudioFx | null
  /** mega-effects overlay (particles/grain/vignette/leaks...) drawn over this clip */
  overlay?: { effectId: string; intensity: number } | null
  /** mega-effects vision post-FX (pixelate/mirror/glow/chroma...) applied to this clip's pixels */
  vision?: { effectId: string; intensity: number } | null
  /**
   * Shape-wipe mask used by wipe transitions ('circle' | 'box' | 'clock'...).
   * The mask progress is driven by 'iris' keyframes (0 hidden → 1 revealed).
   * null/undefined = no mask (plain draw).
   */
  wipe?: WipeShape | null
  /** created by AI auto-captions — included in .srt sidecar export */
  isCaption?: boolean
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
  /** solo — during playback only solo tracks (and clips on them) are audible */
  solo?: boolean
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

export type PanelTab = 'media' | 'text' | 'stickers' | 'effects' | 'audio' | 'ai' | 'pro'
export type AiSubTab = 'assistant' | 'video' | 'create'
export type DialogName = 'export' | 'projects' | 'shortcuts' | 'mixer' | 'versions' | 'theme' | null
