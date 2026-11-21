/** Branded loading state for the read-only share viewer (slow Turso round-trip). */
export default function ShareLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-zinc-100">
      <div className="flex w-full max-w-3xl flex-col items-center gap-4 py-10">
        <div className="nc-gradient nc-glow flex h-14 w-14 items-center justify-center rounded-2xl">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <path d="M8 5.5v13l11-6.5-11-6.5z" fill="white" />
          </svg>
        </div>
        <p className="text-xs font-medium text-zinc-400">Loading shared edit…</p>
        <div className="nc-shimmer h-1.5 w-40 overflow-hidden rounded-full bg-zinc-800" />
        <span className="sr-only" role="status">
          Loading
        </span>
      </div>
    </main>
  )
}
