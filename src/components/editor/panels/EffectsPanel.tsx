'use client'

/**
 * Effects panel — mega effects browser across 10 categories.
 *
 * Browse & apply: color filter/grade presets, transitions (outgoing+incoming
 * clip patches), text animations, canvas overlays, stylized vision post-FX,
 * voice transforms (offline DSP → WAV), motion camera presets, speed presets,
 * plus procedural sound FX and music that render offline to WAV and import
 * into the media library.
 * Clip-dependent tools (Ken Burns motion, fades, speed) stay below the
 * browser for the currently selected clip.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  ArrowRight,
  AudioLines,
  Check,
  Circle,
  Loader2,
  Plus,
  Scan,
  Search,
  SearchX,
  Sparkles,
  Star,
  Wand2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { previewEffect, renderEffectToWav, stopPreview } from '@/lib/effects/audio-render'
import { EFFECT_COUNTS, TOTAL_EFFECTS, getEffect, searchEffects } from '@/lib/effects/registry'
import { previewVoiceEffect, renderVoiceToWav, stopVoicePreview } from '@/lib/effects/voice'
import type {
  ColorEffect,
  Effect,
  EffectCategory,
  MotionEffect,
  MusicEffect,
  OverlayEffect,
  SoundFxEffect,
  SpeedEffect,
  TextEffect,
  TransitionEffect,
  TransitionPatch,
  VisionEffect,
  VoiceFxEffect,
} from '@/lib/effects/types'
import { DEFAULT_COLOR_GRADE, DEFAULT_FILTERS, MOTION_PRESETS, createClipFromMedia } from '@/lib/editor/constants'
import { importFiles } from '@/lib/editor/importer'
import { useEditor, type ClipPatch } from '@/lib/editor/store'
import { round2, uid } from '@/lib/editor/utils'
import type { Clip, ColorGrade, Filters, MotionType, TextStyle } from '@/lib/editor/types'
import { cn } from '@/lib/utils'

type CategoryFilter = EffectCategory | 'all' | 'favorites' | 'recent'

/** Cards rendered per page — keeps 220+ result sets smooth on low-end phones */
const PAGE_SIZE = 60

const CATEGORY_CHIPS: Array<{ id: CategoryFilter; label: string; emoji: string; count: number }> = [
  // 'all', 'favorites' and 'recent' are prepended dynamically (live counts)
  { id: 'color', label: 'Color', emoji: '🎨', count: EFFECT_COUNTS.color },
  { id: 'transition', label: 'Transitions', emoji: '🎬', count: EFFECT_COUNTS.transition },
  { id: 'text', label: 'Text', emoji: '🔤', count: EFFECT_COUNTS.text },
  { id: 'sound', label: 'Sound', emoji: '🔊', count: EFFECT_COUNTS.sound },
  { id: 'music', label: 'Music', emoji: '🎵', count: EFFECT_COUNTS.music },
  { id: 'overlay', label: 'Overlays', emoji: '✦', count: EFFECT_COUNTS.overlay },
  { id: 'vision', label: 'Vision', emoji: '👁', count: EFFECT_COUNTS.vision },
  { id: 'voice', label: 'Voice', emoji: '🎙', count: EFFECT_COUNTS.voice },
  { id: 'motion', label: 'Motion', emoji: '🎥', count: EFFECT_COUNTS.motion },
  { id: 'speed', label: 'Speed', emoji: '⚡', count: EFFECT_COUNTS.speed },
]

/** Voice previews render a short snippet (~2.4s) — keep the playing state a beat longer */
const VOICE_PREVIEW_MS = 2600

/* ---------------- favorites / recent (local-first persistence) ---------------- */

const FAVORITES_KEY = 'novacut.fx.favorites.v1'
const RECENT_KEY = 'novacut.fx.recent.v1'
const RECENT_CAP = 24

function loadIdList(key: string, cap = 200): string[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string').slice(0, cap)
  } catch {
    return []
  }
}

function saveIdList(key: string, ids: string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(ids))
  } catch {
    // storage blocked/full — favorites stay session-only
  }
}

/** Registry text-match shared with searchEffects (name / family / tags). */
function matchesSearch(effect: Effect, search: string): boolean {
  const q = search.trim().toLowerCase()
  if (!q) return true
  return (
    effect.name.toLowerCase().includes(q) ||
    effect.family.toLowerCase().includes(q) ||
    effect.tags.some((tag) => tag.toLowerCase().includes(q))
  )
}

/* ---------------- helpers ---------------- */

function formatDuration(seconds: number): string {
  return seconds < 10 ? `${round2(seconds)}s` : `${Math.round(seconds)}s`
}

function cardClass(active: boolean): string {
  const base =
    active
      ? 'relative cursor-pointer overflow-hidden rounded-lg border border-(--nc-accent) bg-(--nc-panel) shadow-[0_0_14px_var(--nc-accent-glow-soft)] ring-1 ring-(--nc-accent) transition'
      : 'relative cursor-pointer overflow-hidden rounded-lg border border-(--nc-line) bg-(--nc-panel) transition hover:border-fuchsia-400/60 hover:bg-(--nc-panel-strong)'
  return `${base} outline-none focus-visible:ring-2 focus-visible:ring-(--nc-accent)`
}

/**
 * Interactive card root as a div (role=button) — the favorite star is a real
 * <button>, and nesting a button inside a button is invalid HTML that breaks
 * clicks in some browsers. Enter/Space keyboard activation is preserved.
 */
function cardA11y(onApply: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: onApply,
    onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onApply()
      }
    },
  }
}

function FavoriteStar({
  active,
  onToggle,
  label,
}: {
  active: boolean
  onToggle: () => void
  label: string
}) {
  return (
    <button
      type="button"
      title={active ? 'Remove from favorites' : 'Add to favorites'}
      aria-label={active ? `Remove ${label} from favorites` : `Add ${label} to favorites`}
      aria-pressed={active}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      className={cn(
        'absolute left-1 top-1 z-10 flex size-5 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm transition hover:scale-110 hover:bg-black/60',
        active ? 'text-amber-300' : 'text-white/60 hover:text-white'
      )}
    >
      <Star className={cn('size-3', active && 'fill-amber-300')} />
    </button>
  )
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

/**
 * A motion preset is active when the base motion + intensity match. MotionType
 * alone can repeat between presets of a family, so when BOTH the effect and
 * the clip carry keyframes we also compare their count — a simple, documented
 * best-effort check (exact keyframe-by-keyframe matching is overkill here).
 */
function motionEffectActive(clip: Clip, effect: MotionEffect): boolean {
  if (clip.motion !== effect.motion || clip.motionIntensity !== effect.motionIntensity) return false
  if (effect.keys?.length && clip.keyframes?.length) {
    return clip.keyframes.length === effect.keys.length
  }
  return true
}

/** Tiny move description for the motion card footer */
const MOTION_HINTS: Record<MotionType, string> = {
  none: 'Keyframe move',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  panLeft: 'Pan left',
  panRight: 'Pan right',
  panUp: 'Pan up',
  panDown: 'Pan down',
}

function motionDescription(effect: MotionEffect): string {
  const base = MOTION_HINTS[effect.motion]
  return effect.keys?.length ? `${base} + keys` : base
}

/** "0.5×" / "2×" / "10×" */
function formatSpeed(speed: number): string {
  return `${round2(speed)}×`
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
 * Key anchors: 'start'/'end' map to the window edges; a number is a fraction
 * of the window (0 = window start) — used by multi-key patches like the Film
 * Dissolve's gate weave.
 */
function transitionClipPatch(patch: TransitionPatch, clip: Clip, side: 'out' | 'in', duration: number): ClipPatch {
  const window = Math.min(duration, clip.duration)
  const windowStart = side === 'in' ? 0 : Math.max(0, clip.duration - window)
  const anchorTime = (at: 'start' | 'end' | number): number => {
    if (at === 'start') return windowStart
    if (at === 'end') return side === 'in' ? window : clip.duration
    return Math.min(windowStart + at * window, clip.duration)
  }
  return {
    ...(patch.fadeIn !== undefined ? { fadeIn: patch.fadeIn } : {}),
    ...(patch.fadeOut !== undefined ? { fadeOut: patch.fadeOut } : {}),
    ...(patch.motion !== undefined ? { motion: patch.motion } : {}),
    ...(patch.motionIntensity !== undefined ? { motionIntensity: patch.motionIntensity } : {}),
    ...(patch.wipe !== undefined ? { wipe: patch.wipe } : {}),
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

function ColorCard({
  effect,
  active,
  fav,
  onFav,
  onApply,
}: {
  effect: ColorEffect
  active: boolean
  fav: boolean
  onFav: () => void
  onApply: () => void
}) {
  return (
    <div {...cardA11y(onApply)} title={effect.name} aria-pressed={active} className={cardClass(active)}>
      <FavoriteStar active={fav} onToggle={onFav} label={effect.name} />
      <span
        className="block h-12 w-full"
        style={{ background: effect.swatch.bg, filter: effect.swatch.filter }}
        aria-hidden
      />
      <span className="block truncate px-1 pb-1 pt-1 text-center text-[9px] leading-tight text-muted-foreground">
        {effect.name}
      </span>
    </div>
  )
}

function TransitionCard({
  effect,
  fav,
  onFav,
  onApply,
}: {
  effect: TransitionEffect
  fav: boolean
  onFav: () => void
  onApply: () => void
}) {
  const wipe = effect.in?.wipe
  return (
    <div {...cardA11y(onApply)} title={effect.name} className={cardClass(false)}>
      <FavoriteStar active={fav} onToggle={onFav} label={effect.name} />
      <span className="flex h-12 w-full items-center justify-center gap-1 bg-(--nc-scrim)" aria-hidden>
        {wipe ? (
          // wipe transitions reveal through an animated mask — mask icon
          <span className="flex items-center gap-1">
            <span className="h-6 w-7 rounded border border-(--nc-line) bg-(--nc-panel-strong)" />
            {wipe === 'circle' ? (
              <Circle className="size-3.5 text-fuchsia-300" />
            ) : (
              <Scan className="size-3.5 text-fuchsia-300" />
            )}
            <span className="nc-gradient h-6 w-7 rounded" />
          </span>
        ) : (
          <>
            <span className="h-6 w-7 rounded border border-(--nc-line) bg-(--nc-panel-strong)" />
            <ArrowRight className="size-3.5 text-fuchsia-300" />
            <span className="nc-gradient h-6 w-7 rounded" />
          </>
        )}
      </span>
      <span className="block truncate px-1 pt-1 text-center text-[9px] leading-tight text-muted-foreground">
        {effect.name}
      </span>
      <span className="block pb-1 text-center text-[8px] tabular-nums text-muted-foreground/70">
        {formatDuration(effect.duration)}
      </span>
    </div>
  )
}

function TextCard({
  effect,
  active,
  fav,
  onFav,
  onApply,
}: {
  effect: TextEffect
  active: boolean
  fav: boolean
  onFav: () => void
  onApply: () => void
}) {
  return (
    <div {...cardA11y(onApply)} title={effect.name} aria-pressed={active} className={cardClass(active)}>
      <FavoriteStar active={fav} onToggle={onFav} label={effect.name} />
      <span className="flex h-12 w-full items-center justify-center overflow-hidden bg-(--nc-scrim)" aria-hidden>
        <span className="nc-tx-preview select-none text-base leading-none" style={textPreviewStyle(effect)}>
          Aa
        </span>
      </span>
      <span className="block truncate px-1 pb-1 pt-1 text-center text-[9px] leading-tight text-muted-foreground">
        {effect.name}
      </span>
    </div>
  )
}

function OverlayCard({
  effect,
  active,
  fav,
  onFav,
  onApply,
}: {
  effect: OverlayEffect
  active: boolean
  fav: boolean
  onFav: () => void
  onApply: () => void
}) {
  return (
    <div {...cardA11y(onApply)} title={effect.name} aria-pressed={active} className={cardClass(active)}>
      <FavoriteStar active={fav} onToggle={onFav} label={effect.name} />
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
    </div>
  )
}

function AudioCard({
  effect,
  playing,
  loading,
  adding,
  fav,
  onFav,
  onPreview,
  onAdd,
}: {
  effect: SoundFxEffect | MusicEffect
  playing: boolean
  loading: boolean
  adding: boolean
  fav: boolean
  onFav: () => void
  onPreview: () => void
  onAdd: () => void
}) {
  return (
    <div className={cardClass(false)}>
      <FavoriteStar active={fav} onToggle={onFav} label={effect.name} />
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

/* ---------------- vision / voice / motion / speed cards ---------------- */

function VisionCard({
  effect,
  active,
  fav,
  onFav,
  onApply,
}: {
  effect: VisionEffect
  active: boolean
  fav: boolean
  onFav: () => void
  onApply: () => void
}) {
  return (
    <div {...cardA11y(onApply)} title={effect.name} aria-pressed={active} className={cardClass(active)}>
      <FavoriteStar active={fav} onToggle={onFav} label={effect.name} />
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
    </div>
  )
}

function VoiceCard({
  effect,
  playing,
  loading,
  applying,
  fav,
  onFav,
  onPreview,
  onApply,
}: {
  effect: VoiceFxEffect
  playing: boolean
  loading: boolean
  applying: boolean
  fav: boolean
  onFav: () => void
  onPreview: () => void
  onApply: () => void
}) {
  return (
    <div className={cardClass(false)}>
      <FavoriteStar active={fav} onToggle={onFav} label={effect.name} />
      <button
        type="button"
        title={playing ? 'Stop preview' : 'Preview voice effect'}
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
        <span className="flex items-center justify-center gap-1 px-1 pb-1 pt-0.5 text-center text-[8px] leading-tight text-muted-foreground/70">
          <span className="min-w-0 truncate" title={effect.family}>
            {effect.family}
          </span>
          <span className="shrink-0 rounded-full bg-(--nc-panel-strong) px-1 py-px tabular-nums">
            Mix {Math.round(effect.mix * 100)}%
          </span>
        </span>
      </button>
      <button
        type="button"
        title={`Apply ${effect.name} to the selected audio clip`}
        aria-label={`Apply ${effect.name}`}
        onClick={onApply}
        disabled={applying}
        className="nc-gradient absolute right-1 top-1 flex size-6 items-center justify-center rounded-full text-white shadow-md transition hover:scale-110 disabled:opacity-60"
      >
        {applying ? <Loader2 className="size-3 animate-spin" /> : <Wand2 className="size-3" />}
      </button>
    </div>
  )
}

function MotionCard({
  effect,
  active,
  fav,
  onFav,
  onApply,
}: {
  effect: MotionEffect
  active: boolean
  fav: boolean
  onFav: () => void
  onApply: () => void
}) {
  return (
    <div {...cardA11y(onApply)} title={effect.name} aria-pressed={active} className={cardClass(active)}>
      <FavoriteStar active={fav} onToggle={onFav} label={effect.name} />
      <span className="flex h-12 w-full items-center justify-center bg-(--nc-scrim) text-2xl" aria-hidden>
        {effect.emoji}
      </span>
      <span className="block truncate px-1 pt-1 text-center text-[9px] leading-tight text-muted-foreground">
        {effect.name}
      </span>
      <span className="block truncate px-1 pb-1 text-center text-[8px] leading-tight text-muted-foreground/70">
        {motionDescription(effect)}
      </span>
    </div>
  )
}

function SpeedCard({
  effect,
  active,
  fav,
  onFav,
  onApply,
}: {
  effect: SpeedEffect
  active: boolean
  fav: boolean
  onFav: () => void
  onApply: () => void
}) {
  return (
    <div {...cardA11y(onApply)} title={effect.name} aria-pressed={active} className={cardClass(active)}>
      <FavoriteStar active={fav} onToggle={onFav} label={effect.name} />
      <span className="flex h-12 w-full items-center justify-center bg-(--nc-scrim)" aria-hidden>
        <span
          className={
            active
              ? 'nc-gradient bg-clip-text text-base font-bold text-transparent'
              : 'text-base font-bold text-foreground/85'
          }
        >
          {formatSpeed(effect.speed)}
        </span>
      </span>
      <span className="block truncate px-1 pt-1 text-center text-[9px] leading-tight text-muted-foreground">
        {effect.name}
      </span>
      <span className="block truncate px-1 pb-1 text-center text-[8px] leading-tight text-muted-foreground/70">
        {effect.hint ?? ''}
      </span>
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
  const [voicePreviewId, setVoicePreviewId] = useState<string | null>(null)
  const [voiceLoadingId, setVoiceLoadingId] = useState<string | null>(null)
  const [voiceApplyingId, setVoiceApplyingId] = useState<string | null>(null)
  const previewEndTimer = useRef<number | null>(null)
  const voiceEndTimer = useRef<number | null>(null)

  /* timeline transition chips (and other tools) can deep-link into a category */
  useEffect(() => {
    const applyCategory = (cat: string) => {
      setCategory(cat as CategoryFilter)
      setVisibleCount(PAGE_SIZE)
      setSearch('')
    }
    const openCategory = (e: Event) => {
      const cat = (e as CustomEvent<string>).detail
      if (!cat) return
      // consume the pending deep-link flag so a later mount doesn't reapply it
      ;(window as unknown as { __ncEffectsCategoryRequest?: string }).__ncEffectsCategoryRequest = undefined
      applyCategory(cat)
    }
    window.addEventListener('nc-effects-category', openCategory)
    // the panel may mount AFTER the deep-link fired (tab switch race) — consume it now
    const pending = (window as unknown as { __ncEffectsCategoryRequest?: string }).__ncEffectsCategoryRequest
    if (pending) {
      ;(window as unknown as { __ncEffectsCategoryRequest?: string }).__ncEffectsCategoryRequest = undefined
      applyCategory(pending)
    }
    return () => window.removeEventListener('nc-effects-category', openCategory)
  }, [])

  /* favorites & recent — persisted locally, restored on every mount */
  const [favorites, setFavorites] = useState<string[]>(() => loadIdList(FAVORITES_KEY))
  const [recent, setRecent] = useState<string[]>(() => loadIdList(RECENT_KEY, RECENT_CAP))
  /** per-effect custom controls for voice FX (pitch slider + mix knob) */
  const [customVoice, setCustomVoice] = useState<{ effectId: string; pitch: number; mix: number } | null>(null)

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev]
      saveIdList(FAVORITES_KEY, next)
      return next
    })
  }, [])

  /** Records an apply/add into the Recent rail (deduped, capped). */
  const noteUsed = useCallback((id: string) => {
    setRecent((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, RECENT_CAP)
      saveIdList(RECENT_KEY, next)
      return next
    })
  }, [])

  // leaving the panel must stop any playing preview
  useEffect(() => {
    return () => {
      stopPreview()
      stopVoicePreview()
      if (previewEndTimer.current !== null) window.clearTimeout(previewEndTimer.current)
      if (voiceEndTimer.current !== null) window.clearTimeout(voiceEndTimer.current)
    }
  }, [])

  // new filter context → back to the first page
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [category, search])

  const chips = useMemo(
    () => [
      { id: 'all' as CategoryFilter, label: 'All', emoji: '✨', count: TOTAL_EFFECTS },
      { id: 'favorites' as CategoryFilter, label: 'Favorites', emoji: '⭐', count: favorites.length },
      { id: 'recent' as CategoryFilter, label: 'Recent', emoji: '🕘', count: recent.length },
      ...CATEGORY_CHIPS,
    ],
    [favorites.length, recent.length],
  )

  const results = useMemo(() => {
    if (category === 'favorites' || category === 'recent') {
      const ids = category === 'favorites' ? favorites : recent
      return ids
        .map((id) => getEffect(id))
        .filter((e): e is Effect => e !== undefined)
        .filter((e) => matchesSearch(e, search))
    }
    return searchEffects({ category: category === 'all' ? undefined : category, search: search.trim() || undefined })
  }, [category, search, favorites, recent])
  const visible = useMemo(() => results.slice(0, visibleCount), [results, visibleCount])

  const overlayState = clip?.overlay ?? null
  const overlayMatch = overlayState ? getEffect(overlayState.effectId) : undefined
  const activeOverlay = overlayMatch && overlayMatch.category === 'overlay' ? overlayMatch : null

  const visionState = clip?.vision ?? null
  const visionMatch = visionState ? getEffect(visionState.effectId) : undefined
  const activeVision = visionMatch && visionMatch.category === 'vision' ? visionMatch : null

  /** The voice effect whose custom controls (pitch + mix) are on screen. */
  const customVoiceEffect = useMemo(() => {
    if (!customVoice) return undefined
    const e = getEffect(customVoice.effectId)
    return e && e.category === 'voice' ? e : undefined
  }, [customVoice])

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
      noteUsed(effect.id)
      toast(`Color · ${effect.name}`)
    },
    [clip, updateClip, noteUsed]
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
      noteUsed(effect.id)
      toast.success(`Transition applied · ${formatDuration(effect.duration)}`)
    },
    [clip, updateClip, noteUsed]
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
      noteUsed(effect.id)
      toast(`Text effect · ${effect.name}`)
    },
    [clip, updateClip, noteUsed]
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
      noteUsed(effect.id)
      toast(`Overlay · ${effect.name}`)
    },
    [clip, updateClip, noteUsed]
  )

  const removeOverlay = useCallback(() => {
    if (!clip) return
    updateClip(clip.id, { overlay: null }, true)
    toast('Overlay removed')
  }, [clip, updateClip])

  /* ---------- apply: vision (tap active card again to remove) ---------- */
  const applyVision = useCallback(
    (effect: VisionEffect) => {
      // Vision post-FX operate on media pixels — the engine intentionally skips
      // text/sticker clips (they draw straight to the main canvas).
      if (!clip || !(clip.kind === 'video' || clip.kind === 'image')) {
        toast('Vision FX work on video & image clips')
        return
      }
      if (clip.vision?.effectId === effect.id) {
        updateClip(clip.id, { vision: null }, true)
        toast('Vision effect removed')
        return
      }
      updateClip(clip.id, { vision: { effectId: effect.id, intensity: effect.intensity } }, true)
      noteUsed(effect.id)
      toast(`Vision · ${effect.name}`)
    },
    [clip, updateClip, noteUsed]
  )

  const removeVision = useCallback(() => {
    if (!clip) return
    updateClip(clip.id, { vision: null }, true)
    toast('Vision effect removed')
  }, [clip, updateClip])

  /* ---------- apply: motion (camera preset, may replace keyframes) ---------- */
  const applyMotion = useCallback(
    (effect: MotionEffect) => {
      if (!clip) {
        toast('Select a clip first')
        return
      }
      if (clip.kind === 'audio') {
        toast('Motion presets need a visual clip')
        return
      }
      // Replaces any existing transform keyframes — same coalesce-key pattern as
      // transitions so a preset tap is one undoable step.
      updateClip(
        clip.id,
        {
          motion: effect.motion,
          motionIntensity: effect.motionIntensity,
          keyframes: (effect.keys ?? []).map((k) => ({
            id: uid('kf'),
            property: k.property,
            time: k.at * clip.duration,
            value: k.value,
            easing: k.easing,
          })),
        },
        `motion-${clip.id}-${effect.id}`
      )
      noteUsed(effect.id)
      toast('Motion preset applied')
    },
    [clip, updateClip, noteUsed]
  )

  /* ---------- apply: speed (media clips only, duration compensated) ---------- */
  const applySpeed = useCallback(
    (effect: SpeedEffect) => {
      if (!clip) {
        toast('Select a clip first')
        return
      }
      if (clip.kind === 'text' || clip.kind === 'sticker' || !Number.isFinite(clip.sourceDuration)) {
        toast('Speed applies to media clips')
        return
      }
      // Same compensation as the speed slider below: timeline duration scales
      // with the speed ratio (== (sourceDuration − trimStart) / newSpeed),
      // keeping trimStart untouched.
      const newDuration = round2(Math.max(0.1, (clip.duration * clip.speed) / effect.speed))
      updateClip(clip.id, { speed: effect.speed, duration: newDuration }, `speed-${clip.id}`)
      noteUsed(effect.id)
      toast(`Speed set to ${formatSpeed(effect.speed)}`)
    },
    [clip, updateClip, noteUsed]
  )

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
      // only one preview at a time across sound/music AND voice
      stopVoicePreview()
      setVoicePreviewId(null)
      if (voiceEndTimer.current !== null) {
        window.clearTimeout(voiceEndTimer.current)
        voiceEndTimer.current = null
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
        noteUsed(effect.id)
        toast.success('Added to library')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Audio render failed')
      } finally {
        setAddingId(null)
      }
    },
    [addingId, addMediaAsset, noteUsed]
  )

  /* ---------- voice: preview toggle (short ~2.4s snippet) ---------- */
  const toggleVoicePreview = useCallback(
    async (effect: VoiceFxEffect) => {
      if (voiceLoadingId !== null && voiceLoadingId !== effect.id) return
      const clearEndTimer = () => {
        if (voiceEndTimer.current !== null) {
          window.clearTimeout(voiceEndTimer.current)
          voiceEndTimer.current = null
        }
      }
      // only one preview at a time across sound/music AND voice
      stopPreview()
      setPreviewId(null)
      if (previewEndTimer.current !== null) {
        window.clearTimeout(previewEndTimer.current)
        previewEndTimer.current = null
      }
      if (voicePreviewId === effect.id) {
        stopVoicePreview()
        clearEndTimer()
        setVoicePreviewId(null)
        return
      }
      stopVoicePreview()
      clearEndTimer()
      setVoiceLoadingId(effect.id)
      // tapping a voice card opens its custom controls (pitch + mix), seeded
      // from the definition; previously-tweaked values are remembered
      setCustomVoice((cv) =>
        cv && cv.effectId === effect.id ? cv : { effectId: effect.id, pitch: effect.spec.pitch ?? 0, mix: effect.mix },
      )
      try {
        const overrides =
          customVoice && customVoice.effectId === effect.id
            ? { pitch: customVoice.pitch, mix: customVoice.mix }
            : undefined
        await previewVoiceEffect(effect, overrides)
        setVoicePreviewId(effect.id)
        voiceEndTimer.current = window.setTimeout(() => {
          setVoicePreviewId((cur) => (cur === effect.id ? null : cur))
        }, VOICE_PREVIEW_MS)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Voice preview failed')
      } finally {
        setVoiceLoadingId(null)
      }
    },
    [voiceLoadingId, voicePreviewId, customVoice]
  )

  /** Re-renders the custom-controlled preview after a slider commit/reset. */
  const rePreviewCustomVoice = useCallback(
    async (override?: { effectId: string; pitch: number; mix: number }) => {
      const cv = override ?? customVoice
      if (!cv) return
      const effect = getEffect(cv.effectId)
      if (!effect || effect.category !== 'voice') return
      try {
        await previewVoiceEffect(effect, { pitch: cv.pitch, mix: cv.mix })
        setVoicePreviewId(effect.id)
        if (voiceEndTimer.current !== null) window.clearTimeout(voiceEndTimer.current)
        voiceEndTimer.current = window.setTimeout(() => {
          setVoicePreviewId((cur) => (cur === effect.id ? null : cur))
        }, VOICE_PREVIEW_MS)
      } catch {
        // slider-commit re-previews are best-effort
      }
    },
    [customVoice]
  )

  /** Restore the definition defaults (pitch + mix) and re-preview. */
  const resetCustomVoice = useCallback(() => {
    setCustomVoice((cv) => {
      if (!cv) return cv
      const e = getEffect(cv.effectId)
      if (!e || e.category !== 'voice') return cv
      const target = { effectId: cv.effectId, pitch: e.spec.pitch ?? 0, mix: e.mix }
      void rePreviewCustomVoice(target)
      return target
    })
  }, [rePreviewCustomVoice])

  /* ---------- voice: apply — offline DSP the source audio → new clip audio ----------
   * Audio clips: the processed render replaces the clip's audio in place.
   * Video clips: extract-to-track — the processed audio lands as a NEW clip on
   * an audio track at the same start, and the video's own audio is silenced
   * (volume 0 — the engine's per-clip mute path) in the same undo step. */
  const applyVoiceFx = useCallback(
    async (effect: VoiceFxEffect) => {
      if (voiceApplyingId !== null) return
      if (!clip || (clip.kind !== 'audio' && clip.kind !== 'video')) {
        toast('Voice FX need an audio or video clip — select one first')
        return
      }
      const sourceAsset = useEditor.getState().media.find((m) => m.id === clip.mediaId)
      if (!sourceAsset) {
        toast.error('Source media for this clip was not found')
        return
      }
      setVoiceApplyingId(effect.id)
      try {
        const overrides =
          customVoice && customVoice.effectId === effect.id
            ? { pitch: customVoice.pitch, mix: customVoice.mix }
            : undefined
        // Render exactly the clip's trimmed source window (trim in-point +
        // timeline duration · speed = source seconds), so the processed swap
        // keeps the timeline edit intact instead of restoring the full take.
        // For video blobs decodeAudioData extracts the embedded audio track.
        const rendered = await renderVoiceToWav(sourceAsset.rawBlob, effect, {
          offset: clip.trimStart,
          duration: clip.duration * clip.speed,
          ...(overrides ?? {}),
        })
        const file = new File([rendered.blob], `voice-${effect.id}.wav`, { type: 'audio/wav' })
        const assets = await importFiles([file])
        if (assets.length === 0) {
          toast.error('Could not import the processed audio — try again')
          return
        }
        const newAsset = assets[0]
        assets.forEach(addMediaAsset)
        noteUsed(effect.id)

        if (clip.kind === 'video') {
          const st = useEditor.getState()
          let audioTrack = st.project.tracks.find((t) => t.kind === 'audio' && !t.locked) ?? st.project.tracks.find((t) => t.kind === 'audio')
          if (!audioTrack) {
            st.addTrack('audio')
            audioTrack = useEditor.getState().project.tracks.find((t) => t.kind === 'audio')
          }
          if (!audioTrack) throw new Error('Could not find or create an audio track')
          const audioClip = createClipFromMedia(useEditor.getState().project, newAsset, audioTrack.id, clip.start)
          audioClip.name = `${effect.name} (voice FX)`
          // addClip pushes the history snapshot; the volume-0 patch below has
          // no history flag, so ONE undo reverts clip + mute together
          useEditor.getState().addClip(audioClip)
          updateClip(clip.id, { volume: 0, muted: true })
          toast.success('Audio extracted with voice FX — video audio muted (undo reverts both)')
        } else {
          // swap the clip's audio to the processed render — one undoable step.
          // speed resets to 1: the render already covers the source window.
          updateClip(
            clip.id,
            {
              mediaId: newAsset.id,
              duration: newAsset.duration,
              sourceDuration: newAsset.duration,
              trimStart: 0,
              speed: 1,
              name: `${effect.name} (voice FX)`,
            },
            true
          )
          toast.success('Voice effect applied — undo restores the original')
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Voice effect failed')
      } finally {
        setVoiceApplyingId(null)
      }
    },
    [voiceApplyingId, clip, customVoice, addMediaAsset, updateClip, noteUsed]
  )

  /* ---------- card switch ---------- */
  const renderCard = (effect: Effect) => {
    const fav = favorites.includes(effect.id)
    const onFav = () => toggleFavorite(effect.id)
    switch (effect.category) {
      case 'color':
        return (
          <ColorCard
            key={effect.id}
            effect={effect}
            active={clip ? colorEffectActive(clip, effect) : false}
            fav={fav}
            onFav={onFav}
            onApply={() => applyColor(effect)}
          />
        )
      case 'transition':
        return <TransitionCard key={effect.id} effect={effect} fav={fav} onFav={onFav} onApply={() => applyTransition(effect)} />
      case 'text':
        return (
          <TextCard
            key={effect.id}
            effect={effect}
            active={clip ? textEffectActive(clip, effect) : false}
            fav={fav}
            onFav={onFav}
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
            fav={fav}
            onFav={onFav}
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
            fav={fav}
            onFav={onFav}
            onApply={() => applyOverlay(effect)}
          />
        )
      case 'vision':
        return (
          <VisionCard
            key={effect.id}
            effect={effect}
            active={clip?.vision?.effectId === effect.id}
            fav={fav}
            onFav={onFav}
            onApply={() => applyVision(effect)}
          />
        )
      case 'voice':
        return (
          <VoiceCard
            key={effect.id}
            effect={effect}
            playing={voicePreviewId === effect.id}
            loading={voiceLoadingId === effect.id}
            applying={voiceApplyingId === effect.id}
            fav={fav}
            onFav={onFav}
            onPreview={() => void toggleVoicePreview(effect)}
            onApply={() => void applyVoiceFx(effect)}
          />
        )
      case 'motion':
        return (
          <MotionCard
            key={effect.id}
            effect={effect}
            active={clip ? motionEffectActive(clip, effect) : false}
            fav={fav}
            onFav={onFav}
            onApply={() => applyMotion(effect)}
          />
        )
      case 'speed':
        return (
          <SpeedCard
            key={effect.id}
            effect={effect}
            active={clip?.speed === effect.speed}
            fav={fav}
            onFav={onFav}
            onApply={() => applySpeed(effect)}
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
        {TOTAL_EFFECTS >= 1000 ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-(--nc-line) bg-(--nc-panel) px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
            <span aria-hidden className="nc-gradient bg-clip-text text-transparent">
              PRO
            </span>
            <span className="tabular-nums">· {TOTAL_EFFECTS} effects</span>
          </span>
        ) : (
          <span className="nc-gradient shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold text-white">
            {TOTAL_EFFECTS} effects
          </span>
        )}
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

      {/* ---------- category chips (All / Favorites / Recent + 10 categories) ---------- */}
      <div className="-mx-0.5 flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {chips.map((chip) => {
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
              <span aria-hidden className="text-[10px] opacity-70">
                {chip.emoji}
              </span>
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
          <p className="mt-3 text-sm font-medium">
            {category === 'favorites' && favorites.length === 0
              ? 'No favorites yet'
              : category === 'recent' && recent.length === 0
                ? 'Nothing used yet'
                : 'No effects match'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {category === 'favorites' && favorites.length === 0
              ? 'Tap the star on any effect card to pin it here.'
              : category === 'recent' && recent.length === 0
                ? 'Applied and rendered effects show up in Recent.'
                : 'Try a different search or category.'}
          </p>
          {!(
            (category === 'favorites' && favorites.length === 0) ||
            (category === 'recent' && recent.length === 0)
          ) && (
            <Button variant="outline" size="sm" className="mt-3 h-8 rounded-lg text-xs" onClick={clearSearchFilters}>
              Clear search
            </Button>
          )}
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
          Replaces transform keyframes on both clips — transitions need a following clip on the same track. Fades become true crossfades over the cut; wipe transitions reveal through an animated mask.
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

      {/* ---------- active vision controls (same UX as overlays) ---------- */}
      {clip && visionState && activeVision && (
        <section className="nc-glass space-y-2.5 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <SectionTitle>Active vision effect</SectionTitle>
            <button
              type="button"
              onClick={removeVision}
              className="text-[10px] font-medium text-rose-300 transition hover:text-rose-200"
            >
              Remove
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base" aria-hidden>
              {activeVision.emoji}
            </span>
            <span className="truncate text-[11px] text-foreground/90" title={activeVision.name}>
              {activeVision.name}
            </span>
          </div>
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={[visionState.intensity]}
            onValueChange={(v) =>
              updateClip(
                clip.id,
                { vision: { effectId: visionState.effectId, intensity: v[0] ?? visionState.intensity } },
                `vision-intensity-${activeVision.id}`
              )
            }
          />
        </section>
      )}

      {/* ---------- voice FX custom controls (pitch + mix, re-previews on release) ---------- */}
      {customVoice && customVoiceEffect && (
        <section className="nc-glass space-y-2.5 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <SectionTitle>Voice FX controls</SectionTitle>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetCustomVoice}
                className="text-[10px] font-medium text-muted-foreground transition hover:text-foreground"
              >
                Reset
              </button>
              <button
                type="button"
                aria-label="Close voice controls"
                onClick={() => setCustomVoice(null)}
                className="text-muted-foreground transition hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base" aria-hidden>
              {customVoiceEffect.emoji}
            </span>
            <span className="truncate text-[11px] text-foreground/90" title={customVoiceEffect.name}>
              {customVoiceEffect.name}
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-foreground/80">Pitch</span>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {customVoice.pitch > 0 ? `+${customVoice.pitch}` : customVoice.pitch} st
              </span>
            </div>
            <Slider
              min={-12}
              max={12}
              step={1}
              value={[customVoice.pitch]}
              aria-label="Voice pitch in semitones"
              onValueChange={(v) =>
                setCustomVoice((cv) =>
                  cv && cv.effectId === customVoiceEffect.id ? { ...cv, pitch: v[0] ?? 0 } : cv
                )
              }
              onValueCommit={() => void rePreviewCustomVoice()}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-foreground/80">Mix (dry / wet)</span>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {Math.round(customVoice.mix * 100)}%
              </span>
            </div>
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={[customVoice.mix]}
              aria-label="Voice effect mix"
              onValueChange={(v) =>
                setCustomVoice((cv) =>
                  cv && cv.effectId === customVoiceEffect.id ? { ...cv, mix: v[0] ?? 0 } : cv
                )
              }
              onValueCommit={() => void rePreviewCustomVoice()}
            />
          </div>
          <p className="text-[9px] leading-snug text-muted-foreground/70">
            Preview re-renders when you release a slider — Apply bakes these settings into the clip.
          </p>
          <Button
            type="button"
            size="sm"
            disabled={voiceApplyingId !== null}
            onClick={() => void applyVoiceFx(customVoiceEffect)}
            className="nc-gradient h-8 w-full rounded-lg text-xs text-white"
          >
            {voiceApplyingId !== null ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Applying…
              </>
            ) : (
              'Apply to selected clip'
            )}
          </Button>
        </section>
      )}

      {/* ---------- clip-dependent tools (motion / fades / speed) ---------- */}
      {renderClipTools()}
    </div>
  )
}
