'use client'

/**
 * Audio mixer — per-track faders (0..×1.5), mute + solo switches, per-track
 * 3-band EQ (Day 23), live per-track level meters and a master output meter
 * (dB scale + peak hold) driven by the engine analysers.
 */
import { useEffect, useRef, useState } from 'react'
import { AudioLines, ChevronDown, Film, Headphones, Layers, SlidersVertical, Volume2, VolumeX } from 'lucide-react'
import { useEditor } from '@/lib/editor/store'
import { getEngine } from '@/lib/editor/engine'
import type { Track } from '@/lib/editor/types'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'

const VIOLET_GRADIENT = 'linear-gradient(90deg, #8b5cf6, #e879f9)'
const ROSE_GRADIENT = 'linear-gradient(90deg, #f43f5e, #fb7185)'

/** Live master peak meter with peak-hold marker and a dB tick scale. */
function MasterMeter() {
  const barRef = useRef<HTMLDivElement>(null)
  const peakRef = useRef<HTMLDivElement>(null)
  const peak = useRef(0)

  useEffect(() => {
    let raf = 0
    let alive = true
    const tick = () => {
      if (!alive) return
      let level = 0
      try {
        level = getEngine().getMasterLevel()
      } catch {
        level = 0
      }
      const el = barRef.current
      if (el) {
        el.style.width = `${Math.round(Math.min(1, Math.max(0, level)) * 100)}%`
        el.style.background = level > 0.85 ? ROSE_GRADIENT : VIOLET_GRADIENT
      }
      // falling peak-hold (drops ~7%/frame after a new peak)
      if (level >= peak.current) peak.current = level
      else peak.current = Math.max(level, peak.current - 0.006)
      if (peakRef.current) {
        peakRef.current.style.left = `${Math.round(Math.min(1, Math.max(0, peak.current)) * 100)}%`
        peakRef.current.style.opacity = peak.current > 0.02 ? '1' : '0'
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-(--nc-panel-strong)">
        <div
          ref={barRef}
          className="h-full rounded-full"
          style={{ width: '0%', background: VIOLET_GRADIENT }}
        />
        {/* peak-hold marker */}
        <div
          ref={peakRef}
          className="absolute top-0 h-full w-0.5 bg-white/80 transition-opacity"
          style={{ left: '0%', opacity: 0 }}
          aria-hidden
        />
        {/* dB ticks: -40 / -20 / -12 / -6 dB on the linear scale */}
        {[1, 10, 25, 50].map((pct) => (
          <div
            key={pct}
            className="absolute top-0 h-full w-px bg-white/25"
            style={{ left: `${pct}%` }}
            aria-hidden
          />
        ))}
      </div>
      <div className="mt-0.5 flex justify-between font-mono text-[8px] leading-none text-muted-foreground/60">
        <span>-∞</span>
        <span className="ml-[10%]">-40</span>
        <span className="ml-[8%]">-20</span>
        <span className="ml-[10%]">-12</span>
        <span className="ml-[12%]">-6</span>
        <span>0dB</span>
      </div>
    </div>
  )
}

/** Live per-track level meter — polls the engine's per-entry analysers. */
function TrackMeter({ trackId }: { trackId: string }) {
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    let alive = true
    const tick = () => {
      if (!alive) return
      let level = 0
      try {
        level = getEngine().getTrackLevel(trackId)
      } catch {
        level = 0
      }
      const el = barRef.current
      if (el) {
        el.style.width = `${Math.round(Math.min(1, Math.max(0, level)) * 100)}%`
        el.style.background = level > 0.85 ? ROSE_GRADIENT : VIOLET_GRADIENT
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
  }, [trackId])

  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-(--nc-panel-strong)">
      <div
        ref={barRef}
        className="h-full rounded-full"
        style={{ width: '0%', background: VIOLET_GRADIENT }}
      />
    </div>
  )
}

function TrackFaderRow({ track }: { track: Track }) {
  const setTrackVolume = useEditor((s) => s.setTrackVolume)
  const updateTrack = useEditor((s) => s.updateTrack)
  const setTrackSolo = useEditor((s) => s.setTrackSolo)

  const isAudio = track.kind === 'audio'
  const volume = track.volume ?? 1
  const KindIcon = track.kind === 'video' ? Film : track.kind === 'overlay' ? Layers : AudioLines

  return (
    <div
      className={cn(
        'rounded-xl border p-2.5',
        track.solo
          ? 'border-amber-400/40 bg-amber-500/[0.07]'
          : isAudio
            ? 'border-emerald-400/25 bg-emerald-500/[0.06]'
            : 'border-(--nc-line) bg-(--nc-panel-soft)'
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            isAudio ? 'bg-emerald-500/15' : 'bg-(--nc-panel)'
          )}
        >
          <KindIcon className={cn('size-4', isAudio ? 'text-emerald-300' : 'text-fuchsia-300')} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-xs font-medium">{track.name}</span>
            <span className="w-12 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
              ×{volume.toFixed(2)}
            </span>
          </div>
          <Slider
            min={0}
            max={1.5}
            step={0.01}
            value={[volume]}
            onValueChange={(v) => setTrackVolume(track.id, v[0] ?? 1, `mixer-${track.id}`)}
            className="mt-1.5"
            aria-label={`${track.name} volume`}
          />
        </div>

        {/* solo — isolate this track while everything else goes silent */}
        <button
          type="button"
          title={track.solo ? 'Remove solo' : 'Solo — hear only this track'}
          onClick={() => setTrackSolo(track.id, !track.solo)}
          aria-pressed={!!track.solo}
          aria-label={`${track.solo ? 'Unsolo' : 'Solo'} ${track.name}`}
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition',
            track.solo
              ? 'bg-amber-500/20 text-amber-300'
              : 'bg-(--nc-panel) text-muted-foreground hover:bg-(--nc-panel-strong) hover:text-foreground'
          )}
        >
          <Headphones className="size-4" />
        </button>

        <button
          type="button"
          title={track.muted ? 'Unmute track' : 'Mute track'}
          onClick={() => updateTrack(track.id, { muted: !track.muted }, true)}
          aria-label={`${track.muted ? 'Unmute' : 'Mute'} ${track.name}`}
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition',
            track.muted
              ? 'bg-rose-500/15 text-rose-400'
              : 'bg-(--nc-panel) text-muted-foreground hover:bg-(--nc-panel-strong) hover:text-foreground'
          )}
        >
          {track.muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </button>
      </div>

      {/* Day 23 — per-track 3-band EQ (engine + offline mixdown both route through it) */}
      <TrackEq track={track} updateTrack={updateTrack} />

      {/* live track output */}
      <div className="mt-2 flex items-center gap-2">
        <span className="w-10 shrink-0 text-[9px] uppercase tracking-wider text-muted-foreground/60">Level</span>
        <TrackMeter trackId={track.id} />
      </div>
    </div>
  )
}

/** Day 23 — per-track 3-band EQ disclosure (low shelf 200 / mid peak 1.2k / high shelf 4.2k). */
function TrackEq({ track, updateTrack }: { track: Track; updateTrack: (id: string, patch: Partial<Track>, history?: boolean | string) => void }) {
  const [open, setOpen] = useState(false)
  const low = track.eqLow ?? 0
  const mid = track.eqMid ?? 0
  const high = track.eqHigh ?? 0
  const any = low !== 0 || mid !== 0 || high !== 0
  const bands: { key: 'eqLow' | 'eqMid' | 'eqHigh'; label: string; value: number }[] = [
    { key: 'eqLow', label: 'Low', value: low },
    { key: 'eqMid', label: 'Mid', value: mid },
    { key: 'eqHigh', label: 'High', value: high },
  ]
  return (
    <div className="mt-2" data-nc-track-eq>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-nc-track-eq-toggle
        className="flex w-full items-center gap-1.5 text-[9px] uppercase tracking-wider text-muted-foreground/70 transition hover:text-foreground"
      >
        <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} />
        EQ
        <span
          className={cn(
            'rounded border px-1 py-px text-[8px] normal-case tracking-normal',
            any ? 'border-emerald-400/40 text-emerald-300' : 'border-(--nc-line) text-muted-foreground/60'
          )}
          data-nc-track-eq-state
        >
          {any ? `L${low > 0 ? '+' : ''}${low} M${mid > 0 ? '+' : ''}${mid} H${high > 0 ? '+' : ''}${high}` : 'flat'}
        </span>
        {any && (
          <span
            role="button"
            tabIndex={0}
            className="ml-auto normal-case tracking-normal underline-offset-2 hover:text-foreground hover:underline"
            onClick={(e) => {
              e.stopPropagation()
              updateTrack(track.id, { eqLow: 0, eqMid: 0, eqHigh: 0 }, 'track-eq')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation()
                updateTrack(track.id, { eqLow: 0, eqMid: 0, eqHigh: 0 }, 'track-eq')
              }
            }}
            data-nc-track-eq-reset
          >
            Reset
          </span>
        )}
      </button>
      {open && (
        <div className="mt-1.5 space-y-1">
          {bands.map((b) => (
            <div key={b.key} className="flex items-center gap-2">
              <span className="w-8 shrink-0 text-[9px] text-muted-foreground">{b.label}</span>
              <Slider
                min={-24}
                max={24}
                step={1}
                value={[b.value]}
                onValueChange={(v) => updateTrack(track.id, { [b.key]: v[0] ?? 0 }, 'track-eq')}
                className="flex-1"
                aria-label={`${track.name} ${b.label} EQ`}
                data-nc-track-eq-band={b.key}
              />
              <span className="w-9 text-right font-mono text-[9px] tabular-nums text-muted-foreground">
                {b.value > 0 ? '+' : ''}
                {b.value}dB
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function MixerDialog() {
  const open = useEditor((s) => s.activeDialog === 'mixer')
  const tracks = useEditor((s) => s.project.tracks)
  const masterVolume = useEditor((s) => s.masterVolume)
  const masterMuted = useEditor((s) => s.masterMuted)
  const setMasterVolume = useEditor((s) => s.setMasterVolume)
  const toggleMasterMuted = useEditor((s) => s.toggleMasterMuted)
  const openDialog = useEditor((s) => s.openDialog)

  const effectiveMaster = masterMuted ? 0 : masterVolume

  return (
    <Dialog open={open} onOpenChange={(o) => !o && openDialog(null)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <SlidersVertical className="h-4 w-4 text-fuchsia-400" />
            Audio mixer
          </DialogTitle>
          <DialogDescription>
            Balance track faders, solo a track (headphones) to isolate it, and watch the live output meters.
          </DialogDescription>
        </DialogHeader>

        {/* per-track faders */}
        <div className="max-h-[300px] space-y-2 overflow-y-auto pr-0.5">
          {tracks.map((track) => (
            <TrackFaderRow key={track.id} track={track} />
          ))}
        </div>

        {/* master row */}
        <div className="nc-glass space-y-2 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Master</span>
            <span className="ml-auto w-12 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
              ×{effectiveMaster.toFixed(2)}
            </span>
            <button
              type="button"
              title={masterMuted ? 'Unmute master' : 'Mute master'}
              onClick={toggleMasterMuted}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-lg transition',
                masterMuted
                  ? 'bg-rose-500/15 text-rose-400'
                  : 'bg-(--nc-panel) text-muted-foreground hover:bg-(--nc-panel-strong) hover:text-foreground'
              )}
            >
              {masterMuted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
            </button>
          </div>

          <Slider
            min={0}
            max={1}
            step={0.01}
            value={[effectiveMaster]}
            onValueChange={(v) => setMasterVolume(v[0] ?? 1)}
            aria-label="Master volume"
          />

          <div className="space-y-1 pt-0.5">
            <MasterMeter />
            <p className="text-[10px] text-muted-foreground">
              Output level with peak hold — past the rose zone it&apos;s clipping.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default MixerDialog
