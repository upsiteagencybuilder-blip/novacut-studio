'use client'

/**
 * Day 55 — Branding kit: logo watermark + intro/outro auto-attach.
 *
 * Two independent pieces:
 *  1. WATERMARK — an image (or a video asset's poster frame) painted onto every
 *     exported frame by the engine. Export-only: the live preview never shows it
 *     (same contract as the timecode burn-in). Settings persist in localStorage
 *     so the kit survives reloads.
 *  2. INTRO/OUTRO AUTO-ATTACH — for THIS export the timeline is transiently
 *     extended: the intro asset becomes the first clip, the outro the last, and
 *     every existing clip shifts by the intro length. The real project object is
 *     never mutated — the dialog swaps the branded copy in before recording and
 *     restores the original afterwards (no history entry, no autosave debris
 *     once restored).
 */
import { createClipFromMedia } from './constants'
import type { Clip, MediaAssetRuntime, Project } from './types'

export type WatermarkPosition = 'tl' | 'tr' | 'bl' | 'br'

export interface BrandingKit {
  watermarkEnabled: boolean
  watermarkAssetId: string | null
  watermarkPosition: WatermarkPosition
  /** watermark drawn height as a fraction of canvas height (0.05..0.4) */
  watermarkScale: number
  /** 0.1..1 */
  watermarkOpacity: number
  introEnabled: boolean
  introAssetId: string | null
  outroEnabled: boolean
  outroAssetId: string | null
}

export const DEFAULT_BRANDING: BrandingKit = {
  watermarkEnabled: false,
  watermarkAssetId: null,
  watermarkPosition: 'br',
  watermarkScale: 0.14,
  watermarkOpacity: 0.85,
  introEnabled: false,
  introAssetId: null,
  outroEnabled: false,
  outroAssetId: null,
}

const STORE_KEY = 'novacut.branding.v1'
/** fixed timeline length for image intro/outro pieces (videos use source length) */
export const IMAGE_BRAND_DURATION = 2.5

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function loadBrandingKit(): BrandingKit {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_BRANDING }
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return { ...DEFAULT_BRANDING }
    const p = JSON.parse(raw) as Partial<BrandingKit>
    return {
      watermarkEnabled: !!p.watermarkEnabled,
      watermarkAssetId: typeof p.watermarkAssetId === 'string' ? p.watermarkAssetId : null,
      watermarkPosition: (['tl', 'tr', 'bl', 'br'] as const).includes(p.watermarkPosition as WatermarkPosition)
        ? (p.watermarkPosition as WatermarkPosition)
        : DEFAULT_BRANDING.watermarkPosition,
      watermarkScale: clamp(Number(p.watermarkScale) || DEFAULT_BRANDING.watermarkScale, 0.05, 0.4),
      watermarkOpacity: clamp(Number(p.watermarkOpacity) || DEFAULT_BRANDING.watermarkOpacity, 0.1, 1),
      introEnabled: !!p.introEnabled,
      introAssetId: typeof p.introAssetId === 'string' ? p.introAssetId : null,
      outroEnabled: !!p.outroEnabled,
      outroAssetId: typeof p.outroAssetId === 'string' ? p.outroAssetId : null,
    }
  } catch {
    return { ...DEFAULT_BRANDING }
  }
}

export function saveBrandingKit(kit: BrandingKit): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(kit))
  } catch {
    /* storage full/unavailable — kit just won't persist */
  }
}

/** drop kit references to assets that no longer exist (called when the dialog opens) */
export function sanitizeBranding(kit: BrandingKit, assets: MediaAssetRuntime[]): BrandingKit {
  const ids = new Set(assets.map((a) => a.id))
  return {
    ...kit,
    watermarkAssetId: kit.watermarkAssetId && ids.has(kit.watermarkAssetId) ? kit.watermarkAssetId : null,
    introAssetId: kit.introAssetId && ids.has(kit.introAssetId) ? kit.introAssetId : null,
    outroAssetId: kit.outroAssetId && ids.has(kit.outroAssetId) ? kit.outroAssetId : null,
  }
}

export function brandAssetDuration(asset: MediaAssetRuntime): number {
  return asset.kind === 'image' ? IMAGE_BRAND_DURATION : Math.max(0.2, asset.duration || 0.2)
}

/** resolve the paintable watermark URL for an asset — videos use their poster frame */
export function watermarkUrlForAsset(asset: MediaAssetRuntime): string {
  return asset.kind === 'image' ? asset.objectUrl : asset.thumbnail
}

export interface BrandedTimeline {
  project: Project
  introDur: number
  outroDur: number
}

/**
 * Build the transient extended project for one export: intro prepended, outro
 * appended, every existing clip (and marker) shifted by the intro length.
 * Returns null when neither piece is armed or no video track exists.
 */
export function buildBrandedTimeline(
  project: Project,
  assets: MediaAssetRuntime[],
  kit: BrandingKit
): BrandedTimeline | null {
  const byId = new Map(assets.map((a) => [a.id, a]))
  const intro = kit.introEnabled ? (byId.get(kit.introAssetId ?? '') ?? null) : null
  const outro = kit.outroEnabled ? (byId.get(kit.outroAssetId ?? '') ?? null) : null
  const introDur = intro ? brandAssetDuration(intro) : 0
  const outroDur = outro ? brandAssetDuration(outro) : 0
  if (!intro && !outro) return null

  const videoTrack =
    project.tracks.find((t) => t.kind === 'video') ?? project.tracks.find((t) => t.kind !== 'audio') ?? project.tracks[0]
  if (!videoTrack) return null

  // deep clone — no shared references with the live project
  const base: Project = structuredClone(project)
  base.clips = base.clips.map((c) => ({ ...c, start: +(c.start + introDur).toFixed(3) }))
  if (base.markers?.length) base.markers = base.markers.map((m) => ({ ...m, t: +(m.t + introDur).toFixed(3) }))

  const branded: Clip[] = [...base.clips]
  if (intro) {
    const clip = createClipFromMedia(base, intro, videoTrack.id, 0)
    clip.duration = introDur
    clip.fadeIn = 0
    branded.push(clip)
  }
  if (outro) {
    const end = base.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0)
    const clip = createClipFromMedia(base, outro, videoTrack.id, +(end + introDur).toFixed(3))
    clip.duration = outroDur
    clip.fadeOut = 0
    branded.push(clip)
  }
  base.clips = branded
  base.updatedAt = Date.now()
  return { project: base, introDur, outroDur }
}

/** preload the watermark image BEFORE recording starts so frame 1 already has it */
export function ensureImageLoaded(url: string, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const timer = setTimeout(() => reject(new Error('Watermark image took too long to load')), timeoutMs)
    img.onload = () => {
      clearTimeout(timer)
      resolve()
    }
    img.onerror = () => {
      clearTimeout(timer)
      reject(new Error('Watermark image failed to load'))
    }
    img.src = url
  })
}
