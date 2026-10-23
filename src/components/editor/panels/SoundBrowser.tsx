'use client'

/**
 * Audio hub browser — Music (64 procedural loops) and SFX (200 procedural
 * effects) registries rendered as searchable, previewable, favorite-able
 * card grids inside the AudioPanel tabs.
 *
 * Shares the favorites/recent localStorage keys with the Effects panel
 * (src/lib/effects/favorites.ts), so a star made here shows up there and
 * vice versa. "Add" renders the recipe offline to WAV, imports it into the
 * media library and drops the clip at the playhead of an audio track.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Plus, Search, SearchX, Square, Star } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { previewEffect, renderEffectToWav, stopPreview } from '@/lib/effects/audio-render'
import {
  FAVORITES_KEY,
  RECENT_KEY,
  loadIdList,
  pushRecentId,
  saveIdList,
  toggleIdInList,
} from '@/lib/effects/favorites'
import { effectFamilies, searchEffects } from '@/lib/effects/registry'
import type { Effect, MusicEffect, SoundFxEffect } from '@/lib/effects/types'
import { importFiles } from '@/lib/editor/importer'
import { useEditor } from '@/lib/editor/store'
import { cn } from '@/lib/utils'

/** Cards rendered per page — keeps 200-result sets smooth on low-end phones */
const PAGE_SIZE = 60

type SoundEffect = SoundFxEffect | MusicEffect

function formatDuration(seconds: number): string {
  return seconds < 10 ? `${Math.round(seconds * 100) / 100}s` : `${Math.round(seconds)}s`
}

function isSound(effect: Effect): effect is SoundEffect {
  return effect.category === 'sound' || effect.category === 'music'
}

export function SoundBrowser({ category }: { category: 'music' | 'sound' }) {
  const families = useMemo(() => effectFamilies(category), [category])
  const familyLabel = category === 'music' ? 'Genre' : 'Family'
  const emptyText =
    category === 'music'
      ? 'No music matches your search — try "lofi", "edm" or "cinematic".'
      : 'No SFX match your search — try "whoosh", "impact" or "laser".'

  /* favorites & recent — shared with the Effects panel via the same keys */
  const [favorites, setFavorites] = useState<string[]>(() => loadIdList(FAVORITES_KEY))
  const [, setRecent] = useState<string[]>(() => loadIdList(RECENT_KEY, 24))

  /* search / family / favorites filters */
  const [search, setSearch] = useState('')
  const [family, setFamily] = useState<string | null>(null)
  const [favsOnly, setFavsOnly] = useState(false)
  const [pageCount, setPageCount] = useState(1)

  /* preview + add state */
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [addingId, setAddingId] = useState<string | null>(null)
  const endTimer = useRef<number | null>(null)

  /* stop any preview when the browser unmounts or the category changes */
  useEffect(() => {
    return () => {
      if (endTimer.current !== null) window.clearTimeout(endTimer.current)
      endTimer.current = null
      if (playingId !== null) stopPreview()
    }
  }, [category])

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = toggleIdInList(prev, id)
      saveIdList(FAVORITES_KEY, next)
      return next
    })
  }, [])

  const noteUsed = useCallback((id: string) => {
    setRecent((prev) => {
      const next = pushRecentId(prev, id, 24)
      saveIdList(RECENT_KEY, next)
      return next
    })
  }, [])

  const favoriteCount = useMemo(() => {
    let count = 0
    for (const effect of searchEffects({ category })) if (favorites.includes(effect.id)) count++
    return count
  }, [category, favorites])

  const results = useMemo(() => {
    let list = searchEffects({ category, search }).filter(isSound)
    if (family) list = list.filter((e) => e.family === family)
    if (favsOnly) list = list.filter((e) => favorites.includes(e.id))
    return list
  }, [category, search, family, favsOnly, favorites])

  const visible = useMemo(() => results.slice(0, pageCount * PAGE_SIZE), [results, pageCount])

  /* reset pagination + playing card when the filter context changes */
  useEffect(() => {
    setPageCount(1)
  }, [search, family, favsOnly, category])

  useEffect(() => {
    setPlayingId((cur) => (cur !== null && results.some((e) => e.id === cur) ? cur : null))
  }, [search, family, favsOnly])

  const togglePreview = useCallback(
    async (effect: SoundEffect) => {
      if (loadingId !== null && loadingId !== effect.id) return
      if (endTimer.current !== null) {
        window.clearTimeout(endTimer.current)
        endTimer.current = null
      }
      if (playingId === effect.id) {
        stopPreview()
        setPlayingId(null)
        return
      }
      stopPreview()
      setLoadingId(effect.id)
      try {
        await previewEffect(effect)
        setPlayingId(effect.id)
        endTimer.current = window.setTimeout(() => {
          setPlayingId((cur) => (cur === effect.id ? null : cur))
        }, Math.round(effect.duration * 1000) + 150)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Audio preview failed')
      } finally {
        setLoadingId(null)
      }
    },
    [loadingId, playingId],
  )

  const addToTimeline = useCallback(
    async (effect: SoundEffect) => {
      if (addingId !== null) return
      const st = useEditor.getState()
      setAddingId(effect.id)
      try {
        const rendered = await renderEffectToWav(effect)
        const file = new File([rendered.blob], `${rendered.name}.wav`, { type: 'audio/wav' })
        const assets = await importFiles([file])
        if (assets.length === 0) {
          toast.error('Could not import the rendered audio — try again')
          return
        }
        assets.forEach(st.addMediaAsset)
        // land the clip at the playhead (CapCut-style music drop)
        st.addClipFromMediaId(assets[0]!.id, st.currentTime)
        noteUsed(effect.id)
        toast.success(`${effect.name} added at the playhead`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Audio render failed')
      } finally {
        setAddingId(null)
      }
    },
    [addingId, noteUsed],
  )

  return (
    <div className='space-y-2'>
      {/* search */}
      <div className='relative'>
        <Search className='pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground' />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={category === 'music' ? 'Search music…' : 'Search sound effects…'}
          className='h-8 border-(--nc-line) bg-(--nc-panel) pl-8 text-xs'
          aria-label={category === 'music' ? 'Search music' : 'Search sound effects'}
        />
      </div>

      {/* family chips + favorites filter */}
      <div className='-mx-0.5 flex gap-1 overflow-x-auto px-0.5 pb-0.5'>
        <Chip active={family === null && !favsOnly} onClick={() => { setFamily(null); setFavsOnly(false) }}>
          All · {searchEffects({ category }).filter(isSound).length}
        </Chip>
        <Chip active={favsOnly} onClick={() => setFavsOnly((v) => !v)} accent='amber'>
          <Star className={cn('size-2.5', favsOnly && 'fill-amber-300')} />
          {favoriteCount}
        </Chip>
        {families.map((f) => (
          <Chip key={f} active={family === f} onClick={() => setFamily((cur) => (cur === f ? null : f))}>
            {f}
          </Chip>
        ))}
      </div>

      {/* results */}
      {visible.length > 0 ? (
        <>
          <div className='grid grid-cols-2 gap-2' role='list' aria-label={category === 'music' ? 'Music tracks' : 'Sound effects'}>
            {visible.map((effect) => (
              <SoundCard
                key={effect.id}
                effect={effect}
                playing={playingId === effect.id}
                loading={loadingId === effect.id}
                adding={addingId === effect.id}
                fav={favorites.includes(effect.id)}
                onFav={() => toggleFavorite(effect.id)}
                onPreview={() => void togglePreview(effect)}
                onAdd={() => void addToTimeline(effect)}
              />
            ))}
          </div>
          {visible.length < results.length && (
            <button
              type='button'
              onClick={() => setPageCount((p) => p + 1)}
              className='w-full rounded-lg border border-(--nc-line) bg-(--nc-panel) py-2 text-[11px] text-muted-foreground transition hover:bg-(--nc-panel-strong) hover:text-foreground'
            >
              Show more ({results.length - visible.length} left)
            </button>
          )}
        </>
      ) : (
        <div className='rounded-lg border border-dashed border-(--nc-line-strong) p-4 text-center'>
          <SearchX className='mx-auto size-5 text-muted-foreground' />
          <p className='mt-1.5 text-xs text-muted-foreground'>
            {favsOnly && favorites.length === 0
              ? 'No favorites yet — tap the star on any card to keep it here.'
              : emptyText}
          </p>
        </div>
      )}

      <p className='px-0.5 text-[10px] leading-snug text-muted-foreground/70'>
        {familyLabel} chips narrow the list · preview plays instantly · + renders the track offline and
        drops it on the audio track at the playhead.
      </p>
    </div>
  )
}

/* ---------------- card + chip ---------------- */

function SoundCard({
  effect,
  playing,
  loading,
  adding,
  fav,
  onFav,
  onPreview,
  onAdd,
}: {
  effect: SoundEffect
  playing: boolean
  loading: boolean
  adding: boolean
  fav: boolean
  onFav: () => void
  onPreview: () => void
  onAdd: () => void
}) {
  return (
    <div
      role='group'
      aria-label={effect.name}
      className='relative overflow-hidden rounded-lg border border-(--nc-line) bg-(--nc-panel) transition hover:border-emerald-400/60 hover:bg-(--nc-panel-strong)'
    >
      <button
        type='button'
        title={fav ? 'Remove from favorites' : 'Add to favorites'}
        aria-label={fav ? `Remove ${effect.name} from favorites` : `Add ${effect.name} to favorites`}
        aria-pressed={fav}
        onClick={onFav}
        className={cn(
          'absolute left-1 top-1 z-10 flex size-5 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm transition hover:scale-110 hover:bg-black/60',
          fav ? 'text-amber-300' : 'text-white/60 hover:text-white',
        )}
      >
        <Star className={cn('size-3', fav && 'fill-amber-300')} />
      </button>

      <button
        type='button'
        title={playing ? 'Stop preview' : 'Preview'}
        onClick={onPreview}
        className='flex w-full cursor-pointer flex-col items-center px-1 pb-1 pt-2 text-center'
      >
        <span className='flex h-10 w-full items-center justify-center text-xl' aria-hidden>
          {loading ? (
            <Loader2 className='size-4 animate-spin text-fuchsia-300' />
          ) : playing ? (
            <span className='flex size-7 items-center justify-center rounded-full bg-emerald-500/20'>
              <Square className='size-3 fill-emerald-300 text-emerald-300' />
            </span>
          ) : (
            effect.emoji
          )}
        </span>
        <span className='line-clamp-2 min-h-[22px] text-[10px] leading-[11px] text-foreground/90' title={effect.name}>
          {effect.name}
        </span>
        <span className='mt-0.5 rounded bg-(--nc-scrim-strong) px-1 text-[8px] tabular-nums text-white/90'>
          {formatDuration(effect.duration)}
          {effect.category === 'music' ? ` · ${effect.bpm} BPM` : ''}
        </span>
      </button>

      <button
        type='button'
        title='Add to timeline at the playhead'
        aria-label={`Add ${effect.name} to the timeline`}
        onClick={onAdd}
        disabled={adding}
        className='nc-gradient flex h-6 w-full items-center justify-center gap-1 text-[9px] font-semibold text-white transition hover:brightness-110 disabled:opacity-60'
      >
        {adding ? <Loader2 className='size-3 animate-spin' /> : <Plus className='size-3' />}
        {adding ? 'Rendering…' : 'Add'}
      </button>
    </div>
  )
}

function Chip({
  active,
  onClick,
  accent,
  children,
}: {
  active: boolean
  onClick: () => void
  accent?: 'amber'
  children: React.ReactNode
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[10px] font-medium transition',
        accent === 'amber'
          ? active
            ? 'border-amber-300/60 bg-amber-300/15 text-amber-200'
            : 'border-(--nc-line) bg-(--nc-panel) text-muted-foreground hover:text-foreground'
          : active
            ? 'border-(--nc-accent) bg-(--nc-accent)/15 text-foreground'
            : 'border-(--nc-line) bg-(--nc-panel) text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
