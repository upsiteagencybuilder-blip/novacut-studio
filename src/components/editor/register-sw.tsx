'use client'

import { useEffect } from 'react'
import { wireSWRegistration } from '@/hooks/usePWA'

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => wireSWRegistration(registration))
        .catch(() => undefined)
    }
    if (document.readyState === 'complete') onLoad()
    else {
      window.addEventListener('load', onLoad)
      return () => window.removeEventListener('load', onLoad)
    }
  }, [])
  return null
}
