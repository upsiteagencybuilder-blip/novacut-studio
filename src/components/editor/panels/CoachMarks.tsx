'use client'

/**
 * UX60 Day 5-6 — interactive coach marks.
 * A skippable 5-step first-run tour (import → timeline → preview → effects →
 * export). Completion is remembered per device (IndexedDB KV) so the tour
 * auto-starts only once; the Pro toolkit deep link can always restart it.
 * The overlay is pointer-events-none, so the app stays fully usable mid-tour.
 */
import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { getKV, setKV } from '@/lib/editor/db'
import { useEditor } from '@/lib/editor/store'
import type { PanelTab } from '@/lib/editor/types'

interface TourStep {
  /** matches the target element's data-nc-tour attribute */
  key: string
  /** left-panel tab to switch to before locating the target */
  tab?: PanelTab
  title: string
  body: string
}

const STEPS: TourStep[] = [
  { key: 'import', tab: 'media', title: 'Import your media', body: 'Drop video, photos or music into the Media panel — files never leave your device.' },
  { key: 'timeline', title: 'Build on the timeline', body: 'Drag clips, pull the trim handles, split at the playhead. Snapping keeps every cut tight.' },
  { key: 'preview', title: 'Watch the preview', body: 'The canvas plays the full composite live. Scrub the ruler or press Space to play.' },
  { key: 'effects', tab: 'effects', title: 'Add effects & titles', body: 'Effects, text, stickers, audio and the Pro toolkit all live in the left rail.' },
  { key: 'export', title: 'Export your video', body: 'One click opens the export dialog — platform presets, rendered locally on your device.' },
]

const TOUR_KV = 'tourDoneV1'
const EVENT_START = 'nc-start-tour'

interface Box {
  top: number
  left: number
  width: number
  height: number
}

export function CoachMarks() {
  const ready = useEditor((s) => s.ready)
  const [step, setStep] = useState<number | null>(null)
  const [box, setBox] = useState<Box | null>(null)
  const [centered, setCentered] = useState(false)

  const finish = useCallback((skipped: boolean) => {
    setStep(null)
    setBox(null)
    void setKV(TOUR_KV, true)
    toast(skipped ? 'Tour skipped — restart it anytime from the Pro toolkit' : 'Tour finished — the Media panel checklist tracks your first cut')
  }, [])

  /* locate the current step's target and glue the highlight to it */
  const locate = useCallback((key: string) => {
    const el = document.querySelector<HTMLElement>(`[data-nc-tour="${key}"]`)
    if (!el) {
      setBox(null)
      setCentered(true)
      return
    }
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) {
      setBox(null)
      setCentered(true)
      return
    }
    setCentered(false)
    setBox({ top: r.top, left: r.left, width: r.width, height: r.height })
  }, [])

  /* per-step lifecycle: switch tab if needed, measure, follow resize/scroll */
  useEffect(() => {
    if (step === null) return
    const s = STEPS[step]
    if (s.tab && useEditor.getState().panelTab !== s.tab) useEditor.getState().setPanelTab(s.tab)
    // wait for the (possible) tab-switch re-render, then measure
    const t = window.setTimeout(() => locate(s.key), 140)
    const relocate = () => locate(STEPS[step].key)
    window.addEventListener('resize', relocate)
    window.addEventListener('scroll', relocate, true)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('resize', relocate)
      window.removeEventListener('scroll', relocate, true)
    }
  }, [step, locate])

  /* Escape skips the tour */
  useEffect(() => {
    if (step === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, finish])

  /* auto-start once per device — desktop only (mobile layout is a bottom sheet) */
  useEffect(() => {
    if (!ready) return
    let cancelled = false
    void (async () => {
      if (window.innerWidth < 1024) return
      // wait until the onboarding overlay choice is made (max ~20 s)
      for (let i = 0; i < 40; i++) {
        if (cancelled) return
        if (await getKV<boolean>('onboarded')) break
        await new Promise((r) => setTimeout(r, 500))
      }
      if (cancelled) return
      if (await getKV<boolean>(TOUR_KV)) return
      // let the editor settle after onboarding closes
      await new Promise((r) => setTimeout(r, 1200))
      if (!cancelled) setStep(0)
    })()
    return () => {
      cancelled = true
    }
  }, [ready])

  /* deep link: the Pro toolkit can always (re)start the tour */
  useEffect(() => {
    const onStart = () => setStep(0)
    window.addEventListener(EVENT_START, onStart)
    return () => window.removeEventListener(EVENT_START, onStart)
  }, [])

  if (step === null) return null
  const s = STEPS[step]
  const last = step === STEPS.length - 1
  const tooltipWidth = Math.min(300, window.innerWidth - 24)
  const tooltipTop = box
    ? Math.min(Math.max(box.top + box.height + 14, 12), window.innerHeight - 150)
    : window.innerHeight - 168
  const tooltipLeft = box
    ? Math.min(Math.max(box.left, 12), window.innerWidth - 12 - tooltipWidth)
    : Math.max((window.innerWidth - tooltipWidth) / 2, 12)

  return (
    <div className="fixed inset-0 z-[95]" role="dialog" aria-label="NovaCut guided tour" data-nc-coach>
      {/* amber highlight ring + page dim — pointer-events-none, app stays usable */}
      {box && (
        <div
          data-nc-coach-box
          className="pointer-events-none absolute rounded-xl ring-2 ring-amber-300"
          style={{
            top: box.top - 6,
            left: box.left - 6,
            width: box.width + 12,
            height: box.height + 12,
            boxShadow: '0 0 0 4px rgba(252,211,77,0.25), 0 0 0 9999px rgba(0,0,0,0.55)',
          }}
        />
      )}

      {/* step tooltip */}
      <div
        data-nc-coach-tooltip
        className="nc-glass-strong absolute rounded-xl p-4"
        style={{ top: tooltipTop, left: tooltipLeft, width: tooltipWidth }}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-bold leading-tight text-foreground">
            {step + 1}/{STEPS.length} · {s.title}
          </p>
          <button
            type="button"
            data-nc-coach-skip
            title="Skip tour"
            aria-label="Skip tour"
            onClick={() => finish(true)}
            className="-mr-1 -mt-1 rounded-lg p-1 text-muted-foreground transition hover:bg-(--nc-panel) hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex gap-1" aria-hidden>
            {STEPS.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-4 bg-amber-300' : 'w-1.5 bg-(--nc-line-strong)'}`} />
            ))}
          </div>
          <div className="flex gap-1.5">
            {step > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 rounded-lg px-2.5 text-[11px]"
                onClick={() => setStep(step - 1)}
              >
                Back
              </Button>
            )}
            <Button
              type="button"
              data-nc-coach-next
              size="sm"
              className="nc-gradient h-7 rounded-lg px-3 text-[11px] font-semibold text-white"
              onClick={() => (last ? finish(false) : setStep(step + 1))}
            >
              {last ? 'Finish' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CoachMarks
