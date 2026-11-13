'use client'

/**
 * Media panel — import zone (click / drag & drop), progress feedback,
 * asset grid with quick "add to timeline" and delete actions.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AudioLines,
  Check,
  ChevronDown,
  Film,
  Image as ImageIcon,
  ListChecks,
  Loader2,
  Music as MusicIcon,
  Palette as PaletteIcon,
  Plus,
  Trash2,
  UploadCloud,
  Video as VideoIcon,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useEditor } from '@/lib/editor/store'
import { importFiles } from '@/lib/editor/importer'
import { formatBytes, formatShortTime } from '@/lib/editor/utils'
import { DEFAULT_TEXT_STYLE } from '@/lib/editor/constants'
import { getKV, setKV } from '@/lib/editor/db'
import type { MediaAssetRuntime, MediaKind, TextStyle } from '@/lib/editor/types'

const KIND_ICON: Record<MediaKind, LucideIcon> = {
  video: VideoIcon,
  image: ImageIcon,
  audio: MusicIcon,
  lut: PaletteIcon,
}

/* ---------------- asset card ---------------- */

function AssetCard({
  asset,
  onAdd,
  onDelete,
}: {
  asset: MediaAssetRuntime
  onAdd: (id: string) => void
  onDelete: (id: string) => void
}) {
  const KindIcon = KIND_ICON[asset.kind]
  const isAudio = asset.kind === 'audio'

  return (
    <div className="group relative">
      <div
        title={`Double-click to add "${asset.name}" to the timeline`}
        onDoubleClick={() => onAdd(asset.id)}
        className={
          isAudio
            ? 'relative flex h-16 cursor-pointer items-center gap-2 overflow-hidden rounded-lg border border-(--nc-line) bg-(--nc-scrim) px-2 transition hover:border-fuchsia-400/60'
            : 'relative aspect-video cursor-pointer overflow-hidden rounded-lg border border-(--nc-line) bg-(--nc-scrim) transition hover:border-fuchsia-400/60'
        }
      >
        {isAudio ? (
          <>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15">
              <AudioLines className="size-4 text-emerald-300" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] text-foreground/90">{asset.name}</span>
              <span className="block text-[9px] text-muted-foreground">{formatBytes(asset.size)}</span>
            </span>
          </>
        ) : asset.thumbnail ? (
          <img src={asset.thumbnail} alt={asset.name} draggable={false} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            <Film className="size-6 text-muted-foreground" />
          </span>
        )}

        {/* kind chip */}
        <span
          title={asset.kind}
          className="absolute left-1.5 top-1.5 flex items-center justify-center rounded bg-(--nc-scrim-strong) p-1"
        >
          <KindIcon className="size-3 text-white/80" />
        </span>

        {/* duration badge */}
        {asset.duration > 0 && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-(--nc-scrim-strong) px-1 text-[9px] tabular-nums text-white/90">
            {formatShortTime(asset.duration)}
          </span>
        )}

        {/* hover actions */}
        <span className="absolute right-1.5 top-1.5 flex flex-col gap-1 opacity-0 transition group-hover:opacity-100">
          <button
            type="button"
            title="Add to timeline"
            onClick={(e) => {
              e.stopPropagation()
              onAdd(asset.id)
            }}
            className="nc-gradient flex h-7 w-7 items-center justify-center rounded-full text-white shadow-md transition hover:scale-110"
          >
            <Plus className="size-3.5" />
          </button>
          <button
            type="button"
            title="Delete from library"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(asset.id)
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-(--nc-scrim-strong) text-white transition hover:bg-rose-500/80"
          >
            <Trash2 className="size-3.5" />
          </button>
        </span>
      </div>

      {!isAudio && (
        <div className="mt-1 px-0.5">
          <p className="truncate text-[11px] text-foreground/90" title={asset.name}>
            {asset.name}
          </p>
          <p className="text-[9px] text-muted-foreground">{formatBytes(asset.size)}</p>
        </div>
      )}
    </div>
  )
}

/* ---------------- empty state ---------------- */

function MediaEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <span className="nc-gradient nc-glow rounded-2xl p-[2px]">
        <span className="flex h-[76px] w-[76px] items-center justify-center rounded-[14px] bg-(--nc-sheet)">
          <Film className="size-9 text-fuchsia-300" />
        </span>
      </span>
      <p className="mt-3 text-sm font-medium">Your media library is empty</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Import video, photos or music to start editing
      </p>
    </div>
  )
}

/* ---------------- quick-start checklist (UX60 Day 7-8) ---------------- */

const CHECKLIST_KV = 'checklistDismissed'
const CHECKLIST_PULSE_EVENT = 'nc-pulse-checklist'

/** a text clip counts as "styled" once its style leaves the defaults */
function isStyledTextStyle(s?: TextStyle): boolean {
  if (!s) return false
  const a: Record<string, unknown> = { ...s }
  const b: Record<string, unknown> = { ...DEFAULT_TEXT_STYLE }
  delete a.content
  delete b.content
  // ignore untouched optional fields so merely opening Properties doesn't count
  for (const obj of [a, b]) {
    for (const k of Object.keys(obj)) if (obj[k] == null) delete obj[k]
    if (obj.curve === 0) delete obj.curve
  }
  return JSON.stringify(a) !== JSON.stringify(b)
}

function QuickStartChecklist() {
  const mediaCount = useEditor((s) => s.media.length)
  const clips = useEditor((s) => s.project.clips)
  const hasExported = useEditor((s) => s.hasExported)
  const [dismissed, setDismissed] = useState<boolean | null>(null)
  const [open, setOpen] = useState(true)
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    void getKV<boolean>(CHECKLIST_KV).then((v) => setDismissed(v === true))
  }, [])

  /* Pro toolkit deep link highlights the card briefly */
  useEffect(() => {
    const onPulse = () => {
      setPulse(true)
      window.setTimeout(() => setPulse(false), 1600)
    }
    window.addEventListener(CHECKLIST_PULSE_EVENT, onPulse)
    return () => window.removeEventListener(CHECKLIST_PULSE_EVENT, onPulse)
  }, [])

  // null = still reading the dismissal flag (no flash)
  if (dismissed !== false) return null

  const styledText = clips.some((c) => c.kind === 'text' && isStyledTextStyle(c.textStyle))
  const items = [
    { id: 'media', label: 'Import media', done: mediaCount > 0, hint: 'Drop files in the import zone below' },
    { id: 'clip', label: 'Add a clip to the timeline', done: clips.length > 0, hint: 'Double-click an asset card to add it' },
    { id: 'text', label: 'Style a text title', done: styledText, hint: 'Text panel → add a title, then style it in Properties' },
    { id: 'export', label: 'Export your video', done: hasExported, hint: 'Export button → pick a preset → render locally' },
  ]
  const doneCount = items.filter((i) => i.done).length
  const allDone = doneCount === items.length

  return (
    <div
      data-nc-checklist
      className={`rounded-xl border bg-(--nc-panel-soft) p-3 transition ${pulse ? 'border-amber-300 ring-2 ring-amber-300/60' : allDone ? 'border-emerald-400/40' : 'border-(--nc-line)'}`}
    >
      <div className="flex items-center gap-2">
        <ListChecks className={`size-4 shrink-0 ${allDone ? 'text-emerald-300' : 'text-amber-300'}`} />
        <p className="min-w-0 flex-1 text-xs font-bold text-foreground">
          Quick start{allDone ? ' — complete!' : ''}
        </p>
        <span className="rounded-full bg-(--nc-panel-strong) px-1.5 py-px text-[9px] font-bold tabular-nums text-muted-foreground">
          {doneCount}/{items.length}
        </span>
        <button
          type="button"
          title={open ? 'Collapse' : 'Expand'}
          aria-label={open ? 'Collapse checklist' : 'Expand checklist'}
          onClick={() => setOpen(!open)}
          className="rounded p-1 text-muted-foreground transition hover:bg-(--nc-panel) hover:text-foreground"
        >
          <ChevronDown className={`size-3.5 transition-transform ${open ? '' : '-rotate-90'}`} />
        </button>
        <button
          type="button"
          title="Don't show again"
          aria-label="Dismiss checklist"
          onClick={() => {
            setDismissed(true)
            void setKV(CHECKLIST_KV, true)
          }}
          className="rounded p-1 text-muted-foreground transition hover:bg-(--nc-panel) hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      {open && (
        <ul className="mt-2 space-y-1.5">
          {items.map((item, i) => (
            <li key={item.id} data-nc-check-item={item.id} className="flex items-start gap-2">
              <span
                className={`mt-px flex size-4 shrink-0 items-center justify-center rounded-full border ${
                  item.done
                    ? 'border-emerald-400 bg-emerald-400/20 text-emerald-300'
                    : 'border-(--nc-line-strong) text-[8px] font-bold text-muted-foreground'
                }`}
              >
                {item.done ? <Check className="size-2.5" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={`block text-[11px] font-medium leading-tight ${item.done ? 'text-emerald-300/90 line-through' : 'text-foreground/90'}`}>
                  {item.label}
                </span>
                {!item.done && <span className="block text-[10px] leading-tight text-muted-foreground">{item.hint}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ---------------- panel ---------------- */

export function MediaPanel() {
  const media = useEditor((s) => s.media)
  const importing = useEditor((s) => s.importing)
  const setImporting = useEditor((s) => s.setImporting)
  const addMediaAsset = useEditor((s) => s.addMediaAsset)
  const removeMediaAsset = useEditor((s) => s.removeMediaAsset)
  const addClipFromMediaId = useEditor((s) => s.addClipFromMediaId)

  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  /** Import pipeline: importFiles → addMediaAsset → toasts */
  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      setImporting(true)
      try {
        const assets = await importFiles(files)
        assets.forEach(addMediaAsset)
        if (assets.length > 0) {
          toast.success(`${assets.length} file${assets.length === 1 ? '' : 's'} imported`)
        }
        const failed = files.length - assets.length
        if (failed > 0) {
          toast.error(`${failed} file${failed === 1 ? '' : 's'} couldn't be imported — unsupported format`)
        }
      } catch {
        toast.error('Import failed — please try again')
      } finally {
        setImporting(false)
      }
    },
    [addMediaAsset, setImporting]
  )

  const addToTimeline = useCallback(
    (id: string) => {
      addClipFromMediaId(id)
      toast.success('Added to timeline')
    },
    [addClipFromMediaId]
  )

  const handleDelete = useCallback(
    async (id: string) => {
      await removeMediaAsset(id)
      toast.success('Removed from library')
    },
    [removeMediaAsset]
  )

  return (
    <div className="space-y-3">
      {/* ------- quick-start checklist (UX60 Day 7-8) ------- */}
      <QuickStartChecklist />

      {/* ------- import zone ------- */}
      <div
        role="button"
        tabIndex={0}
        data-nc-tour="import"
        data-nc-guided="media"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          void handleFiles(Array.from(e.dataTransfer.files))
        }}
        className={
          dragOver
            ? 'relative cursor-pointer rounded-xl border-2 border-dashed border-fuchsia-400 bg-fuchsia-400/10 p-5 text-center transition'
            : 'relative cursor-pointer rounded-xl border-2 border-dashed border-(--nc-line-strong) p-5 text-center transition hover:border-fuchsia-400/50 hover:bg-(--nc-panel-soft)'
        }
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="video/*,image/*,audio/*,.cube"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            e.target.value = ''
            void handleFiles(files)
          }}
        />
        <UploadCloud className="mx-auto size-7 text-fuchsia-300" />
        <p className="mt-1.5 text-sm font-medium">
          {dragOver && !importing ? 'Drop files to import' : 'Import media'}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">MP4 · WebM · JPG · PNG · MP3 · WAV</p>

        {importing && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-[10px] bg-(--nc-scrim-strong)">
            <Loader2 className="size-5 animate-spin text-fuchsia-300" />
            <p className="text-[11px] font-medium">Processing media…</p>
            <div className="h-1.5 w-32 overflow-hidden rounded-full">
              <div className="nc-gradient nc-shimmer h-full w-full" />
            </div>
          </div>
        )}
      </div>

      {/* ------- assets grid ------- */}
      {media.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {media.map((asset) => (
            <AssetCard key={asset.id} asset={asset} onAdd={addToTimeline} onDelete={handleDelete} />
          ))}
        </div>
      ) : (
        !importing && <MediaEmptyState />
      )}
    </div>
  )
}
