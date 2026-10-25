'use client'

/**
 * NovaCut Studio — nested (compound) clip resolution.
 *
 * A compound clip embeds its children with RELATIVE start times. Everything
 * that PLAYS or RENDERS the timeline (preview engine, video export, offline
 * audio mixdown) consumes a RESOLVED clip list where compounds are flattened
 * back into absolute-time clips on their own tracks — so the engine never
 * needs to know compounds exist.
 *
 * Editing happens on the real project state: grouping packs clips into a
 * compound, double-click materializes the children back onto the tracks for
 * editing (a session), and exiting repacks them (see the store).
 */
import type { Clip, Project } from './types'
import { round2 } from './utils'

/** A compound container that actually carries children */
export function isNestedClip(c: Clip): boolean {
  return c.kind === 'nested' && !!c.nested && Array.isArray(c.nested.children) && c.nested.children.length > 0
}

/** Total timeline span of a compound's children (children starts are relative) */
export function nestedSpan(children: Clip[]): number {
  let end = 0
  for (const c of children) end = Math.max(end, c.start + c.duration)
  return end
}

/** The compound currently being edited (its children are materialized) */
export function openCompound(p: Project): Clip | undefined {
  return p.clips.find((c) => c.kind === 'nested' && c.nested?.open)
}

/**
 * Flatten compounds into an effective clip list:
 * children become absolute-time clones (`compound.start + child.start`) on
 * their own tracks; containers disappear. An OPEN compound contributes
 * nothing — its children are already top-level clips (editing session).
 * Recursion-safe (children are flat by construction, but persisted/hand-edited
 * data is defended anyway). Clips that are not compounds are returned as-is.
 */
export function resolveNestedClips(clips: Clip[], baseTime = 0): Clip[] {
  const out: Clip[] = []
  for (const c of clips) {
    if (c.kind === 'nested' && c.nested?.open) continue // session: children are top-level
    if (isNestedClip(c)) {
      out.push(...resolveNestedClips(c.nested!.children, baseTime + c.start))
    } else {
      out.push(baseTime === 0 ? c : { ...c, start: round2(baseTime + c.start) })
    }
  }
  return out
}

/**
 * Resolved view of a whole project for playback / export / mixdown.
 * Children whose track no longer exists fall back to the compound's own
 * track so they can never be silently dropped from rendering.
 * Returns the SAME object when no compound exists (zero-cost fast path).
 */
export function resolveNestedProject(p: Project): Project {
  if (!p.clips.some((c) => c.kind === 'nested')) return p
  const trackIds = new Set(p.tracks.map((t) => t.id))
  const clips = resolveNestedClips(p.clips).map((c) => (trackIds.has(c.trackId) ? c : { ...c, trackId: p.tracks[0]?.id ?? c.trackId }))
  return { ...p, clips }
}
