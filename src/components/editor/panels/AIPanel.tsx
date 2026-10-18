'use client'

/**
 * AI panel — the "AI Magic" suite:
 *  1. Auto Captions     — on-device WAV extraction → server ASR → caption clips
 *  2. Silence Cut       — fully on-device silence detection + ripple rough-cut
 *  3. AI Image (B-Roll) — text-to-image, imported straight into the library
 *  4. AI Voiceover      — text-to-speech (auto-chunked for long scripts)
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AudioLines,
  Captions,
  Image as ImageIcon,
  Loader2,
  Mic,
  Scissors,
  ShieldCheck,
  Sparkles,
  Wand2,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { analyzeClipSilence, base64ToBlob, exportAudioSegmentWav, fileToBase64, imageBase64ToFile, requireOnline, sniffImageMime } from '@/lib/editor/ai'
import type { SilenceAnalysis } from '@/lib/editor/ai'
import { importFiles } from '@/lib/editor/importer'
import { useEditor } from '@/lib/editor/store'
import { round2 } from '@/lib/editor/utils'
import type { CaptionSegment, Clip, MediaAssetRuntime, TextStyle } from '@/lib/editor/types'

/* ================= shared bits ================= */

function SectionHeader({ icon: Icon, title, subtitle }: { icon: LucideIcon; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="nc-gradient nc-glow flex size-9 shrink-0 items-center justify-center rounded-lg">
        <Icon className="size-4 text-white" />
      </span>
      <div className="min-w-0">
        <h3 className="text-[13px] font-semibold leading-tight text-foreground">{title}</h3>
        <p className="truncate text-[10px] leading-tight text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  )
}

function FeatureCard({ icon, title, subtitle, children }: { icon: LucideIcon; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="nc-glass rounded-xl p-4">
      <SectionHeader icon={icon} title={title} subtitle={subtitle} />
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  )
}

function ClipChip({ clip }: { clip: Clip }) {
  return (
    <div className="flex w-fit max-w-full items-center gap-1.5 rounded-full border border-(--nc-line) bg-(--nc-panel) px-2.5 py-1">
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: clip.color }} aria-hidden />
      <span className="truncate text-[11px] text-foreground/90" title={clip.name}>
        {clip.name}
      </span>
    </div>
  )
}

function NoClipHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-(--nc-line-strong) p-3 text-center">
      <p className="text-[11px] leading-relaxed text-muted-foreground">{children}</p>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</span>
}

function NoteRow({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
      <Icon className="mt-0.5 size-3 shrink-0 text-fuchsia-300/80" />
      <p>{children}</p>
    </div>
  )
}

/* ================= captions helpers ================= */

interface CaptionStylePreset {
  id: string
  label: string
  patch: Partial<TextStyle>
}

const CAPTION_STYLE_PRESETS: CaptionStylePreset[] = [
  {
    id: 'classic',
    label: 'Classic dark chip',
    patch: {
      fontFamily: 'Montserrat',
      fontSize: 40,
      bold: true,
      italic: false,
      color: '#ffffff',
      background: 'rgba(10,10,18,0.66)',
      backgroundPadding: 16,
      shadow: false,
      strokeWidth: 0,
      animation: 'fadeIn',
    },
  },
  {
    id: 'bold',
    label: 'Bold gradient',
    patch: {
      fontFamily: 'Anton',
      fontSize: 64,
      bold: false,
      italic: false,
      color: '#ffffff',
      background: 'rgba(168,85,247,0.9)',
      backgroundPadding: 20,
      shadow: true,
      shadowColor: 'rgba(217,70,239,0.85)',
      shadowBlur: 30,
      strokeWidth: 0,
      animation: 'pop',
    },
  },
  {
    id: 'bangla',
    label: 'Bangla',
    patch: {
      fontFamily: 'Hind Siliguri',
      fontSize: 44,
      bold: true,
      italic: false,
      color: '#ffffff',
      background: 'rgba(10,10,18,0.62)',
      backgroundPadding: 16,
      shadow: false,
      strokeWidth: 0,
      animation: 'fadeIn',
    },
  },
]

/** Split a raw transcript into caption-sized chunks (sentence-aware, min ~2 words) */
function splitTranscriptChunks(text: string): string[] {
  const sentences = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?।])\s+/)
    .filter(Boolean)
  const chunks: string[] = []
  for (const sentence of sentences) {
    const words = sentence.split(' ').filter(Boolean)
    if (words.length <= 10) {
      if (words.length < 2 && chunks.length > 0) chunks[chunks.length - 1] += ` ${sentence}`
      else chunks.push(sentence)
    } else {
      for (let i = 0; i < words.length; i += 10) {
        chunks.push(words.slice(i, i + 10).join(' '))
      }
    }
  }
  return chunks.filter((c) => c.trim().length > 0)
}

/**
 * ASR has no timestamps — distribute chunks across the clip proportionally to
 * their character counts with small 0.05s gaps. Segment coords are absolute
 * timeline seconds (addCaptionClips places them on the overlay track).
 */
function distributeSegments(chunks: string[], clip: Clip): CaptionSegment[] {
  const gap = 0.05
  const usable = Math.max(1, clip.duration - gap * Math.max(0, chunks.length - 1))
  const totalChars = chunks.reduce((acc, c) => acc + c.length, 0) || 1
  let t = 0
  return chunks.map((chunk, i) => {
    const isLast = i === chunks.length - 1
    const dur = isLast
      ? Math.max(0.4, round2(clip.duration - t))
      : Math.max(0.4, round2((chunk.length / totalChars) * usable))
    const start = round2(clip.start + t)
    const end = round2(clip.start + t + dur)
    t += dur + gap
    return { start, end, text: chunk }
  })
}

/* ================= silence-cut helpers ================= */

/** Complement of the speech segments = the removable silence ranges */
function deriveSilences(segments: { start: number; end: number }[], duration: number): { start: number; end: number }[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start)
  const out: { start: number; end: number }[] = []
  let cursor = 0
  for (const seg of sorted) {
    if (seg.start > cursor + 0.02) out.push({ start: round2(cursor), end: round2(Math.min(seg.start, duration)) })
    cursor = Math.max(cursor, seg.end)
    if (cursor >= duration) break
  }
  if (cursor < duration - 0.02) out.push({ start: round2(cursor), end: round2(duration) })
  return out.filter((r) => r.end - r.start >= 0.16)
}

function SilenceMap({ analysis, duration }: { analysis: SilenceAnalysis; duration: number }) {
  const total = Math.max(duration, 0.001)
  const pieces: { key: string; width: number; silent: boolean }[] = []
  let cursor = 0
  analysis.segments.forEach((seg, i) => {
    if (seg.start > cursor) pieces.push({ key: `g${i}`, width: seg.start - cursor, silent: true })
    pieces.push({ key: `p${i}`, width: seg.end - seg.start, silent: false })
    cursor = Math.max(cursor, seg.end)
  })
  if (cursor < duration) pieces.push({ key: 'tail', width: duration - cursor, silent: true })
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-(--nc-panel-strong)" aria-hidden>
      {pieces.map((p) => (
        <span key={p.key} style={{ width: `${Math.max(0.5, (p.width / total) * 100)}%` }} className={p.silent ? '' : 'nc-gradient'} />
      ))}
    </div>
  )
}

/* ================= voiceover helpers ================= */

interface VoiceOption {
  id: string
  label: string
}

const VOICE_OPTIONS: VoiceOption[] = [
  { id: 'tongtong', label: 'Tongtong — Warm · Female' },
  { id: 'chuichui', label: 'Chuichui — Cheerful' },
  { id: 'xiaochen', label: 'Xiaochen — Calm · Professional' },
  { id: 'jam', label: 'Jam — British · Male' },
  { id: 'kazi', label: 'Kazi — Clear · Standard' },
  { id: 'douji', label: 'Douji — Natural' },
  { id: 'luodo', label: 'Luodo — Expressive' },
]

const IMAGE_SIZE_OPTIONS = [
  { id: '1344x768', label: 'Landscape · 1344×768' },
  { id: '768x1344', label: 'Portrait · 768×1344' },
  { id: '1024x1024', label: 'Square · 1024×1024' },
]

/** Split a long script into sentence chunks of at most ~900 chars for sequential TTS */
function splitTextForTts(text: string, maxLen = 900): string[] {
  const sentences = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?।])\s+/)
    .filter(Boolean)
  const chunks: string[] = []
  let current = ''
  for (const sentence of sentences) {
    let piece = sentence
    while (piece.length > maxLen) {
      const cut = piece.lastIndexOf(' ', maxLen)
      const at = cut > maxLen * 0.5 ? cut : maxLen
      const head = piece.slice(0, at).trim()
      piece = piece.slice(at).trim()
      if (head) {
        if (current) {
          chunks.push(current)
          current = ''
        }
        chunks.push(head)
      }
    }
    if (!piece) continue
    if (!current) current = piece
    else if (current.length + 1 + piece.length <= maxLen) current += ` ${piece}`
    else {
      chunks.push(current)
      current = piece
    }
  }
  if (current) chunks.push(current)
  return chunks
}

/* ================= the panel ================= */

export function AIPanel() {
  const selectedClip = useEditor((s) => {
    const id = s.selectedClipIds[0]
    return id ? (s.project.clips.find((c) => c.id === id) ?? null) : null
  })
  const media = useEditor((s) => s.media)
  const addCaptionClips = useEditor((s) => s.addCaptionClips)
  const updateClip = useEditor((s) => s.updateClip)
  const addMediaAsset = useEditor((s) => s.addMediaAsset)

  const clipMedia: MediaAssetRuntime | null = selectedClip?.mediaId
    ? (media.find((m) => m.id === selectedClip.mediaId) ?? null)
    : null
  const isAvClip = !!selectedClip && (selectedClip.kind === 'video' || selectedClip.kind === 'audio')
  const hasAudioSource = isAvClip && !!clipMedia

  /* ---------- auto captions ---------- */
  const [captionStyleId, setCaptionStyleId] = useState('classic')
  const [captionBusy, setCaptionBusy] = useState(false)
  const [captionPhase, setCaptionPhase] = useState('')
  const [transcript, setTranscript] = useState<string | null>(null)

  const handleGenerateCaptions = useCallback(async () => {
    if (!selectedClip || !clipMedia || captionBusy) return
    requireOnline()
    setCaptionBusy(true)
    try {
      setCaptionPhase('Extracting audio…')
      const sourceEnd = selectedClip.trimStart + selectedClip.duration * selectedClip.speed
      const wav = await exportAudioSegmentWav(clipMedia, selectedClip.trimStart, sourceEnd)

      setCaptionPhase('Transcribing (AI)…')
      const audioBase64 = await fileToBase64(wav)
      const res = await fetch('/api/ai/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64 }),
      })
      const data = (await res.json().catch(() => null)) as { text?: string; error?: string } | null
      if (!res.ok || !data?.text) {
        throw new Error(data?.error ?? `Transcription failed (${res.status})`)
      }

      const chunks = splitTranscriptChunks(data.text)
      if (!chunks.length) throw new Error('The transcript came back empty — try a clip with clear speech')

      setCaptionPhase(`Building ${chunks.length} caption clips…`)
      const segments = distributeSegments(chunks, selectedClip)

      const beforeIds = new Set(useEditor.getState().project.clips.map((c) => c.id))
      const count = addCaptionClips(segments)
      // style the fresh caption clips with the chosen preset
      const preset = CAPTION_STYLE_PRESETS.find((p) => p.id === captionStyleId) ?? CAPTION_STYLE_PRESETS[0]
      const created = useEditor
        .getState()
        .project.clips.filter((c) => !beforeIds.has(c.id) && c.kind === 'text')
      for (const c of created) updateClip(c.id, { textStyle: preset.patch })

      setTranscript(data.text)
      toast.success(`${count} caption clip${count === 1 ? '' : 's'} added to the timeline`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Caption generation failed')
    } finally {
      setCaptionPhase('')
      setCaptionBusy(false)
    }
  }, [selectedClip, clipMedia, captionBusy, captionStyleId, addCaptionClips, updateClip])

  /* ---------- silence cut ---------- */
  const [threshold, setThreshold] = useState(0.06)
  const [minSilence, setMinSilence] = useState(0.6)
  const [analyzing, setAnalyzing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [analysis, setAnalysis] = useState<SilenceAnalysis | null>(null)

  // drop stale results when the selection changes
  useEffect(() => {
    setAnalysis(null)
  }, [selectedClip?.id])

  const runAnalysis = useCallback(
    async (clip: Clip, asset: MediaAssetRuntime) => {
      return analyzeClipSilence(asset, clip.trimStart, clip.trimStart, clip.speed, clip.duration, {
        threshold,
        minSilenceSec: minSilence,
        paddingSec: 0.08,
      })
    },
    [threshold, minSilence]
  )

  const handleAnalyze = useCallback(async () => {
    if (!selectedClip || !clipMedia || analyzing) return
    setAnalyzing(true)
    try {
      const result = await runAnalysis(selectedClip, clipMedia)
      setAnalysis(result)
      if (result.totalSilence < 0.05) toast('No significant silence found in this clip')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silence analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }, [selectedClip, clipMedia, analyzing, runAnalysis])

  const silenceRanges = useMemo(() => {
    if (!analysis || !selectedClip) return []
    return deriveSilences(analysis.segments, selectedClip.duration)
  }, [analysis, selectedClip])

  const handleRemoveSilences = useCallback(async () => {
    if (!selectedClip || silenceRanges.length === 0 || removing) return
    setRemoving(true)
    try {
      const clipId = selectedClip.id
      let removedTotal = 0
      let cuts = 0

      // descending: cutting later silences first keeps earlier positions valid
      const ranges = [...silenceRanges].sort((a, b) => b.start - a.start)
      for (const range of ranges) {
        const st = useEditor.getState()
        const clip = st.project.clips.find((c) => c.id === clipId)
        if (!clip) break // clip was fully consumed
        const d = clip.duration
        const sStart = Math.max(0, range.start)
        const sEnd = Math.min(d, range.end)
        if (sEnd - sStart < 0.16) continue // too tight to split safely
        const touchesStart = sStart <= 0.08
        const touchesEnd = sEnd >= d - 0.08

        if (touchesStart && touchesEnd) {
          // the whole clip is silent → remove it entirely and stop
          removedTotal += d
          cuts++
          st.selectClip(clip.id)
          st.rippleDeleteSelected()
          break
        }

        if (touchesStart) {
          // head silence: split off the keep part, then ripple-delete the head fragment
          st.splitClip(clip.id, round2(clip.start + sEnd))
          removedTotal += sEnd
          cuts++
          const st2 = useEditor.getState()
          st2.selectClip(clip.id)
          st2.rippleDeleteSelected()
          continue
        }

        if (touchesEnd) {
          // tail silence: split, the selected right fragment IS the silence
          st.splitClip(clip.id, round2(clip.start + sStart))
          removedTotal += d - sStart
          cuts++
          useEditor.getState().rippleDeleteSelected()
          continue
        }

        // interior silence: split at both boundaries, delete the middle fragment
        st.splitClip(clip.id, round2(clip.start + sStart))
        const st2 = useEditor.getState()
        const middleId = st2.selectedClipIds[0]
        if (!middleId) continue
        st2.splitClip(middleId, round2(clip.start + sEnd))
        removedTotal += sEnd - sStart
        cuts++
        const st3 = useEditor.getState()
        st3.selectClip(middleId)
        st3.rippleDeleteSelected()
      }

      if (cuts > 0) {
        toast.success(`Removed ${round2(removedTotal)}s of silence (${cuts} cut${cuts === 1 ? '' : 's'})`)
        // refresh analysis against the shortened clip
        const st = useEditor.getState()
        const fresh = st.project.clips.find((c) => c.id === clipId)
        const freshMedia = fresh?.mediaId ? (st.media.find((m) => m.id === fresh.mediaId) ?? null) : null
        if (fresh && freshMedia) {
          setAnalysis(await runAnalysis(fresh, freshMedia))
        } else {
          setAnalysis(null)
        }
      } else {
        toast('Nothing was removed — the detected gaps were too short to cut safely')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silence removal failed')
    } finally {
      setRemoving(false)
    }
  }, [selectedClip, silenceRanges, removing, runAnalysis])

  /* ---------- ai image ---------- */
  const [imagePrompt, setImagePrompt] = useState('')
  const [imageSize, setImageSize] = useState('1344x768')
  const [imageBusy, setImageBusy] = useState(false)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  const handleGenerateImage = useCallback(async () => {
    if (imageBusy) return
    const prompt = imagePrompt.trim()
    if (!prompt) {
      toast.error('Describe the image you want first')
      return
    }
    requireOnline()
    setImageBusy(true)
    try {
      const res = await fetch('/api/ai/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, size: imageSize }),
      })
      const data = (await res.json().catch(() => null)) as { imageBase64?: string; error?: string } | null
      if (!res.ok || !data?.imageBase64) {
        throw new Error(data?.error ?? `Image generation failed (${res.status})`)
      }
      const blob = base64ToBlob(data.imageBase64, sniffImageMime(data.imageBase64))
      const file = imageBase64ToFile(data.imageBase64, `ai-image-${Date.now()}`)
      const assets = await importFiles([file])
      assets.forEach(addMediaAsset)
      const url = URL.createObjectURL(blob)
      setImagePreview((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return url
      })
      toast.success('AI image added to media library')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Image generation failed')
    } finally {
      setImageBusy(false)
    }
  }, [imageBusy, imagePrompt, imageSize, addMediaAsset])

  /* ---------- voiceover ---------- */
  const [voiceText, setVoiceText] = useState('')
  const [voice, setVoice] = useState('tongtong')
  const [voiceSpeed, setVoiceSpeed] = useState(1)
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [voicePhase, setVoicePhase] = useState('')

  const handleGenerateVoiceover = useCallback(async () => {
    if (voiceBusy) return
    const text = voiceText.trim()
    if (!text) {
      toast.error('Write the voiceover script first')
      return
    }
    requireOnline()
    setVoiceBusy(true)
    try {
      const chunks = splitTextForTts(text)
      let imported = 0
      for (let i = 0; i < chunks.length; i++) {
        setVoicePhase(chunks.length > 1 ? `Synthesizing part ${i + 1} of ${chunks.length}…` : 'Synthesizing voice…')
        const res = await fetch('/api/ai/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: chunks[i], voice, speed: voiceSpeed }),
        })
        const data = (await res.json().catch(() => null)) as
          | { audioBase64?: string; mimeType?: string; error?: string }
          | null
        if (!res.ok || !data?.audioBase64) {
          throw new Error(data?.error ?? `Speech synthesis failed (${res.status})`)
        }
        const blob = base64ToBlob(data.audioBase64, data.mimeType || 'audio/wav')
        const name = chunks.length > 1 ? `ai-voiceover-${i + 1}-of-${chunks.length}.wav` : 'ai-voiceover.wav'
        const file = new File([blob], name, { type: data.mimeType || 'audio/wav' })
        const assets = await importFiles([file])
        imported += assets.length
        assets.forEach(addMediaAsset)
      }
      if (imported > 0) {
        toast.success(`Voiceover added to media library${chunks.length > 1 ? ` (${chunks.length} parts)` : ''}`)
      } else {
        toast.error('Speech synthesis returned no audio')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Voiceover generation failed')
    } finally {
      setVoicePhase('')
      setVoiceBusy(false)
    }
  }, [voiceBusy, voiceText, voice, voiceSpeed, addMediaAsset])

  /* ================= render ================= */

  return (
    <div className="nc-fade-up space-y-3">
      {/* ---------- 1 · auto captions ---------- */}
      <FeatureCard icon={Captions} title="Auto Captions" subtitle="Speech-to-text captions for the selected clip">
        {hasAudioSource && selectedClip ? (
          <>
            <ClipChip clip={selectedClip} />
            <div className="space-y-1.5">
              <FieldLabel>Caption style</FieldLabel>
              <Select value={captionStyleId} onValueChange={setCaptionStyleId}>
                <SelectTrigger className="h-9 w-full text-xs">
                  <SelectValue placeholder="Pick a style" />
                </SelectTrigger>
                <SelectContent>
                  {CAPTION_STYLE_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              disabled={captionBusy}
              onClick={() => void handleGenerateCaptions()}
              className="nc-gradient nc-glow-hover h-9 w-full rounded-lg text-xs font-semibold text-white"
            >
              {captionBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {captionBusy ? captionPhase : 'Generate captions'}
            </Button>
            {transcript && (
              <div className="space-y-1">
                <FieldLabel>Transcript</FieldLabel>
                <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-(--nc-line) bg-(--nc-scrim) p-2.5 font-mono text-[10px] leading-relaxed text-foreground/80">
                  {transcript}
                </pre>
              </div>
            )}
            <NoteRow icon={ShieldCheck}>Audio is converted on your device, then transcribed by AI.</NoteRow>
          </>
        ) : (
          <NoClipHint>
            {selectedClip
              ? 'The selected clip has no readable audio track — pick a video or audio clip.'
              : 'Select a video or audio clip on the timeline to generate captions for it.'}
          </NoClipHint>
        )}
      </FeatureCard>

      {/* ---------- 2 · silence cut ---------- */}
      <FeatureCard icon={Scissors} title="Silence Cut" subtitle="Rough cut — remove silent gaps in one pass">
        {hasAudioSource && selectedClip ? (
          <>
            <ClipChip clip={selectedClip} />
            <div className="space-y-2.5">
              <div>
                <div className="flex items-center justify-between">
                  <FieldLabel>Background level</FieldLabel>
                  <span className="text-[10px] tabular-nums text-muted-foreground">{threshold.toFixed(2)}</span>
                </div>
                <Slider
                  min={0.02}
                  max={0.3}
                  step={0.01}
                  value={[threshold]}
                  onValueChange={(v) => setThreshold(v[0] ?? 0.06)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <FieldLabel>Min silence</FieldLabel>
                  <span className="text-[10px] tabular-nums text-muted-foreground">{minSilence.toFixed(1)}s</span>
                </div>
                <Slider
                  min={0.3}
                  max={2}
                  step={0.1}
                  value={[minSilence]}
                  onValueChange={(v) => setMinSilence(v[0] ?? 0.6)}
                  className="mt-1.5"
                />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={analyzing || removing}
              onClick={() => void handleAnalyze()}
              className="h-9 w-full rounded-lg border-(--nc-line-strong) bg-(--nc-panel) text-xs font-semibold hover:bg-(--nc-panel-strong) hover:text-foreground"
            >
              {analyzing ? <Loader2 className="size-3.5 animate-spin" /> : <AudioLines className="size-3.5" />}
              {analyzing ? 'Analyzing audio…' : 'Analyze'}
            </Button>
            {analysis && (
              <div className="space-y-2.5 rounded-lg border border-(--nc-line) bg-(--nc-scrim) p-3">
                <SilenceMap analysis={analysis} duration={selectedClip.duration} />
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Silence found</span>
                  <span className="font-semibold text-foreground">
                    {round2(analysis.totalSilence)}s · {silenceRanges.length} gap{silenceRanges.length === 1 ? '' : 's'}
                  </span>
                </div>
                <Button
                  type="button"
                  disabled={removing || silenceRanges.length === 0}
                  onClick={() => void handleRemoveSilences()}
                  className="nc-gradient nc-glow-hover h-9 w-full rounded-lg text-xs font-semibold text-white"
                >
                  {removing ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
                  {removing ? 'Cutting…' : 'Remove silences'}
                </Button>
              </div>
            )}
            <NoteRow icon={ShieldCheck}>Analysis runs fully on your device — audio never leaves the browser.</NoteRow>
          </>
        ) : (
          <NoClipHint>
            {selectedClip
              ? 'The selected clip has no readable audio track — pick a video or audio clip.'
              : 'Select a video or audio clip on the timeline to scan it for silence.'}
          </NoClipHint>
        )}
      </FeatureCard>

      {/* ---------- 3 · ai image ---------- */}
      <FeatureCard icon={ImageIcon} title="AI Image" subtitle="Generate B-roll visuals from a prompt">
        <Input
          value={imagePrompt}
          onChange={(e) => setImagePrompt(e.target.value)}
          placeholder="e.g. neon city skyline at dusk, cinematic"
          className="h-9 border-(--nc-line) bg-(--nc-scrim) text-xs placeholder:text-muted-foreground/60"
          maxLength={300}
        />
        <div className="space-y-1.5">
          <FieldLabel>Size</FieldLabel>
          <Select value={imageSize} onValueChange={setImageSize}>
            <SelectTrigger className="h-9 w-full text-xs">
              <SelectValue placeholder="Pick a size" />
            </SelectTrigger>
            <SelectContent>
              {IMAGE_SIZE_OPTIONS.map((o) => (
                <SelectItem key={o.id} value={o.id} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {imageBusy ? (
          <div className="nc-shimmer relative flex h-28 w-full items-center justify-center overflow-hidden rounded-lg border border-(--nc-line) bg-(--nc-panel)">
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Painting pixels…
            </span>
          </div>
        ) : (
          imagePreview && (
            <img
              src={imagePreview}
              alt="Latest AI generated image preview"
              className="h-28 w-full rounded-lg border border-(--nc-line) object-cover"
            />
          )
        )}
        <Button
          type="button"
          disabled={imageBusy}
          onClick={() => void handleGenerateImage()}
          className="nc-gradient nc-glow-hover h-9 w-full rounded-lg text-xs font-semibold text-white"
        >
          {imageBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
          {imageBusy ? 'Generating…' : 'Generate image'}
        </Button>
        <NoteRow icon={Sparkles}>Generated images are royalty-free — yours to use.</NoteRow>
      </FeatureCard>

      {/* ---------- 4 · ai voiceover ---------- */}
      <FeatureCard icon={Mic} title="AI Voiceover" subtitle="Turn a script into narrated audio">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <FieldLabel>Script</FieldLabel>
            <span className={`text-[10px] tabular-nums ${voiceText.length > 900 ? 'text-orange-400' : 'text-muted-foreground'}`}>
              {voiceText.length}/1000
            </span>
          </div>
          <Textarea
            value={voiceText}
            onChange={(e) => setVoiceText(e.target.value.slice(0, 1000))}
            placeholder="Write what the narrator should say…"
            rows={3}
            className="resize-none border-(--nc-line) bg-(--nc-scrim) text-xs placeholder:text-muted-foreground/60"
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Voice</FieldLabel>
          <Select value={voice} onValueChange={setVoice}>
            <SelectTrigger className="h-9 w-full text-xs">
              <SelectValue placeholder="Pick a voice" />
            </SelectTrigger>
            <SelectContent>
              {VOICE_OPTIONS.map((v) => (
                <SelectItem key={v.id} value={v.id} className="text-xs">
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <FieldLabel>Speed</FieldLabel>
            <span className="text-[10px] tabular-nums text-muted-foreground">{voiceSpeed.toFixed(2)}×</span>
          </div>
          <Slider
            min={0.5}
            max={2}
            step={0.05}
            value={[voiceSpeed]}
            onValueChange={(v) => setVoiceSpeed(v[0] ?? 1)}
            className="mt-1.5"
          />
        </div>
        <Button
          type="button"
          disabled={voiceBusy}
          onClick={() => void handleGenerateVoiceover()}
          className="nc-gradient nc-glow-hover h-9 w-full rounded-lg text-xs font-semibold text-white"
        >
          {voiceBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Mic className="size-3.5" />}
          {voiceBusy ? voicePhase : 'Generate voiceover'}
        </Button>
        <NoteRow icon={Mic}>Scripts over 900 characters are synthesized in sequential parts.</NoteRow>
      </FeatureCard>
    </div>
  )
}

export default AIPanel
