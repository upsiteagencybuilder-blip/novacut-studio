'use client'

/**
 * Effects panel — applies filter presets, Ken Burns motion, fades and speed
 * to the currently selected timeline clip.
 */
import { useCallback } from 'react'
import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Slider } from '@/components/ui/slider'
import { DEFAULT_FILTERS, FILTER_PRESETS, MOTION_PRESETS } from '@/lib/editor/constants'
import type { FilterPreset } from '@/lib/editor/constants'
import { useEditor } from '@/lib/editor/store'
import { round2 } from '@/lib/editor/utils'
import type { Clip, Filters } from '@/lib/editor/types'

/** Shallow-compare the keys inside the preset patch against the clip filters */
function filterPresetActive(clip: Clip, preset: FilterPreset): boolean {
  const keys = Object.keys(preset.patch) as (keyof Filters)[]
  if (keys.length === 0) {
    // "Original" — active when every filter equals its default value
    return (Object.keys(DEFAULT_FILTERS) as (keyof Filters)[]).every(
      (k) => clip.filters[k] === DEFAULT_FILTERS[k]
    )
  }
  return keys.every((k) => clip.filters[k] === preset.patch[k])
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  )
}

export function EffectsPanel() {
  const selected = useEditor((s) => s.project.clips.find((c) => c.id === s.selectedClipIds[0]))
  const updateClip = useEditor((s) => s.updateClip)

  const applyFilter = useCallback(
    (clipId: string, preset: FilterPreset) => {
      updateClip(clipId, { filters: { ...DEFAULT_FILTERS, ...preset.patch } }, true)
      toast(`Filter: ${preset.name}`)
    },
    [updateClip]
  )

  /* ---------- empty state ---------- */
  if (!selected) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-(--nc-line) bg-(--nc-panel)">
          <Sparkles className="size-6 text-fuchsia-300" />
        </span>
        <p className="mt-3 text-sm font-medium">Select a clip on the timeline to apply effects</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Filters, motion, fades and speed show up here once you pick a clip.
        </p>
      </div>
    )
  }

  const clip = selected
  const showMotion = clip.kind === 'video' || clip.kind === 'image'
  const showSpeed = clip.kind === 'video' || clip.kind === 'audio'

  return (
    <div className="space-y-4">
      {/* selected clip chip */}
      <div className="flex w-fit max-w-full items-center gap-1.5 rounded-full border border-(--nc-line) bg-(--nc-panel) px-2.5 py-1">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: clip.color }}
          aria-hidden
        />
        <span className="truncate text-[11px] text-foreground/90" title={clip.name}>
          {clip.name}
        </span>
      </div>

      {/* ---------- filter presets ---------- */}
      <section className="space-y-1.5">
        <SectionTitle>Filter presets</SectionTitle>
        <div className="grid grid-cols-3 gap-1.5">
          {FILTER_PRESETS.map((preset) => {
            const active = filterPresetActive(clip, preset)
            return (
              <button
                key={preset.id}
                type="button"
                title={preset.name}
                onClick={() => applyFilter(clip.id, preset)}
                className={
                  active
                    ? 'overflow-hidden rounded-lg border border-fuchsia-400/80 shadow-[0_0_10px_var(--nc-accent-glow-soft)] transition'
                    : 'cursor-pointer overflow-hidden rounded-lg border border-(--nc-line) transition hover:border-fuchsia-400/60'
                }
              >
                <span
                  className="block h-12 w-full"
                  style={{
                    background: 'linear-gradient(120deg,#a855f7,#d946ef,#fb923c)',
                    filter: preset.css,
                  }}
                  aria-hidden
                />
                <span className="block truncate py-0.5 text-center text-[9px] text-muted-foreground">
                  {preset.name}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* ---------- motion (Ken Burns) ---------- */}
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

      {/* ---------- fades ---------- */}
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

      {/* ---------- speed ---------- */}
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
    </div>
  )
}
