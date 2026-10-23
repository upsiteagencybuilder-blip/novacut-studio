/**
 * NovaCut Studio — favorites / recent persistence (local-first)
 *
 * One shared localStorage contract for every effect browser (EffectsPanel,
 * AudioPanel's Music/SFX tabs): favorites and recents are plain string-id
 * lists under stable keys, so a track starred in the Audio hub shows starred
 * in the Effects panel too. Storage failures degrade to session-only.
 */

export const FAVORITES_KEY = 'novacut.fx.favorites.v1'
export const RECENT_KEY = 'novacut.fx.recent.v1'
export const RECENT_CAP = 24

export function loadIdList(key: string, cap = 200): string[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string').slice(0, cap)
  } catch {
    return []
  }
}

export function saveIdList(key: string, ids: string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(ids))
  } catch {
    // storage blocked/full — favorites stay session-only
  }
}

/** Add/remove an id in a list copy (deduped, newest first, capped). */
export function toggleIdInList(ids: string[], id: string, cap = 200): string[] {
  const next = ids.includes(id) ? ids.filter((x) => x !== id) : [id, ...ids]
  return next.slice(0, cap)
}

/** Record a use into a recency list copy (deduped, newest first, capped). */
export function pushRecentId(ids: string[], id: string, cap = 200): string[] {
  return [id, ...ids.filter((x) => x !== id)].slice(0, cap)
}
