'use client'

/**
 * Day 51 — Export preset manager: named, reusable export BUNDLES.
 * A bundle captures the full export configuration (resolution, fps, video
 * bitrate, container, audio bitrate, timecode burn-in) as one click-to-apply
 * unit. Five stock bundles ship (YouTube 1080p/4K, Reels, TikTok, Square);
 * custom bundles persist in localStorage, any bundle can be the default that
 * auto-applies when the export dialog opens. Builtins cannot be deleted.
 */

import type { Project } from './types'

export interface ExportBundle {
  id: string
  name: string
  width: number
  height: number
  fps: number
  /** video bitrate in bits per second */
  bitrate: number
  format: 'webm' | 'mp4'
  /** audio track bitrate in kbps */
  audioKbps: number
  /** burn a running timecode into the picture */
  burnIn: boolean
  builtin: boolean
  createdAt: number
}

const CUSTOM_KEY = 'novacut.exportBundles.v1'
const DEFAULT_KEY = 'novacut.exportBundleDefault.v1'

export const BUILTIN_BUNDLES: ExportBundle[] = [
  { id: 'bundle-youtube-1080', name: 'YouTube 1080p', width: 1920, height: 1080, fps: 30, bitrate: 10_000_000, format: 'webm', audioKbps: 128, burnIn: false, builtin: true, createdAt: 0 },
  { id: 'bundle-youtube-4k', name: 'YouTube 4K', width: 3840, height: 2160, fps: 30, bitrate: 35_000_000, format: 'webm', audioKbps: 192, burnIn: false, builtin: true, createdAt: 0 },
  { id: 'bundle-reels', name: 'Reels / Shorts', width: 1080, height: 1920, fps: 30, bitrate: 9_000_000, format: 'mp4', audioKbps: 128, burnIn: false, builtin: true, createdAt: 0 },
  { id: 'bundle-tiktok', name: 'TikTok', width: 1080, height: 1920, fps: 30, bitrate: 9_000_000, format: 'mp4', audioKbps: 128, burnIn: false, builtin: true, createdAt: 0 },
  { id: 'bundle-square', name: 'Square Post', width: 1080, height: 1080, fps: 30, bitrate: 8_000_000, format: 'mp4', audioKbps: 128, burnIn: false, builtin: true, createdAt: 0 },
]

export function bundleSummary(b: ExportBundle): string {
  const mbps = b.bitrate >= 1_000_000 ? `${+(b.bitrate / 1_000_000).toFixed(1)} Mbps` : `${Math.round(b.bitrate / 1000)} kbps`
  return `${b.width}×${b.height} · ${b.fps} fps · ${mbps} · ${b.format.toUpperCase()}${b.burnIn ? ' · TC burn-in' : ''}`
}

/** All bundles: builtins first (fixed order), then customs (newest first). */
export function loadAllBundles(): ExportBundle[] {
  return [...BUILTIN_BUNDLES, ...loadCustomBundles()]
}

export function loadCustomBundles(): ExportBundle[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(CUSTOM_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((b): b is ExportBundle => !!b && typeof (b as ExportBundle).id === 'string' && typeof (b as ExportBundle).name === 'string')
      .map((b) => ({ ...b, builtin: false }))
      .sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

/** Name-uniqueness check across builtins + customs (case-insensitive). */
export function bundleNameTaken(name: string): boolean {
  const needle = name.trim().toLowerCase()
  return loadAllBundles().some((b) => b.name.toLowerCase() === needle)
}

export function saveCustomBundle(input: Omit<ExportBundle, 'id' | 'builtin' | 'createdAt'>): ExportBundle {
  const bundle: ExportBundle = {
    ...input,
    name: input.name.trim(),
    id: `bundle-c${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`,
    builtin: false,
    createdAt: Date.now(),
  }
  const customs = loadCustomBundles()
  const next = [bundle, ...customs].slice(0, 30) // cap 30 customs, newest wins
  window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(next))
  return bundle
}

/** Returns true when something was actually deleted (builtins never delete). */
export function deleteCustomBundle(id: string): boolean {
  const customs = loadCustomBundles()
  const next = customs.filter((b) => b.id !== id)
  if (next.length === customs.length) return false
  window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(next))
  if (getDefaultBundleId() === id) setDefaultBundleId(null)
  return true
}

export function getDefaultBundleId(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(DEFAULT_KEY)
}

export function setDefaultBundleId(id: string | null): void {
  if (typeof window === 'undefined') return
  if (id) window.localStorage.setItem(DEFAULT_KEY, id)
  else window.localStorage.removeItem(DEFAULT_KEY)
}

/** Apply a bundle's resolution + fps to the project (same semantics as the platform preset grid). */
export function applyBundleToProject(bundle: ExportBundle, store: { setCanvasSize: (w: number, h: number) => void; setFps: (fps: number) => void; project: Project }): void {
  store.setCanvasSize(bundle.width, bundle.height)
  store.setFps(bundle.fps)
  void store.project // shape guard — callers pass the zustand store snapshot
}

/* ---------------- Day 52: quality ladder ---------------- */

export interface LadderRung {
  id: string
  /** short chip label, e.g. "1080p · 60" */
  label: string
  /** one-line purpose of the rung */
  sub: string
  width: number
  height: number
  fps: number
  bitrate: number
  /** honest per-rung caveat rendered when the rung is active */
  note?: string
}

/**
 * The full quality ladder, bottom to top. Export is REALTIME (canvas
 * captureStream + MediaRecorder), so every rung takes ~project duration in
 * wall-clock time — heavier rungs spend more bits and more encode headroom,
 * they don't take longer, but they can drop frames on weak devices.
 * Bitrates stay inside the 1–40 Mbps dialog slider range.
 */
export const QUALITY_LADDER: LadderRung[] = [
  { id: 'rung-540-24', label: '540p · 24', sub: 'Draft review', width: 960, height: 540, fps: 24, bitrate: 3_000_000 },
  { id: 'rung-720-30', label: '720p · 30', sub: 'Good', width: 1280, height: 720, fps: 30, bitrate: 6_000_000 },
  { id: 'rung-1080-30', label: '1080p · 30', sub: 'High', width: 1920, height: 1080, fps: 30, bitrate: 12_000_000 },
  { id: 'rung-1080-60', label: '1080p · 60', sub: 'Smooth motion', width: 1920, height: 1080, fps: 60, bitrate: 16_000_000 },
  { id: 'rung-1440-30', label: '1440p · 30', sub: 'QHD', width: 2560, height: 1440, fps: 30, bitrate: 20_000_000 },
  { id: 'rung-4k-30', label: '4K · 30', sub: 'UHD', width: 3840, height: 2160, fps: 30, bitrate: 35_000_000, note: 'Realtime 4K capture — heavy on software-rendered or low-power devices' },
  { id: 'rung-4k-60', label: '4K · 60', sub: 'UHD smooth', width: 3840, height: 2160, fps: 60, bitrate: 40_000_000, note: 'Heaviest rung — realtime 4K60 needs a strong GPU; frame drops are honest, not silent' },
]

/** Match the dialog's current state (canvas + fps + bitrate) back to a rung. */
export function matchLadderRung(width: number, height: number, fps: number, bitrate: number): LadderRung | null {
  return QUALITY_LADDER.find((r) => r.width === width && r.height === height && r.fps === fps && r.bitrate === bitrate) ?? null
}
