'use client'

import dynamic from 'next/dynamic'

// The editor touches IndexedDB, canvas and media APIs — client-only.
const EditorShell = dynamic(
  () => import('@/components/editor/EditorShell').then((m) => m.EditorShell),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background">
        <div className="relative">
          <div className="nc-gradient nc-glow flex h-20 w-20 items-center justify-center rounded-3xl">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 5.5v13l11-6.5-11-6.5z" fill="white" />
            </svg>
          </div>
          <div className="absolute -inset-6 -z-10 rounded-full bg-fuchsia-500/20 blur-2xl" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <p className="text-lg font-bold tracking-tight">
            <span className="nc-gradient-text">NovaCut Studio</span>
          </p>
          <p className="text-xs text-muted-foreground">Loading your studio…</p>
        </div>
        <div className="nc-shimmer h-1.5 w-44 overflow-hidden rounded-full bg-(--nc-panel-strong)" />
      </div>
    ),
  }
)

export default function Home() {
  return <EditorShell />
}
