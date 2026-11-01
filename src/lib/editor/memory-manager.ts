'use client'

/**
 * NovaCut Studio — Day 62: Memory budget (media eviction + rehydration)
 *
 * The editor holds every imported asset as a live Blob + objectURL in RAM.
 * On long projects that can exhaust the tab's heap long before disk quota.
 * This module owns the budget:
 *
 *  - `getMediaReport`    — measured live totals vs the configured budget
 *  - `evictOverBudget`   — releases the biggest non-protected blobs first
 *  - `rehydrateMediaAsset` — transparently reloads an evicted asset from
 *    IndexedDB (meta rows and thumbnails are NEVER evicted, so the media
 *    panel stays fully usable — only raw pixels go)
 *
 * Protected from eviction: the media under or right after the playhead,
 * the selected clips' media, and anything a user pins via the Storage panel.
 * Pure module — talks to the store lazily to avoid import cycles.
 */
import { useEditor } from './store'
import type { MediaAssetRuntime } from './types'

const BUDGET_KEY = 'novacut.mediaBudget'
/** default RAM budget for held media blobs: 750 MB */
export const MEDIA_BUDGET_DEFAULT = 750 * 1024 * 1024
/** never evict media within ±this many seconds of the playhead while playing */
const PLAYHEAD_GUARD_S = 4

export const MEDIA_BUDGET_CHOICES = [
  { label: '256 MB', bytes: 256 * 1024 * 1024 },
  { label: '512 MB', bytes: 512 * 1024 * 1024 },
  { label: '750 MB', bytes: MEDIA_BUDGET_DEFAULT },
  { label: '1.5 GB', bytes: 1.5 * 1024 * 1024 },
  { label: 'Off', bytes: Number.MAX_SAFE_INTEGER },
]

export function getMediaBudgetBytes(): number {
  if (typeof localStorage === 'undefined') return MEDIA_BUDGET_DEFAULT
  const raw = localStorage.getItem(BUDGET_KEY)
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) && n > 0 ? n : MEDIA_BUDGET_DEFAULT
}

export function setMediaBudgetBytes(bytes: number) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(BUDGET_KEY, String(bytes))
}

export interface MediaMemoryReport {
  heldBytes: number
  budgetBytes: number
  heldCount: number
  evictedCount: number
  /** bytes that COULD be freed right now (non-protected assets) */
  evictableBytes: number
  evictableCount: number
  top: { id: string; name: string; size: number; protected: boolean }[]
}

/** media ids that must stay in RAM (playhead window + selection) */
function protectedMediaIds(): Set<string> {
  const out = new Set<string>()
  try {
    const s = useEditor.getState()
    const t = s.currentTime
    const near = (start: number, dur: number) => start + dur >= t - PLAYHEAD_GUARD_S && start <= t + PLAYHEAD_GUARD_S
    for (const c of s.project.clips) {
      if (!c.mediaId) continue
      if (c.kind === 'audio' || c.kind === 'video') {
        // audio is cheap; guard only long-lead media near the playhead
        if (near(c.start, c.duration)) out.add(c.mediaId)
      } else if (near(c.start, c.duration)) {
        out.add(c.mediaId)
      }
    }
    for (const cid of s.selectedClipIds) {
      const c = s.project.clips.find((x) => x.id === cid)
      if (c?.mediaId) out.add(c.mediaId)
    }
  } catch {
    /* store not ready — protect nothing */
  }
  return out
}

export function getMediaReport(media: MediaAssetRuntime[]): MediaMemoryReport {
  const budgetBytes = getMediaBudgetBytes()
  const protectedIds = protectedMediaIds()
  let heldBytes = 0
  let heldCount = 0
  let evictedCount = 0
  let evictableBytes = 0
  let evictableCount = 0
  const top: MediaMemoryReport['top'] = []
  for (const a of media) {
    if (a.evicted || !a.rawBlob) {
      evictedCount++
      continue
    }
    heldBytes += a.rawBlob.size
    heldCount++
    const isProtected = protectedIds.has(a.id)
    if (!isProtected) {
      evictableBytes += a.rawBlob.size
      evictableCount++
    }
    top.push({ id: a.id, name: a.name, size: a.rawBlob.size, protected: isProtected })
  }
  top.sort((x, y) => y.size - x.size)
  return {
    heldBytes,
    budgetBytes: budgetBytes === Number.MAX_SAFE_INTEGER ? 0 : budgetBytes,
    heldCount,
    evictedCount,
    evictableBytes,
    evictableCount,
    top: top.slice(0, 5),
  }
}

/** release one asset's blob + objectURL (meta + thumbnail stay) */
export async function evictMediaAssets(ids: string[]): Promise<number> {
  const { useEditor } = await import('./store')
  const st = useEditor.getState()
  let freed = 0
  const media = st.media.map((a) => {
    if (!ids.includes(a.id) || a.evicted || !a.rawBlob) return a
    freed += a.rawBlob.size
    try {
      URL.revokeObjectURL(a.objectUrl)
    } catch {
      /* already gone */
    }
    // drop pooled engine elements for this media so nothing renders from a
    // dead objectURL — the next draw rehydrates instead
    void import('./engine').then(({ getEngine }) => getEngine().dropMediaPools(a.id))
    return { ...a, rawBlob: undefined, evicted: true } as MediaAssetRuntime
  })
  useEditor.setState({ media, mediaVersion: st.mediaVersion + 1 })
  return freed
}

/**
 * Reload an evicted asset's blob from IndexedDB and swap it back into the
 * store. Returns the live runtime asset, or undefined if it no longer exists.
 */
export async function rehydrateMediaAsset(id: string): Promise<MediaAssetRuntime | undefined> {
  const { useEditor } = await import('./store')
  const st = useEditor.getState()
  const current = st.media.find((a) => a.id === id)
  if (!current) return undefined
  if (current.rawBlob && !current.evicted) return current
  const { getAsset } = await import('./db')
  const row = await getAsset(id)
  if (!row) return undefined
  const revived: MediaAssetRuntime = {
    ...current,
    objectUrl: URL.createObjectURL(row.blob),
    rawBlob: row.blob,
    evicted: false,
  }
  useEditor.setState((s) => ({
    media: s.media.map((a) => (a.id === id ? revived : a)),
    mediaVersion: s.mediaVersion + 1,
  }))
  return revived
}

/** get an asset guaranteed to hold its blob (rehydrating first if evicted) */
export async function ensureAssetReady(id: string): Promise<MediaAssetRuntime | undefined> {
  const { useEditor } = await import('./store')
  const a = useEditor.getState().media.find((m) => m.id === id)
  if (a && a.rawBlob && !a.evicted) return a
  return rehydrateMediaAsset(id)
}

/**
 * Bring total held bytes back under budget by evicting the biggest
 * non-protected assets first. Returns the freed byte count.
 */
export async function evictOverBudget(): Promise<number> {
  const { useEditor } = await import('./store')
  const media = useEditor.getState().media
  const budget = getMediaBudgetBytes()
  if (budget === Number.MAX_SAFE_INTEGER) return 0
  const report = getMediaReport(media)
  if (report.heldBytes <= budget) return 0
  const over = report.heldBytes - budget
  const protectedIds = protectedMediaIds()
  const candidates = media
    .filter((a) => !a.evicted && a.rawBlob && !protectedIds.has(a.id))
    .sort((a, b) => (b.rawBlob?.size ?? 0) - (a.rawBlob?.size ?? 0))
  const ids: string[] = []
  let acc = 0
  for (const c of candidates) {
    ids.push(c.id)
    acc += c.rawBlob?.size ?? 0
    if (acc >= over) break
  }
  if (!ids.length) return 0
  return evictMediaAssets(ids)
}
