'use client'

/**
 * UX60 Phase 7 (Days 53–54) — honest render counters.
 *
 * Interaction-latency work needs receipts: these counters live in the
 * component bodies of the heavy surfaces (timeline / preview / properties)
 * and are exposed on `window.__ncRenders_*` so a scripted interaction can
 * count exactly how many React renders a drag or a playback run caused.
 * They mirror the startup-probe pattern (`__ncStartupMs`): permanent,
 * tiny, never networked.
 */
export function bumpRenderCount(key: string) {
  if (typeof window === 'undefined') return
  const w = window as unknown as Record<string, number | undefined>
  const k = `__ncRenders_${key}`
  w[k] = (w[k] ?? 0) + 1
}

export function getRenderCount(key: string): number {
  if (typeof window === 'undefined') return 0
  return (window as unknown as Record<string, number | undefined>)[`__ncRenders_${key}`] ?? 0
}
