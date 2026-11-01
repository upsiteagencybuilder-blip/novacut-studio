'use client'

/**
 * NovaCut Studio — Day 64: crash boundary + crash-recovery dialog.
 *
 * - ErrorBoundary: class boundary that keeps a render crash inside the
 *   editor from producing a white page. The crash UI discloses the error,
 *   offers a plain reload, "Reload & keep my project" (the default — local
 *   autosave already holds everything) and a destructive local reset.
 * - CrashRecoveryWatcher: on mount, if THIS TAB had a previous unclean exit
 *   (sessionStorage flag from telemetry), surface one honest toast — the
 *   project itself is restored automatically from IndexedDB autosave.
 */
import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { hadUncleanExit, markSessionLive, recordError } from '@/lib/telemetry'

interface BoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    recordError('boundary', error.message, info.componentStack ?? error.stack)
  }

  private hardReset = () => {
    // full local wipe, same promise as Storage → factory reset minus caches
    try {
      if (typeof indexedDB !== 'undefined') indexedDB.deleteDatabase('novacut')
      localStorage.clear()
      sessionStorage.clear()
    } catch {
      /* best effort */
    }
    window.location.reload()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background p-4" data-nc-crash-screen>
        <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-(--nc-panel) p-6 shadow-2xl">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/15">
              <AlertTriangle className="h-4.5 w-4.5 text-rose-400" />
            </span>
            <div>
              <h1 className="text-sm font-bold text-foreground">The editor hit an unexpected error</h1>
              <p className="text-[11px] text-muted-foreground">Your project is safe in local storage — nothing was lost.</p>
            </div>
          </div>
          <pre
            data-nc-crash-message
            className="mb-4 max-h-28 overflow-y-auto rounded-lg border border-(--nc-line) bg-(--nc-panel-strong) p-2.5 font-mono text-[10px] leading-relaxed text-rose-200/80"
          >
            {error.message || String(error)}
          </pre>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" className="h-8 px-3 text-xs" onClick={() => window.location.reload()}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Reload &amp; keep my project
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-3 text-xs text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
              onClick={() => {
                if (window.confirm('Wipe ALL local NovaCut data (projects, media, settings) and start fresh? Cloud backups are untouched.')) {
                  this.hardReset()
                }
              }}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Reset local data
            </Button>
          </div>
          <p className="mt-3 text-[10px] text-muted-foreground/70">
            This error was recorded in the local telemetry log (Projects → Storage) — it never leaves this device.
          </p>
        </div>
      </div>
    )
  }
}

/** mount once inside the shell — offers crash recovery when the tab died before */
export function CrashRecoveryWatcher() {
  useEffect(() => {
    const unclean = hadUncleanExit()
    // start (or resume) the liveness heartbeat for THIS session
    markSessionLive()
    if (!unclean) return
    toast('Recovered from an unexpected exit', {
      description: 'Your project was restored from the local autosave. Previous session state is intact.',
      duration: 10000,
      icon: <AlertTriangle className="h-4 w-4 text-amber-400" />,
    })
  }, [])
  return null
}
