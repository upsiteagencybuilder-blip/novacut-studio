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
