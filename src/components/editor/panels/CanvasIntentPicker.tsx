'use client'

/**
 * UX60 Day 3-4 — use-case canvas picker.
 * Three intent cards (Reels / YouTube / Square) create a project with the
 * right canvas shape and drop a target-length marker pin on the timeline,
 * so a brand-new edit starts with a visible finish line.
 * Used by the first-run onboarding overlay AND the projects dialog.
 */
import { RectangleHorizontal, Smartphone, Square } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useEditor } from '@/lib/editor/store'

export interface CanvasIntent {
  id: string
  label: string
  sub: string
  width: number
  height: number
  /** seconds — dropped as an amber "Ns target" marker pin on the timeline */
  targetDuration: number
  icon: LucideIcon
}

export const CANVAS_INTENTS: CanvasIntent[] = [
  { id: 'reels', label: 'Reels & TikTok', sub: 'Vertical 9:16 · 1080×1920', width: 1080, height: 1920, targetDuration: 30, icon: Smartphone },
  { id: 'youtube', label: 'YouTube', sub: 'Landscape 16:9 · 1920×1080', width: 1920, height: 1080, targetDuration: 60, icon: RectangleHorizontal },
  { id: 'square', label: 'Square post', sub: 'Feed 1:1 · 1080×1080', width: 1080, height: 1080, targetDuration: 30, icon: Square },
]

/** Create the project for an intent (canvas + target pin) with a receipt toast */
export function startProjectFromIntent(intent: CanvasIntent, name?: string) {
  useEditor.getState().newProject(name, {
    width: intent.width,
    height: intent.height,
    targetDuration: intent.targetDuration,
  })
  toast.success(`${intent.label} canvas — ${intent.width}×${intent.height} · ${intent.targetDuration}s target pin on the timeline`)
}

export function CanvasIntentPicker({ onPick }: { onPick: (intent: CanvasIntent) => void }) {
  return (
    <div className="space-y-2" data-nc-canvas-picker>
      {CANVAS_INTENTS.map((intent) => {
        const Icon = intent.icon
        return (
          <button
            key={intent.id}
            type="button"
            data-nc-intent={intent.id}
            onClick={() => onPick(intent)}
            className="flex w-full items-center gap-3 rounded-xl border border-(--nc-line) bg-(--nc-panel-soft) p-3 text-left transition hover:border-fuchsia-400/60 hover:bg-(--nc-panel-strong) focus-visible:outline-2 focus-visible:outline-fuchsia-400/60 active:scale-[0.99]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-fuchsia-500/15 text-fuchsia-300">
              <Icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">{intent.label}</span>
              <span className="block text-[11px] text-muted-foreground">{intent.sub}</span>
            </span>
            <span className="shrink-0 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
              {intent.targetDuration}s target
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default CanvasIntentPicker
