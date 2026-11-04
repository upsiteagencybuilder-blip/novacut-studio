'use client'

import { useEffect } from 'react'
import Link from 'next/link'

/**
 * Root-segment error boundary — covers non-editor routes (e.g. /s/[token])
 * that render server-side. The editor page itself is additionally wrapped in
 * its own ErrorBoundary so a render crash there never loses the autosaved
 * project. This page keeps the Chroma Engine look while offering recovery.
 */
export default function GlobalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surface for diagnostics; production reporting can hook in here.
    console.error('[nc-route-error]', error)
  }, [error])

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 text-foreground">
      <div className="nc-aurora" aria-hidden />

      <div className="relative z-10 flex flex-col items-center text-center">
        <div className="nc-gradient nc-glow flex h-16 w-16 items-center justify-center rounded-2xl">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <path
              d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
          NovaCut Studio · Unexpected error
        </p>

        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
          <span className="nc-gradient-text">Render hiccup</span>
        </h1>

        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          Something went wrong while rendering this page. Retrying usually fixes it — and if you
          were editing, your project is autosaved on this device.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="nc-gradient nc-glow-hover inline-flex h-11 cursor-pointer items-center justify-center rounded-xl px-6 text-sm font-bold text-white transition-transform active:scale-[0.98]"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-(--nc-line) bg-(--nc-panel-strong) px-6 text-sm font-semibold text-foreground transition-colors hover:border-(--nc-accent)/40"
          >
            Back to the studio
          </Link>
        </div>

        {error.digest ? (
          <p className="mt-8 font-mono text-[10px] text-muted-foreground/50">
            digest: {error.digest}
          </p>
        ) : null}
      </div>
    </main>
  )
}
