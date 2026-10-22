/**
 * NovaCut Studio — Transition bridge helpers
 *
 * A "transition bridge" joins two ADJACENT clips on the same track (outgoing
 * ends where the incoming starts, ±0.08s tolerance). When armed, the engine
 * renders both clips simultaneously for a short window so fades become TRUE
 * crossfades (the outgoing keeps playing under the incoming while alphas
 * blend) and wipe masks reveal the incoming over a fully-visible outgoing.
 *
 * This module is the single source of truth for bridge arming — the engine
 * (preview + export), the timeline chips and the properties panel all read it.
 */

import type { Clip, WipeShape } from './types'

/** max timeline gap (seconds) between two clips for them to count as adjacent */
export const BRIDGE_GAP_TOLERANCE = 0.08

/** Wipe mask shapes that arm a bridge even without fades */
export function wipeShapeOf(incoming: Clip): WipeShape | null {
  return incoming.wipe ?? null
}

/** Last 'iris' keyframe time of a clip (the wipe reveal window), or null */
export function wipeWindowOf(incoming: Clip): number | null {
  if (!incoming.wipe) return null
  const keys = (incoming.keyframes ?? []).filter((k) => k.property === 'iris')
  if (!keys.length) return null
  return Math.max(...keys.map((k) => k.time))
}

/**
 * The transition window (seconds) between an outgoing and adjacent incoming
 * clip, or null when no bridge is armed:
 *  - wipe bridge: incoming has a wipe mask + iris keys → window = mask reveal span
 *  - fade bridge: outgoing.fadeOut > 0 and incoming.fadeIn > 0 → window = min of both
 * The window never exceeds either clip's duration.
 */
export function bridgeWindowFor(outgoing: Clip, incoming: Clip): number | null {
  if (outgoing.kind === 'audio' !== (incoming.kind === 'audio')) return null
  const gap = incoming.start - (outgoing.start + outgoing.duration)
  if (gap < -BRIDGE_GAP_TOLERANCE || gap > BRIDGE_GAP_TOLERANCE) return null

  let window: number | null = null
  const wipeWin = wipeWindowOf(incoming)
  if (wipeWin != null && wipeWin > 0.01) {
    window = wipeWin
  } else if (outgoing.fadeOut > 0.01 && incoming.fadeIn > 0.01) {
    window = Math.min(outgoing.fadeOut, incoming.fadeIn)
  }
  if (window == null) return null
  window = Math.min(window, outgoing.duration, incoming.duration)
  return window > 0.01 ? window : null
}

/** The outgoing clip adjacent BEFORE `clip` on the same track, or null */
export function outgoingNeighborOf(clip: Clip, trackClips: Clip[]): Clip | null {
  const end = clip.start
  let best: Clip | null = null
  for (const c of trackClips) {
    if (c.id === clip.id) continue
    const cEnd = c.start + c.duration
    if (cEnd <= end + BRIDGE_GAP_TOLERANCE && cEnd >= end - BRIDGE_GAP_TOLERANCE) {
      if (!best || cEnd > best.start + best.duration) best = c
    }
  }
  return best
}

export interface TransitionPair {
  outgoingId: string
  incomingId: string
  /** bridge window in seconds */
  window: number
}

/**
 * All armed transition pairs within one track's clips (sorted by start),
 * used by the timeline chips and properties panel. Each incoming clip pairs
 * with its nearest preceding neighbor.
 */
export function transitionPairsForTrack(trackClips: Clip[]): TransitionPair[] {
  const sorted = [...trackClips].sort((a, b) => a.start - b.start)
  const pairs: TransitionPair[] = []
  for (let i = 1; i < sorted.length; i++) {
    const incoming = sorted[i]
    // nearest preceding neighbor (handles adjacent chains A→B→C)
    for (let j = i - 1; j >= 0; j--) {
      const window = bridgeWindowFor(sorted[j], incoming)
      if (window != null) {
        pairs.push({ outgoingId: sorted[j].id, incomingId: incoming.id, window })
        break
      }
    }
  }
  return pairs
}

/** True when the outgoing side of the bridge must hold full alpha (no own fadeOut) */
export function isWipeBridge(incoming: Clip): boolean {
  return !!incoming.wipe
}
