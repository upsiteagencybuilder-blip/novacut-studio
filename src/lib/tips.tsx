'use client'

/**
 * NovaCut Studio — Day 69: contextual feature tips (Onboarding v2).
 *
 * The first-run overlay (OnboardingOverlay) covers the door; these tips
 * cover the journey. Each tip fires AT MOST ONCE EVER (localStorage flag),
 * only when its real condition is met in the live store, and through the
 * same honest toast system as everything else. Conditions are measured —
 * never guessed — and the flags are plain localStorage so users (and tests)
 * can inspect or reset them.
 */

import { useEffect } from 'react'
import { toast } from 'sonner'
import { useEditor } from '@/lib/editor/store'

const PREFIX = 'novacut.tip.'

export interface ContextualTip {
  id: string
  /** measured condition against the live store snapshot */
  when: (s: ReturnType<typeof useEditor.getState>) => boolean
  title: string
  description: string
}

export const CONTEXTUAL_TIPS: ContextualTip[] = [
  {
    id: 'virtualized-timeline',
    when: (s) => s.project.clips.length >= 40,
    title: 'Long timeline? Still smooth.',
    description: 'Only the clips near your viewport exist in the DOM — scroll a 100+ clip edit freely.',
  },
  {
    id: 'history-depth',
    when: (s) => s.historyPast.length >= 12,
    title: 'Your last 12 edits are one click away',
    description: 'Edit history keeps 150 labeled steps — open it from the top bar (History icon) and jump anywhere.',
  },
  {
    id: 'template-placeholders',
    when: (s) => s.project.clips.some((c) => c.kind === 'text' && (c.textStyle?.content ?? '').startsWith('▶')),
    title: 'This timeline is a template scaffold',
    description: 'The ▶ clips are placeholders. Drop your media, then Replace media keeps the slot — position and duration stay.',
  },
  {
    id: 'memory-budget',
    when: (s) => {
      let held = 0
      for (const m of s.media) held += m.rawBlob?.size ?? 0
      return held > 400 * 1024 * 1024
    },
    title: 'Media is holding a lot of RAM',
    description: 'Projects → Storage shows the live budget and can evict evicted-safe copies — evicted media reloads automatically.',
  },
  {
    id: 'export-queue',
    when: (s) => s.exportState.phase === 'recording',
    title: 'Exports run one at a time — honestly',
    description: 'The render queue is sequential so every job gets the full engine. Queue more while this finishes.',
  },
]

export function tipsSeen(): string[] {
  if (typeof localStorage === 'undefined') return []
  const out: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(PREFIX)) out.push(k.slice(PREFIX.length))
    }
  } catch {
    /* private mode */
  }
  return out
}

export function resetTips() {
  if (typeof localStorage === 'undefined') return
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(PREFIX)) keys.push(k)
    }
    for (const k of keys) localStorage.removeItem(k)
  } catch {
    /* private mode */
  }
}

/**
 * Mount once inside the editor shell. Polls the (cheap) measured conditions
 * a few times a second — conditions are pure store reads, so this stays
 * negligible. The check window throttles to 1.5s between any two tips.
 */
export function ContextualTips() {
  useEffect(() => {
    let stopped = false
    let lastShownAt = 0
    const seen = new Set(tipsSeen())

    const tick = () => {
      if (stopped) return
      try {
        if (Date.now() - lastShownAt > 1500) {
          const s = useEditor.getState()
          if (s.ready && !s.activeDialog) {
            for (const tip of CONTEXTUAL_TIPS) {
              if (seen.has(tip.id)) continue
              if (!tip.when(s)) continue
              seen.add(tip.id)
              try {
                localStorage.setItem(PREFIX + tip.id, String(Date.now()))
              } catch {
                /* private mode — tip stays session-only via `seen` */
              }
              toast(tip.title, { description: tip.description, duration: 7000 })
              lastShownAt = Date.now()
              break
            }
          }
        }
      } catch {
        /* never break the editor from a tip */
      }
      timer = setTimeout(tick, 1200)
    }
    let timer = setTimeout(tick, 2500)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [])

  return null
}
