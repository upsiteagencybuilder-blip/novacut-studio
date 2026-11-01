'use client'

/**
 * Stickers hub — emoji packs, procedural vector shapes, social elements and
 * vlog callouts with search + live canvas thumbnails. Tap adds at playhead.
 * Day 07: favorites + recents across every family (star overlays, ⭐/🕐
 * filter chips) persisted on device via the shared FX-list storage.
 */
import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import { Lightbulb, Search, Star } from 'lucide-react'
import { toast } from 'sonner'
import { STICKER_CATEGORIES } from '@/lib/editor/constants'
import { useEditor } from '@/lib/editor/store'
import {
  loadIdList,
  pushRecentId,
  saveIdList,
  STICKER_FAVORITES_KEY,
  STICKER_RECENT_KEY,
  toggleIdInList,
} from '@/lib/effects/favorites'
import {
  STICKER_SHAPE_DEFS,
  STICKER_SOCIAL_DEFS,
  STICKER_VLOG_DEFS,
  drawStickerArt,
  type StickerDef,
} from '@/lib/editor/sticker-render'
import type { StickerFamily } from '@/lib/editor/types'
import { cn } from '@/lib/utils'

type Tab = 'emoji' | StickerFamily

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'emoji', label: 'Emojis', icon: '😀' },
  { id: 'shape', label: 'Shapes', icon: '⬡' },
  { id: 'social', label: 'Social', icon: '👍' },
  { id: 'vlog', label: 'Vlog', icon: '🎬' },
]

/* ---------------- live canvas thumbnail (same renderer as preview/export) ---------------- */

function StickerThumb({ def, size = 44 }: { def: StickerDef; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const px = 64
    cv.width = px * dpr
    cv.height = px * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, px, px)
    ctx.save()
    ctx.translate(px / 2, px / 2)
    drawStickerArt(
      ctx,
      {
        emoji: def.glyph,
        size: 46,
        animation: 'none',
        family: def.family,
        shape: def.id,
        fill: def.fill,
        stroke: def.stroke,
        strokeWidth: def.strokeWidth,
      },
      0,
    )
    ctx.restore()
  }, [def])

  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden className="pointer-events-none" />
}

/* ---------------- panel ---------------- */

export function StickerPanel() {
  const addStickerClip = useEditor((s) => s.addStickerClip)
  const [tab, setTab] = useState<Tab>('emoji')
  const [activeCat, setActiveCat] = useState(0)
  const [query, setQuery] = useState('')
  const [favorites, setFavorites] = useState<string[]>(() => loadIdList(STICKER_FAVORITES_KEY))
  const [recent, setRecent] = useState<string[]>(() => loadIdList(STICKER_RECENT_KEY, 24))
  const [favOnly, setFavOnly] = useState(false)
  const [recentOnly, setRecentOnly] = useState(false)
  // mirrors of the latest lists — keeps saves deterministic (no side effects
  // inside state updaters, which React may invoke more than once)
  const favRef = useRef(favorites)
  const recRef = useRef(recent)

  const category = STICKER_CATEGORIES[activeCat] ?? STICKER_CATEGORIES[0]

  const toggleFavorite = useCallback((id: string) => {
    const next = toggleIdInList(favRef.current, id)
    favRef.current = next
    setFavorites(next)
    saveIdList(STICKER_FAVORITES_KEY, next)
  }, [])

  const recordRecent = useCallback((id: string) => {
    const next = pushRecentId(recRef.current, id, 24)
    recRef.current = next
    setRecent(next)
    saveIdList(STICKER_RECENT_KEY, next)
  }, [])

  const q = query.trim()
  const ql = q.toLowerCase()

  const filteredDefs = useMemo(() => {
    const defs =
      tab === 'shape' ? STICKER_SHAPE_DEFS : tab === 'social' ? STICKER_SOCIAL_DEFS : tab === 'vlog' ? STICKER_VLOG_DEFS : []
    if (!ql) return defs
    return defs.filter((d) => d.name.toLowerCase().includes(ql) || d.id.includes(ql) || d.glyph === q)
  }, [tab, ql, q])

  const handleAdd = (desc: Parameters<typeof addStickerClip>[0], label: string, id?: string) => {
    addStickerClip(desc)
    if (id) recordRecent(id)
    toast(`${label} added`)
  }

  const visibleEmojis = useMemo(() => {
    let list: string[]
    if (q) {
      list = STICKER_CATEGORIES.filter((c) => c.name.toLowerCase().includes(ql)).flatMap((c) => c.emojis)
    } else {
      list = category?.emojis ?? []
    }
    if (favOnly) list = list.filter((e) => favorites.includes(`emoji:${e}`))
    if (recentOnly) list = list.filter((e) => recent.includes(`emoji:${e}`))
    return list
  }, [q, ql, category, favOnly, recentOnly, favorites, recent])

  const visibleDefs = useMemo(() => {
    let list = filteredDefs
    if (favOnly) list = list.filter((d) => favorites.includes(`sticker:${d.id}`))
    if (recentOnly) list = list.filter((d) => recent.includes(`sticker:${d.id}`))
    return list
  }, [filteredDefs, favOnly, recentOnly, favorites, recent])

  return (
    <div className="space-y-3">
      {/* family tabs */}
      <div className="grid grid-cols-4 gap-1.5" role="tablist" aria-label="Sticker families">
        {TABS.map((t) => {
          const active = t.id === tab
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setTab(t.id)
                setQuery('')
              }}
              className={cn(
                'flex h-8 flex-col items-center justify-center rounded-lg text-[10px] font-medium leading-none transition',
                active
                  ? 'nc-gradient text-white shadow'
                  : 'bg-(--nc-panel) text-muted-foreground hover:bg-(--nc-panel-strong) hover:text-foreground',
              )}
            >
              <span className="text-sm">{t.icon}</span>
              {t.label}
            </button>
          )
        })}
      </div>

      {/* search — all families */}
      <label className="flex h-8 items-center gap-2 rounded-lg border border-(--nc-line) bg-(--nc-panel) px-2.5 focus-within:border-(--nc-accent)">
        <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${TABS.find((t) => t.id === tab)?.label.toLowerCase()}…`}
          aria-label="Search stickers"
          className="w-full bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/60"
        />
      </label>

      {/* favorites / recents filters */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sticker list filters">
        <button
          type="button"
          data-nc-sticker-filter="favorites"
          onClick={() => {
            setFavOnly((v) => !v)
            setRecentOnly(false)
          }}
          aria-pressed={favOnly}
          className={cn(
            'h-7 rounded-full px-2.5 text-[11px] font-medium transition',
            favOnly
              ? 'nc-gradient text-white'
              : 'bg-(--nc-panel) text-muted-foreground hover:bg-(--nc-panel-strong) hover:text-foreground',
          )}
        >
          ⭐ Favorites
          <span className={cn('ml-1 tabular-nums', favOnly ? 'text-white/80' : 'text-muted-foreground/60')}>
            {favorites.length}
          </span>
        </button>
        <button
          type="button"
          data-nc-sticker-filter="recent"
          onClick={() => {
            setRecentOnly((v) => !v)
            setFavOnly(false)
          }}
          aria-pressed={recentOnly}
          className={cn(
            'h-7 rounded-full px-2.5 text-[11px] font-medium transition',
            recentOnly
              ? 'nc-gradient text-white'
              : 'bg-(--nc-panel) text-muted-foreground hover:bg-(--nc-panel-strong) hover:text-foreground',
          )}
        >
          🕐 Recent
          <span className={cn('ml-1 tabular-nums', recentOnly ? 'text-white/80' : 'text-muted-foreground/60')}>
            {recent.length}
          </span>
        </button>
      </div>

      {/* ---------------- emoji tab ---------------- */}
      {tab === 'emoji' && (
        <>
          {!q && (
            <div className="flex flex-wrap gap-1.5">
              {STICKER_CATEGORIES.map((cat, i) => {
                const active = i === activeCat
                return (
                  <button
                    key={cat.name}
                    type="button"
                    onClick={() => setActiveCat(i)}
                    aria-pressed={active}
                    className={
                      active
                        ? 'nc-gradient h-7 rounded-full px-2.5 text-[11px] font-medium text-white transition'
                        : 'h-7 rounded-full bg-(--nc-panel) px-2.5 text-[11px] text-muted-foreground transition hover:bg-(--nc-panel-strong)'
                    }
                  >
                    {cat.name}
                  </button>
                )
              })}
            </div>
          )}

          <div className="grid max-h-72 grid-cols-5 gap-1.5 overflow-y-auto pr-0.5 nc-scroll">
            {visibleEmojis.map((emoji, i) => {
              const id = `emoji:${emoji}`
              const faved = favorites.includes(id)
              return (
                <div key={`${emoji}-${i}`} className="relative">
                  <button
                    type="button"
                    title={`Add ${emoji} sticker at playhead`}
                    onClick={() => handleAdd(emoji, emoji, id)}
                    className="flex aspect-square w-full items-center justify-center rounded-lg bg-(--nc-panel) text-2xl transition hover:scale-110 hover:bg-(--nc-panel-strong) active:scale-95"
                  >
                    {emoji}
                  </button>
                  <button
                    type="button"
                    data-nc-sticker-star={id}
                    title={faved ? 'Remove from favorites' : 'Add to favorites'}
                    aria-label={faved ? `Remove ${emoji} sticker from favorites` : `Add ${emoji} sticker to favorites`}
                    aria-pressed={faved}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleFavorite(id)
                    }}
                    className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm transition hover:scale-110 hover:bg-black/65"
                  >
                    <Star className={cn('size-2.5', faved ? 'fill-amber-400 text-amber-400' : 'text-white/80')} />
                  </button>
                </div>
              )
            })}
          </div>
          {visibleEmojis.length === 0 && (
            <p className="py-4 text-center text-[11px] text-muted-foreground">
              {favOnly && !q
                ? 'No starred emoji in this pack — tap the ☆ corner of an emoji.'
                : q
                  ? `No emoji pack matches “${query}”.`
                  : 'Nothing here yet.'}
            </p>
          )}
        </>
      )}

      {/* ---------------- shape / social / vlog tabs ---------------- */}
      {tab !== 'emoji' && (
        <div className="grid max-h-72 grid-cols-4 gap-1.5 overflow-y-auto pr-0.5 nc-scroll">
          {visibleDefs.map((def) => {
            const id = `sticker:${def.id}`
            const faved = favorites.includes(id)
            return (
              <div key={def.id} className="relative">
                <button
                  type="button"
                  title={`Add ${def.name}`}
                  aria-label={`Add ${def.name} sticker`}
                  onClick={() =>
                    handleAdd(
                      { family: def.family, shape: def.id, fill: def.fill, stroke: def.stroke, strokeWidth: def.strokeWidth },
                      def.name,
                      id,
                    )
                  }
                  className="flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-lg bg-(--nc-panel) p-1 transition hover:bg-(--nc-panel-strong) active:scale-95"
                >
                  <StickerThumb def={def} size={36} />
                  <span className="w-full truncate text-center text-[9px] leading-none text-muted-foreground">{def.name}</span>
                </button>
                <button
                  type="button"
                  data-nc-sticker-star={id}
                  title={faved ? 'Remove from favorites' : 'Add to favorites'}
                  aria-label={faved ? `Remove ${def.name} from favorites` : `Add ${def.name} to favorites`}
                  aria-pressed={faved}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleFavorite(id)
                  }}
                  className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm transition hover:scale-110 hover:bg-black/65"
                >
                  <Star className={cn('size-2.5', faved ? 'fill-amber-400 text-amber-400' : 'text-white/80')} />
                </button>
              </div>
            )
          })}
          {visibleDefs.length === 0 && (
            <p className="col-span-4 py-6 text-center text-[11px] text-muted-foreground">
              {favOnly
                ? 'No starred stickers here — tap the ☆ corner of an item.'
                : `No stickers match “${query}”.`}
            </p>
          )}
        </div>
      )}

      {/* tip */}
      <div className="nc-glass flex gap-2 rounded-lg p-3 text-[11px] text-muted-foreground">
        <Lightbulb className="size-3.5 shrink-0 text-yellow-500" />
        <p>
          Stickers render above video — drag on the timeline to retime, and restyle shapes & elements from Properties
          (fill, outline, size, animation).
        </p>
      </div>
    </div>
  )
}
