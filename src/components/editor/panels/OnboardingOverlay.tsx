'use client'

/**
 * First-run onboarding overlay — blocks the editor until the user picks
 * "demo project" or "start from scratch". Choice is persisted in IndexedDB.
 */
import { useEffect, useState } from 'react'
import { Loader2, Play, Scissors, ShieldCheck, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { getKV, setKV } from '@/lib/editor/db'
import { useEditor } from '@/lib/editor/store'

type OverlayState = 'open' | 'closed' | 'loading'

interface Feature {
  icon: LucideIcon
  color: string
  bg: string
  text: string
}

const FEATURES: Feature[] = [
  {
    icon: ShieldCheck,
    color: '#a855f7', // violet
    bg: 'rgba(168,85,247,0.15)',
    text: '100% local & private — files stay on your device',
  },
  {
    icon: Scissors,
    color: '#d946ef', // fuchsia
    bg: 'rgba(217,70,239,0.15)',
    text: 'Pro multi-track timeline with snap & trim',
  },
  {
    icon: Zap,
    color: '#fb923c', // orange
    bg: 'rgba(251,146,60,0.15)',
    text: 'Text, stickers, cinematic filters & motion',
  },
]

export function OnboardingOverlay() {
  const [state, setState] = useState<OverlayState>('closed')
  const ready = useEditor((s) => s.ready)
  const loadDemoProject = useEditor((s) => s.loadDemoProject)
  const newProject = useEditor((s) => s.newProject)

  /* show once the store finished restoring AND we were never onboarded */
  useEffect(() => {
    if (!ready) return
    let cancelled = false
    void (async () => {
      const done = await getKV<boolean>('onboarded')
      if (!cancelled && !done) setState('open')
    })()
    return () => {
      cancelled = true
    }
  }, [ready])

  if (state === 'closed') return null
  const loading = state === 'loading'

  const handleDemo = async () => {
    setState('loading')
    try {
      await loadDemoProject()
    } catch {
      toast.error('Could not build the demo — try again or start from scratch')
      setState('open')
      return
    }
    await setKV('onboarded', true)
    setState('closed')
  }

  const handleScratch = async () => {
    newProject()
    await setKV('onboarded', true)
    setState('closed')
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-(--nc-scrim-strong) p-4 backdrop-blur-md">
      <div className="nc-glass-strong nc-fade-up w-full max-w-md rounded-2xl p-8 text-center">
        {/* logo */}
        <div className="nc-gradient nc-glow mx-auto flex h-16 w-16 items-center justify-center rounded-2xl">
          <Play className="size-8 fill-white text-white" />
        </div>

        <h2 className="mt-4 text-xl font-bold">
          Welcome to <span className="nc-gradient-text">NovaCut</span> Studio
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          প্রফেশনাল ভিডিও এডিটিং — সম্পূর্ণ লোকাল, সম্পূর্ণ আপনার
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Professional editing that never uploads your files.
        </p>

        {/* features */}
        <div className="mt-5 space-y-2.5">
          {FEATURES.map((f) => {
            const Icon = f.icon
            return (
              <div key={f.text} className="flex items-center gap-2.5 text-left text-xs">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: f.bg, color: f.color }}
                >
                  <Icon className="size-4" />
                </span>
                <span className="text-foreground/85">{f.text}</span>
              </div>
            )
          })}
        </div>

        {/* actions */}
        <div className="mt-6 flex flex-col gap-2">
          <Button
            type="button"
            disabled={loading}
            onClick={() => void handleDemo()}
            className="nc-gradient h-11 w-full rounded-xl font-semibold text-white"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Building your demo…
              </>
            ) : (
              'Try the demo project ✨'
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => void handleScratch()}
            className="h-11 w-full rounded-xl border border-(--nc-line-strong) bg-transparent text-foreground/90 hover:bg-(--nc-panel)"
          >
            Start from scratch
          </Button>
        </div>
      </div>
    </div>
  )
}
