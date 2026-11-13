'use client'

/**
 * UX60 Phase 3 (Days 23-24) — smart defaults engine.
 *
 * Remembers per-device preferences the moment the user expresses them and
 * quietly re-applies them next session: last panel tab, last canvas size,
 * last text font, last export platform preset. Everything persists in the
 * existing IndexedDB KV store (sd.* keys) with debounced writes — zero extra
 * infrastructure, zero network. Explicit choices always win: an intent-picker
 * canvas or a text preset font overrides the remembered default; the engine
 * only fills the gaps.
 *
 * Receipts are verifiable: change tab/font/canvas/preset → reload → the same
 * state returns. The Pro toolkit deep link reads the honest summary.
 */
import { getKV, setKV } from './db'

export interface SmartDefaultsState {
  panelTab?: string
  fontFamily?: string
  canvas?: { width: number; height: number }
  exportPreset?: string
}

const K_TAB = 'sd.panelTab'
const K_FONT = 'sd.fontFamily'
const K_CANVAS = 'sd.canvas'
const K_PRESET = 'sd.exportPreset'

/** synchronous module cache — loaded during store init, kept fresh on record */
const cache: SmartDefaultsState = {}

/** debounce timers per key — typing/scrubbing never hammers IndexedDB */
const timers: Record<string, ReturnType<typeof setTimeout> | undefined> = {}
function saveDebounced(key: string, value: unknown) {
  if (timers[key]) clearTimeout(timers[key])
  timers[key] = setTimeout(() => {
    void setKV(key, value).catch(() => undefined)
  }, 500)
}

/** called once from store.init — fills the cache then restores the panel tab */
export async function loadSmartDefaults(): Promise<void> {
  try {
    const [tab, font, canvas, preset] = await Promise.all([
      getKV<string>(K_TAB),
      getKV<string>(K_FONT),
      getKV<{ width: number; height: number }>(K_CANVAS),
      getKV<string>(K_PRESET),
    ])
    if (tab) cache.panelTab = tab
    if (font) cache.fontFamily = font
    if (canvas && typeof canvas.width === 'number' && typeof canvas.height === 'number') cache.canvas = canvas
    if (preset) cache.exportPreset = preset
  } catch {
    /* private mode / storage down — defaults simply stay empty */
  }
}

export function recordPanelTab(tab: string) {
  cache.panelTab = tab
  saveDebounced(K_TAB, tab)
}

export function recordFontFamily(family: string) {
  if (!family) return
  cache.fontFamily = family
  saveDebounced(K_FONT, family)
}

export function recordCanvas(width: number, height: number) {
  cache.canvas = { width, height }
  saveDebounced(K_CANVAS, cache.canvas)
}

export function recordExportPreset(id: string) {
  if (!id) return
  cache.exportPreset = id
  saveDebounced(K_PRESET, id)
}

/** remembered panel tab — restored right after store init */
export function getSmartDefaultPanelTab(): string | undefined {
  return cache.panelTab
}

/** remembered font for NEW text clips (explicit preset fonts still win) */
export function getSmartDefaultFont(): string | undefined {
  return cache.fontFamily
}

/** remembered canvas for NEW projects (explicit picker choices still win) */
export function getSmartDefaultCanvas(): { width: number; height: number } | undefined {
  return cache.canvas
}

/** remembered export preset for preselecting in the export dialog */
export function getSmartDefaultExportPreset(): string | undefined {
  return cache.exportPreset
}

/** honest summary for the Pro-wall toast — empty parts are named, not faked */
export function getSmartDefaultsSummary(): string {
  const parts: string[] = []
  parts.push(cache.panelTab ? `panel: ${cache.panelTab}` : 'panel: default')
  parts.push(cache.fontFamily ? `font: ${cache.fontFamily}` : 'font: default')
  parts.push(cache.canvas ? `canvas: ${cache.canvas.width}×${cache.canvas.height}` : 'canvas: default')
  parts.push(cache.exportPreset ? `export preset: ${cache.exportPreset}` : 'export preset: default')
  return parts.join(' · ')
}

/** test seam for E2E receipts (window-gated, client-only module) */
if (typeof window !== 'undefined') {
  ;(window as unknown as { __ncSmartDefaults?: SmartDefaultsState }).__ncSmartDefaults = cache
}
