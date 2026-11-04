import Link from 'next/link'

/**
 * Branded 404 — every unmatched route renders the Chroma Engine look instead
 * of Next's default white error page, which would break the dark studio
 * identity (and blind-side users in dark rooms). Reuses the same aurora
 * backdrop, gradient wordmark and token system as the editor shell.
 */
export default function NotFound() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 text-foreground">
      <div className="nc-aurora" aria-hidden />

      <div className="relative z-10 flex flex-col items-center text-center">
        {/* logo tile — mirrors the editor loading screen */}
        <div className="nc-gradient nc-glow flex h-16 w-16 items-center justify-center rounded-2xl">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <path d="M8 5.5v13l11-6.5-11-6.5z" fill="white" />
          </svg>
        </div>

        <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
          NovaCut Studio · Error 404
        </p>

        <h1 className="mt-2 text-7xl font-black tracking-tight sm:text-8xl">
          <span className="nc-gradient-text">404</span>
        </h1>

        <h2 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">Scene not found</h2>

        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          This frame isn&apos;t on any track. The page you&apos;re looking for was moved, renamed,
          or never existed — your projects and edits are safe on this device.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="nc-gradient nc-glow-hover inline-flex h-11 items-center justify-center rounded-xl px-6 text-sm font-bold text-white transition-transform active:scale-[0.98]"
          >
            Open NovaCut Studio
          </Link>
          <Link
            href="/?action=demo"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-(--nc-line) bg-(--nc-panel-strong) px-6 text-sm font-semibold text-foreground transition-colors hover:border-(--nc-accent)/40"
          >
            Try the demo project ✨
          </Link>
        </div>

        <p className="mt-10 text-[10px] text-muted-foreground/60">
          100% local &amp; private — nothing ever leaves your device.
        </p>
      </div>
    </main>
  )
}
