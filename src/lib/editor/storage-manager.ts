'use client'

/**
 * Day 60 — Storage manager: quota report + cleanup, all local-first.
 *
 * HONESTY NOTES:
 *  - usage/quota come from navigator.storage.estimate() — Chromium reports the
 *    WHOLE origin (IndexedDB + Cache API + others); per-store byte counts are
 *    computed locally (asset metadata sizes / blob sizes), the rest is labeled
 *    "everything else (shell caches, cloud copies…)".
 *  - "Orphaned assets" = local media blobs referenced by NO stored project's
 *    clips. The demo/media library keeps assets for the CURRENT session too —
 *    an asset in active use (store.media) is NEVER treated as orphan.
 *  - "Clear service-worker caches" removes the offline shell cache; it
 *    re-populates on the next online session (precache + runtime paths).
 *  - Factory reset wipes IndexedDB + localStorage + caches for this origin and
 *    reloads — double-confirmed in the UI.
 */
import * as db from './db'
import type { MediaAsset } from './types'

export interface StorageReport {
  /** estimate() bytes used by the whole origin (null when unavailable) */
  usageBytes: number | null
  /** estimate() quota granted by the browser (null when unavailable) */
  quotaBytes: number | null
  /** sum of known media blob sizes in the assets store */
  mediaBytes: number
  mediaCount: number
  projectCount: number
  versionCount: number
  /** assets referenced by no stored project (excluding in-session media) */
  orphanIds: string[]
  orphanBytes: number
  persisted: boolean | null
}

export async function getStorageReport(activeAssetIds: string[] = []): Promise<StorageReport> {
  const [assets, projects] = await Promise.all([db.listAssets(), db.listProjects()])
  // versions: list per project (the store is keyed by snapshot id)
  let versionCount = 0
  for (const p of projects) {
    const vs = await db.listVersions(p.id)
    versionCount += vs.length
  }

  const active = new Set(activeAssetIds)
  const referenced = new Set<string>()
  for (const p of projects) {
    for (const c of p.clips) {
      if (c.mediaId) referenced.add(c.mediaId)
    }
  }
  const orphanIds: string[] = []
  let orphanBytes = 0
  let mediaBytes = 0
  for (const { meta } of assets) {
    mediaBytes += meta.size || 0
    if (!referenced.has(meta.id) && !active.has(meta.id)) {
      orphanIds.push(meta.id)
      orphanBytes += meta.size || 0
    }
  }

  let usageBytes: number | null = null
  let quotaBytes: number | null = null
  let persisted: boolean | null = null
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      const est = await navigator.storage.estimate()
      usageBytes = est.usage ?? null
      quotaBytes = est.quota ?? null
    }
    if (typeof navigator !== 'undefined' && navigator.storage?.persisted) {
      persisted = await navigator.storage.persisted()
    }
  } catch {
    /* estimate unavailable — the UI labels it honestly */
  }

  return {
    usageBytes,
    quotaBytes,
    mediaBytes,
    mediaCount: assets.length,
    projectCount: projects.length,
    versionCount,
    orphanIds,
    orphanBytes,
    persisted,
  }
}

/** delete the given local media blobs (orphans only — the UI enforces that) */
export async function deleteOrphanAssets(ids: string[]): Promise<number> {
  let n = 0
  for (const id of ids) {
    try {
      await db.deleteAsset(id)
      n += 1
    } catch {
      /* keep going — report the real count */
    }
  }
  return n
}

/** remove every version snapshot for every project */
export async function clearAllVersions(): Promise<number> {
  const projects = await db.listProjects()
  let n = 0
  for (const p of projects) {
    const vs = await db.listVersions(p.id)
    for (const v of vs) {
      await db.deleteVersion(v.id)
      n += 1
    }
  }
  return n
}

/** drop the service-worker shell caches (re-populate on the next online session) */
export async function clearSWCaches(): Promise<number> {
  if (typeof caches === 'undefined') return 0
  const keys = await caches.keys()
  for (const k of keys) await caches.delete(k)
  return keys.length
}

/** nuclear: wipe local persistence for this origin and reload */
export async function factoryReset(): Promise<void> {
  try {
    if (typeof indexedDB !== 'undefined') indexedDB.deleteDatabase('novacut-db')
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys()
      for (const k of keys) await caches.delete(k)
    }
    if (typeof localStorage !== 'undefined') localStorage.clear()
    if (typeof sessionStorage !== 'undefined') sessionStorage.clear()
  } finally {
    window.location.reload()
  }
}

/** human bytes, shared by the dialog */
export function formatBytesLocal(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export type { MediaAsset }
