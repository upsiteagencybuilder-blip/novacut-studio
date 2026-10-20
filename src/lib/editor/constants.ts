import type {
  BlendMode,
  CaptionSegment,
  ChromaKey,
  Clip,
  ColorGrade,
  EasingType,
  Filters,
  MediaAssetRuntime,
  Project,
  StickerStyle,
  TextStyle,
  Transform,
  Track,
  TrackKind,
} from './types'
import { round2, uid } from './utils'

export const APP_NAME = 'NovaCut'
export const APP_TAGLINE = 'PRO VIDEO STUDIO'

/* ---------------- Canvas / render defaults ---------------- */

export const CANVAS_PRESETS = [
  { id: '16:9', label: '16:9 · Landscape', width: 1280, height: 720 },
  { id: '9:16', label: '9:16 · Portrait', width: 720, height: 1280 },
  { id: '1:1', label: '1:1 · Square', width: 1080, height: 1080 },
  { id: '4:5', label: '4:5 · Social', width: 1024, height: 1280 },
] as const

export const DEFAULT_FPS = 30
export const MIN_CLIP_DURATION = 0.15
export const TRACK_HEIGHT = 60
export const RULER_HEIGHT = 30
export const HEADER_WIDTH = 148

/* ---------------- Export presets (platform targets) ---------------- */

export interface ExportPreset {
  id: string
  label: string
  sub: string
  width: number
  height: number
  fps: number
  bitrate: number
}

export const EXPORT_PRESETS: ExportPreset[] = [
  { id: 'yt-1080', label: 'YouTube 1080p', sub: '16:9 · 30 fps', width: 1920, height: 1080, fps: 30, bitrate: 10_000_000 },
  { id: 'yt-4k', label: 'YouTube 4K', sub: '16:9 · 30 fps', width: 3840, height: 2160, fps: 30, bitrate: 35_000_000 },
  { id: 'reels', label: 'Reels / Shorts', sub: '9:16 · 1080×1920', width: 1080, height: 1920, fps: 30, bitrate: 9_000_000 },
  { id: 'tiktok', label: 'TikTok', sub: '9:16 · 1080×1920', width: 1080, height: 1920, fps: 30, bitrate: 9_000_000 },
  { id: 'square', label: 'Square Post', sub: '1:1 · 1080×1080', width: 1080, height: 1080, fps: 30, bitrate: 8_000_000 },
  { id: 'feed', label: 'Facebook Feed', sub: '4:5 · 1024×1280', width: 1024, height: 1280, fps: 30, bitrate: 8_000_000 },
]

export const EXPORT_QUALITY_PRESETS = [
  { id: 'low', label: 'Draft', bitrate: 3_000_000 },
  { id: 'medium', label: 'Good', bitrate: 8_000_000 },
  { id: 'high', label: 'High', bitrate: 12_000_000 },
  { id: 'ultra', label: 'Ultra', bitrate: 24_000_000 },
] as const

/* ---------------- Style defaults ---------------- */

export const DEFAULT_TRANSFORM: Transform = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  opacity: 1,
  flipX: false,
  flipY: false,
}

export const DEFAULT_FILTERS: Filters = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 0,
  blur: 0,
  sepia: 0,
  grayscale: 0,
  invert: 0,
}

export const CLIP_COLORS = [
  '#a855f7', // violet
  '#d946ef', // fuchsia
  '#f43f5e', // rose
  '#f97316', // orange
  '#eab308', // yellow
  '#10b981', // emerald
] as const

/* ---------------- Fonts ---------------- */

export interface FontOption {
  family: string
  label: string
}

/** All these are loaded in layout via Google Fonts <link> */
export const TEXT_FONTS: FontOption[] = [
  { family: 'Anton', label: 'Anton' },
  { family: 'Bebas Neue', label: 'Bebas Neue' },
  { family: 'Montserrat', label: 'Montserrat' },
  { family: 'Oswald', label: 'Oswald' },
  { family: 'Playfair Display', label: 'Playfair Display' },
  { family: 'Lobster', label: 'Lobster' },
  { family: 'Caveat', label: 'Caveat' },
  { family: 'Righteous', label: 'Righteous' },
  { family: 'Bangers', label: 'Bangers' },
  { family: 'Space Grotesk', label: 'Space Grotesk' },
  { family: 'Inter', label: 'Inter' },
  // Bangla — full conjunct/juktakkhor rendering support
  { family: 'Hind Siliguri', label: 'Hind Siliguri (বাংলা)' },
  { family: 'Noto Sans Bengali', label: 'Noto Sans Bengali (বাংলা)' },
  { family: 'Tiro Bangla', label: 'Tiro Bangla (বাংলা)' },
]

/** Ensure these fonts are loaded before canvas draws text */
export const CANVAS_FONT_LOAD_LIST = TEXT_FONTS.map((f) => `700 64px "${f.family}"`)

/* ---------------- Text presets ---------------- */

export interface TextPreset {
  id: string
  name: string
  preview: string
  style: Partial<TextStyle> & { content?: string }
  transform?: Partial<Transform>
}

export const DEFAULT_TEXT_STYLE: TextStyle = {
  content: 'Your text here',
  fontFamily: 'Montserrat',
  fontSize: 72,
  color: '#ffffff',
  bold: true,
  italic: false,
  align: 'center',
  background: null,
  backgroundPadding: 18,
  strokeWidth: 0,
  strokeColor: '#000000',
  shadow: true,
  shadowColor: 'rgba(0,0,0,0.55)',
  shadowBlur: 18,
  letterSpacing: 0,
  lineHeight: 1.15,
  animation: 'fadeIn',
  animationDuration: 0.5,
}

export const TEXT_PRESETS: TextPreset[] = [
  {
    id: 'title',
    name: 'Big Title',
    preview: 'TITLE',
    style: { fontFamily: 'Anton', fontSize: 110, color: '#ffffff', letterSpacing: 4, shadow: true, shadowBlur: 24, animation: 'fadeIn' },
  },
  {
    id: 'neon',
    name: 'Neon Glow',
    preview: 'NEON',
    style: {
      fontFamily: 'Bebas Neue',
      fontSize: 100,
      color: '#f0abfc',
      shadow: true,
      shadowColor: 'rgba(217,70,239,0.9)',
      shadowBlur: 40,
      letterSpacing: 6,
      animation: 'pop',
    },
  },
  {
    id: 'lower-third',
    name: 'Lower Third',
    preview: 'Name here',
    style: {
      content: 'Your Name',
      fontFamily: 'Montserrat',
      fontSize: 44,
      color: '#ffffff',
      background: 'rgba(168,85,247,0.85)',
      backgroundPadding: 20,
      align: 'left',
      shadow: false,
      animation: 'slideUp',
    },
    transform: { x: -0.18, y: 0.32 },
  },
  {
    id: 'caption',
    name: 'Caption',
    preview: 'Caption',
    style: {
      content: 'Add a caption',
      fontFamily: 'Inter',
      fontSize: 38,
      bold: true,
      color: '#ffffff',
      background: 'rgba(10,10,18,0.6)',
      backgroundPadding: 16,
      animation: 'fadeIn',
    },
    transform: { y: 0.36 },
  },
  {
    id: 'quote',
    name: 'Elegant Quote',
    preview: 'Quote',
    style: {
      content: '"Dream bigger"',
      fontFamily: 'Playfair Display',
      fontSize: 64,
      italic: true,
      bold: false,
      color: '#fde68a',
      animation: 'wipe',
    },
  },
  {
    id: 'sticker-text',
    name: 'Comic Pop',
    preview: 'POW!',
    style: {
      content: 'WOW!',
      fontFamily: 'Bangers',
      fontSize: 96,
      color: '#fb7185',
      strokeWidth: 8,
      strokeColor: '#4c0519',
      shadow: false,
      animation: 'pop',
    },
  },
  {
    id: 'handwrite',
    name: 'Handwritten',
    preview: 'Hello',
    style: {
      content: 'Hello there',
      fontFamily: 'Caveat',
      fontSize: 84,
      bold: true,
      color: '#a7f3d0',
      animation: 'typewriter',
      animationDuration: 1.2,
    },
  },
  {
    id: 'outline',
    name: 'Outline Bold',
    preview: 'BOLD',
    style: {
      fontFamily: 'Righteous',
      fontSize: 92,
      color: 'rgba(255,255,255,0.06)',
      strokeWidth: 4,
      strokeColor: '#ffffff',
      shadow: false,
      animation: 'fadeIn',
    },
  },
  /* ------- Pro templates (v2) ------- */
  {
    id: 'lower-third-bar',
    name: 'Lower Third Bar',
    preview: ' Reporter',
    style: {
      content: 'Reporter Name',
      fontFamily: 'Oswald',
      fontSize: 40,
      color: '#ffffff',
      background: 'linear-gradient(90deg,#a855f7,#d946ef)',
      backgroundPadding: 22,
      align: 'left',
      shadow: false,
      animation: 'slideUp',
    },
    transform: { x: -0.2, y: 0.3 },
  },
  {
    id: 'lower-third-min',
    name: 'Minimal Name',
    preview: 'Name · Role',
    style: {
      content: 'Name · Role',
      fontFamily: 'Space Grotesk',
      fontSize: 34,
      bold: false,
      letterSpacing: 3,
      color: '#ffffff',
      background: 'rgba(0,0,0,0.45)',
      backgroundPadding: 16,
      animation: 'wipe',
    },
    transform: { y: 0.34 },
  },
  {
    id: 'karaoke',
    name: 'Karaoke Pop',
    preview: 'SING IT',
    style: {
      content: 'SING IT LOUD',
      fontFamily: 'Bangers',
      fontSize: 84,
      color: '#fef08a',
      strokeWidth: 10,
      strokeColor: '#7c2d12',
      shadow: false,
      animation: 'pop',
    },
    transform: { y: 0.3 },
  },
  {
    id: 'gradient-chip',
    name: 'Vlog Chip',
    preview: ' DAY 1',
    style: {
      content: 'DAY 1 · VLOG',
      fontFamily: 'Montserrat',
      fontSize: 36,
      bold: true,
      letterSpacing: 2,
      color: '#ffffff',
      background: 'rgba(244,63,94,0.88)',
      backgroundPadding: 18,
      animation: 'pop',
    },
    transform: { x: -0.28, y: -0.36 },
  },
  {
    id: 'bangla-title',
    name: 'Bangla Title',
    preview: 'বাংলা টাইটেল',
    style: {
      content: 'আপনার টাইটেল',
      fontFamily: 'Hind Siliguri',
      fontSize: 88,
      bold: true,
      color: '#ffffff',
      shadow: true,
      shadowBlur: 26,
      animation: 'slideUp',
    },
  },
  {
    id: 'bangla-caption',
    name: 'Bangla Caption',
    preview: 'বাংলা সাবটাইটেল',
    style: {
      content: 'বাংলা সাবটাইটেল',
      fontFamily: 'Noto Sans Bengali',
      fontSize: 44,
      bold: true,
      color: '#ffffff',
      background: 'rgba(10,10,18,0.62)',
      backgroundPadding: 18,
      animation: 'fadeIn',
    },
    transform: { y: 0.37 },
  },
]

/* ---------------- Stickers ---------------- */

export interface StickerCategory {
  name: string
  emojis: string[]
}

export const STICKER_CATEGORIES: StickerCategory[] = [
  {
    name: 'Emotions',
    emojis: ['😍', '🤩', '😂', '🥳', '😱', '🤔', '😎', '🥰', '😭', '🔥', '💖', '👀', '💯', '🤯', '😴', '🤗'],
  },
  {
    name: 'Pop & Fun',
    emojis: ['⭐', '✨', '🌟', '💫', '🎉', '🎊', '🎈', '🚀', '🃏', '🎭', '🎯', '🏆', '👑', '💎', '⚡', '💥'],
  },
  {
    name: 'Reactions',
    emojis: ['👍', '👎', '👏', '🙌', '🤝', '✌️', '🤟', '👉', '💪', '🙏', '🫶', '❤️', '🧡', '💜', '🖤', '💔'],
  },
  {
    name: 'Creator',
    emojis: ['🎬', '🎥', '📸', '🎤', '🎧', '🎵', '🎹', '🥁', '📱', '💻', '🎮', '🕹️', '💡', '🔔', '📌', '✏️'],
  },
  {
    name: 'Nature',
    emojis: ['🌈', '🌸', '🌺', '🌻', '🍀', '🌊', '🌙', '☀️', '🍃', '🦋', '🐞', '🌴', '🌵', '🌸', '🌼', '🍁'],
  },
  {
    name: 'Food',
    emojis: ['🍕', '🍔', '🍟', '🌮', '🍿', '🍩', '🍪', '🎂', '☕', '🧋', '🍹', '🍓', '🍉', '🥑', '🍫', '🍦'],
  },
]

export const DEFAULT_STICKER: StickerStyle = {
  emoji: '✨',
  size: 140,
  animation: 'pop',
}

/* ---------------- Filter presets ---------------- */

export interface FilterPreset {
  id: string
  name: string
  /** CSS preview for the UI chip */
  css: string
  patch: Partial<Filters>
}

export const FILTER_PRESETS: FilterPreset[] = [
  { id: 'original', name: 'Original', css: 'none', patch: {} },
  { id: 'vivid', name: 'Vivid', css: 'saturate(1.4) contrast(1.12)', patch: { saturation: 1.4, contrast: 1.12 } },
  { id: 'punch', name: 'Punch', css: 'contrast(1.35) saturate(1.25)', patch: { contrast: 1.35, saturation: 1.25 } },
  { id: 'noir', name: 'Noir', css: 'grayscale(1) contrast(1.4) brightness(0.92)', patch: { grayscale: 1, contrast: 1.4, brightness: 0.92 } },
  { id: 'silver', name: 'Silver', css: 'grayscale(1) brightness(1.08) contrast(0.95)', patch: { grayscale: 1, brightness: 1.08, contrast: 0.95 } },
  { id: 'vintage', name: 'Vintage', css: 'sepia(0.45) saturate(0.85) contrast(0.95) brightness(1.05)', patch: { sepia: 0.45, saturation: 0.85, contrast: 0.95, brightness: 1.05 } },
  { id: 'warm', name: 'Warm Sun', css: 'sepia(0.28) saturate(1.25) hue-rotate(-8deg)', patch: { sepia: 0.28, saturation: 1.25, hue: -8 } },
  { id: 'cold', name: 'Cold Moon', css: 'saturate(0.85) brightness(1.05) hue-rotate(12deg) contrast(1.08)', patch: { saturation: 0.85, brightness: 1.05, hue: 12, contrast: 1.08 } },
  { id: 'dreamy', name: 'Dreamy', css: 'blur(1.2px) brightness(1.1) saturate(1.18)', patch: { blur: 1.2, brightness: 1.1, saturation: 1.18 } },
  { id: 'faded', name: 'Faded', css: 'contrast(0.82) brightness(1.12) saturate(0.8)', patch: { contrast: 0.82, brightness: 1.12, saturation: 0.8 } },
  { id: 'cinema', name: 'Cinematic', css: 'contrast(1.22) saturate(0.92) brightness(0.96) sepia(0.12)', patch: { contrast: 1.22, saturation: 0.92, brightness: 0.96, sepia: 0.12 } },
  { id: 'sunset', name: 'Sunset', css: 'sepia(0.3) saturate(1.3) hue-rotate(-18deg) brightness(1.04)', patch: { sepia: 0.3, saturation: 1.3, hue: -18, brightness: 1.04 } },
  { id: 'invert', name: 'Invert', css: 'invert(1)', patch: { invert: 1 } },
]

/* ---------------- Motion presets ---------------- */

export const MOTION_PRESETS: { id: Clip['motion']; name: string; icon: string }[] = [
  { id: 'none', name: 'None', icon: '⏹' },
  { id: 'zoomIn', name: 'Zoom In', icon: '🔍+' },
  { id: 'zoomOut', name: 'Zoom Out', icon: '🔍-' },
  { id: 'panLeft', name: 'Pan Left', icon: '⬅️' },
  { id: 'panRight', name: 'Pan Right', icon: '➡️' },
  { id: 'panUp', name: 'Pan Up', icon: '⬆️' },
  { id: 'panDown', name: 'Pan Down', icon: '⬇️' },
]

/* ---------------- Shortcuts ---------------- */

export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Space', action: 'Play / Pause' },
  { keys: '← / →', action: 'Step 1 frame (Shift = 1 sec)' },
  { keys: 'Home / End', action: 'Jump to start / end' },
  { keys: 'S', action: 'Split clip at playhead' },
  { keys: 'D', action: 'Duplicate selected clip' },
  { keys: 'Ctrl + C', action: 'Copy selected clips' },
  { keys: 'Ctrl + X', action: 'Cut selected clips' },
  { keys: 'Ctrl + V', action: 'Paste at playhead' },
  { keys: 'Ctrl + A', action: 'Select all clips' },
  { keys: 'Ctrl + S', action: 'Save project now' },
  { keys: 'Esc', action: 'Deselect all clips' },
  { keys: 'Delete / Backspace', action: 'Delete selected clip' },
  { keys: 'Shift + Delete', action: 'Ripple delete (close gap)' },
  { keys: 'M', action: 'Mute / unmute selected clip' },
  { keys: 'Shift + M', action: 'Add marker at playhead' },
  { keys: 'Ctrl + Z', action: 'Undo' },
  { keys: 'Ctrl + Shift + Z / Ctrl + Y', action: 'Redo' },
  { keys: '+ / -', action: 'Zoom timeline in / out' },
  { keys: 'Ctrl + E', action: 'Open export dialog' },
]

/* ---------------- Blend / easing / pro color ---------------- */

export const BLEND_MODES: { id: BlendMode; label: string }[] = [
  { id: 'source-over', label: 'Normal' },
  { id: 'multiply', label: 'Multiply' },
  { id: 'screen', label: 'Screen' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'darken', label: 'Darken' },
  { id: 'lighten', label: 'Lighten' },
  { id: 'color-dodge', label: 'Color Dodge' },
  { id: 'color-burn', label: 'Color Burn' },
  { id: 'hard-light', label: 'Hard Light' },
  { id: 'soft-light', label: 'Soft Light' },
  { id: 'difference', label: 'Difference' },
  { id: 'exclusion', label: 'Exclusion' },
  { id: 'hue', label: 'Hue' },
  { id: 'saturation', label: 'Saturation' },
  { id: 'color', label: 'Color' },
  { id: 'luminosity', label: 'Luminosity' },
]

export const EASING_OPTIONS: { id: EasingType; label: string }[] = [
  { id: 'linear', label: 'Linear' },
  { id: 'easeIn', label: 'Ease In' },
  { id: 'easeOut', label: 'Ease Out' },
  { id: 'easeInOut', label: 'Ease In Out' },
  { id: 'bounce', label: 'Bounce' },
]

export const DEFAULT_CHROMA_KEY: ChromaKey = {
  enabled: false,
  color: '#00b140',
  similarity: 0.32,
  smoothness: 0.12,
}

export const DEFAULT_COLOR_GRADE: ColorGrade = {
  temperature: 0,
  tint: 0,
  shadows: 0,
  highlights: 0,
  vibrance: 1,
}

/** Default style applied to generated auto-captions */
export const CAPTION_STYLE: Partial<TextStyle> = {
  fontFamily: 'Montserrat',
  fontSize: 40,
  bold: true,
  color: '#ffffff',
  background: 'rgba(10,10,18,0.66)',
  backgroundPadding: 16,
  shadow: false,
  animation: 'fadeIn',
  animationDuration: 0.18,
  align: 'center',
}

export const CAPTION_POSITION: Partial<Transform> = { y: 0.36 }

/* ---------------- Factories ---------------- */

export function createTrack(kind: TrackKind, name?: string): Track {
  const labels: Record<TrackKind, string> = { video: 'Video', overlay: 'Overlay', audio: 'Audio' }
  return {
    id: uid('trk_'),
    kind,
    name: name ?? labels[kind],
    muted: false,
    hidden: false,
    locked: false,
  }
}

export function createDefaultProject(name = 'Untitled Project'): Project {
  const now = Date.now()
  return {
    id: uid('prj_'),
    name,
    canvasWidth: 1280,
    canvasHeight: 720,
    fps: DEFAULT_FPS,
    backgroundColor: '#000000',
    tracks: [
      createTrack('overlay', 'Overlay 1'),
      createTrack('video', 'Video 1'),
      createTrack('audio', 'Audio 1'),
    ],
    clips: [],
    createdAt: now,
    updatedAt: now,
  }
}

function nextFreeStart(project: Project, trackId: string): number {
  let end = 0
  for (const c of project.clips) if (c.trackId === trackId) end = Math.max(end, c.start + c.duration)
  return end
}

function baseClipFields(): Pick<Clip, 'keyframes' | 'blendMode' | 'chromaKey' | 'colorGrade' | 'lutId' | 'lutIntensity' | 'autoDuck'> {
  return {
    keyframes: [],
    blendMode: 'source-over',
    chromaKey: { ...DEFAULT_CHROMA_KEY },
    colorGrade: { ...DEFAULT_COLOR_GRADE },
    lutId: null,
    lutIntensity: 1,
    autoDuck: false,
  }
}

export function createClipFromMedia(project: Project, asset: MediaAssetRuntime, trackId?: string, start?: number): Clip {
  let track = trackId
    ? project.tracks.find((t) => t.id === trackId)
    : project.tracks.find((t) => (asset.kind === 'audio' ? t.kind === 'audio' : t.kind === 'video'))
  if (!track) track = project.tracks.find((t) => (asset.kind === 'audio' ? t.kind === 'audio' : t.kind !== 'audio'))
  const targetTrack = track ?? project.tracks[0]
  const duration = asset.kind === 'image' ? 4 : Math.max(0.2, asset.duration)
  return {
    id: uid('clip_'),
    trackId: targetTrack.id,
    kind: asset.kind === 'lut' ? 'image' : asset.kind,
    name: asset.name,
    mediaId: asset.id,
    start: start ?? nextFreeStart(project, targetTrack.id),
    duration,
    trimStart: 0,
    sourceDuration: asset.kind === 'image' ? 3600 : asset.duration,
    speed: 1,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    transform: { ...DEFAULT_TRANSFORM },
    filters: { ...DEFAULT_FILTERS },
    motion: 'none',
    motionIntensity: 0.35,
    ...baseClipFields(),
    color: asset.kind === 'audio' ? '#10b981' : asset.kind === 'image' ? '#d946ef' : '#a855f7',
  }
}

export function createTextClip(project: Project, preset?: TextPreset, trackId?: string, start?: number): Clip {
  let track = trackId ? project.tracks.find((t) => t.id === trackId) : project.tracks.find((t) => t.kind === 'overlay')
  if (!track) track = project.tracks[0]
  const style: TextStyle = { ...DEFAULT_TEXT_STYLE, ...(preset?.style ?? {}) }
  return {
    id: uid('clip_'),
    trackId: track.id,
    kind: 'text',
    name: style.content.slice(0, 24) || 'Text',
    start: start ?? 0,
    duration: 4,
    trimStart: 0,
    sourceDuration: 3600,
    speed: 1,
    volume: 0,
    muted: true,
    fadeIn: 0,
    fadeOut: 0,
    transform: { ...DEFAULT_TRANSFORM, ...(preset?.transform ?? {}) },
    filters: { ...DEFAULT_FILTERS },
    motion: 'none',
    motionIntensity: 0.35,
    ...baseClipFields(),
    textStyle: style,
    color: '#f97316',
  }
}

export function createStickerClip(project: Project, emoji: string, trackId?: string, start?: number): Clip {
  let track = trackId ? project.tracks.find((t) => t.id === trackId) : project.tracks.find((t) => t.kind === 'overlay')
  if (!track) track = project.tracks[0]
  return {
    id: uid('clip_'),
    trackId: track.id,
    kind: 'sticker',
    name: `Sticker ${emoji}`,
    start: start ?? 0,
    duration: 3,
    trimStart: 0,
    sourceDuration: 3600,
    speed: 1,
    volume: 0,
    muted: true,
    fadeIn: 0,
    fadeOut: 0,
    transform: { ...DEFAULT_TRANSFORM, x: (Math.random() - 0.5) * 0.4, y: (Math.random() - 0.5) * 0.3 },
    filters: { ...DEFAULT_FILTERS },
    motion: 'none',
    motionIntensity: 0.35,
    ...baseClipFields(),
    sticker: { ...DEFAULT_STICKER, emoji },
    color: '#eab308',
  }
}

/** Build styled caption text clips from ASR segments (auto-ducked source audio not touched) */
export function buildCaptionClips(project: Project, segments: CaptionSegment[]): Clip[] {
  const overlayTrack =
    project.tracks.find((t) => t.kind === 'overlay') ?? project.tracks[0]
  return segments.map((seg) => {
    const style: TextStyle = { ...DEFAULT_TEXT_STYLE, ...CAPTION_STYLE, content: seg.text }
    return {
      id: uid('clip_'),
      trackId: overlayTrack.id,
      kind: 'text' as const,
      name: `CC: ${seg.text.slice(0, 20)}`,
      start: round2(seg.start),
      duration: Math.max(0.4, round2(seg.end - seg.start)),
      trimStart: 0,
      sourceDuration: 3600,
      speed: 1,
      volume: 0,
      muted: true,
      fadeIn: 0,
      fadeOut: 0,
      transform: { ...DEFAULT_TRANSFORM, ...CAPTION_POSITION },
      filters: { ...DEFAULT_FILTERS },
      motion: 'none' as const,
      motionIntensity: 0.35,
      ...baseClipFields(),
      textStyle: style,
      color: '#f43f5e',
    }
  })
}
