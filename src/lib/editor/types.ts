/**
 * NovaCut Studio — Core data model
 * This file is THE contract for the whole editor. Do not break existing shapes.
 */

/**
 * 'adjustment' — an invisible FX layer: everything it carries (filters, color
 * grade, LUT) is applied to every visible clip BELOW its track while its time
 * range is active. Drawn as a distinct amber block on the timeline.
 */
export type ClipKind = 'video' | 'image' | 'audio' | 'text' | 'sticker' | 'nested' | 'adjustment'
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
  /** normalized 0..1 audio peaks for waveform (audio + video-with-audio) */
  peaks?: number[]
  /** normalized 0..1 per-bucket RMS envelope (Day 29) — drawn under the peak bars */
  rms?: number[]
  /** true max absolute sample across ALL source samples (0..1) — feeds per-clip normalize gain */
  peakLevel?: number
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
export type KeyframeProperty = 'x' | 'y' | 'scale' | 'rotation' | 'opacity' | 'volume' | 'iris' | 'maskX' | 'maskY' | 'maskScale'
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
  /**
   * Day 17 — 0..1 spill suppression: pulls the key-color cast out of the
   * remaining (non-keyed) pixels by clamping the key channel toward the
   * other two. undefined/0 = off (legacy projects).
   */
  spill?: number
  /**
   * Day 17 — 0..1 edge shaping: alpha gamma on the partial-key ramp.
   * 0.5 = neutral (default/undefined); < 0.5 softens the matte, > 0.5 hardens it.
   */
  edge?: number
}

/** One control point of an RGB-curve channel (normalized 0..1 space, sorted by x) */
export interface CurvePoint {
  x: number
  y: number
}

/** Per-channel curve sets — any channel with fewer than 2 points is identity */
export interface GradeCurves {
  rgb?: CurvePoint[]
  r?: CurvePoint[]
  g?: CurvePoint[]
  b?: CurvePoint[]
}

/** Per-channel color offset for the lift/gamma/gain wheels (each -1..1, wheel pads keep r+g+b ≈ 0) */
export interface WheelColor {
  r: number
  g: number
  b: number
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
  /** Day 12 — per-channel RGB curves (0..1 control points); optional for legacy projects */
  curves?: GradeCurves
  /** Day 13 — lift wheel: push shadows toward a color */
  lift?: WheelColor
  /** Day 13 — gamma wheel: tint midtones */
  gamma?: WheelColor
  /** Day 13 — gain wheel: tint highlights */
  gain?: WheelColor
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

/** Easing applied from a speed-ramp point to the NEXT point's segment. */
export type RampEase = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'

/** One control point of a clip's speed-ramp curve (normalized clip space). */
export interface SpeedRampPoint {
  /** normalized position along the clip timeline, 0..1 (sorted, endpoints pinned) */
  pos: number
  /** raw speed multiplier at this point (relative; mean-normalized at evaluation) */
  mult: number
  /** easing shape of the segment that starts at this point */
  ease: RampEase
}

/** Timeline marker — a colored, labeled pin on the ruler (Day 08). */
export interface TimelineMarker {
  id: string
  /** seconds from timeline start */
  t: number
  label: string
  /** pin color (hex) */
  color: string
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
  /** modulation flavor — none bypasses; ringmod is the robot-voice carrier */
  modKind?: 'none' | 'chorus' | 'flanger' | 'phaser' | 'ringmod'
  /** modulation amount 0..1 (depth/wet) */
  modAmount?: number
  /**
   * 10-band graphic EQ gains in dB (−12..+12) at the ISO octave centers
   * 31/62/125/250/500/1k/2k/4k/8k/16k Hz (see EQ10_FREQS). Undefined or all
   * zeros = transparent. Runs in the shared chain (preview + mixdown).
   */
  eq10?: number[]
  /** reverb pre-delay seconds 0..0.25 (Day 28) — separates the dry from the tail */
  reverbPredelay?: number
  /** reverb damping 0..1 (Day 28) — high-frequency absorption in the tail */
  reverbDamp?: number
  /** ping-pong echo (Day 28) — repeats alternate left/right */
  delayPingPong?: boolean
  /** noise gate on/off (Day 24) — envelope follower below the threshold */
  gate?: boolean
  /** gate threshold dB −80..−1 (only meaningful when gate is on) */
  gateThreshold?: number
  /** gate release ms 20..1500 */
  gateRelease?: number
  /**
   * Spectral de-noise amount 0..1 (Day 24) — STFT spectral gating with a
   * running minimum noise-floor estimate; 0/undefined = off. Heard in preview
   * AND baked into the offline mixdown.
   */
  denoise?: number
  /**
   * Pitch shift in semitones -12..12 — granular, tempo preserved (preview AND
   * offline mixdown ride the same AudioWorklet). 0/undefined = off.
   */
  pitch?: number
  /** pitch wet/dry blend 0..1 — 1 = fully shifted, 0.5 = parallel harmony (default 1) */
  pitchMix?: number
  /**
   * Formant (vocal-tract resonance) shift in semitones -12..12 — STFT
   * cepstral-envelope shifter; timbre changes while pitch AND tempo stay
   * put. Heard in preview AND baked into the offline mixdown. 0/undefined = off.
   */
  formant?: number
}

/**
 * Compound (nested) clip payload — embedded child clips.
 * Children keep their own absolute `trackId` but their `start` values are
 * RELATIVE to the compound clip's start (0 = at the compound's left edge).
 * Playback/export/audio resolve compounds through lib/editor/nested.ts.
 *
 * `open` marks an ACTIVE editing session: the children are materialized as
 * top-level clips (ids listed in memberIds) and the compound itself is
 * skipped by the resolver. Because this lives INSIDE the project, undo/redo
 * history carries session state for free. Exit sets open=false and repacks.
 */
export interface NestedClipData {
  children: Clip[]
  /** editing session active — children live as top-level clips while true */
  open?: boolean
  /** materialized child clip ids while open (membership for the session) */
  memberIds?: string[]
}

/**
 * Day 16 — shape mask: clips the clip's own draw to a rect or ellipse in
 * canvas space. Position (x/y) is a −1..1 offset from the canvas center (same
 * UX as transform); w/h are fractions of the canvas dimensions; keyframes on
 * maskX/maskY/maskScale animate the mask (scale multiplies w/h).
 */
export interface ClipMask {
  shape: 'rect' | 'ellipse'
  x: number
  y: number
  w: number
  h: number
  /** show everything OUTSIDE the shape instead */
  invert?: boolean
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
  /**
   * Speed ramp — piecewise speed-multiplier curve over the clip's timeline span.
   * Points are { pos: 0..1, mult: relative multiplier, ease into next segment }.
   * The curve is mean-normalized at evaluation time so the total consumed source
   * span stays exactly `duration × speed` (timeline layout never reflows).
   * null/undefined = uniform speed (no ramp). Video clips only.
   */
  speedRamp?: SpeedRampPoint[] | null
  /** play this video clip backwards (frame-stepped, audio muted) */
  reverse?: boolean
  /** how the source fills the canvas — default cover */
  fit?: ClipFit
  /** normalized crop rect, null/undefined = no crop */
  crop?: CropRect | null
  /** Day 16 — shape mask (rect/ellipse) cutting this clip's draw; null = off */
  mask?: ClipMask | null
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
   * Auto-duck v2 (Day 25) — speech threshold as a linear level 0.01..0.6:
 * music ducks only while the video audio's level is ABOVE this (default 0.07).
   * Without a live graph the engine falls back to plain overlap ducking.
   */
  duckThreshold?: number
  /**
   * Per-clip audio FX chain (pan / EQ / filters / compressor / reverb / delay /
   * modulation) — built as WebAudio nodes by the engine for playback AND export.
   * null/undefined = untouched original sound.
   */
  /** Day 29 — normalize this clip's audio true peak to −1 dBFS (gain capped at +12 dB) */
  normalize?: boolean
  /** fade-in curve shape (Day 28) — linear (default) / ease / hold */
  fadeInCurve?: 'linear' | 'ease' | 'hold'
  /** fade-out curve shape (Day 28) — linear (default) / ease / hold */
  fadeOutCurve?: 'linear' | 'ease' | 'hold'
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
  /** compound (nested) container payload — set only when kind is 'nested' */
  nested?: NestedClipData | null
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
  /** per-track 3-band EQ (mixer) — low shelf 200 Hz, mid peak 1.2 kHz, high shelf 4.2 kHz, −24..+24 dB */
  eqLow?: number
  eqMid?: number
  eqHigh?: number
  /** per-track pan (mixer) — −1 hard left .. 1 hard right, 0 = center (Day 27) */
  pan?: number
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
  /** colored labeled ruler pins — persists with the project (undoable) */
  markers?: TimelineMarker[]
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
