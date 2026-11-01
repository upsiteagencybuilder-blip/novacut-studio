'use client'

/**
 * Text panel — one-click "Add text", visual title presets and a helper tip.
 * Day 07: favorites + recents for title presets (star a preset, All/⭐/🕐
 * filters, usage-recency list) persisted on device via the shared FX-list
 * storage contract.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Lightbulb, Plus, Star } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DEFAULT_TEXT_STYLE, TEXT_PRESETS } from '@/lib/editor/constants'
import type { TextPreset } from '@/lib/editor/constants'
import { useEditor } from '@/lib/editor/store'
import {
  loadIdList,
  pushRecentId,
  saveIdList,
  TEXT_FAVORITES_KEY,
  TEXT_RECENT_KEY,
  toggleIdInList,
} from '@/lib/effects/favorites'
import { cn } from '@/lib/utils'

const PREVIEW_SIZE = 20

type TextFilter = 'all' | 'favorites' | 'recent'

/** Render a preset's style as an inline preview at ~20px */
function presetPreviewStyle(preset: TextPreset): CSSProperties {
  const s = preset.style
  const fontSize = s.fontSize ?? DEFAULT_TEXT_STYLE.fontSize
  const scale = PREVIEW_SIZE / fontSize
  const bold = s.bold ?? DEFAULT_TEXT_STYLE.bold
  return {
    fontFamily: `"${s.fontFamily ?? DEFAULT_TEXT_STYLE.fontFamily}", sans-serif`,
    fontSize: PREVIEW_SIZE,
    color: s.color ?? DEFAULT_TEXT_STYLE.color,
    fontWeight: bold ? 800 : 500,
    fontStyle: s.italic ? 'italic' : 'normal',
    textShadow: s.shadow
      ? `0 0 ${Math.max(4, (s.shadowBlur ?? DEFAULT_TEXT_STYLE.shadowBlur) * scale * 1.4)}px ${
          s.shadowColor ?? DEFAULT_TEXT_STYLE.shadowColor
        }`
      : undefined,
    letterSpacing: (s.letterSpacing ?? 0) * scale,
    background: s.background ?? undefined,
    padding: s.background ? '2px 6px' : undefined,
    borderRadius: s.background ? 4 : undefined,
  }
}

export function TextPanel() {
  const addTextClip = useEditor((s) => s.addTextClip)
  const [favorites, setFavorites] = useState<string[]>(() => loadIdList(TEXT_FAVORITES_KEY))
  const [recent, setRecent] = useState<string[]>(() => loadIdList(TEXT_RECENT_KEY, 24))
  const [filter, setFilter] = useState<TextFilter>('all')
  // mirrors of the latest lists — keeps saves deterministic (no side effects
  // inside state updaters, which React may invoke more than once)
  const favRef = useRef(favorites)
  const recRef = useRef(recent)

  const toggleFavorite = useCallback((id: string) => {
    const next = toggleIdInList(favRef.current, id)
    favRef.current = next
    setFavorites(next)
    saveIdList(TEXT_FAVORITES_KEY, next)
  }, [])

  const handleAdd = useCallback(() => {
    addTextClip()
    toast.success('Text added at playhead')
  }, [addTextClip])

  const handlePreset = useCallback(
    (preset: TextPreset) => {
      addTextClip(preset)
      const next = pushRecentId(recRef.current, preset.id, 24)
      recRef.current = next
      setRecent(next)
      saveIdList(TEXT_RECENT_KEY, next)
      toast('Preset added at playhead')
    },
    [addTextClip]
  )

  const visiblePresets = useMemo(() => {
    if (filter === 'favorites') return TEXT_PRESETS.filter((p) => favorites.includes(p.id))
    if (filter === 'recent') {
      return [...recent]
        .map((id) => TEXT_PRESETS.find((p) => p.id === id))
        .filter((p): p is TextPreset => !!p)
    }
    return TEXT_PRESETS
  }, [filter, favorites, recent])

  const filters: { id: TextFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: TEXT_PRESETS.length },
    { id: 'favorites', label: '⭐ Favorites', count: favorites.length },
    { id: 'recent', label: '🕐 Recent', count: recent.length },
  ]

  return (
    <div className="space-y-3">
      {/* primary action */}
      <Button
        type="button"
        onClick={handleAdd}
        className="nc-gradient nc-glow-hover h-10 w-full rounded-xl font-semibold text-white"
      >
        <Plus className="size-4" />
        Add text
      </Button>

      {/* title presets */}
      <section className="space-y-1.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Title presets
        </h3>

        {/* favorites / recents filters */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Preset list filters">
          {filters.map((f) => {
            const active = filter === f.id
            return (
              <button
                key={f.id}
                type="button"
                data-nc-text-filter={f.id}
                onClick={() => setFilter(f.id)}
                aria-pressed={active}
                className={cn(
                  'h-7 rounded-full px-2.5 text-[11px] font-medium transition',
                  active
                    ? 'nc-gradient text-white'
                    : 'bg-(--nc-panel) text-muted-foreground hover:bg-(--nc-panel-strong) hover:text-foreground',
                )}
              >
                {f.label}
                <span className={cn('ml-1 tabular-nums', active ? 'text-white/80' : 'text-muted-foreground/60')}>
                  {f.count}
                </span>
              </button>
            )
          })}
        </div>

        <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-0.5 nc-scroll">
          {visiblePresets.map((preset) => {
            const faved = favorites.includes(preset.id)
            return (
              <div key={preset.id} className="relative">
                <button
                  type="button"
                  data-nc-text-preset={preset.id}
                  title={`Add "${preset.name}" at playhead`}
                  onClick={() => handlePreset(preset)}
                  className="flex w-full cursor-pointer flex-col gap-1 rounded-lg border border-(--nc-line) bg-(--nc-panel) p-3 text-left transition hover:scale-[1.02] hover:border-fuchsia-400/60"
                >
                  <span
                    className="block overflow-hidden truncate whitespace-nowrap"
                    style={presetPreviewStyle(preset)}
                  >
                    {preset.preview}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{preset.name}</span>
                </button>
                <button
                  type="button"
                  data-nc-text-star={preset.id}
                  title={faved ? 'Remove from favorites' : 'Add to favorites'}
                  aria-label={faved ? `Remove ${preset.name} from favorites` : `Add ${preset.name} to favorites`}
                  aria-pressed={faved}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleFavorite(preset.id)
                  }}
                  className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm transition hover:scale-110 hover:bg-black/60"
                >
                  <Star
                    className={cn('size-3', faved ? 'fill-amber-400 text-amber-400' : 'text-white/80')}
                  />
                </button>
              </div>
            )
          })}
          {visiblePresets.length === 0 && (
            <p className="col-span-2 py-6 text-center text-[11px] text-muted-foreground">
              {filter === 'favorites' ? 'No starred presets yet — tap the ☆ on a title card.' : 'Nothing used yet.'}
            </p>
          )}
        </div>
      </section>

      {/* tip */}
      <div className="nc-glass flex gap-2 rounded-lg p-3 text-[11px] text-muted-foreground">
        <Lightbulb className="size-3.5 shrink-0 text-yellow-500" />
        <p>
          Tip: double-click anywhere on the preview canvas to drop text exactly there. Select a text
          clip to customize font, colors, animations and more in Properties.
        </p>
      </div>
    </div>
  )
}
