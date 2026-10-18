'use client'

/**
 * Sticker panel — emoji categories + tap-to-add sticker grid.
 */
import { useState } from 'react'
import { Lightbulb } from 'lucide-react'
import { toast } from 'sonner'
import { STICKER_CATEGORIES } from '@/lib/editor/constants'
import { useEditor } from '@/lib/editor/store'

export function StickerPanel() {
  const addStickerClip = useEditor((s) => s.addStickerClip)
  const [activeCat, setActiveCat] = useState(0)
  const category = STICKER_CATEGORIES[activeCat] ?? STICKER_CATEGORIES[0]

  const handleAdd = (emoji: string) => {
    addStickerClip(emoji)
    toast(`${emoji} added`)
  }

  return (
    <div className="space-y-3">
      {/* category chips */}
      <div className="flex flex-wrap gap-1.5">
        {STICKER_CATEGORIES.map((cat, i) => {
          const active = i === activeCat
          return (
            <button
              key={cat.name}
              type="button"
              onClick={() => setActiveCat(i)}
              className={
                active
                  ? 'nc-gradient h-7 rounded-full px-2.5 text-[11px] font-medium text-white transition'
                  : 'h-7 rounded-full bg-(--nc-panel) px-2.5 text-[11px] text-muted-foreground transition hover:bg-(--nc-panel-strong)'
              }
            >
              {cat.name}
            </button>
          )
        })}
      </div>

      {/* emoji grid */}
      <div className="grid grid-cols-5 gap-1.5">
        {category?.emojis.map((emoji, i) => (
          <button
            key={`${emoji}-${i}`}
            type="button"
            title={`Add ${emoji} sticker at playhead`}
            onClick={() => handleAdd(emoji)}
            className="flex aspect-square items-center justify-center rounded-lg bg-(--nc-panel) text-2xl transition hover:scale-110 hover:bg-(--nc-panel-strong) active:scale-95"
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* tip */}
      <div className="nc-glass flex gap-2 rounded-lg p-3 text-[11px] text-muted-foreground">
        <Lightbulb className="size-3.5 shrink-0 text-yellow-500" />
        <p>Stickers appear above video. Drag them on the timeline to reposition in time.</p>
      </div>
    </div>
  )
}
