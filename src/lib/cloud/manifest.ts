'use client'

/**
 * Day 41 — Media manifest builder.
 *
 * A manifest is the sha-256 hash map of every media asset a project
 * references. It travels with the cloud backup so any device can answer
 * "which binaries does this project need, and do I already have them?"
 * (re-link + dedupe land in Days 42/46).
 *
 * Everything runs on-device: blobs are read from IndexedDB, hashed with
 * the WebCrypto subtle API (secure context), never uploaded here.
 */

import type { MediaKind, Project } from '@/lib/editor/types'
import * as idb from '@/lib/editor/db'

export interface ManifestEntry {
  /** IndexedDB media asset id */
  assetId: string
  name: string
  kind: MediaKind
  mimeType: string
  size: number
  duration: number
  width: number
  height: number
  /** sha-256 hex of the blob */
  hash: string
}

export interface ManifestBuildResult {
  entries: ManifestEntry[]
  /** clip-referenced assets that no longer exist in IndexedDB */
  missing: string[]
  totalBytes: number
  hashMs: number
}

/** sha-256 of a Blob → lowercase hex string. */
export async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Build the manifest for a project: every `clip.mediaId` referenced by any
 * clip, resolved against IndexedDB, deduped by asset id, hashed. Missing
 * assets are reported (honestly) instead of silently dropped.
 */
export async function buildProjectManifest(project: Project): Promise<ManifestBuildResult> {
  const started = performance.now()

  const referenced = new Set<string>()
  for (const clip of project.clips) {
    if (clip.mediaId) referenced.add(clip.mediaId)
  }

  const missing: string[] = []
  const entries: ManifestEntry[] = []

  for (const assetId of referenced) {
    const record = await idb.getAsset(assetId).catch(() => undefined)
    if (!record) {
      missing.push(assetId)
      continue
    }
    const { meta, blob } = record
    entries.push({
      assetId: meta.id,
      name: meta.name,
      kind: meta.kind,
      mimeType: meta.mimeType,
      size: meta.size,
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
      hash: await sha256Hex(blob),
    })
  }

  return {
    entries,
    missing,
    totalBytes: entries.reduce((sum, e) => sum + e.size, 0),
    hashMs: Math.round(performance.now() - started),
  }
}

/** Verify local blobs still match a manifest — returns per-entry match state. */
export interface ManifestCheckResult {
  assetId: string
  name: string
  hash: string
  /** 'match' | 'mismatch' | 'missing' — relative to THIS device's IndexedDB */
  status: 'match' | 'mismatch' | 'missing'
}

export async function checkManifestAgainstLocal(entries: ManifestEntry[]): Promise<ManifestCheckResult[]> {
  const out: ManifestCheckResult[] = []
  for (const entry of entries) {
    const record = await idb.getAsset(entry.assetId).catch(() => undefined)
    if (!record) {
      out.push({ assetId: entry.assetId, name: entry.name, hash: entry.hash, status: 'missing' })
      continue
    }
    const local = await sha256Hex(record.blob)
    out.push({
      assetId: entry.assetId,
      name: entry.name,
      hash: entry.hash,
      status: local === entry.hash ? 'match' : 'mismatch',
    })
  }
  return out
}

/* ---------- Day 42 — asset upload pipeline ---------- */

/** Blob → base64 (chunked — the spread trick dies on multi-MB buffers). */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < buf.length; i += CHUNK) {
    binary += String.fromCharCode(...buf.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export interface UploadProgress {
  file: string
  index: number
  total: number
}

export interface UploadResult {
  uploaded: { assetId: string; name: string; bytes: number }[]
  skipped: { assetId: string; name: string }[]
  failed: { assetId: string; name: string; error: string }[]
  totalBytes: number
}

/**
 * Upload every manifest-entry binary that the server doesn't already have.
 * The server re-verifies each payload's sha-256 against the manifest hash —
 * integrity is enforced, never assumed.
 */
export async function uploadProjectMedia(
  deviceId: string,
  projectId: string,
  entries: ManifestEntry[],
  status: { assetId: string; uploaded: boolean }[],
  onProgress?: (p: UploadProgress) => void,
): Promise<UploadResult> {
  const uploadedSet = new Set(status.filter((s) => s.uploaded).map((s) => s.assetId))
  const result: UploadResult = { uploaded: [], skipped: [], failed: [], totalBytes: 0 }

  let index = 0
  for (const entry of entries) {
    index += 1
    onProgress?.({ file: entry.name, index, total: entries.length })

    if (uploadedSet.has(entry.assetId)) {
      result.skipped.push({ assetId: entry.assetId, name: entry.name })
      continue
    }
    const record = await idb.getAsset(entry.assetId).catch(() => undefined)
    if (!record) {
      result.failed.push({ assetId: entry.assetId, name: entry.name, error: 'missing on this device' })
      continue
    }
    try {
      const dataBase64 = await blobToBase64(record.blob)
      const res = await fetch('/api/cloud/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, projectId, assetId: entry.assetId, dataBase64 }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string; bytes?: number }
      if (!res.ok) throw new Error(body.error || `upload failed (${res.status})`)
      result.uploaded.push({ assetId: entry.assetId, name: entry.name, bytes: body.bytes ?? entry.size })
      result.totalBytes += body.bytes ?? entry.size
    } catch (e) {
      result.failed.push({
        assetId: entry.assetId,
        name: entry.name,
        error: e instanceof Error ? e.message : 'upload failed',
      })
    }
  }
  return result
}
