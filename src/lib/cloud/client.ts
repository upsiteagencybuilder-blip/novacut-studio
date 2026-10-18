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
