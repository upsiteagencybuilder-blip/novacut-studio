'use client'

/**
 * Text panel — one-click "Add text", visual title presets and a helper tip.
 */
import { useCallback } from 'react'
import type { CSSProperties } from 'react'
import { Lightbulb, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DEFAULT_TEXT_STYLE, TEXT_PRESETS } from '@/lib/editor/constants'
import type { TextPreset } from '@/lib/editor/constants'
import { useEditor } from '@/lib/editor/store'

const PREVIEW_SIZE = 20

/** Render a preset's style as an inline preview at ~20px */
function presetPreviewStyle(preset: TextPreset): CSSProperties {
  const s = preset.style
  const fontSize = s.fontSize ?? DEFAULT_TEXT_STYLE.fontSize
  const scale = PREVIEW_SIZE / fontSize
  const bold = s.bold ?? DEFAULT_TEXT_STYLE.bold
  return {
    fontFamily: `"${s.fontFamily ?? DEFAULT_TEXT_STYLE.fontFamily}", sans-serif`,
    fontSize: PREVIEW_SIZE,
    color: s.color ?? DEFAULT_TEXT_STYLE.color,
    fontWeight: bold ? 800 : 500,
    fontStyle: s.italic ? 'italic' : 'normal',
    textShadow: s.shadow
      ? `0 0 ${Math.max(4, (s.shadowBlur ?? DEFAULT_TEXT_STYLE.shadowBlur) * scale * 1.4)}px ${
          s.shadowColor ?? DEFAULT_TEXT_STYLE.shadowColor
        }`
      : undefined,
    letterSpacing: (s.letterSpacing ?? 0) * scale,
    background: s.background ?? undefined,
    padding: s.background ? '2px 6px' : undefined,
    borderRadius: s.background ? 4 : undefined,
  }
}

export function TextPanel() {
  const addTextClip = useEditor((s) => s.addTextClip)

  const handleAdd = useCallback(() => {
    addTextClip()
    toast.success('Text added at playhead')
  }, [addTextClip])

  const handlePreset = useCallback(
    (preset: TextPreset) => {
      addTextClip(preset)
      toast('Preset added at playhead')
    },
    [addTextClip]
  )

  return (
    <div className="space-y-3">
      {/* primary action */}
      <Button
        type="button"
        onClick={handleAdd}
        className="nc-gradient nc-glow-hover h-10 w-full rounded-xl font-semibold text-white"
      >
        <Plus className="size-4" />
        Add text
      </Button>

      {/* title presets */}
      <section className="space-y-1.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Title presets
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {TEXT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              title={`Add "${preset.name}" at playhead`}
              onClick={() => handlePreset(preset)}
              className="flex cursor-pointer flex-col gap-1 rounded-lg border border-(--nc-line) bg-(--nc-panel) p-3 text-left transition hover:scale-[1.02] hover:border-fuchsia-400/60"
            >
              <span
                className="block overflow-hidden truncate whitespace-nowrap"
                style={presetPreviewStyle(preset)}
              >
                {preset.preview}
              </span>
              <span className="text-[10px] text-muted-foreground">{preset.name}</span>
            </button>
          ))}
        </div>
      </section>

      {/* tip */}
      <div className="nc-glass flex gap-2 rounded-lg p-3 text-[11px] text-muted-foreground">
        <Lightbulb className="size-3.5 shrink-0 text-yellow-500" />
        <p>Select a text clip on the timeline to customize font, colors, animations and more in the Properties panel.</p>
      </div>
    </div>
  )
}
