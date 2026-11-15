'use client'

/**
 * NovaCut Studio — UX60 Phase 5 (Days 37-38): draft-recovery banner.
 *
 * After an unclean exit (crash heartbeat gone stale) the autosaved project is
 * already restored by the store — this banner makes that fact VISIBLE: what
 * happened, the real saved-time of the draft, and a one-tap dismiss. The
 * Pro-wall deep link can preview the same banner with this project's real
 * last-save time (disclosed inside as a preview).
 */
import { useEffect, useState } from 'react'
import { FileClock, X } from 'lucide-react'
import { useEditor } from '@/lib/editor/store'

function relTime(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m ago`
  return `${Math.floor(h / 24)}d ago`
}

export function RecoveryBanner() {
  const banner = useEditor((s) => s.recoveryBanner)
  const dismiss = useEditor((s) => s.dismissRecoveryBanner)
  const [, tick] = useState(0)

  // keep the "saved X ago" honest while the banner is open
  useEffect(() => {
    if (!banner) return
    const t = setInterval(() => tick((n) => n + 1), 10000)
    return () => clearInterval(t)
  }, [banner])

  if (!banner) return null
  return (
    <div
      role="status"
      aria-live="polite"
      data-nc-recovery-banner
      className="fixed left-1/2 top-16 z-[70] flex w-[min(92vw,420px)] -translate-x-1/2 items-start gap-2.5 rounded-xl border border-amber-400/40 bg-(--nc-sheet)/95 p-3 shadow-xl backdrop-blur-md"
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-400/15">
        <FileClock className="size-4 text-amber-400" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground" data-nc-recovery-title>
          {banner.preview ? 'Draft recovery — preview' : 'Draft restored'}
          <span className="ml-1.5 font-normal text-muted-foreground" data-nc-recovery-saved>
            saved {relTime(banner.savedAt)}
          </span>
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground" data-nc-recovery-desc>
          {banner.preview
            ? 'After an unexpected exit this banner appears automatically with the restored autosave time. Nothing was lost right now.'
            : 'Your last session ended unexpectedly — the autosaved project is back exactly as saved.'}
        </p>
        <button
          type="button"
          data-nc-recovery-dismiss
          onClick={dismiss}
          className="mt-2 rounded-lg border border-(--nc-line-strong) px-2.5 py-1 text-[11px] font-medium text-foreground/90 transition hover:bg-(--nc-panel-strong)"
        >
          Keep editing
        </button>
      </div>
      <button
        type="button"
        aria-label="Dismiss recovery banner"
        onClick={dismiss}
        className="rounded-md p-1 text-muted-foreground transition hover:bg-(--nc-panel-strong) hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
