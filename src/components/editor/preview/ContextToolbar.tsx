'use client'

/**
 * NovaCut Studio — selection-aware context toolbar (UX60 Phase 2, Days 15–16)
 *
 * Exactly one clip selected (+ not playing) → a floating pill appears over
 * the preview with the quick actions that matter for THAT kind:
 *   text    → font size −/+, 6 quick colors, bold, duplicate, delete
 *   sticker → size −/+, duplicate, delete
 *   video   → split at playhead, mute, duplicate, delete
 *   audio   → volume −/+, mute, duplicate, delete
 * Everything runs through the store's real actions (undoable). Hidden during
 * playback and multi-select so it never fights the transport or batch badge.
 */
import { useEffect, useState } from 'react'
import { Bold, CopyPlus, Minus, Plus, Scissors, Trash2, Volume2, VolumeX } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useEditor } from '@/lib/editor/store'
import { clamp } from '@/lib/editor/utils'
import { cn } from '@/lib/utils'

/** quick text colors — content swatches, deliberately not UI-theme colors */
const TEXT_SWATCHES = ['#f8fafc', '#fbbf24', '#34d399', '#fb7185', '#c4b5fd', '#f97316'] as const

const CTX_BTN =
  'size-7 max-sm:size-8 rounded-full p-0 text-foreground/75 hover:bg-(--nc-panel-strong) hover:text-foreground'

export function ContextToolbar() {
  const selectedClipIds = useEditor((s) => s.selectedClipIds)
  const clips = useEditor((s) => s.project.clips)
  const isPlaying = useEditor((s) => s.isPlaying)
  const currentTime = useEditor((s) => s.currentTime)
  const updateClip = useEditor((s) => s.updateClip)
  const splitClip = useEditor((s) => s.splitClip)
  const duplicateClip = useEditor((s) => s.duplicateClip)
  const deleteClip = useEditor((s) => s.deleteClip)
  const [pulse, setPulse] = useState(false)

  /* Pro-wall deep link — flash the toolbar when it is visible */
  useEffect(() => {
    let timer = 0
    const onPulse = () => {
      setPulse(true)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setPulse(false), 1600)
    }
    window.addEventListener('nc-pulse-context-toolbar', onPulse)
    return () => {
      window.removeEventListener('nc-pulse-context-toolbar', onPulse)
      window.clearTimeout(timer)
    }
  }, [])

  const clip = selectedClipIds.length === 1 ? clips.find((c) => c.id === selectedClipIds[0]) : undefined
  if (!clip || isPlaying) return null

  /** UX60 polish — rapid clicks must toggle against LIVE state, not the render closure */
  const liveClip = () => useEditor.getState().project.clips.find((c) => c.id === clip.id)

  const dup = () => duplicateClip(clip.id)
  const del = () => deleteClip(clip.id)
  const playheadInside = currentTime > clip.start + 0.08 && currentTime < clip.start + clip.duration - 0.08

  return (
    <div
      data-nc-context-toolbar={clip.kind}
      role="toolbar"
      aria-label={`${clip.kind} clip quick actions`}
      className={cn(
        'absolute bottom-3 left-1/2 z-30 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center justify-center gap-1 rounded-full border border-(--nc-line) bg-(--nc-chrome)/95 px-2 py-1 shadow-xl backdrop-blur max-sm:flex-wrap max-sm:rounded-2xl max-sm:px-1.5 max-sm:py-1.5',
        pulse && 'ring-2 ring-amber-300',
      )}
    >
      {clip.kind === 'text' && clip.textStyle && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className={CTX_BTN}
            data-nc-ctx="font-smaller"
            aria-label="Smaller text"
            title="Smaller text"
            onClick={() =>
              updateClip(clip.id, { textStyle: { fontSize: Math.max(10, Math.round(clip.textStyle!.fontSize * 0.87)) } }, 'ctx-text-size')
            }
          >
            <Minus className="size-3.5" aria-hidden />
          </Button>
          <span
            className="min-w-[2.2rem] text-center text-[10px] font-semibold tabular-nums text-muted-foreground"
            aria-label={`Font size ${Math.round(clip.textStyle.fontSize)} pixels`}
          >
            {Math.round(clip.textStyle.fontSize)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className={CTX_BTN}
            data-nc-ctx="font-bigger"
            aria-label="Bigger text"
            title="Bigger text"
            onClick={() =>
              updateClip(clip.id, { textStyle: { fontSize: Math.min(600, Math.round(clip.textStyle!.fontSize * 1.15)) } }, 'ctx-text-size')
            }
          >
            <Plus className="size-3.5" aria-hidden />
          </Button>
          <span className="mx-0.5 h-4 w-px bg-(--nc-line)" aria-hidden />
          <Button
            variant="ghost"
            size="icon"
            className={cn(CTX_BTN, clip.textStyle.bold && 'text-amber-300')}
            data-nc-ctx="bold"
            aria-label={clip.textStyle.bold ? 'Bold off' : 'Bold on'}
            title="Bold"
            onClick={() => {
              const cur = liveClip()
              if (!cur?.textStyle) return
              updateClip(clip.id, { textStyle: { bold: !cur.textStyle.bold } }, 'ctx-text-bold')
            }}
          >
            <Bold className="size-3.5" aria-hidden />
          </Button>
          <span className="mx-0.5 h-4 w-px bg-(--nc-line)" aria-hidden />
          {TEXT_SWATCHES.map((c, i) => (
            <button
              key={c}
              type="button"
              data-nc-ctx={`color-${i}`}
              aria-label={`Text color ${c}`}
              title={`Text color ${c}`}
              onClick={() => updateClip(clip.id, { textStyle: { color: c } }, 'ctx-text-color')}
              className={cn(
                'size-5 max-sm:size-8 shrink-0 rounded-full border border-white/25 transition-transform hover:scale-110',
                clip.textStyle!.color.toLowerCase() === c.toLowerCase() && 'ring-2 ring-amber-300 ring-offset-1 ring-offset-(--nc-chrome)',
              )}
              style={{ backgroundColor: c }}
            />
          ))}
          <span className="mx-0.5 h-4 w-px bg-(--nc-line)" aria-hidden />
        </>
      )}

      {clip.kind === 'sticker' && clip.sticker && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className={CTX_BTN}
            data-nc-ctx="sticker-smaller"
            aria-label="Smaller sticker"
            title="Smaller sticker"
            onClick={() => updateClip(clip.id, { sticker: { size: Math.max(24, Math.round(clip.sticker!.size * 0.85)) } }, 'ctx-sticker-size')}
          >
            <Minus className="size-3.5" aria-hidden />
          </Button>
          <span
            className="min-w-[2.2rem] text-center text-[10px] font-semibold tabular-nums text-muted-foreground"
            aria-label={`Sticker size ${Math.round(clip.sticker.size)} pixels`}
          >
            {Math.round(clip.sticker.size)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className={CTX_BTN}
            data-nc-ctx="sticker-bigger"
            aria-label="Bigger sticker"
            title="Bigger sticker"
            onClick={() => updateClip(clip.id, { sticker: { size: Math.min(1200, Math.round(clip.sticker!.size * 1.15)) } }, 'ctx-sticker-size')}
          >
            <Plus className="size-3.5" aria-hidden />
          </Button>
          <span className="mx-0.5 h-4 w-px bg-(--nc-line)" aria-hidden />
        </>
      )}

      {(clip.kind === 'video' || clip.kind === 'image') && (
        <Button
          variant="ghost"
          size="icon"
          className={CTX_BTN}
          data-nc-ctx="split"
          aria-label="Split clip at playhead"
          title="Split at playhead"
          disabled={!playheadInside}
          onClick={() => {
            splitClip(clip.id, currentTime)
            toast.success(`Split at ${currentTime.toFixed(2)}s`)
          }}
        >
          <Scissors className="size-3.5" aria-hidden />
        </Button>
      )}

      {(clip.kind === 'video' || clip.kind === 'audio') && (
        <>
          {clip.kind === 'audio' && (
            <Button
              variant="ghost"
              size="icon"
              className={CTX_BTN}
              data-nc-ctx="volume-down"
              aria-label="Quieter"
              title="Quieter"
              onClick={() => {
                const cur = liveClip()
                if (!cur) return
                updateClip(clip.id, { volume: clamp(Math.round(cur.volume * 10 - 1) / 10, 0, 1) }, 'ctx-volume')
              }}
            >
              <Minus className="size-3.5" aria-hidden />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn(CTX_BTN, clip.muted ? 'text-rose-300' : 'text-emerald-300')}
            data-nc-ctx="mute"
            aria-label={clip.muted ? 'Unmute clip' : 'Mute clip'}
            title={clip.muted ? 'Unmute' : 'Mute'}
            onClick={() => {
              const cur = liveClip()
              if (!cur) return
              updateClip(clip.id, { muted: !cur.muted }, 'ctx-mute')
            }}
          >
            {clip.muted ? <VolumeX className="size-3.5" aria-hidden /> : <Volume2 className="size-3.5" aria-hidden />}
          </Button>
          {clip.kind === 'audio' && (
            <Button
              variant="ghost"
              size="icon"
              className={CTX_BTN}
              data-nc-ctx="volume-up"
              aria-label="Louder"
              title="Louder"
              onClick={() => {
                const cur = liveClip()
                if (!cur) return
                updateClip(clip.id, { volume: clamp(Math.round(cur.volume * 10 + 1) / 10, 0, 1) }, 'ctx-volume')
              }}
            >
              <Plus className="size-3.5" aria-hidden />
            </Button>
          )}
          <span className="mx-0.5 h-4 w-px bg-(--nc-line)" aria-hidden />
        </>
      )}

      <Button
        variant="ghost"
        size="icon"
        className={CTX_BTN}
        data-nc-ctx="duplicate"
        aria-label="Duplicate clip"
        title="Duplicate"
        onClick={dup}
      >
        <CopyPlus className="size-3.5" aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={cn(CTX_BTN, 'text-rose-300 hover:bg-rose-500/10 hover:text-rose-200')}
        data-nc-ctx="delete"
        aria-label="Delete clip"
        title="Delete"
        onClick={del}
      >
        <Trash2 className="size-3.5" aria-hidden />
      </Button>
    </div>
  )
}
