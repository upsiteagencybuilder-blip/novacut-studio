'use client'

/**
 * AI panel — the "AI Magic" suite, grouped into three sub-tabs:
 *
 *  Assistant  — AI Copilot (natural-language editing via /api/ai/copilot) and
 *               the Script Writer (hooks / scripts / captions from a topic)
 *  Video      — Auto Captions (speech-to-text + transcript translation),
 *               Silence Cut (on-device) and AI Audio Enhance (one-tap cleanup)
 *  Create     — AI Image (text-to-image B-roll) and AI Voiceover (TTS)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AudioLines,
  Bot,
  Captions,
  Clapperboard,
  FileText,
  Image as ImageIcon,
  Languages,
  Loader2,
  Mic,
  Paintbrush,
  RotateCcw,
  Scissors,
  Search,
  Send,
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
import { BACKGROUND_PRESETS, renderBackgroundPreset } from '@/lib/editor/asset-registry'
import { renderEffectToWav } from '@/lib/effects/audio-render'
import { MUSIC_EFFECTS } from '@/lib/effects/music'
import { applyCopilotActions, buildCopilotContext } from '@/lib/editor/copilot'
import { importFiles } from '@/lib/editor/importer'
import { rankFrames, renderTitleCard, scoreFrame, TITLE_CARD_STYLES, captureCurrentFrame, type FrameScore } from '@/lib/editor/thumbnail'
import { useEditor } from '@/lib/editor/store'
import { clamp, round2 } from '@/lib/editor/utils'
import type { AiSubTab } from '@/lib/editor/types'
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

/* ================= long-op progress (pro UX) ================= */

/**
 * Elapsed-seconds ticker for long AI operations.
 * Renders nothing itself — the busy bar consumes `ms`.
 */
function useAiElapsed(active: boolean) {
  const [ms, setMs] = useState(0)
  useEffect(() => {
    if (!active) return
    const t0 = performance.now()
    const iv = window.setInterval(() => setMs(performance.now() - t0), 200)
    return () => window.clearInterval(iv)
  }, [active])
  return ms
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Pro-style progress row for AI calls that take 10–90 s: shimmer track,
 * live phase, honest elapsed counter and an always-reachable Cancel.
 */
function AiBusyBar({
  phase,
  elapsedMs,
  hint,
  onCancel,
}: {
  phase: string
  elapsedMs: number
  hint?: string
  onCancel?: () => void
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-lg border border-fuchsia-400/25 bg-(--nc-scrim) p-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-foreground">
          <Loader2 className="size-3 shrink-0 animate-spin text-fuchsia-300" aria-hidden />
          <span className="truncate">{phase}</span>
        </span>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground" data-nc-elapsed>
          {formatElapsed(elapsedMs)}
        </span>
      </div>
      <div className="nc-shimmer mt-2 h-1 w-full overflow-hidden rounded-full" aria-hidden />
      {(hint || onCancel) && (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="min-w-0 text-[9.5px] leading-tight text-muted-foreground">{hint}</span>
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="h-6 shrink-0 rounded-md border-(--nc-line-strong) bg-(--nc-panel) px-2 text-[10px] font-semibold hover:bg-(--nc-panel-strong) hover:text-foreground"
            >
              Cancel
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/* ================= tab bar ================= */

const AI_TABS: { id: AiSubTab; label: string; icon: LucideIcon }[] = [
  { id: 'assistant', label: 'Assistant', icon: Bot },
  { id: 'video', label: 'Video', icon: Clapperboard },
  { id: 'create', label: 'Create', icon: Wand2 },
]

function AiTabBar({ tab, onChange }: { tab: AiSubTab; onChange: (t: AiSubTab) => void }) {
  return (
    <div role="tablist" aria-label="AI panel sections" className="grid grid-cols-3 gap-1.5 rounded-xl border border-(--nc-line) bg-(--nc-panel) p-1.5">
      {AI_TABS.map((t) => {
        const active = tab === t.id
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`flex h-8 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold transition ${
              active ? 'nc-gradient text-white shadow-[0_0_14px_var(--nc-accent-glow-soft)]' : 'text-muted-foreground hover:bg-(--nc-panel-strong) hover:text-foreground'
            }`}
          >
            <t.icon className="size-3.5" />
            {t.label}
          </button>
        )
      })}
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
    label: 'Classic chip',
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
  /* --- Day 32: six more styled caption looks --- */
  {
    id: 'karaoke',
    label: 'Karaoke yellow',
    patch: {
      fontFamily: 'Anton',
      fontSize: 58,
      bold: false,
      italic: false,
      color: '#facc15',
      background: null,
      backgroundPadding: 0,
      shadow: true,
      shadowColor: 'rgba(0,0,0,0.6)',
      shadowBlur: 8,
      strokeWidth: 7,
      strokeColor: '#0a0a12',
      animation: 'pop',
    },
  },
  {
    id: 'neon',
    label: 'Neon glow',
    patch: {
      fontFamily: 'Montserrat',
      fontSize: 46,
      bold: true,
      italic: false,
      color: '#fdf4ff',
      background: null,
      backgroundPadding: 0,
      shadow: true,
      shadowColor: 'rgba(232,121,249,0.95)',
      shadowBlur: 26,
      strokeWidth: 3,
      strokeColor: '#a21caf',
      animation: 'fadeIn',
    },
  },
  {
    id: 'minimal',
    label: 'Minimal clean',
    patch: {
      fontFamily: 'Montserrat',
      fontSize: 38,
      bold: false,
      italic: false,
      color: '#ffffff',
      background: null,
      backgroundPadding: 0,
      shadow: true,
      shadowColor: 'rgba(0,0,0,0.55)',
      shadowBlur: 10,
      strokeWidth: 0,
      animation: 'fadeIn',
    },
  },
  {
    id: 'pop',
    label: 'Social pop',
    patch: {
      fontFamily: 'Montserrat',
      fontSize: 52,
      bold: true,
      italic: false,
      color: '#ffffff',
      background: null,
      backgroundPadding: 0,
      shadow: true,
      shadowColor: 'rgba(0,0,0,0.5)',
      shadowBlur: 6,
      strokeWidth: 8,
      strokeColor: '#0a0a12',
      animation: 'bounceIn',
    },
  },
  {
    id: 'impact',
    label: 'Impact meme',
    patch: {
      fontFamily: 'Anton',
      fontSize: 68,
      bold: false,
      italic: false,
      color: '#ffffff',
      background: null,
      backgroundPadding: 0,
      shadow: false,
      strokeWidth: 10,
      strokeColor: '#000000',
      textTransform: 'uppercase',
      animation: 'pop',
    },
  },
  {
    id: 'lowerthird',
    label: 'News bar',
    patch: {
      fontFamily: 'Montserrat',
      fontSize: 36,
      bold: true,
      italic: false,
      color: '#fafafa',
      background: 'rgba(20,20,26,0.82)',
      backgroundPadding: 18,
      shadow: false,
      strokeWidth: 0,
      animation: 'slideUp',
    },
  },
]

const CAPTION_LANGS = [
  { id: 'off', label: 'Original — no translation' },
  { id: 'Bangla', label: 'Translate → বাংলা (Bangla)' },
  { id: 'English', label: 'Translate → English' },
  { id: 'Hindi', label: 'Translate → Hindi' },
  { id: 'Urdu', label: 'Translate → Urdu' },
  { id: 'Spanish', label: 'Translate → Spanish' },
  { id: 'Arabic', label: 'Translate → Arabic' },
  // Day 32 — wider multi-language set
  { id: 'French', label: 'Translate → French' },
  { id: 'German', label: 'Translate → German' },
  { id: 'Portuguese', label: 'Translate → Portuguese' },
  { id: 'Japanese', label: 'Translate → Japanese' },
]

/** Day 32 — languages offered for re-translating EXISTING caption clips in place */
const CAPTION_RETRANSLATE_LANGS = CAPTION_LANGS.filter((l) => l.id !== 'off')

const SCRIPT_LANGS = ['Bangla', 'English', 'Hindi', 'Urdu', 'Spanish', 'Arabic']

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
  /** Day 33 — language engines this voice serves best (honest per-language picks) */
  langs?: string[]
}

const VOICE_OPTIONS: VoiceOption[] = [
  { id: 'tongtong', label: 'Tongtong — Warm · Female', langs: ['中文', 'English'] },
  { id: 'chuichui', label: 'Chuichui — Cheerful', langs: ['中文'] },
  { id: 'xiaochen', label: 'Xiaochen — Calm · Professional', langs: ['中文'] },
  { id: 'jam', label: 'Jam — British · Male', langs: ['English'] },
  { id: 'kazi', label: 'Kazi — Clear · Standard', langs: ['English', 'বাংলা', 'Español'] },
  { id: 'douji', label: 'Douji — Natural', langs: ['Español', 'English'] },
  { id: 'luodo', label: 'Luodo — Expressive', langs: ['বাংলা', 'Español'] },
]

/** Day 33 — narration languages → recommended voice pick + visible engine set */
const TTS_LANGS: { id: string; label: string; defaultVoice: string }[] = [
  { id: 'Auto', label: 'Auto', defaultVoice: 'tongtong' },
  { id: 'English', label: 'English', defaultVoice: 'jam' },
  { id: 'বাংলা', label: 'বাংলা', defaultVoice: 'kazi' },
  { id: '中文', label: '中文', defaultVoice: 'tongtong' },
  { id: 'Español', label: 'Español', defaultVoice: 'douji' },
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

/* ================= copilot ================= */

interface CopilotMsg {
  role: 'user' | 'ai'
  text: string
  applied?: string[]
  skipped?: string[]
  /** v2 — how many plan steps the server proposed for this instruction */
  steps?: number
}

const COPILOT_WELCOME =
  'Hi! I run MULTI-STEP edit sequences from one instruction — try “trailer intro: bold title NovaCut, ken burns on all clips, crossfade and fade out at the end” or follow up with “now make it red”. Bangla চলে!'

const COPILOT_QUICK_PROMPTS = [
  'Trailer intro: bold title "NovaCut" at the start, kenBurns motion on all clips, crossfade between clips',
  'Vlog polish: warm look on all clips, fade in on the first clip and fade out 1.5s on the last clip',
  'Add a 💥 sticker and set speed 1.5 on the selected clip',
  'Make the last clip a PiP in the bottom right corner and add a marker at the playhead',
]

function CopilotCard() {
  const [msgs, setMsgs] = useState<CopilotMsg[]>([{ role: 'ai', text: COPILOT_WELCOME }])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const elapsed = useAiElapsed(busy)
  const chatRef = useRef<HTMLDivElement | null>(null)
  /** v2 — ref-mirrored transcript (Day 07 lesson: no side effects inside setState updaters) */
  const msgsRef = useRef<CopilotMsg[]>(msgs)
  useEffect(() => {
    msgsRef.current = msgs
  }, [msgs])

  useEffect(() => {
    const el = chatRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs, busy])

  const send = useCallback(
    async (raw?: string) => {
      const command = (raw ?? input).trim()
      if (!command || busy) return
      setInput('')
      setBusy(true)
      const ac = new AbortController()
      abortRef.current = ac
      setMsgs((m) => [...m, { role: 'user', text: command }])
      try {
        // v2 — recent turns ride along so follow-ups ("now make it red") resolve
        const history = msgsRef.current
          .filter((x) => x.text && x.text !== COPILOT_WELCOME)
          .slice(-8)
          .map((x) => ({ role: x.role, text: x.text.slice(0, 240) }))
        const res = await fetch('/api/ai/copilot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command,
            context: buildCopilotContext(useEditor.getState()),
            history,
          }),
          signal: ac.signal,
        })
        const data = (await res.json().catch(() => null)) as
          | { actions?: unknown[]; note?: string; error?: string }
          | null
        if (!res.ok) throw new Error(data?.error ?? `Copilot failed (${res.status})`)
        const actions = Array.isArray(data?.actions) ? data!.actions! : []
        let applied: string[] = []
        let skipped: string[] = []
        if (actions.length > 0) {
          const receipt = applyCopilotActions(actions)
          applied = receipt.applied
          skipped = receipt.skipped
        }
        const note = (data?.note ?? '').trim()
        setMsgs((m) => [
          ...m,
          {
            role: 'ai',
            text: note || (actions.length ? 'Done!' : 'I could not map that to an edit — try rephrasing.'),
            applied: applied.length ? applied : undefined,
            skipped: skipped.length ? skipped : undefined,
            steps: actions.length || undefined,
          },
        ])
        if (applied.length > 0) toast.success(`${applied.length} edit${applied.length === 1 ? '' : 's'} applied — one undo reverts all`)
        else if (skipped.length > 0) toast(`Nothing applied — ${skipped.length} step${skipped.length === 1 ? '' : 's'} skipped`)
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') {
          setMsgs((m) => [...m, { role: 'ai', text: 'Cancelled.' }])
        } else {
          setMsgs((m) => [...m, { role: 'ai', text: e instanceof Error ? e.message : 'Copilot failed' }])
        }
      } finally {
        abortRef.current = null
        setBusy(false)
      }
    },
    [input, busy]
  )

  const cancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return (
    <FeatureCard icon={Bot} title="AI Copilot v2" subtitle="One instruction — a full multi-step edit sequence">
      <div
        ref={chatRef}
        className="max-h-72 space-y-2.5 overflow-y-auto rounded-lg border border-(--nc-line) bg-(--nc-scrim) p-2.5"
        aria-live="polite"
      >
        {msgs.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={`max-w-[92%] rounded-xl px-2.5 py-1.5 ${
                m.role === 'user'
                  ? 'nc-gradient text-white'
                  : 'border border-(--nc-line) bg-(--nc-panel) text-foreground'
              }`}
            >
              {m.role === 'ai' && m.steps ? (
                <p
                  data-nc-copilot-plan
                  className="mb-1 inline-block rounded-full border border-fuchsia-400/30 bg-fuchsia-400/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-fuchsia-300"
                >
                  Plan · {m.steps} step{m.steps === 1 ? '' : 's'} · one undo
                </p>
              ) : null}
              <p className="whitespace-pre-wrap text-[11px] leading-relaxed">{m.text}</p>
              {m.applied && m.applied.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {m.applied.map((x, j) => (
                    <span
                      key={`a${j}`}
                      className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-medium text-emerald-300"
                    >
                      ✓ {x}
                    </span>
                  ))}
                </div>
              )}
              {m.skipped && m.skipped.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {m.skipped.map((x, j) => (
                    <span
                      key={`s${j}`}
                      className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[9px] font-medium text-amber-300"
                      title="Skipped — the copilot only applies edits it can verify"
                    >
                      ⚠ {x}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="min-w-0 flex-1">
              <AiBusyBar
                phase="Planning edits…"
                elapsedMs={elapsed}
                hint="Reading your project and drafting the edit plan"
                onCancel={cancel}
              />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {COPILOT_QUICK_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            disabled={busy}
            data-nc-copilot-chip={p.slice(0, 18)}
            onClick={() => void send(p)}
            className="rounded-lg border border-(--nc-line) bg-(--nc-panel) px-2 py-1.5 text-left text-[10px] leading-snug text-muted-foreground transition hover:border-fuchsia-400/50 hover:text-foreground disabled:opacity-50"
          >
            {p}
          </button>
        ))}
      </div>

      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. add a title + crossfade…"
          maxLength={600}
          disabled={busy}
          className="h-9 flex-1 border-(--nc-line) bg-(--nc-scrim) text-xs placeholder:text-muted-foreground/60"
          aria-label="Describe the edit for the AI copilot"
        />
        <Button
          type="submit"
          size="icon"
          disabled={busy || !input.trim()}
          aria-label="Send to AI copilot"
          className="nc-gradient nc-glow-hover size-9 shrink-0 rounded-lg text-white"
        >
          <Send className="size-3.5" />
        </Button>
      </form>
      <NoteRow icon={ShieldCheck}>Plans are validated against your project — unknown edits are skipped, never guessed.</NoteRow>
    </FeatureCard>
  )
}

/* ================= AI BGM director (Day 34) ================= */

const BGM_MOOD_CHIPS = [
  'Cozy rainy vlog',
  'Hype gaming intro',
  'Cinematic epic trailer',
  'Sad piano story',
  'Happy travel montage',
  'Dark tension build-up',
]

interface BgmSectionReceipt {
  name: string
  start: number
  duration: number
}

function BgmDirectorCard() {
  const [mood, setMood] = useState('')
  const [bgmDuck, setBgmDuck] = useState(true)
  const [bgmBusy, setBgmBusy] = useState(false)
  const [bgmPhase, setBgmPhase] = useState('')
  const [bgmPlan, setBgmPlan] = useState<{ note: string; applied: BgmSectionReceipt[]; skipped: string[] } | null>(null)
  const bgmAbortRef = useRef<AbortController | null>(null)
  const bgmElapsed = useAiElapsed(bgmBusy)

  const cancelBgm = useCallback(() => {
    bgmAbortRef.current?.abort()
  }, [])

  const handleGenerateBgm = useCallback(async () => {
    if (bgmBusy) return
    const text = mood.trim()
    if (!text) {
      toast.error('Describe the mood first')
      return
    }
    requireOnline()
    setBgmBusy(true)
    setBgmPlan(null)
    const ac = new AbortController()
    bgmAbortRef.current = ac
    try {
      const st0 = useEditor.getState()
      const projectEnd = st0.project.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0)
      const hasSpeech = st0.project.clips.some((c) => c.kind === 'video' || c.kind === 'audio')
      setBgmPhase('Directing the arrangement…')
      const res = await fetch('/api/ai/bgm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mood: text,
          context: { durationSec: round2(projectEnd) || 30, clipCount: st0.project.clips.length, hasSpeech },
        }),
        signal: ac.signal,
      })
      const data = (await res.json().catch(() => null)) as
        | { sections?: { effectId: string; start: number; duration: number; fadeIn: number; fadeOut: number; volume: number }[]; note?: string; error?: string }
        | null
      if (!res.ok) throw new Error(data?.error ?? `BGM planning failed (${res.status})`)
      const sections = Array.isArray(data?.sections) ? data!.sections! : []
      if (!sections.length) {
        setBgmPlan({ note: (data?.note ?? '').trim() || 'No arrangement came back — try a different mood.', applied: [], skipped: [] })
        return
      }

      setBgmPhase(`Rendering ${sections.length} section${sections.length === 1 ? '' : 's'}…`)
      // the WHOLE arrangement is one history group — one undo removes every section
      const before = st0.beginHistoryGroup()
      const applied: BgmSectionReceipt[] = []
      const skipped: string[] = []
      for (let i = 0; i < sections.length; i++) {
        const sec = sections[i]
        const effect = MUSIC_EFFECTS.find((e) => e.id === sec.effectId)
        if (!effect) {
          skipped.push(`Section ${i + 1}: unknown loop "${String(sec.effectId).slice(0, 30)}"`)
          continue
        }
        setBgmPhase(`Rendering section ${i + 1}: ${effect.name}`)
        const rendered = await renderEffectToWav(effect)
        const file = new File([rendered.blob], `${rendered.name}.wav`, { type: 'audio/wav' })
        const assets = await importFiles([file])
        if (!assets.length) {
          skipped.push(`Section ${i + 1}: render import failed`)
          continue
        }
        const st = useEditor.getState()
        assets.forEach(st.addMediaAsset)
        const beforeIds = new Set(useEditor.getState().project.clips.map((c) => c.id))
        useEditor.getState().addClipFromMediaId(assets[0]!.id, round2(sec.start))
        const st2 = useEditor.getState()
        const clip = st2.project.clips.find((c) => !beforeIds.has(c.id))
        if (!clip) {
          skipped.push(`Section ${i + 1}: placement failed`)
          continue
        }
        // stage the section — duration clamps to the loop's rendered length (honest)
        const dur = round2(Math.min(sec.duration, clip.sourceDuration || sec.duration))
        st2.updateClip(
          clip.id,
          {
            duration: dur,
            volume: clamp(sec.volume, 0.1, 1),
            fadeIn: round2(clamp(sec.fadeIn, 0, Math.max(0.05, dur * 0.6))),
            fadeOut: round2(clamp(sec.fadeOut, 0, Math.max(0.05, dur * 0.6))),
            ...(bgmDuck && hasSpeech ? { autoDuck: true, duckDepth: 0.68 } : {}),
          },
          false
        )
        applied.push({ name: effect.name, start: sec.start, duration: dur })
      }
      useEditor.getState().endHistoryGroup(before)
      setBgmPlan({ note: (data?.note ?? '').trim(), applied, skipped })
      if (applied.length > 0) {
        toast.success(`${applied.length} BGM section${applied.length === 1 ? '' : 's'} placed — one undo removes all`)
      } else {
        toast(`No sections applied — ${skipped.length} skipped`)
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') toast('BGM cancelled')
      else toast.error(e instanceof Error ? e.message : 'BGM generation failed')
    } finally {
      bgmAbortRef.current = null
      setBgmPhase('')
      setBgmBusy(false)
    }
  }, [bgmBusy, mood, bgmDuck])

  return (
    <FeatureCard icon={AudioLines} title="AI BGM" subtitle="Describe a mood — get a scored arrangement">
      <div className="space-y-1.5">
        <FieldLabel>Mood</FieldLabel>
        <Input
          value={mood}
          onChange={(e) => setMood(e.target.value.slice(0, 300))}
          placeholder="e.g. cozy rainy vlog, hype gaming…"
          maxLength={300}
          disabled={bgmBusy}
          data-nc-bgm-input
          className="h-9 border-(--nc-line) bg-(--nc-scrim) text-xs placeholder:text-muted-foreground/60"
          aria-label="Describe the background music mood"
        />
        <div className="flex flex-wrap gap-1">
          {BGM_MOOD_CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              disabled={bgmBusy}
              data-nc-bgm-chip={c.slice(0, 14)}
              onClick={() => setMood(c)}
              className="rounded-full border border-(--nc-line) bg-(--nc-panel) px-2 py-0.5 text-[9.5px] text-muted-foreground transition hover:border-fuchsia-400/50 hover:text-foreground disabled:opacity-50"
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
        <input
          type="checkbox"
          checked={bgmDuck}
          onChange={(e) => setBgmDuck(e.target.checked)}
          data-nc-bgm-duck
          className="size-3.5 accent-fuchsia-500"
        />
        Auto-duck under speech (threshold ducking v2)
      </label>
      <Button
        type="button"
        disabled={bgmBusy}
        onClick={() => void handleGenerateBgm()}
        data-nc-bgm-generate
        className="nc-gradient nc-glow-hover h-9 w-full rounded-lg text-xs font-semibold text-white"
      >
        {bgmBusy ? <Loader2 className="size-3.5 animate-spin" /> : <AudioLines className="size-3.5" />}
        {bgmBusy ? bgmPhase : 'Arrange BGM'}
      </Button>
      {bgmBusy && (
        <AiBusyBar
          phase={bgmPhase || 'Working…'}
          elapsedMs={bgmElapsed}
          hint="Mood → arrangement from the 64-loop library, rendered offline"
          onCancel={cancelBgm}
        />
      )}
      {bgmPlan && (
        <div className="space-y-1.5 rounded-lg border border-(--nc-line) bg-(--nc-scrim) p-2" data-nc-bgm-receipt>
          {bgmPlan.note && <p className="text-[10px] leading-relaxed text-foreground/80">{bgmPlan.note}</p>}
          {bgmPlan.applied.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {bgmPlan.applied.map((s, i) => (
                <span
                  key={i}
                  className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-medium text-emerald-300"
                >
                  ✓ {s.name} @ {s.start}s · {s.duration}s
                </span>
              ))}
            </div>
          )}
          {bgmPlan.skipped.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {bgmPlan.skipped.map((s, i) => (
                <span
                  key={i}
                  className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[9px] font-medium text-amber-300"
                >
                  ⚠ {s}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      <NoteRow icon={AudioLines}>Arrangements come from the 64 procedural loops — rendered on your device, royalty-free.</NoteRow>
    </FeatureCard>
  )
}

/* ================= AI asset search (Day 39) ================= */

const ASSET_IDEAS = ['cozy coffee vlog', 'gaming intro fire', 'travel ocean vibes', 'beauty pastel soft']

interface AssetResult {
  kind: 'sticker' | 'background'
  id: string
  name: string
  reason: string
}

function AssetSearchCard() {
  const [assetQuery, setAssetQuery] = useState('')
  const [assetBusy, setAssetBusy] = useState(false)
  const [assetResults, setAssetResults] = useState<AssetResult[]>([])
  const [assetNote, setAssetNote] = useState('')
  const [addingId, setAddingId] = useState<string | null>(null)
  const assetAbortRef = useRef<AbortController | null>(null)
  const assetElapsed = useAiElapsed(assetBusy)
  const addMediaAsset = useEditor((s) => s.addMediaAsset)
  const project = useEditor((s) => s.project)

  const cancelAssetSearch = useCallback(() => {
    assetAbortRef.current?.abort()
  }, [])

  const handleAssetSearch = useCallback(async () => {
    if (assetBusy) return
    const q = assetQuery.trim()
    if (!q) {
      toast.error('Describe what you are looking for')
      return
    }
    requireOnline()
    setAssetBusy(true)
    setAssetResults([])
    setAssetNote('')
    const ac = new AbortController()
    assetAbortRef.current = ac
    try {
      const res = await fetch('/api/ai/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q.slice(0, 200) }),
        signal: ac.signal,
      })
      const data = (await res.json().catch(() => null)) as
        | { results?: AssetResult[]; note?: string; error?: string }
        | null
      if (!res.ok) throw new Error(data?.error ?? `Asset search failed (${res.status})`)
      setAssetResults(Array.isArray(data?.results) ? data!.results! : [])
      setAssetNote((data?.note ?? '').trim())
      if (!data?.results?.length) toast('No matching assets — try different words')
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') toast('Asset search cancelled')
      else toast.error(e instanceof Error ? e.message : 'Asset search failed')
    } finally {
      assetAbortRef.current = null
      setAssetBusy(false)
    }
  }, [assetBusy, assetQuery])

  /** place an asset on the timeline at the playhead (CapCut-style drop) */
  const placeAsset = useCallback(
    async (r: AssetResult) => {
      const key = `${r.kind}:${r.id}`
      if (addingId) return
      setAddingId(key)
      try {
        if (r.kind === 'sticker') {
          const st = useEditor.getState()
          st.addStickerClip({ family: 'shape', shape: r.id })
          toast.success(`${r.name} added at the playhead`)
        } else {
          const preset = BACKGROUND_PRESETS.find((b) => b.id === r.id)
          if (!preset) return
          const blob = await renderBackgroundPreset(preset, project.canvasWidth, project.canvasHeight)
          const file = new File([blob], `bg-${preset.id}.png`, { type: 'image/png' })
          const assets = await importFiles([file])
          if (!assets.length) {
            toast.error('Background render import failed')
            return
          }
          const st = useEditor.getState()
          assets.forEach(st.addMediaAsset)
          st.addClipFromMediaId(assets[0]!.id, round2(st.currentTime))
          toast.success(`${preset.name} background placed at the playhead`)
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Asset placement failed')
      } finally {
        setAddingId(null)
      }
    },
    [addingId, project.canvasWidth, project.canvasHeight, addMediaAsset],
  )

  return (
    <FeatureCard icon={Search} title="AI Asset Search" subtitle="Describe it — stickers & backgrounds, placed in one tap">
      <div className="flex gap-1.5">
        <Input
          value={assetQuery}
          onChange={(e) => setAssetQuery(e.target.value.slice(0, 200))}
          placeholder="e.g. cozy coffee vlog vibes…"
          maxLength={200}
          disabled={assetBusy}
          data-nc-asset-input
          className="h-9 flex-1 border-(--nc-line) bg-(--nc-scrim) text-xs placeholder:text-muted-foreground/60"
          aria-label="Describe the asset you want"
        />
        <Button
          type="button"
          size="icon"
          disabled={assetBusy || !assetQuery.trim()}
          onClick={() => void handleAssetSearch()}
          data-nc-asset-search
          aria-label="Search assets with AI"
          className="nc-gradient nc-glow-hover size-9 shrink-0 rounded-lg text-white"
        >
          {assetBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        {ASSET_IDEAS.map((c) => (
          <button
            key={c}
            type="button"
            disabled={assetBusy}
            data-nc-asset-chip={c.slice(0, 14)}
            onClick={() => setAssetQuery(c)}
            className="rounded-full border border-(--nc-line) bg-(--nc-panel) px-2 py-0.5 text-[9.5px] text-muted-foreground transition hover:border-fuchsia-400/50 hover:text-foreground disabled:opacity-50"
          >
            {c}
          </button>
        ))}
      </div>
      {assetBusy && (
        <AiBusyBar
          phase="Searching the registry…"
          elapsedMs={assetElapsed}
          hint="AI matches your words against stickers + backgrounds"
          onCancel={cancelAssetSearch}
        />
      )}
      {assetResults.length > 0 && (
        <div className="space-y-1.5" data-nc-asset-results>
          {assetNote && <p className="text-[10px] leading-relaxed text-foreground/80">{assetNote}</p>}
          <div className="grid grid-cols-3 gap-1.5">
            {assetResults.map((r) => {
              const key = `${r.kind}:${r.id}`
              const bg = r.kind === 'background' ? (BACKGROUND_PRESETS.find((b) => b.id === r.id)?.css ?? '#333') : undefined
              const emoji = r.kind === 'sticker' ? '✦' : undefined
              return (
                <button
                  key={key}
                  type="button"
                  disabled={addingId !== null}
                  data-nc-asset-place={key}
                  onClick={() => void placeAsset(r)}
                  className="group space-y-1 rounded-lg border border-(--nc-line) bg-(--nc-panel) p-1.5 text-center transition hover:border-fuchsia-400/50 disabled:opacity-50"
                >
                  <span
                    className="flex h-12 w-full items-center justify-center rounded text-xl"
                    style={bg ? { background: bg } : { background: 'rgba(255,255,255,0.06)' }}
                    aria-hidden
                  >
                    {emoji}
                  </span>
                  <span className="block truncate text-[9px] font-semibold text-foreground">{r.name}</span>
                  <span className="block truncate text-[8.5px] text-muted-foreground">{r.reason}</span>
                  <span className="block text-[8.5px] font-medium text-fuchsia-300">
                    {addingId === key ? 'Placing…' : r.kind === 'sticker' ? '+ Sticker' : '+ Background'}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="text-[9px] text-muted-foreground/60">
            One tap lands the asset at the playhead — drag it on the timeline to reposition.
          </p>
        </div>
      )}
      <NoteRow icon={ShieldCheck}>Registry-validated search — stickers and gradients only, no invented assets.</NoteRow>
    </FeatureCard>
  )
}

/* ================= script → storyboard (Day 37) ================= */

function StoryboardCard() {
  const [sbTopic, setSbTopic] = useState('')
  const [sbSeconds, setSbSeconds] = useState(30)
  const [sbBusy, setSbBusy] = useState(false)
  const [sbShots, setSbShots] = useState<{ title: string; description: string; seconds: number; start: number }[] | null>(null)
  const sbAbortRef = useRef<AbortController | null>(null)
  const sbElapsed = useAiElapsed(sbBusy)

  const cancelStoryboard = useCallback(() => {
    sbAbortRef.current?.abort()
  }, [])

  const handleStoryboard = useCallback(async () => {
    if (sbBusy) return
    const topic = sbTopic.trim()
    if (!topic) {
      toast.error('Write the video topic first')
      return
    }
    requireOnline()
    setSbBusy(true)
    setSbShots(null)
    const ac = new AbortController()
    sbAbortRef.current = ac
    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'storyboard', topic: topic.slice(0, 300), seconds: sbSeconds }),
        signal: ac.signal,
      })
      const data = (await res.json().catch(() => null)) as
        | { shots?: { title: string; description: string; seconds: number }[]; error?: string }
        | null
      if (!res.ok || !data?.shots?.length) {
        throw new Error(data?.error ?? `Storyboard failed (${res.status})`)
      }

      // scaffold the timeline — every slate inside ONE history group
      const st0 = useEditor.getState()
      const before = st0.beginHistoryGroup()
      const placed: { title: string; description: string; seconds: number; start: number }[] = []
      let cursor = 0
      for (let i = 0; i < data.shots.length; i++) {
        const shot = data.shots[i]
        const beforeIds = new Set(useEditor.getState().project.clips.map((c) => c.id))
        useEditor.getState().addTextClip()
        const st1 = useEditor.getState()
        const clip = st1.project.clips.find((c) => !beforeIds.has(c.id))
        if (!clip) continue
        // move to the sequenced slot and stage the slate look
        st1.moveClip(clip.id, round2(cursor), null, false)
        const st2 = useEditor.getState()
        st2.updateClip(
          clip.id,
          {
            duration: round2(Math.max(1.5, shot.seconds)),
            name: `S${i + 1}: ${shot.title.slice(0, 24)}`,
            textStyle: {
              ...(clip.textStyle ?? {}),
              content: `SHOT ${i + 1} · ${shot.title.toUpperCase()}`,
              fontSize: 54,
              bold: true,
              color: '#fafafa',
              background: 'rgba(10,10,18,0.85)',
              backgroundPadding: 22,
              animation: 'fadeIn' as const,
            },
          },
          false
        )
        placed.push({ ...shot, start: round2(cursor) })
        cursor += Math.max(1.5, shot.seconds)
      }
      useEditor.getState().endHistoryGroup(before)
      setSbShots(placed)
      if (placed.length) {
        toast.success(`${placed.length} storyboard slates placed — one undo clears all`)
      } else {
        toast.error('The shot list could not be placed on the timeline')
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') toast('Storyboard cancelled')
      else toast.error(e instanceof Error ? e.message : 'Storyboard failed')
    } finally {
      sbAbortRef.current = null
      setSbBusy(false)
    }
  }, [sbBusy, sbTopic, sbSeconds])

  return (
    <FeatureCard icon={Clapperboard} title="Script → Storyboard" subtitle="A shot list that scaffolds the timeline">
      <div className="space-y-1.5">
        <FieldLabel>Video topic</FieldLabel>
        <Textarea
          value={sbTopic}
          onChange={(e) => setSbTopic(e.target.value.slice(0, 300))}
          placeholder="e.g. a 30s promo for my handmade coffee brand…"
          rows={2}
          maxLength={300}
          data-nc-sb-topic
          className="resize-none border-(--nc-line) bg-(--nc-scrim) text-xs placeholder:text-muted-foreground/60"
          aria-label="Storyboard topic"
        />
      </div>
      <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Target length">
        {[15, 30, 60].map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={sbSeconds === s}
            data-nc-sb-len={s}
            onClick={() => setSbSeconds(s)}
            className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition ${
              sbSeconds === s
                ? 'border-fuchsia-400/70 bg-fuchsia-400/15 text-fuchsia-200'
                : 'border-(--nc-line) bg-(--nc-panel) text-muted-foreground hover:text-foreground'
            }`}
          >
            ~{s}s
          </button>
        ))}
      </div>
      <Button
        type="button"
        disabled={sbBusy}
        onClick={() => void handleStoryboard()}
        data-nc-sb-generate
        className="nc-gradient nc-glow-hover h-9 w-full rounded-lg text-xs font-semibold text-white"
      >
        {sbBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Clapperboard className="size-3.5" />}
        {sbBusy ? 'Directing shots…' : 'Generate storyboard'}
      </Button>
      {sbBusy && (
        <AiBusyBar
          phase="Directing shots…"
          elapsedMs={sbElapsed}
          hint="Topic → shot list → slate clips on the timeline"
          onCancel={cancelStoryboard}
        />
      )}
      {sbShots && sbShots.length > 0 && (
        <div className="space-y-1 rounded-lg border border-(--nc-line) bg-(--nc-scrim) p-2" data-nc-sb-receipt>
          {sbShots.map((s, i) => (
            <div key={i} className="flex items-baseline gap-1.5 text-[10px] leading-snug">
              <span className="rounded bg-(--nc-panel-strong) px-1 font-mono text-[9px] text-fuchsia-300">
                {s.start}s · {s.seconds}s
              </span>
              <span className="font-semibold text-foreground">{s.title}</span>
              <span className="truncate text-muted-foreground">{s.description}</span>
            </div>
          ))}
          <p className="pt-0.5 text-[9px] text-muted-foreground/60">
            Slates are placeholder text clips — replace each with your real footage, one undo clears all.
          </p>
        </div>
      )}
    </FeatureCard>
  )
}

/* ================= AI thumbnails (Day 36) ================= */

const THUMB_STYLES = TITLE_CARD_STYLES

function ThumbnailsCard() {
  const selectedClip = useEditor((s) => s.project.clips.find((c) => s.selectedClipIds.includes(c.id)) ?? null)
  const addMediaAsset = useEditor((s) => s.addMediaAsset)
  const setCurrentTime = useEditor((s) => s.setCurrentTime)
  const project = useEditor((s) => s.project)
  const media = useEditor((s) => s.media)

  const isVisual = !!selectedClip && (selectedClip.kind === 'video' || selectedClip.kind === 'image')
  const asset = selectedClip?.mediaId ? media.find((m) => m.id === selectedClip.mediaId) ?? null : null

  /* ---------- best-frame picker ---------- */
  const [scanning, setScanning] = useState(false)
  const [candidates, setCandidates] = useState<FrameScore[]>([])
  const [capturingT, setCapturingT] = useState<number | null>(null)

  const scanFrames = useCallback(async () => {
    if (!selectedClip || scanning) return
    const engine = (
      window as unknown as { __ncEngineInstance?: { seekTo: (t: number) => void; sampleFrame: (n: number) => Uint8ClampedArray | null } }
    ).__ncEngineInstance
    if (!engine) {
      toast.error('Preview engine not ready')
      return
    }
    setScanning(true)
    setCandidates([])
    try {
      const st = useEditor.getState()
      const savedTime = st.currentTime
      const frames: FrameScore[] = []
      for (let i = 0; i < 7; i++) {
        const t = round2(selectedClip.start + (selectedClip.duration * (i + 0.5)) / 7)
        engine.seekTo(Math.min(t, selectedClip.start + selectedClip.duration - 0.05))
        await new Promise((r) => setTimeout(r, 140))
        const px = engine.sampleFrame(96)
        if (px && px.length >= 64) {
          const side = Math.round(Math.sqrt(px.length / 4))
          frames.push(scoreFrame(px, side, side, t, 96))
        }
      }
      engine.seekTo(savedTime)
      if (!frames.length) {
        toast.error('Could not read frames from this clip')
        return
      }
      setCandidates(rankFrames(frames).slice(0, 3))
    } finally {
      setScanning(false)
    }
  }, [selectedClip, scanning])

  const captureFrame = useCallback(
    async (t: number) => {
      if (capturingT !== null) return
      setCapturingT(t)
      try {
        const engine = (
          window as unknown as { __ncEngineInstance?: { seekTo: (t: number) => void } }
        ).__ncEngineInstance
        engine?.seekTo(t)
        await new Promise((r) => setTimeout(r, 220))
        const blob = await captureCurrentFrame(project.canvasWidth, project.canvasHeight)
        const file = new File([blob], `best-frame-${round2(t)}s.png`, { type: 'image/png' })
        const assets = await importFiles([file])
        if (assets.length) {
          assets.forEach(addMediaAsset)
          toast.success('Frame captured to the media library')
        } else {
          toast.error('Capture import failed')
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Frame capture failed')
      } finally {
        setCapturingT(null)
      }
    },
    [capturingT, project.canvasWidth, project.canvasHeight, addMediaAsset],
  )

  /* ---------- title-card generator ---------- */
  const [cardTitle, setCardTitle] = useState('')
  const [cardSubtitle, setCardSubtitle] = useState('')
  const [cardStyleId, setCardStyleId] = useState(THUMB_STYLES[0]!.id)
  const [usePhoto, setUsePhoto] = useState(true)
  const [cardBusy, setCardBusy] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [cardPreview, setCardPreview] = useState<string | null>(null)

  const suggestTitles = useCallback(async () => {
    if (suggesting) return
    const topic = cardTitle.trim() || project.name
    requireOnline()
    setSuggesting(true)
    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'titles', topic: topic.slice(0, 200) }),
      })
      const data = (await res.json().catch(() => null)) as { text?: string; error?: string } | null
      if (!res.ok || !data?.text) throw new Error(data?.error ?? `Title ideas failed (${res.status})`)
      const lines = data.text
        .split('\n')
        .map((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim())
        .filter((l) => l.length > 2)
        .slice(0, 8)
      setSuggestions(lines)
      if (!lines.length) toast('No title ideas came back — try a different topic')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Title suggestions failed')
    } finally {
      setSuggesting(false)
    }
  }, [suggesting, cardTitle, project.name])

  const generateCard = useCallback(async () => {
    if (cardBusy) return
    const title = cardTitle.trim()
    if (!title) {
      toast.error('Write the thumbnail title first')
      return
    }
    setCardBusy(true)
    try {
      let frameDataUrl: string | null = null
      if (usePhoto) {
        const blob = await captureCurrentFrame(project.canvasWidth, project.canvasHeight)
        frameDataUrl = await new Promise<string>((resolve) => {
          const fr = new FileReader()
          fr.onload = () => resolve(String(fr.result))
          fr.readAsDataURL(blob)
        })
      }
      const style = THUMB_STYLES.find((s) => s.id === cardStyleId) ?? THUMB_STYLES[0]!
      const { blob, preview } = await renderTitleCard({
        title,
        subtitle: cardSubtitle,
        style,
        frameDataUrl,
      })
      setCardPreview(preview)
      const file = new File([blob], `title-card-${style.id}.png`, { type: 'image/png' })
      const assets = await importFiles([file])
      if (assets.length) {
        assets.forEach(addMediaAsset)
        toast.success('Title card added to the media library')
      } else {
        toast.error('Card import failed')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Title card failed')
    } finally {
      setCardBusy(false)
    }
  }, [cardBusy, cardTitle, cardSubtitle, cardStyleId, usePhoto, project.canvasWidth, project.canvasHeight, addMediaAsset])

  return (
    <FeatureCard icon={ImageIcon} title="AI Thumbnails" subtitle="Best-frame picker + title-card generator">
      {/* ---------- best frames ---------- */}
      <div className="space-y-1.5" data-nc-thumb-frames>
        <div className="flex items-center justify-between">
          <FieldLabel>Best frame</FieldLabel>
          {selectedClip ? (
            <span className="max-w-[55%] truncate text-[9.5px] text-muted-foreground">
              {selectedClip.name.slice(0, 22)}
              {asset ? ` · ${asset.width}×${asset.height}` : ''}
            </span>
          ) : null}
        </div>
        {isVisual ? (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={scanning}
              onClick={() => void scanFrames()}
              data-nc-thumb-scan
              className="h-8 w-full rounded-lg border-(--nc-line) text-[11px]"
            >
              {scanning ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
              {scanning ? 'Scanning 7 frames…' : 'Scan for best frames'}
            </Button>
            {candidates.length > 0 && (
              <div className="grid grid-cols-3 gap-1.5" data-nc-thumb-cands>
                {candidates.map((c) => (
                  <div key={c.t} className="space-y-1 rounded-lg border border-(--nc-line) bg-(--nc-panel) p-1.5">
                    {c.preview ? (
                      <img src={c.preview} alt={`Frame at ${c.t}s`} className="h-12 w-full rounded object-cover" />
                    ) : null}
                    <p className="text-center font-mono text-[9px] text-foreground">{c.t}s</p>
                    <p className="text-center font-mono text-[8.5px] leading-tight text-muted-foreground">
                      d{c.detail.toFixed(2)} e{c.exposure.toFixed(2)} c{c.contrast.toFixed(2)}
                    </p>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        disabled={capturingT !== null}
                        onClick={() => void captureFrame(c.t)}
                        data-nc-thumb-capture={c.t}
                        className="nc-gradient h-6 flex-1 rounded-md px-1 text-[9px] font-semibold text-white"
                      >
                        {capturingT === c.t ? '…' : 'Capture'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setCurrentTime(c.t)}
                        className="h-6 rounded-md px-1.5 text-[9px]"
                      >
                        Go
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[9px] leading-snug text-muted-foreground/60">
              Scores detail 50% + exposure 30% + contrast 20% — every number stays visible.
            </p>
          </>
        ) : (
          <NoClipHint>Select a video or image clip to scan its frames.</NoClipHint>
        )}
      </div>

      {/* ---------- title card ---------- */}
      <div className="space-y-1.5 border-t border-(--nc-line) pt-2" data-nc-thumb-card>
        <FieldLabel>Title card</FieldLabel>
        <div className="flex gap-1.5">
          <Input
            value={cardTitle}
            onChange={(e) => setCardTitle(e.target.value.slice(0, 80))}
            placeholder="Thumbnail title…"
            maxLength={80}
            data-nc-thumb-title
            className="h-8 flex-1 border-(--nc-line) bg-(--nc-scrim) text-xs"
            aria-label="Thumbnail title"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={suggesting}
            onClick={() => void suggestTitles()}
            data-nc-thumb-suggest
            className="h-8 shrink-0 rounded-lg px-2 text-[10px]"
          >
            {suggesting ? <Loader2 className="size-3 animate-spin" /> : <Wand2 className="size-3" />}
            Ideas
          </Button>
        </div>
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1" data-nc-thumb-suggestions>
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCardTitle(s.slice(0, 80))}
                className="rounded-full border border-(--nc-line) bg-(--nc-panel) px-2 py-0.5 text-[9.5px] text-muted-foreground transition hover:border-fuchsia-400/50 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <Input
          value={cardSubtitle}
          onChange={(e) => setCardSubtitle(e.target.value.slice(0, 60))}
          placeholder="Subtitle (optional)"
          maxLength={60}
          className="h-8 border-(--nc-line) bg-(--nc-scrim) text-xs"
          aria-label="Thumbnail subtitle"
        />
        <div className="grid grid-cols-4 gap-1">
          {THUMB_STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={cardStyleId === s.id}
              data-nc-thumb-style={s.id}
              onClick={() => setCardStyleId(s.id)}
              className={`flex h-9 items-center justify-center rounded-lg border text-[9px] font-semibold transition ${
                cardStyleId === s.id
                  ? 'border-fuchsia-400/70 bg-fuchsia-400/10 text-foreground'
                  : 'border-(--nc-line) bg-(--nc-panel) text-muted-foreground hover:text-foreground'
              }`}
            >
              <span
                className="rounded px-1 py-0.5"
                style={{
                  color: s.titleColor,
                  background: s.accent,
                  textShadow: `0 1px 1px ${s.titleStroke}`,
                }}
              >
                Aa
              </span>
              <span className="ml-1 truncate">{s.label.split(' ')[0]}</span>
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={usePhoto}
            onChange={(e) => setUsePhoto(e.target.checked)}
            data-nc-thumb-photo
            className="size-3.5 accent-fuchsia-500"
          />
          Use the current preview frame as the background
        </label>
        <Button
          type="button"
          disabled={cardBusy}
          onClick={() => void generateCard()}
          data-nc-thumb-generate
          className="nc-gradient nc-glow-hover h-9 w-full rounded-lg text-xs font-semibold text-white"
        >
          {cardBusy ? <Loader2 className="size-3.5 animate-spin" /> : <ImageIcon className="size-3.5" />}
          {cardBusy ? 'Rendering 1280×720…' : 'Generate title card'}
        </Button>
        {cardPreview && (
          <img src={cardPreview} alt="Generated title card preview" className="w-full rounded-lg border border-(--nc-line)" data-nc-thumb-preview />
        )}
      </div>
      <NoteRow icon={ShieldCheck}>Frames and cards render on your device — 1280×720 PNGs, royalty-free.</NoteRow>
    </FeatureCard>
  )
}

/* ================= script writer ================= */

const SCRIPT_KINDS = [
  { id: 'script', label: 'Voiceover script' },
  { id: 'hooks', label: '8 hook ideas' },
  { id: 'captions', label: '6 caption ideas' },
] as const

function ScriptWriterCard() {
  const [topic, setTopic] = useState('')
  const [kind, setKind] = useState<'script' | 'hooks' | 'captions'>('script')
  const [language, setLanguage] = useState('Bangla')
  const [busy, setBusy] = useState(false)
  const [output, setOutput] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const elapsed = useAiElapsed(busy)

  const generate = useCallback(async () => {
    const t = topic.trim()
    if (!t) {
      toast.error('Write a topic first')
      return
    }
    if (busy) return
    requireOnline()
    setBusy(true)
    const ac = new AbortController()
    abortRef.current = ac
    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'script', topic: t, kind, language }),
        signal: ac.signal,
      })
      const data = (await res.json().catch(() => null)) as { text?: string; error?: string } | null
      if (!res.ok || !data?.text) throw new Error(data?.error ?? `Script generation failed (${res.status})`)
      setOutput(data.text)
      toast.success('Script ready')
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        toast.error(e instanceof Error ? e.message : 'Script generation failed')
      }
    } finally {
      abortRef.current = null
      setBusy(false)
    }
  }, [topic, kind, language, busy])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const useInVoiceover = useCallback(() => {
    if (!output.trim()) return
    // hand the script to the voiceover card via the panel-level event bridge
    useEditor.getState().setAiSubTab('create')
    window.dispatchEvent(new CustomEvent('nc-ai-voiceover-script', { detail: output.slice(0, 1000) }))
    toast('Script sent to AI Voiceover')
  }, [output])

  return (
    <FeatureCard icon={FileText} title="Script Writer" subtitle="Hooks, scripts & captions from a topic">
      <Input
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="Topic — e.g. monsoon tea stall vibes, Dhaka street food"
        maxLength={200}
        className="h-9 border-(--nc-line) bg-(--nc-scrim) text-xs placeholder:text-muted-foreground/60"
        aria-label="Script topic"
      />
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <FieldLabel>Type</FieldLabel>
          <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
            <SelectTrigger className="h-9 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCRIPT_KINDS.map((k) => (
                <SelectItem key={k.id} value={k.id} className="text-xs">
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Language</FieldLabel>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="h-9 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCRIPT_LANGS.map((l) => (
                <SelectItem key={l} value={l} className="text-xs">
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button
        type="button"
        disabled={busy}
        onClick={() => void generate()}
        className="nc-gradient nc-glow-hover h-9 w-full rounded-lg text-xs font-semibold text-white"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        {busy ? 'Writing…' : 'Generate'}
      </Button>
      {busy && (
        <AiBusyBar
          phase={`Writing ${SCRIPT_KINDS.find((k) => k.id === kind)?.label.toLowerCase() ?? 'script'}…`}
          elapsedMs={elapsed}
          hint="Usually 10–25 s — Bangla and long topics can take a little longer"
          onCancel={cancel}
        />
      )}
      {output && (
        <div className="space-y-1.5">
          <FieldLabel>Output</FieldLabel>
          <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-(--nc-line) bg-(--nc-scrim) p-2.5 font-mono text-[10px] leading-relaxed text-foreground/80">
            {output}
          </pre>
          <Button
            type="button"
            variant="outline"
            onClick={useInVoiceover}
            className="h-9 w-full rounded-lg border-(--nc-line-strong) bg-(--nc-panel) text-xs font-semibold hover:bg-(--nc-panel-strong) hover:text-foreground"
          >
            <Mic className="size-3.5" />
            Use in AI Voiceover
          </Button>
        </div>
      )}
    </FeatureCard>
  )
}

/* ================= audio enhance ================= */

/** One-tap speech cleanup recipe — merged into the clip's FX chain. */
const ENHANCE_FX = {
  highPass: 110,
  lowPass: 14000,
  eqLow: -6,
  eqMid: 2.5,
  eqHigh: 2,
  compressor: true,
  compAmount: 0.35,
} as const

function AudioEnhanceCard({ clip, isAvClip }: { clip: Clip | null; isAvClip: boolean }) {
  const updateClip = useEditor((s) => s.updateClip)
  const enhanced = !!clip?.audioFx && !!clip.audioFx.compressor && (clip.audioFx.highPass ?? 0) >= 100

  return (
    <FeatureCard icon={AudioLines} title="AI Audio Enhance" subtitle="One-tap speech cleanup for the selected clip">
      {clip && isAvClip ? (
        <>
          <ClipChip clip={clip} />
          <div className="flex items-center justify-between rounded-lg border border-(--nc-line) bg-(--nc-scrim) px-2.5 py-2 text-[11px]">
            <span className="text-muted-foreground">Current state</span>
            <span className={`font-semibold ${enhanced ? 'text-emerald-400' : 'text-muted-foreground'}`}>
              {enhanced ? 'Enhanced' : 'Original'}
            </span>
          </div>
          <Button
            type="button"
            disabled={enhanced}
            onClick={() => {
              updateClip(clip.id, { audioFx: { ...ENHANCE_FX } }, 'ai-audio-enhance')
              toast.success('Speech cleanup applied — tweak the values in Properties → Audio FX')
            }}
            className="nc-gradient nc-glow-hover h-9 w-full rounded-lg text-xs font-semibold text-white disabled:opacity-50"
          >
            <Zap className="size-3.5" />
            Enhance speech
          </Button>
          {enhanced && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                updateClip(clip.id, { audioFx: null }, 'ai-audio-enhance-reset')
                toast('Audio FX reset to original')
              }}
              className="h-9 w-full rounded-lg border-(--nc-line-strong) bg-(--nc-panel) text-xs font-semibold hover:bg-(--nc-panel-strong) hover:text-foreground"
            >
              <RotateCcw className="size-3.5" />
              Reset to original
            </Button>
          )}
          <NoteRow icon={AudioLines}>
            De-rumble (110 Hz high-pass) + de-hiss (14 kHz low-pass) + presence EQ + gentle compression — fully tweakable afterwards.
          </NoteRow>
        </>
      ) : (
        <NoClipHint>
          {clip
            ? 'The selected clip has no audio — pick a video or audio clip to enhance its sound.'
            : 'Select a video or audio clip on the timeline to clean up its sound.'}
        </NoClipHint>
      )}
    </FeatureCard>
  )
}

/* ================= the panel ================= */

export function AIPanel() {
  const tab = useEditor((s) => s.aiSubTab)
  const setTab = useEditor((s) => s.setAiSubTab)

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
  const [captionLang, setCaptionLang] = useState('off')
  const [captionBusy, setCaptionBusy] = useState(false)
  const [captionPhase, setCaptionPhase] = useState('')
  const [transcript, setTranscript] = useState<string | null>(null)
  const [translatedTranscript, setTranslatedTranscript] = useState<string | null>(null)
  const captionAbortRef = useRef<AbortController | null>(null)
  const captionElapsed = useAiElapsed(captionBusy)

  const cancelCaptions = useCallback(() => {
    captionAbortRef.current?.abort()
  }, [])

  const handleGenerateCaptions = useCallback(async () => {
    if (!selectedClip || !clipMedia || captionBusy) return
    requireOnline()
    setCaptionBusy(true)
    const ac = new AbortController()
    captionAbortRef.current = ac
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
        signal: ac.signal,
      })
      const data = (await res.json().catch(() => null)) as { text?: string; error?: string } | null
      if (!res.ok || !data?.text) {
        throw new Error(data?.error ?? `Transcription failed (${res.status})`)
      }

      const original = data.text
      let finalText = original
      let translated: string | null = null

      if (captionLang !== 'off') {
        setCaptionPhase(`Translating to ${captionLang}…`)
        try {
          const tRes = await fetch('/api/ai/assistant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'translate', text: original.slice(0, 4000), language: captionLang }),
            signal: ac.signal,
          })
          const tData = (await tRes.json().catch(() => null)) as { text?: string; error?: string } | null
          if (tRes.ok && tData?.text) {
            translated = tData.text
            finalText = tData.text
          } else {
            toast('Translation failed — building captions from the original transcript')
          }
        } catch {
          toast('Translation failed — building captions from the original transcript')
        }
      }

      const chunks = splitTranscriptChunks(finalText)
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

      setTranscript(original)
      setTranslatedTranscript(translated)
      toast.success(
        `${count} caption clip${count === 1 ? '' : 's'} added${translated ? ` (translated to ${captionLang})` : ''}`
      )
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        toast.error(e instanceof Error ? e.message : 'Caption generation failed')
      }
    } finally {
      captionAbortRef.current = null
      setCaptionPhase('')
      setCaptionBusy(false)
    }
  }, [selectedClip, clipMedia, captionBusy, captionStyleId, captionLang, addCaptionClips, updateClip])

  /* ---------- Day 32 — restyle + re-translate EXISTING caption clips ---------- */
  const captionCount = useEditor((s) => s.project.clips.reduce((n, c) => (c.isCaption ? n + 1 : n), 0))
  const [restyleBusy, setRestyleBusy] = useState(false)
  const [retransLang, setRetransLang] = useState('English')
  const [retransBusy, setRetransBusy] = useState(false)
  const [retransPhase, setRetransPhase] = useState('')

  /** apply the picked preset to every caption clip on the timeline — one undo */
  const handleApplyCaptionStyle = useCallback(() => {
    const st = useEditor.getState()
    const caps = st.project.clips.filter((c) => c.isCaption)
    if (!caps.length) {
      toast('No caption clips on the timeline — generate captions first')
      return
    }
    setRestyleBusy(true)
    try {
      const preset = CAPTION_STYLE_PRESETS.find((p) => p.id === captionStyleId) ?? CAPTION_STYLE_PRESETS[0]
      for (const c of caps) {
        // same merge key for every clip → the whole restyle is ONE history step
        st.updateClip(c.id, { textStyle: { ...(c.textStyle ?? {}), ...preset.patch } }, 'caption-style')
      }
      toast.success(`${preset.label} applied to ${caps.length} caption clip${caps.length === 1 ? '' : 's'} — one undo`)
    } finally {
      setRestyleBusy(false)
    }
  }, [captionStyleId])

  /** re-translate every caption clip's content in place (same time grid, one undo) */
  const handleRetranslateCaptions = useCallback(async () => {
    const st = useEditor.getState()
    const caps = st.project.clips.filter((c) => c.isCaption).sort((a, b) => a.start - b.start)
    if (!caps.length) {
      toast('No caption clips on the timeline — generate captions first')
      return
    }
    requireOnline()
    setRetransBusy(true)
    setRetransPhase(`Translating ${caps.length} captions → ${retransLang}…`)
    try {
      const DELIM = '\n@@NC@@\n'
      const joined = caps.map((c) => c.textStyle?.content ?? '').join(DELIM)
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'translate',
          text: joined.slice(0, 6000),
          language: retransLang,
        }),
      })
      const data = (await res.json().catch(() => null)) as { text?: string; error?: string } | null
      if (!res.ok || !data?.text) throw new Error(data?.error ?? `Translation failed (${res.status})`)

      const st2 = useEditor.getState()
      const live = st2.project.clips
        .filter((c) => c.isCaption)
        .sort((a, b) => a.start - b.start)
      const parts = data.text.split(/@@NC@@/)
      let done = 0
      if (parts.length === live.length) {
        // clean 1:1 rewrite — each caption keeps its window, gets new text
        for (let i = 0; i < live.length; i++) {
          const text = parts[i].trim()
          if (!text) continue
          st2.updateClip(
            live[i].id,
            { textStyle: { ...(live[i].textStyle ?? {}), content: text }, name: `CC: ${text.slice(0, 20)}` },
            'caption-translate'
          )
          done++
        }
      } else {
        // count drifted — redistribute the translated text over the SAME windows
        const chunks = splitTranscriptChunks(data.text)
        const totalChars = chunks.reduce((acc, c) => acc + c.length, 0) || 1
        let acc = 0
        for (const c of live) {
          const windowChars = (c.duration / live.reduce((s, x) => s + x.duration, 0)) * totalChars
          let text = ''
          while (acc < chunks.length && text.length < windowChars) {
            text += (text ? ' ' : '') + chunks[acc]
            acc++
          }
          if (!text && acc < chunks.length) {
            text = chunks[acc]
            acc++
          }
          if (!text) break
          st2.updateClip(
            c.id,
            { textStyle: { ...(c.textStyle ?? {}), content: text }, name: `CC: ${text.slice(0, 20)}` },
            'caption-translate'
          )
          done++
        }
      }
      if (!done) throw new Error('Translation came back empty — try again')
      toast.success(`${done} caption${done === 1 ? '' : 's'} translated to ${retransLang} — one undo`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Caption translation failed')
    } finally {
      setRetransBusy(false)
      setRetransPhase('')
    }
  }, [retransLang])

  /* ---------- silence cut (v2, Day 38) ---------- */
  const [threshold, setThreshold] = useState(0.06)
  const [minSilence, setMinSilence] = useState(0.6)
  const [jumpPadding, setJumpPadding] = useState(0.08)
  const [silencePreset, setSilencePreset] = useState<'gentle' | 'standard' | 'aggressive'>('standard')
  const [analyzing, setAnalyzing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [analysis, setAnalysis] = useState<SilenceAnalysis | null>(null)
  const [silenceReceipt, setSilenceReceipt] = useState<string | null>(null)

  /** Day 38 — sensitivity presets: threshold + min-silence pairs for one-tap cuts */
  const applySilencePreset = useCallback((p: 'gentle' | 'standard' | 'aggressive') => {
    setSilencePreset(p)
    if (p === 'gentle') {
      setThreshold(0.09)
      setMinSilence(0.9)
    } else if (p === 'aggressive') {
      setThreshold(0.04)
      setMinSilence(0.35)
    } else {
      setThreshold(0.06)
      setMinSilence(0.6)
    }
  }, [])

  // drop stale results when the selection changes
  useEffect(() => {
    setAnalysis(null)
    setSilenceReceipt(null)
  }, [selectedClip?.id])

  const runAnalysis = useCallback(
    async (clip: Clip, asset: MediaAssetRuntime) => {
      return analyzeClipSilence(asset, clip.trimStart, clip.trimStart, clip.speed, clip.duration, {
        threshold,
        minSilenceSec: minSilence,
        paddingSec: jumpPadding,
      })
    },
    [threshold, minSilence, jumpPadding]
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

  /**
   * Day 38 — shared removal engine: takes explicit ranges so both the manual
   * two-step flow and the ONE-TAP jump-cut run the exact same split+ripple path.
   * The WHOLE pass is one history group — a single undo restores every cut.
   */
  const removeSilenceRanges = useCallback(
    async (rangesIn: { start: number; end: number }[], clipId: string): Promise<{ removed: number; cuts: number }> => {
      let removedTotal = 0
      let cuts = 0
      const st0 = useEditor.getState()
      const groupBefore = st0.beginHistoryGroup()
      try {
      // descending: cutting later silences first keeps earlier positions valid
      const ranges = [...rangesIn].sort((a, b) => b.start - a.start)
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
      } finally {
        useEditor.getState().endHistoryGroup(groupBefore)
      }
      return { removed: round2(removedTotal), cuts }
    },
    [],
  )

  const handleRemoveSilences = useCallback(async () => {
    if (!selectedClip || silenceRanges.length === 0 || removing) return
    setRemoving(true)
    try {
      const { removed, cuts } = await removeSilenceRanges(silenceRanges, selectedClip.id)
      if (cuts > 0) {
        toast.success(`Removed ${removed}s of silence (${cuts} cut${cuts === 1 ? '' : 's'})`)
        // refresh analysis against the shortened clip
        const st = useEditor.getState()
        const fresh = st.project.clips.find((c) => c.id === selectedClip.id)
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
  }, [selectedClip, silenceRanges, removing, runAnalysis, removeSilenceRanges])

  /** Day 38 — ONE-TAP jump-cut: analyze with the current preset, then cut immediately */
  const handleOneTapJumpCut = useCallback(async () => {
    if (!selectedClip || !clipMedia || removing || analyzing) return
    setRemoving(true)
    setSilenceReceipt(null)
    try {
      const durBefore = selectedClip.duration
      const result = await runAnalysis(selectedClip, clipMedia)
      const ranges = deriveSilences(result.segments, durBefore)
      if (!ranges.length) {
        setSilenceReceipt(`No usable silence found (threshold ${threshold.toFixed(2)}, min ${minSilence.toFixed(1)}s) — nothing to cut`)
        toast('No silence found — try the Aggressive preset')
        return
      }
      const { removed, cuts } = await removeSilenceRanges(ranges, selectedClip.id)
      if (cuts > 0) {
        const st = useEditor.getState()
        // total remaining length across every surviving fragment of this media
        const remaining = st.project.clips
          .filter((c) => c.mediaId === selectedClip.mediaId)
          .reduce((acc, c) => acc + c.duration, 0)
        setSilenceReceipt(
          `Jump-cut: ${cuts} cut${cuts === 1 ? '' : 's'} removed ${removed}s (${round2(durBefore)}s → ${round2(remaining)}s) — padding ${Math.round(jumpPadding * 1000)}ms`
        )
        toast.success(`Jump-cut done — ${cuts} cut${cuts === 1 ? '' : 's'}, ${removed}s removed`)
      } else {
        setSilenceReceipt('Gaps were too short to cut safely — try the Aggressive preset or lower padding')
        toast('Nothing was removed — try a different preset')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Jump-cut failed')
    } finally {
      setRemoving(false)
    }
  }, [selectedClip, clipMedia, removing, analyzing, runAnalysis, removeSilenceRanges, threshold, minSilence, jumpPadding])

  /* ---------- ai image ---------- */
  const [imagePrompt, setImagePrompt] = useState('')
  const [imageSize, setImageSize] = useState('1344x768')
  const [imageBusy, setImageBusy] = useState(false)
  const [imageHistory, setImageHistory] = useState<{ url: string; prompt: string }[]>([])
  const imageAbortRef = useRef<AbortController | null>(null)
  const imageElapsed = useAiElapsed(imageBusy)

  const cancelImage = useCallback(() => {
    imageAbortRef.current?.abort()
  }, [])

  const reimportImage = useCallback(
    (url: string, prompt: string) => {
      void (async () => {
        try {
          const blob = await (await fetch(url)).blob()
          const file = imageBase64ToFile(
            await new Promise<string>((resolve, reject) => {
              const fr = new FileReader()
              fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '')
              fr.onerror = () => reject(new Error('Could not read the image'))
              fr.readAsDataURL(blob)
            }),
            `ai-image-${Date.now()}`
          )
          const assets = await importFiles([file])
          assets.forEach(addMediaAsset)
          toast.success(`"${prompt.slice(0, 40)}${prompt.length > 40 ? '…' : ''}" added to media library`)
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Could not re-add the image')
        }
      })()
    },
    [addMediaAsset]
  )

  const handleGenerateImage = useCallback(async () => {
    if (imageBusy) return
    const prompt = imagePrompt.trim()
    if (!prompt) {
      toast.error('Describe the image you want first')
      return
    }
    requireOnline()
    setImageBusy(true)
    const ac = new AbortController()
    imageAbortRef.current = ac
    try {
      const res = await fetch('/api/ai/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, size: imageSize }),
        signal: ac.signal,
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
      setImageHistory((prev) => {
        const next = [{ url, prompt }, ...prev]
        // revoke only the entry evicted out of the bounded gallery, never the live ones
        if (next.length > 8) URL.revokeObjectURL(next.pop()!.url)
        return next
      })
      toast.success('AI image added to media library')
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') toast('Image generation cancelled')
      else toast.error(e instanceof Error ? e.message : 'Image generation failed')
    } finally {
      imageAbortRef.current = null
      setImageBusy(false)
    }
  }, [imageBusy, imagePrompt, imageSize, addMediaAsset])

  /* ---------- voiceover ---------- */
  const [voiceText, setVoiceText] = useState('')
  const [voice, setVoice] = useState('tongtong')
  const [voiceSpeed, setVoiceSpeed] = useState(1)
  const [voiceGain, setVoiceGain] = useState(1)
  const [voiceNormalize, setVoiceNormalize] = useState(false)
  const [voicePitch, setVoicePitch] = useState(0)
  const [voiceLang, setVoiceLang] = useState('Auto')
  const [voicePlace, setVoicePlace] = useState(true)
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [voicePhase, setVoicePhase] = useState('')
  const voiceAbortRef = useRef<AbortController | null>(null)
  const voiceElapsed = useAiElapsed(voiceBusy)

  const cancelVoiceover = useCallback(() => {
    voiceAbortRef.current?.abort()
  }, [])

  /** Day 33 — per-language pick: switch the recommended voice when the language changes */
  const handleVoiceLang = useCallback((langId: string) => {
    setVoiceLang(langId)
    const lang = TTS_LANGS.find((l) => l.id === langId)
    if (lang) setVoice(lang.defaultVoice)
  }, [])

  // Script Writer → Voiceover handoff (same panel, different sub-tab)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail
      if (typeof detail === 'string' && detail.trim()) setVoiceText(detail.slice(0, 1000))
    }
    window.addEventListener('nc-ai-voiceover-script', handler)
    return () => window.removeEventListener('nc-ai-voiceover-script', handler)
  }, [])

  const handleGenerateVoiceover = useCallback(async () => {
    if (voiceBusy) return
    const text = voiceText.trim()
    if (!text) {
      toast.error('Write the voiceover script first')
      return
    }
    requireOnline()
    setVoiceBusy(true)
    const ac = new AbortController()
    voiceAbortRef.current = ac
    try {
      const chunks = splitTextForTts(text)
      let imported = 0
      let firstAssetId: string | null = null
      for (let i = 0; i < chunks.length; i++) {
        setVoicePhase(chunks.length > 1 ? `Synthesizing part ${i + 1} of ${chunks.length}…` : 'Synthesizing voice…')
        const res = await fetch('/api/ai/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: chunks[i], voice, speed: voiceSpeed }),
          signal: ac.signal,
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
        if (i === 0 && assets[0]) firstAssetId = assets[0].id
      }
      if (imported > 0) {
        // Day 33 — place the first part at the playhead and stage it with the
        // REAL pitch engine (clip.audioFx.pitch — shared preview+export chain)
        let placed = false
        if (voicePlace && firstAssetId) {
          const st = useEditor.getState()
          const beforeIds = new Set(st.project.clips.map((c) => c.id))
          const playhead = round2(st.currentTime)
          st.addClipFromMediaId(firstAssetId, playhead)
          const st2 = useEditor.getState()
          const newClip =
            st2.project.clips.find((c) => !beforeIds.has(c.id) && c.mediaId === firstAssetId) ??
            st2.project.clips.find((c) => !beforeIds.has(c.id))
          if (newClip) {
            // fold into the placement's history entry — one undo removes clip + staging
            st2.updateClip(
              newClip.id,
              {
                ...(voiceGain !== 1 ? { volume: clamp(voiceGain, 0, 1) } : {}),
                ...(voiceNormalize ? { normalize: true } : {}),
                ...(voicePitch !== 0
                  ? { audioFx: { ...(newClip.audioFx ?? {}), pitch: clamp(voicePitch, -12, 12) } }
                  : {}),
              },
              false
            )
            placed = true
          }
        }
        toast.success(
          `Voiceover added${chunks.length > 1 ? ` (${chunks.length} parts)` : ''}${placed ? ' — placed at the playhead' : ''}`
        )
      } else {
        toast.error('Speech synthesis returned no audio')
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') toast('Voiceover cancelled')
      else toast.error(e instanceof Error ? e.message : 'Voiceover generation failed')
    } finally {
      voiceAbortRef.current = null
      setVoicePhase('')
      setVoiceBusy(false)
    }
  }, [voiceBusy, voiceText, voice, voiceSpeed, voiceGain, voiceNormalize, voicePitch, voicePlace, addMediaAsset])

  /* ================= render ================= */

  return (
    <div className="nc-fade-up space-y-3">
      <AiTabBar tab={tab} onChange={setTab} />

      {tab === 'assistant' && (
        <>
          <CopilotCard />
          <AssetSearchCard />
          <StoryboardCard />
          <ScriptWriterCard />
        </>
      )}

      {tab === 'video' && (
        <>
          {/* ---------- 1 · auto captions ---------- */}
          <FeatureCard icon={Captions} title="Auto Captions" subtitle="Speech-to-text captions for the selected clip">
            {hasAudioSource && selectedClip ? (
              <>
                <ClipChip clip={selectedClip} />
                <div className="space-y-1.5">
                  <FieldLabel>Caption style</FieldLabel>
                  {/* Day 32 — styled preset gallery with live swatches */}
                  <div className="grid grid-cols-3 gap-1.5" role="listbox" aria-label="Caption style presets">
                    {CAPTION_STYLE_PRESETS.map((p) => {
                      const active = captionStyleId === p.id
                      return (
                        <button
                          key={p.id}
                          type="button"
                          role="option"
                          aria-selected={active}
                          data-nc-cap-style={p.id}
                          onClick={() => setCaptionStyleId(p.id)}
                          className={`rounded-lg border px-1.5 py-2 text-center transition ${
                            active
                              ? 'border-fuchsia-400/70 bg-fuchsia-400/10'
                              : 'border-(--nc-line) bg-(--nc-panel) hover:border-(--nc-line-strong)'
                          }`}
                        >
                          <span
                            className="block truncate text-[11px] leading-tight"
                            style={{
                              fontFamily: p.patch.fontFamily,
                              color: p.patch.color ?? '#fff',
                              fontWeight: p.patch.bold ? 800 : 500,
                              background: p.patch.background ?? 'transparent',
                              padding: p.patch.background ? '1px 4px' : 0,
                              borderRadius: 4,
                              WebkitTextStroke: p.patch.strokeWidth ? '0.6px ' + (p.patch.strokeColor ?? '#000') : undefined,
                              textShadow: p.patch.shadow ? `0 1px 3px ${p.patch.shadowColor ?? 'rgba(0,0,0,.6)'}` : undefined,
                              textTransform: p.patch.textTransform === 'uppercase' ? 'uppercase' : undefined,
                            }}
                          >
                            Aa
                          </span>
                          <span className="mt-1 block truncate text-[8.5px] text-muted-foreground">{p.label}</span>
                        </button>
                      )
                    })}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={restyleBusy || captionCount === 0}
                    onClick={handleApplyCaptionStyle}
                    data-nc-cap-apply
                    className="h-8 w-full rounded-lg border-(--nc-line) text-[11px]"
                  >
                    <Paintbrush className="size-3" />
                    Apply style to {captionCount} caption{captionCount === 1 ? '' : 's'}
                  </Button>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Languages className="size-3 text-muted-foreground" aria-hidden />
                    <FieldLabel>Transcript language</FieldLabel>
                  </div>
                  <Select value={captionLang} onValueChange={setCaptionLang}>
                    <SelectTrigger className="h-9 w-full text-xs">
                      <SelectValue placeholder="No translation" />
                    </SelectTrigger>
                    <SelectContent>
                      {CAPTION_LANGS.map((l) => (
                        <SelectItem key={l.id} value={l.id} className="text-xs">
                          {l.label}
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
                {captionBusy && (
                  <AiBusyBar
                    phase={captionPhase || 'Working…'}
                    elapsedMs={captionElapsed}
                    hint="On-device audio prep, then AI transcription — usually 10–30 s"
                    onCancel={cancelCaptions}
                  />
                )}
                {/* Day 32 — re-translate EXISTING caption clips in place */}
                <div className="space-y-1.5 rounded-lg border border-(--nc-line) bg-(--nc-scrim) p-2" data-nc-cap-retrans>
                  <div className="flex items-center gap-1.5">
                    <Languages className="size-3 text-fuchsia-300" aria-hidden />
                    <FieldLabel>Translate existing captions</FieldLabel>
                    <span className="ml-auto rounded-full border border-(--nc-line) px-1.5 py-0.5 text-[9px] text-muted-foreground">
                      {captionCount} on timeline
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <Select value={retransLang} onValueChange={setRetransLang}>
                      <SelectTrigger className="h-8 flex-1 text-[11px]" data-nc-cap-lang>
                        <SelectValue placeholder="Target language" />
                      </SelectTrigger>
                      <SelectContent>
                        {CAPTION_RETRANSLATE_LANGS.map((l) => (
                          <SelectItem key={l.id} value={l.id} className="text-xs">
                            {l.label.replace('Translate → ', '')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="sm"
                      disabled={retransBusy || captionCount === 0}
                      onClick={() => void handleRetranslateCaptions()}
                      data-nc-cap-translate
                      className="nc-gradient h-8 shrink-0 rounded-lg px-2.5 text-[11px] font-semibold text-white"
                    >
                      {retransBusy ? <Loader2 className="size-3 animate-spin" /> : <Languages className="size-3" />}
                      {retransBusy ? 'Translating…' : 'Translate'}
                    </Button>
                  </div>
                  {retransBusy && <p className="text-[9.5px] text-muted-foreground">{retransPhase}</p>}
                  <p className="text-[9.5px] text-muted-foreground">
                    Rewrites every caption clip in place — the same time grid, one undo.
                  </p>
                </div>
                {translatedTranscript && (
                  <div className="space-y-1">
                    <FieldLabel>Translated ({captionLang})</FieldLabel>
                    <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg border border-(--nc-line) bg-(--nc-scrim) p-2.5 font-mono text-[10px] leading-relaxed text-foreground/80">
                      {translatedTranscript}
                    </pre>
                  </div>
                )}
                {transcript && (
                  <div className="space-y-1">
                    <FieldLabel>Original transcript</FieldLabel>
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

          {/* ---------- 2 · silence cut v2 ---------- */}
          <FeatureCard icon={Scissors} title="Silence Cut v2" subtitle="Presets, padding and a one-tap jump-cut">
            {hasAudioSource && selectedClip ? (
              <>
                <ClipChip clip={selectedClip} />
                {/* Day 38 — sensitivity presets */}
                <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Silence sensitivity">
                  {(
                    [
                      { id: 'gentle', label: 'Gentle' },
                      { id: 'standard', label: 'Standard' },
                      { id: 'aggressive', label: 'Aggressive' },
                    ] as const
                  ).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={silencePreset === p.id}
                      data-nc-silence-preset={p.id}
                      onClick={() => applySilencePreset(p.id)}
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-[10px] font-semibold transition ${
                        silencePreset === p.id
                          ? 'border-fuchsia-400/70 bg-fuchsia-400/15 text-fuchsia-200'
                          : 'border-(--nc-line) bg-(--nc-panel) text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
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
                  {/* Day 38 — padding control */}
                  <div>
                    <div className="flex items-center justify-between">
                      <FieldLabel>Keep padding</FieldLabel>
                      <span className="text-[10px] tabular-nums text-muted-foreground">{Math.round(jumpPadding * 1000)} ms</span>
                    </div>
                    <Slider
                      min={0}
                      max={0.3}
                      step={0.01}
                      value={[jumpPadding]}
                      onValueChange={(v) => setJumpPadding(v[0] ?? 0.08)}
                      data-nc-silence-padding
                      className="mt-1.5"
                    />
                    <p className="mt-1 text-[9px] text-muted-foreground/60">
                      Silence kept on each side of a cut — higher = more natural rhythm, lower = tighter jump cuts.
                    </p>
                  </div>
                </div>
                {/* Day 38 — one-tap jump-cut */}
                <Button
                  type="button"
                  disabled={analyzing || removing}
                  onClick={() => void handleOneTapJumpCut()}
                  data-nc-silence-jumpcut
                  className="nc-gradient nc-glow-hover h-9 w-full rounded-lg text-xs font-semibold text-white"
                >
                  {removing ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
                  {removing ? 'Jump-cutting…' : 'One-tap jump-cut'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={analyzing || removing}
                  onClick={() => void handleAnalyze()}
                  className="h-9 w-full rounded-lg border-(--nc-line-strong) bg-(--nc-panel) text-xs font-semibold hover:bg-(--nc-panel-strong) hover:text-foreground"
                >
                  {analyzing ? <Loader2 className="size-3.5 animate-spin" /> : <AudioLines className="size-3.5" />}
                  {analyzing ? 'Analyzing audio…' : 'Analyze first (preview mode)'}
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
            {/* Day 38 — receipt lives OUTSIDE the clip conditional so it survives the selection clearing after cuts */}
            {silenceReceipt && (
              <p
                className="rounded-lg border border-(--nc-line) bg-(--nc-scrim) p-2 text-[10px] leading-snug text-foreground/85"
                data-nc-silence-receipt
              >
                {silenceReceipt}
              </p>
            )}
          </FeatureCard>

          {/* ---------- 3 · audio enhance ---------- */}
          <AudioEnhanceCard clip={selectedClip} isAvClip={isAvClip} />
        </>
      )}

      {tab === 'create' && (
        <>
          {/* ---------- 4 · ai image ---------- */}
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
              <AiBusyBar
                phase="Painting pixels…"
                elapsedMs={imageElapsed}
                hint="AI image jobs usually take 30–90 s — keep this tab open"
                onCancel={cancelImage}
              />
            ) : (
              <>
                {imageHistory[0] && (
                  <img
                    src={imageHistory[0].url}
                    alt="Latest AI generated image preview"
                    className="h-28 w-full rounded-lg border border-(--nc-line) object-cover"
                  />
                )}
                {imageHistory.length > 1 && (
                  <div className="space-y-1.5">
                    <FieldLabel>Session gallery</FieldLabel>
                    <div className="grid grid-cols-4 gap-1.5">
                      {imageHistory.map((h, i) => (
                        <button
                          key={`${i}-${h.url.slice(-8)}`}
                          type="button"
                          title={h.prompt}
                          aria-label={`Re-add image ${i + 1} to media library`}
                          onClick={() => reimportImage(h.url, h.prompt)}
                          className="group relative aspect-video overflow-hidden rounded border border-(--nc-line) transition hover:border-fuchsia-400/60 focus-visible:outline-2 focus-visible:outline-fuchsia-400/60"
                        >
                          <img src={h.url} alt="" className="h-full w-full object-cover" />
                          <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[9px] font-semibold text-white opacity-0 transition group-hover:opacity-100">
                            + Add
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
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

          {/* ---------- 5 · ai voiceover ---------- */}
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
            {/* Day 33 — narration language picks the recommended engine */}
            <div className="space-y-1.5">
              <FieldLabel>Narration language</FieldLabel>
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Narration language">
                {TTS_LANGS.map((l) => {
                  const active = voiceLang === l.id
                  return (
                    <button
                      key={l.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      data-nc-tts-lang={l.id}
                      onClick={() => handleVoiceLang(l.id)}
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition ${
                        active
                          ? 'border-fuchsia-400/70 bg-fuchsia-400/15 text-fuchsia-200'
                          : 'border-(--nc-line) bg-(--nc-panel) text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {l.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Voice {voiceLang !== 'Auto' ? `· recommended for ${voiceLang}` : ''}</FieldLabel>
              <Select value={voice} onValueChange={setVoice}>
                <SelectTrigger className="h-9 w-full text-xs" data-nc-tts-voice>
                  <SelectValue placeholder="Pick a voice" />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const recommended = VOICE_OPTIONS.filter((v) => voiceLang !== 'Auto' && v.langs?.includes(voiceLang))
                    const rest = VOICE_OPTIONS.filter((v) => !recommended.includes(v))
                    const item = (v: VoiceOption) => (
                      <SelectItem key={v.id} value={v.id} className="text-xs">
                        {v.label}
                        {recommended.includes(v) ? ' ★' : ''}
                      </SelectItem>
                    )
                    return (
                      <>
                        {recommended.length > 0 && (
                          <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-fuchsia-300/80">
                            Recommended
                          </div>
                        )}
                        {recommended.map(item)}
                        {recommended.length > 0 && rest.length > 0 && (
                          <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                            All engines
                          </div>
                        )}
                        {rest.map(item)}
                      </>
                    )
                  })()}
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
            <div>
              <div className="flex items-center justify-between">
                <FieldLabel>Clip gain (placement)</FieldLabel>
                <span className="text-[10px] tabular-nums text-muted-foreground">{Math.round(voiceGain * 100)}%</span>
              </div>
              <Slider
                min={0}
                max={1}
                step={0.05}
                value={[voiceGain]}
                onValueChange={(v) => setVoiceGain(v[0] ?? 1)}
                className="mt-1.5"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={voiceNormalize}
                onChange={(e) => setVoiceNormalize(e.target.checked)}
                data-nc-tts-normalize
                className="size-3.5 accent-fuchsia-500"
              />
              Normalize loudness (true peak −1 dBFS, up to +12 dB boost)
            </label>
            <div>
              <div className="flex items-center justify-between">
                <FieldLabel>Pitch (Voice FX engine)</FieldLabel>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {voicePitch > 0 ? '+' : ''}
                  {voicePitch} st
                </span>
              </div>
              <Slider
                min={-12}
                max={12}
                step={1}
                value={[voicePitch]}
                onValueChange={(v) => setVoicePitch(v[0] ?? 0)}
                data-nc-tts-pitch
                className="mt-1.5"
              />
              <p className="mt-1 text-[9.5px] text-muted-foreground">
                Gain, normalize and pitch apply on the placed clip through the real audio chain — heard in preview and
                baked into exports. (The synthesis API ignores its volume param — measured — so loudness is handled
                here honestly.)
              </p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={voicePlace}
                onChange={(e) => setVoicePlace(e.target.checked)}
                data-nc-tts-place
                className="size-3.5 accent-fuchsia-500"
              />
              Place the first part at the playhead (others go to the media library)
            </label>
            <Button
              type="button"
              disabled={voiceBusy}
              onClick={() => void handleGenerateVoiceover()}
              className="nc-gradient nc-glow-hover h-9 w-full rounded-lg text-xs font-semibold text-white"
            >
              {voiceBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Mic className="size-3.5" />}
              {voiceBusy ? voicePhase : 'Generate voiceover'}
            </Button>
            {voiceBusy && (
              <AiBusyBar
                phase={voicePhase || 'Synthesizing voice…'}
                elapsedMs={voiceElapsed}
                hint="Each part usually takes 10–20 s of AI synthesis"
                onCancel={cancelVoiceover}
              />
            )}
            <NoteRow icon={Mic}>Scripts over 900 characters are synthesized in sequential parts.</NoteRow>
          </FeatureCard>

          {/* ---------- 6 · ai bgm director (Day 34) ---------- */}
          <BgmDirectorCard />

          {/* ---------- 7 · ai thumbnails (Day 36) ---------- */}
          <ThumbnailsCard />
        </>
      )}
    </div>
  )
}

export default AIPanel
