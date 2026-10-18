'use client'

/**
 * PWA runtime hooks — online/offline status, install flow, service-worker updates.
 *
 * - useOnlineStatus: live navigator.onLine via useSyncExternalStore (SSR-safe,
 *   correct on first render — works even when the page itself loads offline).
 * - usePWAInstall: captures the browser's beforeinstallprompt event and exposes
 *   a one-tap install(); on iOS Safari (which never fires the event) it reports
 *   `iosGuide: true` so the UI can show Add-to-Home-Screen instructions.
 * - useSWUpdate: detects a waiting service worker and exposes applyUpdate(),
 *   which tells the worker to skipWaiting + reload — used by the "Update ready"
 *   toast.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

/* ---------------- shared module state (single listeners, many subscribers) ---------------- */

type InstallState = {
  available: boolean
  /** iOS Safari & co. — needs manual Add to Home Screen */
  iosGuide: boolean
  installed: boolean
}

type DeferredPrompt = Event & {
  prompt: () => void
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: DeferredPrompt | null = null
let swWaiting: ServiceWorker | null = null
const installSubs = new Set<(s: InstallState) => void>()
const updateSubs = new Set<(waiting: boolean) => void>()

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // iPadOS 13+ masquerades as Mac — touch support gives it away
  const iPadMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return /iPad|iPhone|iPod/.test(ua) || iPadMac
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches
  )
}

function currentInstallState(): InstallState {
  return {
    available: deferredPrompt !== null,
    iosGuide: isIOS() && !isStandalone(),
    installed: isStandalone(),
  }
}

function emitInstall() {
  const state = currentInstallState()
  installSubs.forEach((fn) => fn(state))
}

let bound = false
function bindGlobalListeners() {
  if (bound || typeof window === 'undefined') return
  bound = true

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault()
    deferredPrompt = e as DeferredPrompt
    emitInstall()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    emitInstall()
  })
}

/* ---------------- online / offline (external store) ---------------- */

const onlineStore = {
  subscribe(cb: () => void) {
    window.addEventListener('online', cb)
    window.addEventListener('offline', cb)
    return () => {
      window.removeEventListener('online', cb)
      window.removeEventListener('offline', cb)
    }
  },
  getSnapshot: () => navigator.onLine,
  getServerSnapshot: () => true,
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(onlineStore.subscribe, onlineStore.getSnapshot, onlineStore.getServerSnapshot)
}

/* ---------------- install flow ---------------- */

export function usePWAInstall() {
  const [state, setState] = useState<InstallState>({ available: false, iosGuide: false, installed: false })

  useEffect(() => {
    bindGlobalListeners()
    const fn = (s: InstallState) => setState(s)
    installSubs.add(fn)
    // seed once the current environment state is known (async so this is an
    // event-driven update, not a synchronous effect-body render cascade)
    const id = window.setTimeout(() => fn(currentInstallState()), 0)
    return () => {
      window.clearTimeout(id)
      installSubs.delete(fn)
    }
  }, [])

  const install = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredPrompt) return 'unavailable'
    void deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    if (choice.outcome === 'accepted') {
      deferredPrompt = null
      emitInstall()
    }
    return choice.outcome
  }, [])

  return { ...state, install }
}

/* ---------------- service worker update ---------------- */

/** Subscribe to "a new service worker version is waiting". */
export function useSWUpdateWaiting(): boolean {
  const [waiting, setWaiting] = useState(false)
  useEffect(() => {
    const fn = (w: boolean) => setWaiting(w)
    updateSubs.add(fn)
    const id = window.setTimeout(() => fn(swWaiting !== null), 0)
    return () => {
      window.clearTimeout(id)
      updateSubs.delete(fn)
    }
  }, [])
  return waiting
}

/** Tell the waiting worker to take over, then reload once it's active. */
export async function applySWUpdate(): Promise<void> {
  const worker = swWaiting
  if (!worker) return
  await new Promise<void>((resolve) => {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => resolve()
    worker.postMessage({ type: 'SKIP_WAITING' }, [channel.port2])
    // safety: never hang the UI on a stuck worker
    setTimeout(resolve, 2500)
  })
  window.location.reload()
}

/** Called by ServiceWorkerRegistrar — wires update plumbing. */
export function wireSWRegistration(registration: ServiceWorkerRegistration): void {
  const notify = () => {
    swWaiting = registration.waiting ?? null
    updateSubs.forEach((fn) => fn(swWaiting !== null))
  }
  notify()
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing
    if (!installing) return
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        // a new version arrived while an old one controls the page
        swWaiting = installing
        updateSubs.forEach((fn) => fn(true))
      }
    })
  })
}
