'use client'

/**
 * Chroma Engine — hydration-safe theme applier.
 * The pre-paint bootstrap script in layout.tsx applies the saved theme
 * before first paint; this provider hydrates the shared zustand store and
 * wraps every palette switch in a smooth cross-fade.
 */
import { useEffect } from 'react'
import { useThemeStore } from '@/lib/design/theme-store'

/** Mounts once in the shell; owns nothing visible — purely applies the theme. */
export function ThemeProvider() {
  const hydrate = useThemeStore((s) => s.hydrate)
  const config = useThemeStore((s) => s.config)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  useEffect(() => {
    if (!config) return
    const root = document.documentElement
    root.classList.add('nc-theme-anim')
    const t = window.setTimeout(() => root.classList.remove('nc-theme-anim'), 450)
    return () => window.clearTimeout(t)
  }, [config])

  return null
}

export default ThemeProvider
