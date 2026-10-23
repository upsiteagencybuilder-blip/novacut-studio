'use client'

/**
 * PWA surface — install flow, connection status, update toast.
 * Mounted once in the TopBar.
 */
import { useEffect, useReducer, useState } from 'react'
import { toast } from 'sonner'
import { ArrowDownToLine, Loader2, RefreshCw, Share, SquarePlus, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { applySWUpdate, usePWAInstall, useOnlineStatus, useSWUpdateWaiting } from '@/hooks/usePWA'

/* ---------------- offline / online pill ---------------- */

export function ConnectionPill() {
  const online = useOnlineStatus()
  const [backOnlineAt, setBackOnlineAt] = useState<number | null>(null)
  const [, tick] = useReducer((x: number) => x + 1, 0)

  // event-driven: show while offline, keep visible ~4s after reconnect
  useEffect(() => {
    const on = () => {
      setBackOnlineAt(Date.now())
      window.setTimeout(tick, 4200)
    }
    window.addEventListener('online', on)
    return () => window.removeEventListener('online', on)
  }, [tick])

  const showOffline = !online || (backOnlineAt !== null && Date.now() - backOnlineAt < 4000)
  if (!showOffline) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="nc-glass flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[10px] font-medium text-amber-300"
    >
      <WifiOff className="size-3" />
      Offline — editing continues, everything saves locally
    </div>
  )
}

/* ---------------- update-ready toast ---------------- */

export function PWAUpdateToast() {
  const waiting = useSWUpdateWaiting()
  useEffect(() => {
    if (!waiting) return
    toast('A new version of NovaCut is ready', {
      id: 'nc-sw-update',
      description: 'Refresh to get the latest tools and fixes.',
      duration: Infinity,
      icon: <RefreshCw className="size-4 text-(--nc-accent-300)" />,
      action: {
        label: 'Refresh now',
        onClick: () => {
          void applySWUpdate()
        },
      },
    })
  }, [waiting])
  return null
}

/* ---------------- install button (direct native install) ---------------- */

export function InstallApp() {
  const { iosGuide, installed, install } = usePWAInstall()
  const [guideOpen, setGuideOpen] = useState(false)
  const [pending, setPending] = useState(false)

  // hidden when already running as the installed app
  if (installed) return null

  const handleClick = async () => {
    if (pending) return
    setPending(true)
    try {
      // Direct install — the native dialog opens immediately (the hook waits
      // briefly for `beforeinstallprompt` if needed). No suggestion screens.
      const outcome = await install()
      if (outcome === 'accepted') toast.success('NovaCut installed 🎉 — find it on your home screen')
      if (outcome === 'unavailable') {
        if (iosGuide) setGuideOpen(true)
        else toast('To install: open the browser menu ⋮ and choose "Install NovaCut"', { duration: 6000 })
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        title="Install NovaCut as an app"
        aria-label="Install NovaCut as an app"
        disabled={pending}
        onClick={() => void handleClick()}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
      </Button>

      <Dialog open={guideOpen} onOpenChange={setGuideOpen}> {/* iOS-only fallback */}
        <DialogContent className="nc-glass-strong rounded-2xl border-(--nc-line) p-6 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <span className="nc-gradient nc-glow flex h-7 w-7 items-center justify-center rounded-lg">
                <ArrowDownToLine className="size-3.5 text-white" />
              </span>
              Install NovaCut
            </DialogTitle>
            <DialogDescription className="pt-1">
              Works offline, opens instantly, feels like a native app on every device.
            </DialogDescription>
          </DialogHeader>

          <ol className="mt-2 space-y-3 text-sm text-foreground/85">
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-(--nc-panel-strong) text-[10px] font-bold text-(--nc-accent-300)">1</span>
              {iosGuide ? (
                <span className="flex items-center gap-1.5">
                  Tap the <Share className="size-4 text-(--nc-accent-300)" /> <strong>Share</strong> button in Safari
                </span>
              ) : (
                <span>
                  Open the browser menu <strong>⋮ / ⋯</strong> (top right)
                </span>
              )}
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-(--nc-panel-strong) text-[10px] font-bold text-(--nc-accent-300)">2</span>
              {iosGuide ? (
                <span className="flex items-center gap-1.5">
                  Choose <SquarePlus className="size-4 text-(--nc-accent-300)" /> <strong>Add to Home Screen</strong>
                </span>
              ) : (
                <span>
                  Choose <strong>&ldquo;Install NovaCut&rdquo;</strong> / <strong>&ldquo;Add to Home screen&rdquo;</strong>
                </span>
              )}
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-(--nc-panel-strong) text-[10px] font-bold text-(--nc-accent-300)">3</span>
              <span>Launch it like any app — full screen, offline-ready</span>
            </li>
          </ol>

          <Button
            type="button"
            className="mt-4 h-10 w-full rounded-xl nc-gradient font-semibold text-white"
            onClick={() => setGuideOpen(false)}
          >
            Got it
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}
