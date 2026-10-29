'use client'

/**
 * Day 46 — Cross-device media re-link.
 *
 * Scenario: device B restores a cloud project but lacks the media blobs.
 * The Day-41 manifest knows exactly which files the project references and
 * their sha-256 identities; the Day-42 pipeline stored the binaries
 * server-side. This module bridges the two:
 *
 *   plan    — compare the manifest against THIS device's IndexedDB
 *             (satisfied / downloadable / conflicts, hash-based)
 *   execute — download each binary, verify its sha-256 LOCALLY too, then
 *             hand it to the editor (addMediaAsset persists + makes it
 *             usable immediately, no reload)
 *
 * Conflicts are never overwritten silently — they are reported.
 */

import type { Project } from '@/lib/editor/types'
import * as idb from '@/lib/editor/db'
import { useEditor } from '@/lib/editor/store'
import { sha256Hex, type ManifestEntry } from '@/lib/cloud/manifest'
import { cloudGetAssetBinary, getDeviceId } from '@/lib/cloud/client'

export interface RelinkPlan {
  localId: string
  satisfied: ManifestEntry[]
  downloadable: ManifestEntry[]
  conflicts: ManifestEntry[]
  totalBytes: number
}

export async function planRelink(project: Project, entries: ManifestEntry[]): Promise<RelinkPlan> {
  const plan: RelinkPlan = {
    localId: project.id,
    satisfied: [],
    downloadable: [],
    conflicts: [],
    totalBytes: 0,
  }

  for (const entry of entries) {
    const record = await idb.getAsset(entry.assetId).catch(() => undefined)
    if (!record) {
      plan.downloadable.push(entry)
      plan.totalBytes += entry.size
      continue
    }
    const localHash = await sha256Hex(record.blob)
    if (localHash === entry.hash) {
      plan.satisfied.push(entry)
    } else {
      // same asset id, different content — never overwrite silently
      plan.conflicts.push(entry)
    }
  }
  return plan
}

export interface RelinkProgress {
  file: string
  index: number
  total: number
}

export interface RelinkResult {
  restored: { name: string; bytes: number }[]
  failed: { name: string; error: string }[]
  totalBytes: number
}

/** Tiny generated poster tile for re-linked assets (the binary is intact; the thumbnail is cosmetic). */
function placeholderThumbnail(name: string, kind: string): string {
  try {
    const c = document.createElement('canvas')
    c.width = 160
    c.height = 90
    const ctx = c.getContext('2d')
    if (!ctx) return ''
    const hues: Record<string, [string, string]> = {
      video: ['#a21caf', '#7e22ce'],
      image: ['#7c3aed', '#4f46e5'],
      audio: ['#059669', '#0d9488'],
      lut: ['#eab308', '#ea580c'],
    }
    const [a, b] = hues[kind] ?? ['#52525b', '#3f3f46']
    const grad = ctx.createLinearGradient(0, 0, 160, 90)
    grad.addColorStop(0, a)
    grad.addColorStop(1, b)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 160, 90)
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.font = 'bold 42px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(name.replace(/\.[^.]+$/, '').charAt(0).toUpperCase() || '·', 80, 46)
    ctx.font = '10px system-ui, sans-serif'
    ctx.fillText(name.length > 22 ? `${name.slice(0, 21)}…` : name, 80, 76)
    return c.toDataURL('image/jpeg', 0.7)
  } catch {
    return ''
  }
}

function base64ToBlob(dataBase64: string, mimeType: string): Blob {
  const binary = atob(dataBase64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}

/**
 * Download + verify + register every planned binary. Hashes are checked
 * locally against the manifest (the server verified at upload; this guards
 * the transport). Returns an honest per-file result.
 */
export async function executeRelink(
  plan: RelinkPlan,
  onProgress?: (p: RelinkProgress) => void,
): Promise<RelinkResult> {
  const result: RelinkResult = { restored: [], failed: [], totalBytes: 0 }
  const deviceId = getDeviceId()
  let index = 0

  for (const entry of plan.downloadable) {
    index += 1
    onProgress?.({ file: entry.name, index, total: plan.downloadable.length })
    try {
      const bin = await cloudGetAssetBinary(deviceId, plan.localId, entry.assetId)
      const blob = base64ToBlob(bin.dataBase64, bin.mimeType || entry.mimeType)
      const hash = await sha256Hex(blob)
      if (hash !== entry.hash) {
        result.failed.push({ name: entry.name, error: 'hash mismatch after download' })
        continue
      }
      const asset = {
        id: entry.assetId,
        name: entry.name,
        kind: entry.kind,
        mimeType: bin.mimeType || entry.mimeType,
        size: entry.size,
        duration: entry.duration,
        width: entry.width,
        height: entry.height,
        thumbnail: placeholderThumbnail(entry.name, entry.kind),
        createdAt: Date.now(),
        objectUrl: URL.createObjectURL(blob),
        rawBlob: blob,
      }
      useEditor.getState().addMediaAsset(asset)
      result.restored.push({ name: entry.name, bytes: blob.size })
      result.totalBytes += blob.size
    } catch (e) {
      result.failed.push({
        name: entry.name,
        error: e instanceof Error ? e.message : 'download failed',
      })
    }
  }
  return result
}
