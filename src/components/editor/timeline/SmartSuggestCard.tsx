'use client'

/**
 * NovaCut Studio — Highlight-reel suggestion card (UX60 Phase 2, Days 11–12)
 *
 * Appears at the timeline's bottom-right after the on-device silence scan.
 * Proposes keep-ranges per clip; Apply tightens the timeline in ONE undo
 * step, the ✕ dismisses in one tap. Pure review surface — the analysis
 * itself lives in lib/effects/highlight.ts and runs from the toolbar or
 * the Pro-wall deep link.
 */
import { Check, Loader2, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useEditor } from '@/lib/editor/store'

/** sub-60s values keep one decimal (0.8s) — formatShortTime would floor 0.84s to 0:00 */
const fmt = (t: number): string => (t < 60 ? `${Math.round(t * 10) / 10}s` : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`)

export function SmartSuggestCard() {
  const suggest = useEditor((s) => s.highlightSuggest)
  const analyzing = useEditor((s) => s.analyzingHighlights)
  const applyHighlightSuggestions = useEditor((s) => s.applyHighlightSuggestions)
  const dismissHighlightSuggestions = useEditor((s) => s.dismissHighlightSuggestions)

  if (!analyzing && (!suggest || suggest.suggestions.length === 0)) return null

  return (
    <div
      data-nc-highlight-card
      role="region"
      aria-label="Highlight reel suggestion"
      className="absolute bottom-3 right-3 z-[46] w-72 max-w-[calc(100%-1.5rem)] rounded-lg border border-amber-400/30 bg-(--nc-chrome)/95 p-3 shadow-xl backdrop-blur"
    >
      {analyzing ? (
        <div className="flex items-center gap-2 text-[11px] text-amber-200">
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
          <span>Listening for dead air — on-device audio analysis…</span>
        </div>
      ) : (
        suggest && (
          <>
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-3.5 shrink-0 text-amber-300" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-foreground">
                Highlight reel suggestion
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 rounded-full p-0 text-muted-foreground hover:text-foreground"
                data-nc-highlight-dismiss
                aria-label="Dismiss suggestion"
                onClick={() => dismissHighlightSuggestions()}
              >
                <X className="size-3.5" />
              </Button>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              Keep <span className="font-semibold text-emerald-300">{fmt(suggest.totalKeep)}</span>
              {' · '}cut{' '}
              <span className="font-semibold text-amber-300">{fmt(suggest.totalCut)}</span> of dead air
              across {suggest.suggestions.length} clip{suggest.suggestions.length === 1 ? '' : 's'}
              {suggest.analyzedClips > suggest.suggestions.length
                ? ` (${suggest.analyzedClips} scanned)`
                : ''}
            </p>
            <ul className="mt-1.5 max-h-28 space-y-1 overflow-y-auto pr-1" aria-label="Per-clip suggestions">
              {suggest.suggestions.map((s) => (
                <li key={s.clipId} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="min-w-0 flex-1 truncate">{s.clipName}</span>
                  <span className="shrink-0 rounded-full bg-amber-400/15 px-1.5 py-px font-semibold tabular-nums text-amber-200">
                    −{fmt(s.cutSeconds)}
                  </span>
                </li>
              ))}
            </ul>
            <Button
              size="sm"
              className="mt-2 h-7 w-full gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500"
              data-nc-highlight-apply
              onClick={() => {
                const n = applyHighlightSuggestions()
                if (n > 0) toast.success(`Tightened ${n} clip${n === 1 ? '' : 's'} — dead air removed (one undo step)`)
                else toast('Nothing to apply — the suggestion expired')
              }}
            >
              <Check className="size-3.5" aria-hidden />
              Apply — tighten in one undo step
            </Button>
          </>
        )
      )}
    </div>
  )
}
