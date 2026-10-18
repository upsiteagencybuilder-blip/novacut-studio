'use client'

/**
 * Audio mixer — per-track faders (0..×1.5), mute switches and a live
 * master output peak meter driven by the engine analyser.
 */
import { useEffect, useRef } from 'react'
import { AudioLines, Film, Layers, SlidersVertical, Volume2, VolumeX } from 'lucide-react'
import { useEditor } from '@/lib/editor/store'
import { getEngine } from '@/lib/editor/engine'
import type { Track } from '@/lib/editor/types'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'

const VIOLET_GRADIENT = 'linear-gradient(90deg, #8b5cf6, #e879f9)'
const ROSE_GRADIENT = 'linear-gradient(90deg, #f43f5e, #fb7185)'

/** Live master peak meter — polls the engine analyser every animation frame. */
function MasterMeter() {
  const barRef = useRef<HTMLDivElement>(null)

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
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
  }, [])

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

  const isAudio = track.kind === 'audio'
  const volume = track.volume ?? 1
  const KindIcon = track.kind === 'video' ? Film : track.kind === 'overlay' ? Layers : AudioLines

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border p-2.5',
        isAudio ? 'border-emerald-400/25 bg-emerald-500/[0.06]' : 'border-(--nc-line) bg-(--nc-panel-soft)'
      )}
    >
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

      <button
        type="button"
        title={track.muted ? 'Unmute track' : 'Mute track'}
        onClick={() => updateTrack(track.id, { muted: !track.muted }, true)}
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
            Balance your track faders (up to ×1.5) and watch the master output live.
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
              Output level — past the rose zone it&apos;s clipping.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default MixerDialog
