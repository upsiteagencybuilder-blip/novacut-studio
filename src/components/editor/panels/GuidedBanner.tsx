'use client'

/**
 * UX60 Phase 3 (Days 19-20) — step-by-step guided mode.
 *
 * Applying a task template starts a 5-step walkthrough. A glass banner sits
 * under the header, an amber ring highlights the CURRENT step's real UI
 * target (data-nc-guided attributes), and every step watches the live store
 * for its completion signal — swap a clip, restyle a title, add music, play,
 * export — and auto-advances with an honest toast. Back/Next/Skip stay
 * available: the user is always in control, auto-advance is a convenience,
 * never a gate.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { getTaskTemplate } from '@/lib/task-templates'
import { useEditor } from '@/lib/editor/store'
import { cn } from '@/lib/utils'

interface Box {
  top: number
  left: number
  width: number
  height: number
}

/** what a step looks at to decide "done" — honest live-store signals */
type DoneCheck = (snap: { isPlaying: boolean; phase: string; time: number }) => boolean

/** per-step completion checks; baselines resolved against snapshotAtStart */
const DONE_CHECKS: DoneCheck[] = [
  // 0 · timeline — a NEW real video/image clip appeared (placeholder swapped in)
  () => {
    const s = useEditor.getState()
    const base = readBaseline()
    return s.project.clips.some((c) => (c.kind === 'video' || c.kind === 'image') && !!c.mediaId && !base.visualIds.has(c.id))
  },
  // 1 · preview — any text clip's style changed since the walkthrough started
  () => {
    const s = useEditor.getState()
    const base = readBaseline()
    return s.project.clips.some((c) => {
      if (c.kind !== 'text') return false
      const before = base.styles[c.id]
      return before !== undefined && JSON.stringify(c.textStyle) !== before
    })
  },
  // 2 · audio — a real music track landed (audio clip gained a mediaId)
  () => {
    const s = useEditor.getState()
    const base = readBaseline()
    return s.project.clips.some((c) => c.kind === 'audio' && !!c.mediaId && !base.audioIds.has(c.id))
  },
  // 3 · play — playback actually advanced ≥0.6s while guiding
  (snap) => snap.isPlaying && snap.time > readBaseline().playTime + 0.6,
  // 4 · export — the export pipeline reached its done phase
  (snap) => snap.phase === 'done',
]

/* baseline captured when the walkthrough mounts (per-template-instance) */
const baseline = {
  styles: {} as Record<string, string>,
  audioIds: new Set<string>(),
  visualIds: new Set<string>(),
  playTime: 0,
}
function readBaseline() {
  return baseline
}

export function GuidedBanner() {
  const guided = useEditor((s) => s.guided)
  const ready = useEditor((s) => s.ready)
  const [box, setBox] = useState<Box | null>(null)
  const [pulsing, setPulsing] = useState(false)
  const snapshotDone = useRef(false)

  const step = guided?.step ?? 0
  const template = guided ? getTaskTemplate(guided.templateId) : undefined
  const steps = template?.steps ?? []
  const current = steps[step]

  /* capture the baseline ONCE per walkthrough — what "changed" is measured against */
  useEffect(() => {
    if (!guided) {
      snapshotDone.current = false
      return
    }
    if (snapshotDone.current) return
    snapshotDone.current = true
    const s = useEditor.getState()
    baseline.styles = {}
    for (const c of s.project.clips) if (c.kind === 'text') baseline.styles[c.id] = JSON.stringify(c.textStyle)
    baseline.audioIds = new Set(s.project.clips.filter((c) => c.kind === 'audio').map((c) => c.id))
    baseline.visualIds = new Set(s.project.clips.filter((c) => (c.kind === 'video' || c.kind === 'image') && c.mediaId).map((c) => c.id))
    baseline.playTime = s.currentTime
  }, [guided])

  /* locate the amber ring on the current step's target */
  const locate = useCallback((key?: string) => {
    if (!key) {
      setBox(null)
      return
    }
    const el = document.querySelector<HTMLElement>(`[data-nc-guided="${key}"]`)
    if (!el) {
      setBox(null)
      return
    }
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) {
      setBox(null)
      return
    }
    setBox({ top: r.top, left: r.left, width: r.width, height: r.height })
  }, [])

  /* follow the target: step change, tab switches, resize, scroll, layout settle */
  useEffect(() => {
    if (!guided || !current) return
    const tabFor = (key: string) => (key === 'panel-audio' ? 'audio' : key === 'timeline' ? undefined : undefined)
    const tab = current.key ? tabFor(current.key) : undefined
    if (tab && useEditor.getState().panelTab !== tab) useEditor.getState().setPanelTab(tab)
    const relocate = () => locate(current.key)
    const t0 = window.setTimeout(relocate, 120)
    const t1 = window.setTimeout(relocate, 600)
    const iv = window.setInterval(relocate, 900) // catch silent layout shifts
    window.addEventListener('resize', relocate)
    window.addEventListener('scroll', relocate, true)
    return () => {
      window.clearTimeout(t0)
      window.clearTimeout(t1)
      window.clearInterval(iv)
      window.removeEventListener('resize', relocate)
      window.removeEventListener('scroll', relocate, true)
    }
  }, [guided, current, locate, step])

  /* LIVE completion watcher — subscribes to the store, advances on real signals */
  useEffect(() => {
    if (!guided || !current) return
    let advancing = false
    const unsub = useEditor.subscribe((state) => {
      if (advancing) return
      // template liveness first: when NONE of the anchored clips remain on the
      // timeline (undo of the apply, new project) the walkthrough ends honestly
      // instead of "advancing" on clips the user just restored
      if (guided.clipIds.length > 0 && !state.project.clips.some((c) => guided.clipIds.includes(c.id))) {
        advancing = true
        useEditor.getState().endGuided()
        toast('Walkthrough ended — the template is no longer on the timeline')
        return
      }
      const snap = { isPlaying: state.isPlaying, phase: state.exportState.phase, time: state.currentTime }
      let done = false
      try {
        done = DONE_CHECKS[step]?.(snap) ?? false
      } catch {
        done = false
      }
      if (!done) return
      advancing = true
      if (step >= steps.length - 1) {
        useEditor.getState().endGuided()
        toast.success('Walkthrough complete — template personalized, ready to export')
      } else {
        useEditor.getState().setGuidedStep(step + 1)
        toast.success(`Step ${step + 1} done — next: ${steps[step + 1]?.title ?? ''}`)
      }
    })
    return unsub
  }, [guided, current, step, steps])

  /* deep link: the Pro wall can pulse the live banner so users find it */
  useEffect(() => {
    const onPulse = () => {
      setPulsing(true)
      window.setTimeout(() => setPulsing(false), 1200)
    }
    window.addEventListener('nc-pulse-guided-banner', onPulse)
    return () => window.removeEventListener('nc-pulse-guided-banner', onPulse)
  }, [])

  /* Escape ends the walkthrough */
  useEffect(() => {
    if (!guided) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useEditor.getState().endGuided()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [guided])

  if (!ready || !guided || !template || !current) return null
  const last = step === steps.length - 1

  return (
    <>
      {/* amber ring on the live target — pointer-events-none, app stays usable */}
      {box && (
        <div
          data-nc-guided-ring
          className="pointer-events-none fixed z-[92] rounded-xl ring-2 ring-amber-300"
          style={{
            top: box.top - 6,
            left: box.left - 6,
            width: box.width + 12,
            height: box.height + 12,
            boxShadow: '0 0 0 4px rgba(252,211,77,0.25)',
          }}
        />
      )}

      {/* walkthrough banner */}
      <div
        data-nc-guided-banner
        role="status"
        aria-label={`Guided walkthrough — step ${step + 1} of ${steps.length}`}
        className={cn(
          'nc-glass-strong fixed left-1/2 top-14 z-[92] w-[min(560px,calc(100vw-16px))] -translate-x-1/2 rounded-xl border border-amber-300/25 p-3 shadow-2xl transition-shadow',
          pulsing && 'ring-2 ring-amber-300',
        )}
        data-pulsing={pulsing || undefined}
      >
        <div className="flex items-start gap-2.5">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300/90">
              {template.name} · Step {step + 1}/{steps.length}
            </p>
            <p className="truncate text-sm font-bold text-foreground">{current.title}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{current.body}</p>
          </div>
          <button
            type="button"
            data-nc-guided-skip
            title="End the walkthrough"
            aria-label="End the walkthrough"
            onClick={() => useEditor.getState().endGuided()}
            className="-mr-1 -mt-1 rounded-lg p-1 text-muted-foreground transition hover:bg-(--nc-panel) hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <div className="mt-2.5 flex items-center justify-between">
          <div className="flex gap-1" aria-hidden>
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === step ? 'w-4 bg-amber-300' : i < step ? 'w-1.5 bg-emerald-400/70' : 'w-1.5 bg-(--nc-line-strong)'}`}
              />
            ))}
          </div>
          <div className="flex gap-1.5">
            {step > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 rounded-lg px-2.5 text-[11px]"
                onClick={() => useEditor.getState().setGuidedStep(step - 1)}
              >
                <ChevronLeft className="mr-0.5 size-3" />
                Back
              </Button>
            )}
            <Button
              type="button"
              data-nc-guided-next
              size="sm"
              className="nc-gradient h-7 rounded-lg px-3 text-[11px] font-semibold text-white"
              onClick={() => {
                if (last) {
                  useEditor.getState().endGuided()
                  toast.success('Walkthrough complete — template personalized, ready to export')
                } else {
                  useEditor.getState().setGuidedStep(step + 1)
                }
              }}
            >
              {last ? 'Finish' : 'Next'}
              {!last && <ChevronRight className="ml-0.5 size-3" />}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

export default GuidedBanner
