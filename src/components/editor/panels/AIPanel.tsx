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
  RotateCcw,
  Scissors,
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
import { applyCopilotActions, buildCopilotContext } from '@/lib/editor/copilot'
import { importFiles } from '@/lib/editor/importer'
import { useEditor } from '@/lib/editor/store'
import { round2 } from '@/lib/editor/utils'
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

const CAPTION_LANGS = [
  { id: 'off', label: 'Original — no translation' },
  { id: 'Bangla', label: 'Translate → বাংলা (Bangla)' },
  { id: 'English', label: 'Translate → English' },
  { id: 'Hindi', label: 'Translate → Hindi' },
  { id: 'Urdu', label: 'Translate → Urdu' },
  { id: 'Spanish', label: 'Translate → Spanish' },
  { id: 'Arabic', label: 'Translate → Arabic' },
]

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
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [voicePhase, setVoicePhase] = useState('')
  const voiceAbortRef = useRef<AbortController | null>(null)
  const voiceElapsed = useAiElapsed(voiceBusy)

  const cancelVoiceover = useCallback(() => {
    voiceAbortRef.current?.abort()
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
      }
      if (imported > 0) {
        toast.success(`Voiceover added to media library${chunks.length > 1 ? ` (${chunks.length} parts)` : ''}`)
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
  }, [voiceBusy, voiceText, voice, voiceSpeed, addMediaAsset])

  /* ================= render ================= */

  return (
    <div className="nc-fade-up space-y-3">
      <AiTabBar tab={tab} onChange={setTab} />

      {tab === 'assistant' && (
        <>
          <CopilotCard />
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
        </>
      )}
    </div>
  )
}

export default AIPanel
