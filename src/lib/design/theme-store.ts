'use client'

/**
 * Chroma Engine — shared theme state (zustand).
 * Both the ThemeProvider (applier) and the Theme Studio dialog read/write
 * this single source of truth.
 */
import { create } from 'zustand'
import {
  applyTheme,
  DEFAULT_THEME,
  loadThemeConfig,
  saveThemeConfig,
  type ThemeConfig,
} from '@/lib/design/themes'

interface ThemeState {
  /** null until hydrated from localStorage on the client */
  config: ThemeConfig | null
  hydrate: () => void
  update: (patch: Partial<ThemeConfig>) => void
  reset: () => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  config: null,

  hydrate: () => {
    if (get().config) return
    const config = loadThemeConfig()
    applyTheme(config)
    set({ config })
  },

  update: (patch) => {
    const config = { ...(get().config ?? DEFAULT_THEME), ...patch }
    applyTheme(config)
    saveThemeConfig(config)
    set({ config })
  },

  reset: () => {
    const config = { ...DEFAULT_THEME }
    applyTheme(config)
    saveThemeConfig(config)
    set({ config })
  },
}))
