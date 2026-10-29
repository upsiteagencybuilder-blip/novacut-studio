'use client'

/**
 * NovaCut cloud sync client — typed fetch wrappers for /api/cloud/*.
 * The editor stays local-first; cloud features are progressive enhancements
 * that light up automatically when the deployment has Turso configured.
 */

export interface CloudHealth {
  ok: boolean
  backend: 'turso' | 'sqlite'
  latencyMs?: number
  error?: string
}

export interface CloudProjectMeta {
  localId: string
  name: string
  duration: number
  clipCount: number
  thumbnail: string | null
  createdAt: string
  updatedAt: string
}

/** Stable per-install device id (localStorage backed). */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server'
  const KEY = 'novacut.deviceId'
  let id = window.localStorage.getItem(KEY)
  if (!id) {
    id = `dev-${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`
    window.localStorage.setItem(KEY, id)
  }
  return id
}

async function jsonFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(body.error || `request failed (${res.status})`)
  return body
}

export async function cloudHealth(): Promise<CloudHealth> {
  return jsonFetch<CloudHealth>('/api/cloud/health')
}

export async function cloudListProjects(deviceId: string): Promise<CloudProjectMeta[]> {
  const data = await jsonFetch<{ projects: CloudProjectMeta[] }>(
    `/api/cloud/projects?deviceId=${encodeURIComponent(deviceId)}`,
  )
  return data.projects
}

export async function cloudLoadProject(deviceId: string, localId: string): Promise<string> {
  const data = await jsonFetch<{ project: { data: string } }>(
    `/api/cloud/projects?deviceId=${encodeURIComponent(deviceId)}&localId=${encodeURIComponent(localId)}`,
  )
  return data.project.data
}

export interface SyncProjectInput {
  localId: string
  name: string
  duration: number
  clipCount: number
  thumbnail?: string
  /** JSON.stringify(project) */
  data: string
}

export async function cloudSyncProject(input: SyncProjectInput): Promise<{ syncedAt: string }> {
  return jsonFetch<{ ok: true; syncedAt: string }>('/api/cloud/projects', {
    method: 'POST',
    body: JSON.stringify({ deviceId: getDeviceId(), ...input }),
  })
}

export async function cloudDeleteProject(localId: string): Promise<void> {
  await jsonFetch(
    `/api/cloud/projects?deviceId=${encodeURIComponent(getDeviceId())}&localId=${encodeURIComponent(localId)}`,
    { method: 'DELETE' },
  )
}

export async function cloudShare(input: {
  projectId: string
  title: string
  payload: string
}): Promise<{ token: string }> {
  return jsonFetch<{ ok: true; token: string }>('/api/cloud/share', {
    method: 'POST',
    body: JSON.stringify({ deviceId: getDeviceId(), ...input }),
  })
}

export async function cloudGetShare(token: string): Promise<{
  title: string
  payload: string
  views: number
  createdAt: string
}> {
  return jsonFetch(`/api/cloud/share?token=${encodeURIComponent(token)}`)
}

/* ---------- Day 41 — media manifest sync ---------- */

export interface ManifestEntry {
  assetId: string
  name: string
  kind: 'video' | 'image' | 'audio' | 'lut'
  mimeType: string
  size: number
  duration: number
  width: number
  height: number
  /** sha-256 hex of the blob */
  hash: string
}

export interface ManifestSummary {
  assets: ManifestEntry[]
  count: number
  totalBytes: number
  syncedAt: string | null
}

/** Replace-set the manifest for a cloud backup (transactional on the server). */
export async function cloudSyncManifest(
  deviceId: string,
  localId: string,
  assets: ManifestEntry[],
): Promise<{ count: number; totalBytes: number }> {
  return jsonFetch('/api/cloud/manifest', {
    method: 'POST',
    body: JSON.stringify({ deviceId, localId, assets }),
  })
}

export async function cloudGetManifest(deviceId: string, localId: string): Promise<ManifestSummary> {
  return jsonFetch(`/api/cloud/manifest?deviceId=${encodeURIComponent(deviceId)}&localId=${encodeURIComponent(localId)}`)
}

export async function cloudDeleteManifest(deviceId: string, localId: string): Promise<void> {
  await jsonFetch(
    `/api/cloud/manifest?deviceId=${encodeURIComponent(deviceId)}&localId=${encodeURIComponent(localId)}`,
    { method: 'DELETE' },
  )
}

/* ---------- Day 42 — asset binary upload pipeline ---------- */

export interface AssetUploadStatus {
  assetId: string
  name: string
  size: number
  uploaded: boolean
  uploadedAt: string | null
}

/** Which of the project's media binaries are stored on the server. */
export async function cloudGetAssetStatus(deviceId: string, projectId: string): Promise<{
  assets: AssetUploadStatus[]
  uploadedCount: number
  count: number
}> {
  return jsonFetch(
    `/api/cloud/assets?deviceId=${encodeURIComponent(deviceId)}&projectId=${encodeURIComponent(projectId)}`,
  )
}

export async function cloudDeleteAssetBinaries(deviceId: string, projectId: string): Promise<void> {
  await jsonFetch(
    `/api/cloud/assets?deviceId=${encodeURIComponent(deviceId)}&projectId=${encodeURIComponent(projectId)}`,
    { method: 'DELETE' },
  )
}

/* ---------- Day 43 — cloud project versioning ---------- */

export interface CloudVersionMeta {
  id: string
  version: number
  label: string
  clipCount: number
  duration: number
  createdAt: string
}

export async function cloudSaveVersion(input: {
  localId: string
  label?: string
  clipCount: number
  duration: number
  data: string
}): Promise<{ id: string; version: number; label: string }> {
  return jsonFetch('/api/cloud/versions', {
    method: 'POST',
    body: JSON.stringify({ deviceId: getDeviceId(), ...input }),
  })
}

export async function cloudListVersions(localId: string): Promise<CloudVersionMeta[]> {
  const data = await jsonFetch<{ versions: CloudVersionMeta[] }>(
    `/api/cloud/versions?deviceId=${encodeURIComponent(getDeviceId())}&localId=${encodeURIComponent(localId)}`,
  )
  return data.versions
}

export async function cloudLoadVersion(localId: string, versionId: string): Promise<string> {
  const data = await jsonFetch<{ version: { data: string } }>(
    `/api/cloud/versions?deviceId=${encodeURIComponent(getDeviceId())}&localId=${encodeURIComponent(localId)}&versionId=${encodeURIComponent(versionId)}`,
  )
  return data.version.data
}

export async function cloudDeleteVersion(localId: string, versionId: string): Promise<void> {
  await jsonFetch(
    `/api/cloud/versions?deviceId=${encodeURIComponent(getDeviceId())}&localId=${encodeURIComponent(localId)}&versionId=${encodeURIComponent(versionId)}`,
    { method: 'DELETE' },
  )
}
