'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'
import { wireSWRegistration } from '@/hooks/usePWA'

/**
 * Celebrate a successful PWA install exactly once per page load. The
 * 'appinstalled' event fires on EVERY install path (browser omnibox UI,
 * floating suggestion card, TopBar button), so this global listener is the
 * single canonical success toast.
 */
let installCelebrated = false
function celebrateInstall() {
  if (installCelebrated) return
  installCelebrated = true
  toast.success('NovaCut installed 🎉 Find it on your home screen', { duration: 5000 })
}

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    window.addEventListener('appinstalled', celebrateInstall)
    const removeInstalledListener = () => window.removeEventListener('appinstalled', celebrateInstall)

    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return removeInstalledListener
    }
    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => wireSWRegistration(registration))
        .catch(() => undefined)
    }
    if (document.readyState === 'complete') {
      onLoad()
      return removeInstalledListener
    }
    window.addEventListener('load', onLoad)
    return () => {
      window.removeEventListener('load', onLoad)
      removeInstalledListener()
    }
  }, [])
  return null
}
