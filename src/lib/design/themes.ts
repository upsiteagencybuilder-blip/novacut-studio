'use client'

/**
 * NovaCut Chroma Engine — theme registry & runtime.
 *
 * A theme = curated palette (colors) × backdrop style × glass intensity ×
 * corner radius × optional custom accent. Everything is applied through CSS
 * custom properties declared in globals.css, so the whole app re-tints live.
 */

export type PaletteId =
  | 'nova'
  | 'ember'
  | 'emerald'
  | 'rosenoir'
  | 'golden'
  | 'crimson'
  | 'arctic'
  | 'paper'

export type BackdropStyle = 'aurora' | 'grid' | 'spotlight' | 'plain'
export type GlassLevel = 'soft' | 'medium' | 'strong'
export type RadiusLevel = 'sharp' | 'soft' | 'round' | 'pill'

export interface PaletteMeta {
  id: PaletteId
  name: string
  tagline: string
  mode: 'dark' | 'light'
  /** colors used only to render the picker swatches (mirror of the CSS values) */
  preview: {
    bg: string
    brand: string
    accent: string
    gradFrom: string
    gradVia: string
    gradTo: string
  }
}

export const PALETTES: PaletteMeta[] = [
  {
    id: 'nova',
    name: 'Nova Violet',
    tagline: 'Midnight aurora — the signature studio look',
    mode: 'dark',
    preview: { bg: '#07070d', brand: '#a855f7', accent: '#d946ef', gradFrom: '#a855f7', gradVia: '#d946ef', gradTo: '#fb923c' },
  },
  {
    id: 'ember',
    name: 'Ember Sunset',
    tagline: 'Warm cinematic glow for storytellers',
    mode: 'dark',
    preview: { bg: '#0e0907', brand: '#f97316', accent: '#fb7185', gradFrom: '#f97316', gradVia: '#fb7185', gradTo: '#fbbf24' },
  },
  {
    id: 'emerald',
    name: 'Emerald Aurora',
    tagline: 'Fresh studio green with lime energy',
    mode: 'dark',
    preview: { bg: '#05100b', brand: '#10b981', accent: '#a3e635', gradFrom: '#10b981', gradVia: '#a3e635', gradTo: '#fbbf24' },
  },
  {
    id: 'rosenoir',
    name: 'Rose Noir',
    tagline: 'Plum black wrapped in magenta silk',
    mode: 'dark',
    preview: { bg: '#0d060b', brand: '#f43f5e', accent: '#ec4899', gradFrom: '#f43f5e', gradVia: '#ec4899', gradTo: '#fb923c' },
  },
  {
    id: 'golden',
    name: 'Golden Noir',
    tagline: 'Luxury gold on true black',
    mode: 'dark',
    preview: { bg: '#090907', brand: '#f59e0b', accent: '#fbbf24', gradFrom: '#f59e0b', gradVia: '#fbbf24', gradTo: '#fef3c7' },
  },
  {
    id: 'crimson',
    name: 'Crimson Cinema',
    tagline: 'Bold red stage light, premiere ready',
    mode: 'dark',
    preview: { bg: '#0c0708', brand: '#ef4444', accent: '#f97316', gradFrom: '#ef4444', gradVia: '#f97316', gradTo: '#fbbf24' },
  },
  {
    id: 'arctic',
    name: 'Arctic Mint',
    tagline: 'Crisp daylight workspace, mint fresh',
    mode: 'light',
    preview: { bg: '#f2f6f4', brand: '#0d9488', accent: '#059669', gradFrom: '#0d9488', gradVia: '#10b981', gradTo: '#84cc16' },
  },
  {
    id: 'paper',
    name: 'Paper Studio',
    tagline: 'Warm editorial paper with violet ink',
    mode: 'light',
    preview: { bg: '#f8f5f0', brand: '#9333ea', accent: '#c026d3', gradFrom: '#9333ea', gradVia: '#c026d3', gradTo: '#f97316' },
  },
]

export const DEFAULT_PALETTE: PaletteId = 'nova'
export const DEFAULT_BACKDROP: BackdropStyle = 'aurora'
export const DEFAULT_GLASS: GlassLevel = 'medium'
export const DEFAULT_RADIUS: RadiusLevel = 'soft'

/** Curated accent swatches offered in the Theme Studio. */
export const ACCENT_SWATCHES = [
  '#d946ef', '#f43f5e', '#fb7185', '#f97316', '#fbbf24',
  '#a3e635', '#34d399', '#2dd4bf', '#c026d3', '#e879f9',
]

export interface ThemeConfig {
  palette: PaletteId
  backdrop: BackdropStyle
  glass: GlassLevel
  radius: RadiusLevel
  /** optional accent override; null = use the palette accent */
  accent: string | null
}

export const DEFAULT_THEME: ThemeConfig = {
  palette: DEFAULT_PALETTE,
  backdrop: DEFAULT_BACKDROP,
  glass: DEFAULT_GLASS,
  radius: DEFAULT_RADIUS,
  accent: null,
}

const STORAGE_KEY = 'novacut.theme.v2'

/* ------------------------------ persistence ------------------------------ */

export function loadThemeConfig(): ThemeConfig {
  if (typeof window === 'undefined') return DEFAULT_THEME
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_THEME
    const parsed = JSON.parse(raw) as Partial<ThemeConfig>
    const validPalette = PALETTES.some((p) => p.id === parsed.palette)
    return {
      palette: validPalette ? (parsed.palette as PaletteId) : DEFAULT_PALETTE,
      backdrop: isBackdrop(parsed.backdrop) ? parsed.backdrop : DEFAULT_BACKDROP,
      glass: isGlass(parsed.glass) ? parsed.glass : DEFAULT_GLASS,
      radius: isRadius(parsed.radius) ? parsed.radius : DEFAULT_RADIUS,
      accent: typeof parsed.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.accent) ? parsed.accent : null,
    }
  } catch {
    return DEFAULT_THEME
  }
}

export function saveThemeConfig(config: ThemeConfig): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    /* storage full / private mode — theme still applies for this session */
  }
}

function isBackdrop(v: unknown): v is BackdropStyle {
  return v === 'aurora' || v === 'grid' || v === 'spotlight' || v === 'plain'
}
function isGlass(v: unknown): v is GlassLevel {
  return v === 'soft' || v === 'medium' || v === 'strong'
}
function isRadius(v: unknown): v is RadiusLevel {
  return v === 'sharp' || v === 'soft' || v === 'round' || v === 'pill'
}

/* ------------------------------ application ------------------------------ */

/**
 * Applies a ThemeConfig to <html>. Safe to call repeatedly.
 * Palettes are pure CSS ([data-nc-theme] blocks), so we only flip
 * attributes + the optional accent override + browser chrome color.
 */
export function applyTheme(config: ThemeConfig): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.ncTheme = config.palette
  root.dataset.ncBackdrop = config.backdrop
  root.dataset.ncGlass = config.glass
  root.dataset.ncRadius = config.radius
  if (config.accent) {
    root.style.setProperty('--nc-accent', config.accent)
  } else {
    root.style.removeProperty('--nc-accent')
  }
  // keep the PWA browser chrome in sync with the canvas background
  const palette = PALETTES.find((p) => p.id === config.palette)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (palette && meta) meta.setAttribute('content', palette.preview.bg)
}

/** Inline <head> script string — applies the saved theme before first paint (no FOUC). */
export const THEME_BOOTSTRAP_SNIPPET = `(function(){try{var c=JSON.parse(localStorage.getItem('${STORAGE_KEY}')||'null');var d=document.documentElement;if(c){if(c.palette)d.dataset.ncTheme=c.palette;if(c.backdrop)d.dataset.ncBackdrop=c.backdrop;if(c.glass)d.dataset.ncGlass=c.glass;if(c.radius)d.dataset.ncRadius=c.radius;if(c.accent&&/^#[0-9a-fA-F]{6}$/.test(c.accent))d.style.setProperty('--nc-accent',c.accent);var m=document.querySelector('meta[name="theme-color"]');if(m&&c.palette){var bgs={nova:'#07070d',ember:'#0e0907',emerald:'#05100b',rosenoir:'#0d060b',golden:'#090907',crimson:'#0c0708',arctic:'#f2f6f4',paper:'#f8f5f0'};if(bgs[c.palette])m.setAttribute('content',bgs[c.palette])}}}catch(e){}})();`

/**
 * Reads the live Chroma Engine hues for <canvas> drawing (selection boxes,
 * handles, overlays). Cached per theme change to stay cheap inside RAF loops.
 */
let canvasColorsCache: { key: string; colors: CanvasThemeColors } | null = null
export interface CanvasThemeColors {
  accent: string
  brand: string
  danger: string
  audio: string
  foreground: string
  panel: string
}

export function canvasThemeColors(): CanvasThemeColors {
  if (typeof document === 'undefined') {
    return { accent: '#d946ef', brand: '#a855f7', danger: '#f43f5e', audio: '#34d399', foreground: '#f4f2fa', panel: '#0c0c16' }
  }
  const root = document.documentElement
  const key = [
    root.dataset.ncTheme,
    root.dataset.ncGlass,
    root.style.getPropertyValue('--nc-accent') || '',
  ].join('|')
  if (canvasColorsCache && canvasColorsCache.key === key) return canvasColorsCache.colors
  const cs = getComputedStyle(root)
  const colors: CanvasThemeColors = {
    accent: cs.getPropertyValue('--nc-accent').trim() || '#d946ef',
    brand: cs.getPropertyValue('--nc-brand').trim() || '#a855f7',
    danger: cs.getPropertyValue('--nc-danger').trim() || '#f43f5e',
    audio: cs.getPropertyValue('--nc-audio').trim() || '#34d399',
    foreground: cs.getPropertyValue('--foreground').trim() || '#f4f2fa',
    panel: cs.getPropertyValue('--nc-sheet').trim() || '#0c0c16',
  }
  canvasColorsCache = { key, colors }
  return colors
}
