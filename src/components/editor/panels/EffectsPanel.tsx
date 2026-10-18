'use client'

/**
 * Effects panel — mega effects browser (794 effects).
 *
 * Browse & apply: color filter/grade presets, transitions (outgoing+incoming
 * clip patches), text animations, canvas overlays, plus procedural sound FX
 * and music that render offline to WAV and import into the media library.
 * Clip-dependent tools (Ken Burns motion, fades, speed) stay below the
 * browser for the currently selected clip.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  ArrowRight,
  AudioLines,
  Check,
  Loader2,
  Plus,
  Search,
  SearchX,
  Sparkles,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { previewEffect, renderEffectToWav, stopPreview } from '@/lib/effects/audio-render'
import { EFFECT_COUNTS, TOTAL_EFFECTS, getEffect, searchEffects } from '@/lib/effects/registry'
import type {
  ColorEffect,
  Effect,
  EffectCategory,
  MusicEffect,
  OverlayEffect,
  SoundFxEffect,
  TextEffect,
  TransitionEffect,
  TransitionPatch,
} from '@/lib/effects/types'
import { DEFAULT_COLOR_GRADE, DEFAULT_FILTERS, MOTION_PRESETS } from '@/lib/editor/constants'
import { importFiles } from '@/lib/editor/importer'
import { useEditor, type ClipPatch } from '@/lib/editor/store'
import { round2, uid } from '@/lib/editor/utils'
import type { Clip, ColorGrade, Filters, TextStyle } from '@/lib/editor/types'

type CategoryFilter = EffectCategory | 'all'

/** Cards rendered per page — keeps 220+ result sets smooth on low-end phones */
const PAGE_SIZE = 60

const CATEGORY_CHIPS: Array<{ id: CategoryFilter; label: string; count: number }> = [
  { id: 'all', label: 'All', count: TOTAL_EFFECTS },
  { id: 'color', label: 'Color', count: EFFECT_COUNTS.color },
  { id: 'transition', label: 'Transitions', count: EFFECT_COUNTS.transition },
  { id: 'text', label: 'Text', count: EFFECT_COUNTS.text },
  { id: 'sound', label: 'Sound', count: EFFECT_COUNTS.sound },
  { id: 'music', label: 'Music', count: EFFECT_COUNTS.music },
  { id: 'overlay', label: 'Overlays', count: EFFECT_COUNTS.overlay },
]

/* ---------------- helpers ---------------- */

function formatDuration(seconds: number): string {
  return seconds < 10 ? `${round2(seconds)}s` : `${Math.round(seconds)}s`
}

function cardClass(active: boolean): string {
  return active
    ? 'relative cursor-pointer overflow-hidden rounded-lg border border-(--nc-accent) bg-(--nc-panel) shadow-[0_0_14px_var(--nc-accent-glow-soft)] ring-1 ring-(--nc-accent) transition'
    : 'relative cursor-pointer overflow-hidden rounded-lg border border-(--nc-line) bg-(--nc-panel) transition hover:border-fuchsia-400/60 hover:bg-(--nc-panel-strong)'
}

/** Shallow-compare the effect's filter patch against the clip filters */
function colorEffectActive(clip: Clip, effect: ColorEffect): boolean {
  const keys = Object.keys(effect.filters) as (keyof Filters)[]
  if (!keys.every((k) => clip.filters[k] === effect.filters[k])) return false
  if (!effect.grade) return true
  const gradeKeys = Object.keys(effect.grade) as (keyof ColorGrade)[]
  return gradeKeys.every(
    (k) => (clip.colorGrade?.[k] ?? DEFAULT_COLOR_GRADE[k]) === effect.grade?.[k]
  )
}

/** A text effect is active when animation, duration and style patch all match */
function textEffectActive(clip: Clip, effect: TextEffect): boolean {
  const ts = clip.textStyle
  if (!ts || ts.animation !== effect.animation || ts.animationDuration !== effect.animationDuration) return false
  if (!effect.style) return true
  const keys = Object.keys(effect.style) as (keyof TextStyle)[]
  return keys.every((k) => ts[k] === effect.style?.[k])
}

/** Mini live "Aa" preview style derived from the effect's TextStyle patch */
function textPreviewStyle(effect: TextEffect): CSSProperties {
  const st = effect.style
  return {
    animation: effect.previewCss,
    color: st?.color ?? '#ffffff',
    fontWeight: st?.bold ? 700 : 600,
    fontStyle: st?.italic ? 'italic' : undefined,
    fontFamily: st?.fontFamily ? `${st.fontFamily}, sans-serif` : undefined,
    letterSpacing: st?.letterSpacing ? `${Math.min(6, st.letterSpacing / 3)}px` : undefined,
    WebkitTextStroke: st?.strokeWidth ? `${Math.max(0.5, st.strokeWidth / 4)}px ${st.strokeColor ?? '#000000'}` : undefined,
    textShadow: st?.shadow ? `0 0 ${Math.max(4, (st.shadowBlur ?? 16) / 3)}px ${st.shadowColor ?? 'rgba(0,0,0,0.6)'}` : undefined,
  }
}

/**
 * Convert a TransitionPatch into a ClipPatch (keyframe anchors → absolute times).
 * `side` confines the motion to the transition window, not the whole clip:
 *   out → keys live in the clip's LAST `duration` seconds
 *   in  → keys live in the clip's FIRST `duration` seconds
 */
function transitionClipPatch(patch: TransitionPatch, clip: Clip, side: 'out' | 'in', duration: number): ClipPatch {
  const window = Math.min(duration, clip.duration)
  const anchorTime = (at: 'start' | 'end'): number => {
    if (side === 'in') return at === 'start' ? 0 : window
    return at === 'start' ? Math.max(0, clip.duration - window) : clip.duration
  }
  return {
    ...(patch.fadeIn !== undefined ? { fadeIn: patch.fadeIn } : {}),
    ...(patch.fadeOut !== undefined ? { fadeOut: patch.fadeOut } : {}),
    ...(patch.motion !== undefined ? { motion: patch.motion } : {}),
    ...(patch.motionIntensity !== undefined ? { motionIntensity: patch.motionIntensity } : {}),
    keyframes: (patch.keys ?? []).map((k) => ({
      id: uid('kf'),
      property: k.property,
      time: anchorTime(k.at),
      value: k.value,
      easing: k.easing,
    })),
  }
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  )
}

/* ---------------- effect cards ---------------- */

function ColorCard({ effect, active, onApply }: { effect: ColorEffect; active: boolean; onApply: () => void }) {
  return (
    <button type="button" title={effect.name} aria-pressed={active} onClick={onApply} className={cardClass(active)}>
      <span
        className="block h-12 w-full"
        style={{ background: effect.swatch.bg, filter: effect.swatch.filter }}
        aria-hidden
      />
      <span className="block truncate px-1 pb-1 pt-1 text-center text-[9px] leading-tight text-muted-foreground">
        {effect.name}
      </span>
    </button>
  )
}

function TransitionCard({ effect, onApply }: { effect: TransitionEffect; onApply: () => void }) {
  return (
    <button type="button" title={effect.name} onClick={onApply} className={cardClass(false)}>
      <span className="flex h-12 w-full items-center justify-center gap-1 bg-(--nc-scrim)" aria-hidden>
        <span className="h-6 w-7 rounded border border-(--nc-line) bg-(--nc-panel-strong)" />
        <ArrowRight className="size-3.5 text-fuchsia-300" />
        <span className="nc-gradient h-6 w-7 rounded" />
      </span>
      <span className="block truncate px-1 pt-1 text-center text-[9px] leading-tight text-muted-foreground">
        {effect.name}
      </span>
      <span className="block pb-1 text-center text-[8px] tabular-nums text-muted-foreground/70">
        {formatDuration(effect.duration)}
      </span>
    </button>
  )
}

function TextCard({ effect, active, onApply }: { effect: TextEffect; active: boolean; onApply: () => void }) {
  return (
    <button type="button" title={effect.name} aria-pressed={active} onClick={onApply} className={cardClass(active)}>
      <span className="flex h-12 w-full items-center justify-center overflow-hidden bg-(--nc-scrim)" aria-hidden>
        <span className="nc-tx-preview select-none text-base leading-none" style={textPreviewStyle(effect)}>
          Aa
        </span>
      </span>
      <span className="block truncate px-1 pb-1 pt-1 text-center text-[9px] leading-tight text-muted-foreground">
        {effect.name}
      </span>
    </button>
  )
}

function OverlayCard({ effect, active, onApply }: { effect: OverlayEffect; active: boolean; onApply: () => void }) {
  return (
    <button type="button" title={effect.name} aria-pressed={active} onClick={onApply} className={cardClass(active)}>
      <span className="relative block h-12 w-full" style={{ background: effect.swatch }} aria-hidden>
        <span className="absolute inset-0 flex items-center justify-center text-lg">{effect.emoji}</span>
        {active && (
          <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-(--nc-accent)">
            <Check className="size-2.5 text-white" />
          </span>
        )}
      </span>
      <span className="block truncate px-1 pb-1 pt-1 text-center text-[9px] leading-tight text-muted-foreground">
        {effect.name}
      </span>
    </button>
  )
}

function AudioCard({
  effect,
  playing,
  loading,
  adding,
  onPreview,
  onAdd,
}: {
  effect: SoundFxEffect | MusicEffect
  playing: boolean
  loading: boolean
  adding: boolean
  onPreview: () => void
  onAdd: () => void
}) {
  return (
    <div className={cardClass(false)}>
      <button
        type="button"
        title={playing ? 'Stop preview' : 'Preview audio'}
        onClick={onPreview}
        className="block w-full cursor-pointer text-left"
      >
        <span className="flex h-12 w-full items-center justify-center bg-(--nc-scrim) text-2xl" aria-hidden>
          {loading ? (
            <Loader2 className="size-5 animate-spin text-fuchsia-300" />
          ) : playing ? (
            <AudioLines className="size-6 animate-pulse text-emerald-300" />
          ) : (
            effect.emoji
          )}
        </span>
        <span className="block truncate px-1 pt-1 text-[9px] leading-tight text-muted-foreground" title={effect.name}>
          {effect.name}
        </span>
        <span className="block pb-1 text-center text-[8px] tabular-nums text-muted-foreground/70">
          {formatDuration(effect.duration)}
          {effect.category === 'music' ? ` · ${effect.bpm} bpm` : ''}
        </span>
      </button>
      <button
        type="button"
        title="Add to library"
        aria-label={`Add ${effect.name} to library`}
        onClick={onAdd}
        disabled={adding}
        className="nc-gradient absolute right-1 top-1 flex size-6 items-center justify-center rounded-full text-white shadow-md transition hover:scale-110 disabled:opacity-60"
      >
        {adding ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3.5" />}
      </button>
    </div>
  )
}

/* ---------------- panel ---------------- */

export function EffectsPanel() {
  const clip = useEditor((s) => s.project.clips.find((c) => c.id === s.selectedClipIds[0]))
  const updateClip = useEditor((s) => s.updateClip)
  const addMediaAsset = useEditor((s) => s.addMediaAsset)

  const [category, setCategory] = useState<CategoryFilter>('all')
  const [search, setSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [addingId, setAddingId] = useState<string | null>(null)
  const previewEndTimer = useRef<number | null>(null)

  // leaving the panel must stop any playing preview
  useEffect(() => {
    return () => {
      stopPreview()
      if (previewEndTimer.current !== null) window.clearTimeout(previewEndTimer.current)
    }
  }, [])

  // new filter context → back to the first page
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [category, search])

  const results = useMemo(
    () => searchEffects({ category: category === 'all' ? undefined : category, search: search.trim() || undefined }),
    [category, search]
  )
  const visible = useMemo(() => results.slice(0, visibleCount), [results, visibleCount])

  const overlayState = clip?.overlay ?? null
  const overlayMatch = overlayState ? getEffect(overlayState.effectId) : undefined
  const activeOverlay = overlayMatch && overlayMatch.category === 'overlay' ? overlayMatch : null

  const clearSearchFilters = useCallback(() => {
    setSearch('')
    setCategory('all')
  }, [])

  /* ---------- apply: color ---------- */
  const applyColor = useCallback(
    (effect: ColorEffect) => {
      if (!clip) {
        toast('Select a clip first')
        return
      }
      updateClip(
        clip.id,
        {
          filters: { ...DEFAULT_FILTERS, ...effect.filters },
          colorGrade: { ...DEFAULT_COLOR_GRADE, ...(effect.grade ?? {}) },
        },
        true
      )
      toast(`Color · ${effect.name}`)
    },
    [clip, updateClip]
  )

  /* ---------- apply: transition (outgoing + incoming clip) ---------- */
  const applyTransition = useCallback(
    (effect: TransitionEffect) => {
      if (!clip) {
        toast('Select a clip first')
        return
      }
      const project = useEditor.getState().project
      const incoming = project.clips
        .filter((c) => c.trackId === clip.trackId && c.start > clip.start)
        .sort((a, b) => a.start - b.start)[0]
      if (!incoming) {
        toast('Add another clip after this one to use a transition')
        return
      }
      const historyKey = `transition-${clip.id}-${incoming.id}`
      if (effect.out) updateClip(clip.id, transitionClipPatch(effect.out, clip, 'out', effect.duration), historyKey)
      if (effect.in) updateClip(incoming.id, transitionClipPatch(effect.in, incoming, 'in', effect.duration), historyKey)
      toast.success(`Transition applied · ${formatDuration(effect.duration)}`)
    },
    [clip, updateClip]
  )

  /* ---------- apply: text ---------- */
  const applyText = useCallback(
    (effect: TextEffect) => {
      if (!clip) {
        toast('Select a clip first')
        return
      }
      if (clip.kind !== 'text') {
        toast('Text effects need a text clip')
        return
      }
      updateClip(
        clip.id,
        {
          textStyle: {
            animation: effect.animation,
            animationDuration: effect.animationDuration,
            ...(effect.style ?? {}),
          },
        },
        true
      )
      toast(`Text effect · ${effect.name}`)
    },
    [clip, updateClip]
  )

  /* ---------- apply: overlay (tap active card again to remove) ---------- */
  const applyOverlay = useCallback(
    (effect: OverlayEffect) => {
      if (!clip) {
        toast('Select a clip first')
        return
      }
      if (clip.kind === 'audio') {
        toast('Overlays need a visual clip')
        return
      }
      if (clip.overlay?.effectId === effect.id) {
        updateClip(clip.id, { overlay: null }, true)
        toast('Overlay removed')
        return
      }
      updateClip(clip.id, { overlay: { effectId: effect.id, intensity: effect.intensity } }, true)
      toast(`Overlay · ${effect.name}`)
    },
    [clip, updateClip]
  )

  const removeOverlay = useCallback(() => {
    if (!clip) return
    updateClip(clip.id, { overlay: null }, true)
    toast('Overlay removed')
  }, [clip, updateClip])

  /* ---------- audio: preview toggle ---------- */
  const togglePreview = useCallback(
    async (effect: SoundFxEffect | MusicEffect) => {
      if (loadingId !== null && loadingId !== effect.id) return
      const clearEndTimer = () => {
        if (previewEndTimer.current !== null) {
          window.clearTimeout(previewEndTimer.current)
          previewEndTimer.current = null
        }
      }
      if (previewId === effect.id) {
        stopPreview()
        clearEndTimer()
        setPreviewId(null)
        return
      }
      stopPreview()
      clearEndTimer()
      setLoadingId(effect.id)
      try {
        await previewEffect(effect)
        setPreviewId(effect.id)
        previewEndTimer.current = window.setTimeout(() => {
          setPreviewId((cur) => (cur === effect.id ? null : cur))
        }, Math.round(effect.duration * 1000) + 150)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Audio preview failed')
      } finally {
        setLoadingId(null)
      }
    },
    [loadingId, previewId]
  )

  /* ---------- audio: render WAV → media library ---------- */
  const addToLibrary = useCallback(
    async (effect: SoundFxEffect | MusicEffect) => {
      if (addingId !== null) return
      setAddingId(effect.id)
      try {
        const rendered = await renderEffectToWav(effect)
        const file = new File([rendered.blob], `${rendered.name}.wav`, { type: 'audio/wav' })
        const assets = await importFiles([file])
        if (assets.length === 0) {
          toast.error('Could not import the rendered audio — try again')
          return
        }
        assets.forEach(addMediaAsset)
        toast.success('Added to library')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Audio render failed')
      } finally {
        setAddingId(null)
      }
    },
    [addingId, addMediaAsset]
  )

  /* ---------- card switch ---------- */
  const renderCard = (effect: Effect) => {
    switch (effect.category) {
      case 'color':
        return (
          <ColorCard
            key={effect.id}
            effect={effect}
            active={clip ? colorEffectActive(clip, effect) : false}
            onApply={() => applyColor(effect)}
          />
        )
      case 'transition':
        return <TransitionCard key={effect.id} effect={effect} onApply={() => applyTransition(effect)} />
      case 'text':
        return (
          <TextCard
            key={effect.id}
            effect={effect}
            active={clip ? textEffectActive(clip, effect) : false}
            onApply={() => applyText(effect)}
          />
        )
      case 'sound':
      case 'music':
        return (
          <AudioCard
            key={effect.id}
            effect={effect}
            playing={previewId === effect.id}
            loading={loadingId === effect.id}
            adding={addingId === effect.id}
            onPreview={() => void togglePreview(effect)}
            onAdd={() => void addToLibrary(effect)}
          />
        )
      case 'overlay':
        return (
          <OverlayCard
            key={effect.id}
            effect={effect}
            active={clip?.overlay?.effectId === effect.id}
            onApply={() => applyOverlay(effect)}
          />
        )
      default:
        return null
    }
  }

  /* ---------- clip-dependent legacy tools ---------- */
  const renderClipTools = () => {
    if (!clip) {
      return (
        <div className="nc-glass flex items-start gap-2.5 rounded-lg p-3">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-fuchsia-300" />
          <p className="text-xs leading-snug text-muted-foreground">
            Select a clip on the timeline to apply effects — color, overlays, transitions, motion, fades and speed
            live here once you pick a clip.
          </p>
        </div>
      )
    }

    const showMotion = clip.kind === 'video' || clip.kind === 'image'
    const showSpeed = clip.kind === 'video' || clip.kind === 'audio'

    return (
      <>
        {/* selected clip chip */}
        <div className="flex w-fit max-w-full items-center gap-1.5 rounded-full border border-(--nc-line) bg-(--nc-panel) px-2.5 py-1">
          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: clip.color }} aria-hidden />
          <span className="truncate text-[11px] text-foreground/90" title={clip.name}>
            {clip.name}
          </span>
        </div>

        {/* motion (Ken Burns) */}
        {showMotion && (
          <section className="space-y-1.5">
            <SectionTitle>Motion (Ken Burns)</SectionTitle>
            <div className="flex flex-wrap gap-1.5">
              {MOTION_PRESETS.map((preset) => {
                const active = clip.motion === preset.id
                return (
                  <button
                    key={preset.id}
                    type="button"
                    title={`Motion: ${preset.name}`}
                    onClick={() => updateClip(clip.id, { motion: preset.id }, true)}
                    className={
                      active
                        ? 'nc-gradient flex h-8 items-center gap-1 rounded-lg px-2.5 text-[11px] font-medium text-white transition'
                        : 'flex h-8 items-center gap-1 rounded-lg bg-(--nc-panel) px-2.5 text-[11px] text-muted-foreground transition hover:bg-(--nc-panel-strong)'
                    }
                  >
                    <span aria-hidden>{preset.icon}</span>
                    {preset.name}
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* fades */}
        <section className="nc-glass space-y-3 rounded-lg p-3">
          <SectionTitle>Fades</SectionTitle>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-foreground/80">Fade in</span>
              <span className="text-[10px] tabular-nums text-muted-foreground">{clip.fadeIn.toFixed(2)}s</span>
            </div>
            <Slider
              min={0}
              max={3}
              step={0.05}
              value={[clip.fadeIn]}
              onValueChange={(v) => updateClip(clip.id, { fadeIn: v[0] ?? 0 }, `fade-in-${clip.id}`)}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-foreground/80">Fade out</span>
              <span className="text-[10px] tabular-nums text-muted-foreground">{clip.fadeOut.toFixed(2)}s</span>
            </div>
            <Slider
              min={0}
              max={3}
              step={0.05}
              value={[clip.fadeOut]}
              onValueChange={(v) => updateClip(clip.id, { fadeOut: v[0] ?? 0 }, `fade-out-${clip.id}`)}
            />
          </div>
        </section>

        {/* speed */}
        {showSpeed && (
          <section className="space-y-1.5">
            <div className="flex items-center justify-between">
              <SectionTitle>Speed</SectionTitle>
              <span className="text-[11px] font-semibold tabular-nums text-fuchsia-300">
                {clip.speed.toFixed(2)}x
              </span>
            </div>
            <Slider
              min={0.25}
              max={4}
              step={0.05}
              value={[clip.speed]}
              onValueChange={(v) => {
                const newSpeed = v[0] ?? 1
                // speed change alters timeline duration: dur = dur * oldSpeed / newSpeed
                updateClip(
                  clip.id,
                  { speed: newSpeed, duration: round2(Math.max(0.1, (clip.duration * clip.speed) / newSpeed)) },
                  `speed-${clip.id}`
                )
              }}
            />
            {clip.speed !== 1 && (
              <p className="text-[9px] text-yellow-500">⚠ Duration adjusted to match the new speed</p>
            )}
          </section>
        )}
      </>
    )
  }

  return (
    <div className="space-y-3">
      {/* ---------- header: counter + search ---------- */}
      <div className="flex items-center gap-2">
        <span className="nc-gradient shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold text-white">
          {TOTAL_EFFECTS} effects
        </span>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search effects…"
            aria-label="Search effects"
            className="h-8 rounded-lg border-(--nc-line) bg-(--nc-panel) pl-7 pr-8 text-xs"
          />
          {search.length > 0 && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearch('')}
              className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition hover:bg-(--nc-panel-strong) hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      {/* ---------- category chips ---------- */}
      <div className="-mx-0.5 flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CATEGORY_CHIPS.map((chip) => {
          const active = category === chip.id
          return (
            <button
              key={chip.id}
              type="button"
              aria-pressed={active}
              onClick={() => setCategory(chip.id)}
              className={
                active
                  ? 'nc-gradient flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold text-white shadow-sm transition'
                  : 'flex h-7 shrink-0 items-center gap-1 rounded-full border border-(--nc-line) bg-(--nc-panel) px-2.5 text-[11px] text-muted-foreground transition hover:border-fuchsia-400/50 hover:text-foreground'
              }
            >
              {chip.label}
              <span className={active ? 'text-white/80' : 'text-muted-foreground/60'}>{chip.count}</span>
            </button>
          )
        })}
      </div>

      {/* ---------- effects grid ---------- */}
      {results.length === 0 ? (
        <div className="flex flex-col items-center px-4 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-(--nc-line) bg-(--nc-panel)">
            <SearchX className="size-5 text-fuchsia-300" />
          </span>
          <p className="mt-3 text-sm font-medium">No effects match</p>
          <p className="mt-1 text-xs text-muted-foreground">Try a different search or category.</p>
          <Button variant="outline" size="sm" className="mt-3 h-8 rounded-lg text-xs" onClick={clearSearchFilters}>
            Clear search
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-1.5">{visible.map(renderCard)}</div>
          {visibleCount < results.length && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full rounded-lg text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            >
              Load more ({results.length - visibleCount} remaining)
            </Button>
          )}
        </>
      )}

      {/* transitions rewrite transform keyframes on both clips — always disclose */}
      {category === 'transition' && results.length > 0 && (
        <p className="text-[10px] leading-snug text-muted-foreground/80">
          Replaces transform keyframes on both clips — transitions need a following clip on the same track.
        </p>
      )}

      {/* ---------- active overlay controls ---------- */}
      {clip && overlayState && activeOverlay && (
        <section className="nc-glass space-y-2.5 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <SectionTitle>Active overlay</SectionTitle>
            <button
              type="button"
              onClick={removeOverlay}
              className="text-[10px] font-medium text-rose-300 transition hover:text-rose-200"
            >
              Remove
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base" aria-hidden>
              {activeOverlay.emoji}
            </span>
            <span className="truncate text-[11px] text-foreground/90" title={activeOverlay.name}>
              {activeOverlay.name}
            </span>
          </div>
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={[overlayState.intensity]}
            onValueChange={(v) =>
              updateClip(
                clip.id,
                { overlay: { effectId: overlayState.effectId, intensity: v[0] ?? overlayState.intensity } },
                `overlay-intensity-${clip.id}`
              )
            }
          />
        </section>
      )}

      {/* ---------- clip-dependent tools (motion / fades / speed) ---------- */}
      {renderClipTools()}
    </div>
  )
}
