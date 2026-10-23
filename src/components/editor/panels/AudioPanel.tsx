'use client'

/**
 * Audio panel — voiceover recorder, master volume control,
 * audio-only media library and tips.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AudioWaveform,
  Lightbulb,
  Library as LibraryIcon,
  Loader2,
  Mic,
  Music,
  Plus,
  Square,
  Star,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { SoundBrowser } from '@/components/editor/panels/SoundBrowser'
import { loadIdList, saveIdList, toggleIdInList } from '@/lib/effects/favorites'
import { useEditor } from '@/lib/editor/store'
import { importFiles } from '@/lib/editor/importer'
import { formatShortTime } from '@/lib/editor/utils'
import { cn } from '@/lib/utils'

type RecState = 'idle' | 'recording' | 'processing'
type AudioTab = 'library' | 'music' | 'sfx'

/** audio-asset favorites (separate from the effect-favorites keys) */
const AUDIO_FAVORITES_KEY = 'novacut.audio.favorites.v1'

const EMERALD_GRADIENT = 'linear-gradient(90deg, #10b981, #34d399)'
const ROSE_GRADIENT = 'linear-gradient(90deg, #f43f5e, #fb7185)'

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

/* ---------------- voiceover recorder ---------------- */

function VoiceoverRecorder() {
  const [recState, setRecState] = useState<RecState>('idle')
  const [elapsed, setElapsed] = useState(0)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const rafRef = useRef(0)
  const startedAtRef = useRef(0)
  const discardRef = useRef(false)
  const levelRef = useRef<HTMLDivElement>(null)

  const setImporting = useEditor((s) => s.setImporting)
  const addMediaAsset = useEditor((s) => s.addMediaAsset)

  const cleanupCapture = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (audioCtxRef.current) {
      const ctx = audioCtxRef.current
      audioCtxRef.current = null
      ctx.close().catch(() => undefined)
    }
  }, [])

  const persistRecording = useCallback(
    async (blob: Blob) => {
      const seconds = (Date.now() - startedAtRef.current) / 1000
      const mins = Math.floor(seconds / 60)
      const secs = Math.round(seconds % 60)
      const label = `${mins}m${String(secs).padStart(2, '0')}s`
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
      const file = new File([blob], `Voiceover ${label}.${ext}`, { type: blob.type || 'audio/webm' })
      setImporting(true)
      try {
        const assets = await importFiles([file])
        assets.forEach(addMediaAsset)
        if (assets.length > 0) {
          toast.success(`Voiceover saved to the media library (${formatClock(seconds)})`)
        } else {
          toast.error("Couldn't import the recording — unsupported format")
        }
      } catch {
        toast.error('Import failed — please try again')
      } finally {
        setImporting(false)
        setRecState('idle')
        setElapsed(0)
      }
    },
    [addMediaAsset, setImporting]
  )

  const onRecorderStop = useCallback(() => {
    cleanupCapture()
    const recorder = recorderRef.current
    recorderRef.current = null
    const blob = new Blob(chunksRef.current, { type: recorder?.mimeType || 'audio/webm' })
    chunksRef.current = []
    if (discardRef.current) {
      setRecState('idle')
      setElapsed(0)
      return
    }
    if (blob.size === 0) {
      setRecState('idle')
      toast.error('Recording was empty — please try again')
      return
    }
    void persistRecording(blob)
  }, [cleanupCapture, persistRecording])

  /** simple live level bar from the mic stream via AnalyserNode */
  const startMeter = useCallback((stream: MediaStream) => {
    try {
      const AudioCtx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new AudioCtx()
      audioCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      source.connect(analyser)
      const data = new Uint8Array(analyser.fftSize)
      const tick = () => {
        analyser.getByteTimeDomainData(data as Uint8Array<ArrayBuffer>)
        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128
          sum += v * v
        }
        const level = Math.min(1, Math.sqrt(sum / data.length) * 2.2)
        const el = levelRef.current
        if (el) {
          el.style.width = `${Math.round(level * 100)}%`
          el.style.background = level > 0.85 ? ROSE_GRADIENT : EMERALD_GRADIENT
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch {
      /* level meter is optional */
    }
  }, [])

  const startRecording = useCallback(async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast.error('Recording is not supported in this browser')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      discardRef.current = false
      streamRef.current = stream
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : undefined
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = onRecorderStop
      recorder.start(250)
      recorderRef.current = recorder
      startedAtRef.current = Date.now()
      setElapsed(0)
      setRecState('recording')
      timerRef.current = setInterval(() => setElapsed((Date.now() - startedAtRef.current) / 1000), 200)
      startMeter(stream)
    } catch (err) {
      cleanupCapture()
      setRecState('idle')
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
        toast.error('Microphone access denied — allow mic permission in your browser to record a voiceover')
      } else {
        toast.error('Could not access the microphone — check your device settings')
      }
    }
  }, [cleanupCapture, onRecorderStop, startMeter])

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      setRecState('processing')
      recorder.stop() // onstop persists the blob
    } else {
      cleanupCapture()
      setRecState('idle')
    }
  }, [cleanupCapture])

  const cancelRecording = useCallback(() => {
    discardRef.current = true
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop() // onstop takes the discard branch
    } else {
      cleanupCapture()
      setRecState('idle')
    }
    toast('Recording discarded')
  }, [cleanupCapture])

  // stop everything if the panel unmounts mid-recording
  useEffect(() => {
    return () => {
      discardRef.current = true
      if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
      cleanupCapture()
    }
  }, [cleanupCapture])

  return (
    <div className="nc-glass rounded-lg p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Voiceover</span>
        {recState === 'recording' && (
          <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-rose-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
            </span>
            REC
          </span>
        )}
      </div>

      {recState === 'idle' && (
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            title="Start recording"
            onClick={() => void startRecording()}
            className="nc-gradient nc-glow-hover flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition hover:scale-105"
          >
            <Mic className="size-5" />
          </button>
          <div className="min-w-0">
            <p className="text-xs font-medium">Record a voiceover</p>
            <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
              Records from your microphone — stays on this device.
            </p>
          </div>
        </div>
      )}

      {recState === 'recording' && (
        <div className="mt-2 space-y-2.5">
          <div className="flex items-center gap-3">
            <span className="font-mono text-lg font-bold tabular-nums text-rose-300">{formatClock(elapsed)}</span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-(--nc-panel-strong)">
              <div
                ref={levelRef}
                className="h-full rounded-full"
                style={{ width: '0%', background: EMERALD_GRADIENT }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 flex-1 border border-rose-500/40 text-xs text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
              onClick={stopRecording}
            >
              <Square className="size-3.5" />
              Stop
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Discard recording"
              onClick={cancelRecording}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {recState === 'processing' && (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-fuchsia-400" />
          Saving voiceover to the media library…
        </div>
      )}
    </div>
  )
}

/* ---------------- panel ---------------- */

const AUDIO_TABS: Array<{ id: AudioTab; label: string; icon: typeof Music }> = [
  { id: 'library', label: 'Library', icon: LibraryIcon },
  { id: 'music', label: 'Music', icon: Music },
  { id: 'sfx', label: 'SFX', icon: AudioWaveform },
]

export function AudioPanel() {
  const [tab, setTab] = useState<AudioTab>('library')

  return (
    <div className='space-y-3'>
      {/* ---------- hub tabs ---------- */}
      <div
        className='grid grid-cols-3 gap-1 rounded-xl border border-(--nc-line) bg-(--nc-panel-soft) p-1'
        role='tablist'
        aria-label='Audio sections'
      >
        {AUDIO_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type='button'
            role='tab'
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              'flex h-8 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold transition',
              tab === id
                ? 'nc-gradient text-white shadow-md'
                : 'text-muted-foreground hover:bg-(--nc-panel) hover:text-foreground',
            )}
          >
            <Icon className='size-3.5' />
            {label}
          </button>
        ))}
      </div>

      {tab === 'library' && <LibraryTab />}
      {tab === 'music' && <SoundBrowser category='music' />}
      {tab === 'sfx' && <SoundBrowser category='sound' />}
    </div>
  )
}

function LibraryTab() {
  const media = useEditor((s) => s.media)
  const audioAssets = media.filter((m) => m.kind === 'audio')
  const setImporting = useEditor((s) => s.setImporting)
  const addMediaAsset = useEditor((s) => s.addMediaAsset)
  const addClipFromMediaId = useEditor((s) => s.addClipFromMediaId)
  const masterVolume = useEditor((s) => s.masterVolume)
  const masterMuted = useEditor((s) => s.masterMuted)
  const setMasterVolume = useEditor((s) => s.setMasterVolume)
  const toggleMasterMuted = useEditor((s) => s.toggleMasterMuted)

  /* audio-asset favorites — persisted locally */
  const [favIds, setFavIds] = useState<string[]>(() => loadIdList(AUDIO_FAVORITES_KEY))
  const [favsOnly, setFavsOnly] = useState(false)
  const toggleFav = useCallback((id: string) => {
    setFavIds((prev) => {
      const next = toggleIdInList(prev, id)
      saveIdList(AUDIO_FAVORITES_KEY, next)
      return next
    })
  }, [])

  const shownAssets = useMemo(
    () => (favsOnly ? audioAssets.filter((a) => favIds.includes(a.id)) : audioAssets),
    [audioAssets, favIds, favsOnly],
  )

  const audioInputRef = useRef<HTMLInputElement>(null)
  const effectiveVolume = masterMuted ? 0 : masterVolume

  const handleImport = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      setImporting(true)
      try {
        const assets = await importFiles(files)
        assets.forEach(addMediaAsset)
        if (assets.length > 0) {
          toast.success(`${assets.length} audio file${assets.length === 1 ? '' : 's'} imported`)
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

  return (
    <div className='space-y-3'>
      {/* ---------- voiceover recorder ---------- */}
      <VoiceoverRecorder />

      {/* ---------- master volume ---------- */}
      <div className='nc-glass rounded-lg p-3'>
        <div className='flex items-center justify-between'>
          <span className='text-[11px] font-semibold uppercase tracking-wider text-muted-foreground'>
            Master volume
          </span>
          <button
            type='button'
            title={masterMuted ? 'Unmute master' : 'Mute master'}
            onClick={toggleMasterMuted}
            className='flex h-8 w-8 items-center justify-center rounded-lg bg-(--nc-panel) text-muted-foreground transition hover:bg-(--nc-panel-strong) hover:text-foreground'
          >
            {masterMuted ? <VolumeX className='size-4 text-rose-400' /> : <Volume2 className='size-4' />}
          </button>
        </div>
        <div className='mt-2.5 flex items-center gap-2.5'>
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={[effectiveVolume]}
            onValueChange={(v) => setMasterVolume(v[0] ?? 0)}
            className='flex-1'
          />
          <span className='w-9 text-right text-[10px] tabular-nums text-muted-foreground'>
            {Math.round(effectiveVolume * 100)}%
          </span>
        </div>
      </div>

      {/* ---------- audio library ---------- */}
      <section className='space-y-1.5'>
        <div className='flex items-center justify-between'>
          <span className='text-[11px] font-semibold uppercase tracking-wider text-muted-foreground'>
            Audio library
          </span>
          <button
            type='button'
            title='Import audio files'
            onClick={() => audioInputRef.current?.click()}
            className='flex h-7 items-center gap-1 rounded-lg bg-(--nc-panel) px-2 text-[11px] text-muted-foreground transition hover:bg-(--nc-panel-strong) hover:text-foreground'
          >
            <Upload className='size-3' />
            Import
          </button>
          <input
            ref={audioInputRef}
            type='file'
            multiple
            accept='audio/*'
            className='hidden'
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              e.target.value = ''
              void handleImport(files)
            }}
          />
        </div>

        {/* All / Favorites filter chips */}
        {audioAssets.length > 0 && (
          <div className='flex gap-1'>
            <button
              type='button'
              onClick={() => setFavsOnly(false)}
              aria-pressed={!favsOnly}
              className={cn(
                'flex h-6 items-center rounded-full border px-2.5 text-[10px] font-medium transition',
                !favsOnly
                  ? 'border-(--nc-accent) bg-(--nc-accent)/15 text-foreground'
                  : 'border-(--nc-line) bg-(--nc-panel) text-muted-foreground hover:text-foreground',
              )}
            >
              All · {audioAssets.length}
            </button>
            <button
              type='button'
              onClick={() => setFavsOnly((v) => !v)}
              aria-pressed={favsOnly}
              className={cn(
                'flex h-6 items-center gap-1 rounded-full border px-2.5 text-[10px] font-medium transition',
                favsOnly
                  ? 'border-amber-300/60 bg-amber-300/15 text-amber-200'
                  : 'border-(--nc-line) bg-(--nc-panel) text-muted-foreground hover:text-foreground',
              )}
            >
              <Star className={cn('size-2.5', favsOnly && 'fill-amber-300')} />
              {favIds.length}
            </button>
          </div>
        )}

        {shownAssets.length > 0 ? (
          <div className='space-y-1.5'>
            {shownAssets.map((asset) => {
              const fav = favIds.includes(asset.id)
              return (
                <div
                  key={asset.id}
                  className='flex items-center gap-2 rounded-lg border border-(--nc-line) bg-(--nc-panel) p-2 transition hover:border-emerald-400/50'
                >
                  <span className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15'>
                    <Music className='size-4 text-emerald-300' />
                  </span>
                  <div className='min-w-0 flex-1'>
                    <p className='truncate text-[11px]' title={asset.name}>
                      {asset.name}
                    </p>
                    {asset.duration > 0 && (
                      <span className='mt-0.5 inline-block rounded bg-(--nc-scrim-strong) px-1 text-[9px] tabular-nums text-white/90'>
                        {formatShortTime(asset.duration)}
                      </span>
                    )}
                  </div>
                  <button
                    type='button'
                    title={fav ? 'Remove from favorites' : 'Add to favorites'}
                    aria-label={fav ? `Remove ${asset.name} from favorites` : `Add ${asset.name} to favorites`}
                    aria-pressed={fav}
                    onClick={() => toggleFav(asset.id)}
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition hover:bg-(--nc-panel-strong)',
                      fav ? 'text-amber-300' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Star className={cn('size-3.5', fav && 'fill-amber-300')} />
                  </button>
                  <button
                    type='button'
                    title='Add to timeline'
                    onClick={() => addToTimeline(asset.id)}
                    className='nc-gradient flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white transition hover:scale-110'
                  >
                    <Plus className='size-3.5' />
                  </button>
                </div>
              )
            })}
          </div>
        ) : favsOnly && favIds.length === 0 ? (
          <div className='rounded-lg border border-dashed border-(--nc-line-strong) p-4 text-center'>
            <Star className='mx-auto size-5 text-muted-foreground' />
            <p className='mt-1.5 text-xs text-muted-foreground'>
              No favorites yet — tap the star on any audio row to keep it a tap away.
            </p>
          </div>
        ) : (
          <div className='rounded-lg border border-dashed border-(--nc-line-strong) p-4 text-center'>
            <Music className='mx-auto size-5 text-muted-foreground' />
            <p className='mt-1.5 text-xs text-muted-foreground'>
              No audio yet — import music, record a voiceover, or extract audio from a video clip.
            </p>
          </div>
        )}
      </section>

      {/* ---------- tip ---------- */}
      <div className='nc-glass flex gap-2 rounded-lg p-3 text-[11px] text-muted-foreground'>
        <Lightbulb className='size-3.5 shrink-0 text-yellow-500' />
        <p>
          Pro tip:{' '}
          <kbd className='rounded border border-(--nc-line) bg-(--nc-panel-strong) px-1.5 py-0.5 font-mono text-[10px] text-foreground/90'>
            S
          </kbd>{' '}
          splits a clip at the playhead.
        </p>
      </div>
    </div>
  )
}
