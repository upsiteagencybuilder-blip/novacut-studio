'use client'

/**
 * NovaCut cloud backup helpers — client side.
 *
 * A cloud backup stores the full project structure (tracks, clips, markers,
 * styles, timings) as JSON keyed to the device. Media binaries stay in the
 * browser's IndexedDB, so a restore on THIS device is pixel-complete;
 * the dialog states that honestly.
 */

import type { Project } from '@/lib/editor/types'

/** Capture a small JPEG thumbnail from the biggest live preview canvas. */
export function captureThumbnail(): string | undefined {
  try {
    const canvases = Array.from(document.querySelectorAll('canvas'))
    const src = canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0]
    if (!src || !src.width || !src.height) return undefined
    const out = document.createElement('canvas')
    out.width = 160
    out.height = 90
    const ctx = out.getContext('2d')
    if (!ctx) return undefined
    ctx.drawImage(src, 0, 0, out.width, out.height)
    return out.toDataURL('image/jpeg', 0.6)
  } catch {
    return undefined
  }
}

/** Defensive shape check for payloads coming back from the cloud. */
export function isCloudProjectPayload(v: unknown): v is Project {
  if (!v || typeof v !== 'object') return false
  const p = v as Partial<Project>
  return (
    typeof p.id === 'string' &&
    p.id.length > 0 &&
    typeof p.name === 'string' &&
    Array.isArray(p.tracks) &&
    Array.isArray(p.clips) &&
    typeof p.canvasWidth === 'number' &&
    typeof p.fps === 'number'
  )
}
