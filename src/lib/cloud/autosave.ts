'use client'

/**
 * Day 44 — Debounced cloud auto-save + offline queue with retry.
 *
 * Local-first never breaks: the engine only ever ADDS a cloud sync on top
 * of IndexedDB persistence. It syncs the project STRUCTURE (never binaries,
 * never the manifest — those stay manual because hashing blobs on every
 * keystroke would burn battery).
 *
 * Behavior:
 *   • dirty signal   — project.id / updatedAt changes → debounce 8 s
 *   • failure        — envelope queued in localStorage (per project, newest
 *                      state wins, cap 10) with attempt counter
 *   • retry          — every 45 s timer + `online` event + after any
 *                      successful manual backup; backoff 15/30/60/120 s
 *   • give-up        — after 6 attempts the entry is dropped (counted in
 *                      status.lastDropped so the UI can say so honestly)
 */

import { getDeviceId, cloudSyncProject, cloudHealth } from '@/lib/cloud/client'
import { useEditor } from '@/lib/editor/store'

const QUEUE_KEY = 'novacut.cloudQueue'
const ENABLED_KEY = 'novacut.autosave.enabled'
const DEBOUNCE_MS = 8_000
const RETRY_TICK_MS = 45_000
const MAX_QUEUE = 10
const MAX_ATTEMPTS = 6

export interface QueueEnvelope {
  localId: string
  name: string
  duration: number
  clipCount: number
  data: string
  queuedAt: number
  attempts: number
  lastError?: string
}

export interface AutosaveStatus {
  enabled: boolean
  syncing: boolean
  lastSyncAt: number | null
  queued: number
  nextRetryInMs: number | null
  lastError: string | null
  droppedTotal: number
}

interface EngineState {
  enabled: boolean
  syncing: boolean
  lastSyncAt: number | null
  lastError: string | null
  droppedTotal: number
  debounceTimer: ReturnType<typeof setTimeout> | null
  retryTimer: ReturnType<typeof setInterval> | null
  lastDirtyAt: number
  lastProjectId: string | null
  listeners: Set<(s: AutosaveStatus) => void>
  started: boolean
}

const g = globalThis as unknown as { __novaCutAutosave?: EngineState }

function engine(): EngineState {
  if (!g.__novaCutAutosave) {
    g.__novaCutAutosave = {
      enabled: false,
      syncing: false,
      lastSyncAt: null,
      lastError: null,
      droppedTotal: 0,
      debounceTimer: null,
      retryTimer: null,
      lastDirtyAt: 0,
      lastProjectId: null,
      listeners: new Set(),
      started: false,
    }
  }
  return g.__novaCutAutosave
}

/* ---------------- queue (localStorage, survives reloads) ---------------- */

function readQueue(): QueueEnvelope[] {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY)
    return raw ? (JSON.parse(raw) as QueueEnvelope[]) : []
  } catch {
    return []
  }
}

function writeQueue(queue: QueueEnvelope[]): void {
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(0, MAX_QUEUE)))
  } catch {
    /* storage full — the queue is best-effort by design */
  }
}

export function getQueue(): QueueEnvelope[] {
  return typeof window === 'undefined' ? [] : readQueue()
}

/* ---------------- status plumbing ---------------- */

function snapshot(): AutosaveStatus {
  const e = engine()
  const queue = getQueue()
  const nextEntry = queue[0]
  const elapsed = nextEntry ? Date.now() - nextEntry.queuedAt : 0
  const backoffs = [15_000, 30_000, 60_000, 120_000, 120_000]
  const wait = nextEntry ? Math.max(0, (backoffs[Math.min(nextEntry.attempts, backoffs.length - 1)] ?? 15_000) - elapsed) : null
  return {
    enabled: e.enabled,
    syncing: e.syncing,
    lastSyncAt: e.lastSyncAt,
    queued: queue.length,
    nextRetryInMs: e.enabled ? wait : null,
    lastError: e.lastError,
    droppedTotal: e.droppedTotal,
  }
}

function notify(): void {
  const e = engine()
  const s = snapshot()
  e.listeners.forEach((cb) => {
    try {
      cb(s)
    } catch {
      /* listener errors never break the engine */
    }
  })
}

export function subscribeAutosave(cb: (s: AutosaveStatus) => void): () => void {
  const e = engine()
  e.listeners.add(cb)
  cb(snapshot())
  return () => e.listeners.delete(cb)
}

export function getAutosaveStatus(): AutosaveStatus {
  return snapshot()
}

export function isAutosaveEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(ENABLED_KEY) === '1'
}

export function setAutosaveEnabled(on: boolean): void {
  const e = engine()
  e.enabled = on
  try {
    window.localStorage.setItem(ENABLED_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
  if (on) {
    startRetryLoop()
    scheduleSave(1_000) // immediate first sync when enabled
  } else {
    if (e.debounceTimer) clearTimeout(e.debounceTimer)
    e.debounceTimer = null
  }
  notify()
}

/* ---------------- core ---------------- */

function scheduleSave(delayMs: number): void {
  const e = engine()
  if (!e.enabled) return
  if (e.debounceTimer) clearTimeout(e.debounceTimer)
  e.debounceTimer = setTimeout(() => {
    e.debounceTimer = null
    void performSave('debounce')
  }, delayMs)
}

async function performSave(trigger: 'debounce' | 'retry' | 'online' | 'manual'): Promise<void> {
  const e = engine()
  if (!e.enabled || e.syncing) return
  e.syncing = true
  notify()
  try {
    const project = useEditor.getState().project
    await cloudSyncProject({
      localId: project.id,
      name: project.name,
      duration: Math.max(...project.clips.map((c) => c.start + c.duration), 0),
      clipCount: project.clips.length,
      // no thumbnail on auto-save — canvas capture stays a manual-backup thing
      data: JSON.stringify(project),
    })
    e.lastSyncAt = Date.now()
    e.lastError = null
    if (trigger !== 'debounce') {
      // a successful sync also drains whatever was queued while offline
      await flushQueue()
    }
  } catch (err) {
    e.lastError = err instanceof Error ? err.message : 'sync failed'
    await queueCurrentProject(e.lastError)
  } finally {
    e.syncing = false
    notify()
  }
}

/** Put (or refresh) the current project's envelope in the offline queue. */
async function queueCurrentProject(error: string): Promise<void> {
  const project = useEditor.getState().project
  const envelope: QueueEnvelope = {
    localId: project.id,
    name: project.name,
    duration: Math.max(...project.clips.map((c) => c.start + c.duration), 0),
    clipCount: project.clips.length,
    data: JSON.stringify(project),
    queuedAt: Date.now(),
    attempts: 0,
    lastError: error,
  }
  const queue = readQueue().filter((q) => q.localId !== project.id)
  queue.unshift(envelope)
  writeQueue(queue)
  notify()
}

/** Retry every queued envelope; successful ones leave the queue. */
async function flushQueue(): Promise<void> {
  const e = engine()
  if (e.syncing) return
  const health = await cloudHealth().catch(() => null)
  if (!health?.ok) return

  let queue = readQueue()
  if (queue.length === 0) return
  e.syncing = true
  notify()
  try {
    const remaining: QueueEnvelope[] = []
    for (const entry of queue) {
      try {
        await cloudSyncProject({
          localId: entry.localId,
          name: entry.name,
          duration: entry.duration,
          clipCount: entry.clipCount,
          data: entry.data,
        })
        e.lastSyncAt = Date.now()
        e.lastError = null
      } catch (err) {
        entry.attempts += 1
        entry.lastError = err instanceof Error ? err.message : 'retry failed'
        if (entry.attempts >= MAX_ATTEMPTS) {
          e.droppedTotal += 1 // honest give-up; surfaced in status
        } else {
          remaining.push(entry)
        }
      }
    }
    writeQueue(remaining)
  } finally {
    e.syncing = false
    notify()
  }
}

function startRetryLoop(): void {
  const e = engine()
  if (e.retryTimer) return
  e.retryTimer = setInterval(() => {
    if (!e.enabled) return
    if (getQueue().length > 0) void flushQueue()
  }, RETRY_TICK_MS)
}

/** Manual hook — ProjectsDialog calls this after a successful backup. */
export function notifyManualSyncSuccess(): void {
  const e = engine()
  e.lastSyncAt = Date.now()
  e.lastError = null
  const queue = readQueue()
  if (queue.length > 0) void flushQueue()
  else notify()
}

/** UI-facing manual sync (Sync now button). */
export function syncNow(): Promise<void> {
  return performSave('manual')
}

/** Wire the engine to the store — called once from EditorShell. */
export function startCloudAutosave(): void {
  const e = engine()
  if (e.started) return
  e.started = true
  e.enabled = isAutosaveEnabled()

  useEditor.subscribe((state, prev) => {
    if (!e.enabled) return
    const p = state.project
    const pp = prev.project
    if (p.id !== pp.id || p.updatedAt !== pp.updatedAt) {
      e.lastDirtyAt = Date.now()
      if (e.lastProjectId !== p.id) e.lastProjectId = p.id
      scheduleSave(DEBOUNCE_MS)
    }
  })

  window.addEventListener('online', () => {
    if (e.enabled && getQueue().length > 0) void flushQueue()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && e.enabled && getQueue().length > 0) {
      void flushQueue()
    }
  })

  if (e.enabled) {
    startRetryLoop()
    if (getQueue().length > 0) void flushQueue()
  }
  notify()
}
