'use client'

/**
 * Floating install suggestion — the soft "pop-up" that nudges the user to
 * install NovaCut as a PWA.
 *
 * Behavior:
 *  - Never shows when the app already runs standalone (hook + matchMedia check).
 *  - Slides up 6s after mount, once per session.
 *  - Dismissal (X, or declining the native prompt) stores `novacut.installHint`
 *    = { at: Date.now() } and suppresses the card for 3 days.
 *  - Accepting the install stores the same record via the `appinstalled`
 *    event → never shows again on this device.
 *  - When the native install prompt is unavailable (iOS Safari, some desktops),
 *    the primary button opens the step-by-step Add-to-Home-Screen guide.
 */
import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowDownToLine, Share, SquarePlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { usePWAInstall } from '@/hooks/usePWA'

const HINT_KEY = 'novacut.installHint'
const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000
const SHOW_DELAY_MS = 6000

interface HintRecord {
  at: number
}

function readHint(): HintRecord | null {
  try {
    const raw = window.localStorage.getItem(HINT_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && typeof (parsed as HintRecord).at === 'number') {
      return parsed as HintRecord
    }
    return null
  } catch {
    return null
  }
}

function writeHint(): void {
  try {
    window.localStorage.setItem(HINT_KEY, JSON.stringify({ at: Date.now() }))
  } catch {
    // storage unavailable — the suggestion will simply reappear next session
  }
}

export function InstallSuggestion() {
  const { available, iosGuide, installed, install } = usePWAInstall()
  const reducedMotion = useReducedMotion()
  const [standalone, setStandalone] = useState(false)
  const [show, setShow] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)

  // Standalone double-check + persistent acceptance via 'appinstalled'
  useEffect(() => {
    const queries = [
      window.matchMedia('(display-mode: standalone)'),
      window.matchMedia('(display-mode: minimal-ui)'),
    ]
    const update = () => setStandalone(queries.some((mq) => mq.matches))
    update()
    queries.forEach((mq) => mq.addEventListener('change', update))
    const onInstalled = () => {
      writeHint()
      setShow(false)
    }
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      queries.forEach((mq) => mq.removeEventListener('change', update))
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // Delayed entrance — suppressed while installed/standalone or inside cooldown
  useEffect(() => {
    if (installed || standalone) return
    const hint = readHint()
    if (hint && Date.now() - hint.at < COOLDOWN_MS) return
    const timer = window.setTimeout(() => setShow(true), SHOW_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [installed, standalone])

  const dismiss = useCallback(() => {
    writeHint()
    setShow(false)
  }, [])

  const handleInstall = useCallback(async () => {
    if (available) {
      const outcome = await install()
      if (outcome === 'accepted') {
        writeHint()
        setShow(false)
        toast.success('NovaCut installed 🎉 — find it on your home screen')
      } else {
        // declined the native prompt — same cooldown as a manual dismiss
        dismiss()
      }
      return
    }
    setGuideOpen(true)
  }, [available, install, dismiss])

  const hidden = installed || standalone

  return (
    <>
      <AnimatePresence>
        {show && !hidden && (
          <motion.div
            role="dialog"
            aria-label="Install NovaCut app suggestion"
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
            animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom)+8px)] left-3 right-3 z-40 sm:left-auto sm:w-80 lg:bottom-4 lg:right-4"
          >
            <div className="nc-glass-strong relative rounded-2xl border-(--nc-line) p-4 shadow-xl shadow-black/30">
              <button
                type="button"
                aria-label="Dismiss install suggestion"
                onClick={dismiss}
                className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full text-muted-foreground transition hover:bg-(--nc-panel-strong) hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>

              <div className="flex items-start gap-3">
                {/* floating mark with a soft accent pulse ring */}
                <span className="nc-install-float relative flex size-10 shrink-0 items-center justify-center rounded-xl nc-pulse-ring">
                  <img
                    src="/icons/novacut-mark.svg"
                    alt=""
                    width={40}
                    height={40}
                    className="size-10"
                    draggable={false}
                  />
                </span>
                <div className="min-w-0 flex-1 pr-5">
                  <p className="text-sm font-semibold">Install NovaCut</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                    Works offline · Opens instantly · Full screen
                  </p>
                </div>
              </div>

              <Button
                type="button"
                size="sm"
                className="mt-3 h-9 w-full gap-1.5 rounded-xl nc-gradient text-xs font-semibold text-white"
                onClick={() => void handleInstall()}
              >
                <ArrowDownToLine className="size-3.5" />
                Install app
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* step-by-step guide for browsers without the native prompt */}
      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
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
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-(--nc-panel-strong) text-[10px] font-bold text-(--nc-accent-300)">
                1
              </span>
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
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-(--nc-panel-strong) text-[10px] font-bold text-(--nc-accent-300)">
                2
              </span>
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
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-(--nc-panel-strong) text-[10px] font-bold text-(--nc-accent-300)">
                3
              </span>
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
