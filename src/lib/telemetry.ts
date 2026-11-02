'use client'

/**
 * NovaCut Studio — Day 64: local telemetry + crash history.
 *
 * LOCAL-FIRST, HONEST: nothing ever leaves this device. Errors (React
 * boundary catches, window errors, unhandled rejections) land in a ring
 * buffer persisted to localStorage. Session liveness flags let the next
 * launch detect an unclean exit and offer crash recovery.
 */

export interface TelemetryEntry {
  at: number
  kind: 'boundary' | 'window-error' | 'unhandled-rejection' | 'console-error'
  message: string
  /** first stack line, if any (kept short — this is a human-readable log) */
  stack?: string
}

const LOG_KEY = 'novacut.telemetry'
const SESSION_KEY = 'novacut.sessionLive'
const TELEMETRY_CAP = 50

let buffer: TelemetryEntry[] | null = null
const listeners = new Set<() => void>()

function readStore(): TelemetryEntry[] {
  if (buffer) return buffer
  if (typeof localStorage === 'undefined') return (buffer = [])
  try {
    const raw = localStorage.getItem(LOG_KEY)
    const parsed = raw ? (JSON.parse(raw) as TelemetryEntry[]) : []
    buffer = Array.isArray(parsed) ? parsed.slice(-TELEMETRY_CAP) : []
  } catch {
    buffer = []
  }
  return buffer
}

function persist() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(readStore().slice(-TELEMETRY_CAP)))
  } catch {
    /* storage full/blocked — the in-memory buffer still works */
  }
}

/** record an error (dedupes identical consecutive messages) */
export function recordError(kind: TelemetryEntry['kind'], message: string, stack?: string) {
  const store = readStore()
  const last = store[store.length - 1]
  if (last && last.kind === kind && last.message === message && Date.now() - last.at < 1500) return
  const entry: TelemetryEntry = {
    at: Date.now(),
    kind,
    message: String(message).slice(0, 300),
    stack: stack ? String(stack).split('\n').slice(0, 2).join(' ⏎ ').slice(0, 240) : undefined,
  }
  store.push(entry)
  if (store.length > TELEMETRY_CAP) store.splice(0, store.length - TELEMETRY_CAP)
  persist()
  for (const l of listeners) l()
}

export function getRecentErrors(): TelemetryEntry[] {
  return [...readStore()].reverse()
}

export function clearTelemetry() {
  buffer = []
  persist()
  for (const l of listeners) l()
}

export function subscribeTelemetry(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/* ---------------- crash / session liveness ---------------- */

const HEARTBEAT_MS = 5000
/** a heartbeat older than this at boot means the tab died mid-session */
const STALE_MS = 15000
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

const beat = () => {
  try {
    sessionStorage.setItem(SESSION_KEY, String(Date.now()))
  } catch {
    /* private mode — crash detection just stays off */
  }
}

/**
 * Mark this session as live and keep a 5s heartbeat in sessionStorage.
 * A crash freezes the heartbeat mid-session; the next boot in the same tab
 * sees a stale timestamp and can honestly offer recovery. Normal reloads
 * always have a fresh heartbeat and never trigger the recovery toast.
 */
export function markSessionLive() {
  beat()
  if (heartbeatTimer) clearInterval(heartbeatTimer)
  heartbeatTimer = setInterval(beat, HEARTBEAT_MS)
}

/** true when the previous session in this tab stopped heartbeating abruptly */
export function hadUncleanExit(): boolean {
  if (typeof sessionStorage === 'undefined') return false
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return false
    const ts = Number(raw)
    return Number.isFinite(ts) && Date.now() - ts > STALE_MS
  } catch {
    return false
  }
}

/** install global window error listeners once (idempotent) */
let installed = false
export function installTelemetry() {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('error', (e) => {
    recordError('window-error', e.message || String(e.error ?? 'unknown error'), e.error?.stack)
  })
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason instanceof Error ? e.reason.message : String(e.reason ?? 'rejected promise')
    recordError('unhandled-rejection', reason, e.reason instanceof Error ? e.reason.stack : undefined)
  })
  // funnel console.error into the log as well (the DevOverlay counts these)
  const origError = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    try {
      const first = args[0]
      const msg = first instanceof Error ? first.message : typeof first === 'string' ? first : JSON.stringify(first).slice(0, 200)
      recordError('console-error', msg, first instanceof Error ? first.stack : undefined)
    } catch {
      /* never break the app from logging */
    }
    origError(...args)
  }
}
