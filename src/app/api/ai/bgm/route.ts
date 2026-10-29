import { NextResponse } from 'next/server'

import { recordOp } from '@/lib/server/ai-ops'

import { MUSIC_EFFECTS } from '@/lib/effects/music'

export const runtime = 'nodejs'

/**
 * POST /api/ai/bgm  (Day 34 — AI BGM: mood → music arrangement)
 * Body: { mood: string, context?: { durationSec?: number, clipCount?: number, hasSpeech?: boolean } }
 * Returns: { sections: {effectId,start,duration,fadeIn,fadeOut,volume}[], note }
 *
 * The LLM maps a free-text mood onto a MULTI-SECTION arrangement picked from
 * the REAL 64-loop procedural library (ids validated server-side against the
 * registry — hallucinated ids can never reach the client). Every section is
 * rendered and placed client-side by the AI panel card, all inside one undo
 * group.
 */

const MAX_MOOD = 300
const MAX_SECTIONS = 6

const GENRES = [...new Set(MUSIC_EFFECTS.map((e) => e.family))]

function catalog(): string {
  return MUSIC_EFFECTS.map((e) => `${e.id} — ${e.name} (${Math.round(e.duration)}s, ${e.bpm} BPM)`).join('\n')
}

const SYSTEM_PROMPT = `You are NovaCut's BGM director. The user describes a MOOD for background music; you return a music ARRANGEMENT built ONLY from the loop library below.

Reply with STRICT JSON only — no markdown fences, no prose outside:
{"sections":[{"effectId":"<id from the list>","start":<sec>,"duration":<sec>,"fadeIn":<sec>,"fadeOut":<sec>,"volume":<0.1..1>}],"note":"<one short friendly sentence>"}

Loop library (id — name (rendered length, BPM)):
${catalog()}

Genres available: ${GENRES.join(', ')}.

Rules:
- effectId MUST be copied EXACTLY from the list. Never invent ids.
- 1–${MAX_SECTIONS} sections. Sections may overlap slightly for blend, but usually follow each other. Cover the project duration (${'{dur}'} s) when possible; loop sections back-to-back rather than leaving silence.
- "start" ≥ 0, ascending. "duration" 2..${'{dur}'} s — how long THIS section plays (the client clamps to the loop's rendered length).
- fadeIn/fadeOut 0..3 s (fade out the last section for a clean ending).
- "volume": background music sits at 0.3–0.6 under narration; solo mood pieces can go up to 1.
- Match the mood honestly: "cozy rainy vlog" → chill lofi; "hype gaming" → uplifting edm; sad → minor keys; epic → cinematic. Prefer the listed mood halves (chill/uplifting) that fit.
- The note must be in the SAME LANGUAGE as the mood text (Bangla → Bangla, English → English).`

/** Tolerant JSON extraction — models sometimes wrap JSON in fences or prose. */
function extractJson(raw: string): { sections?: unknown; note?: unknown } | null {
  let s = raw.trim()
  s = s
    .replace(/^```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim()
  const a = s.indexOf('{')
  const b = s.lastIndexOf('}')
  if (a === -1 || b <= a) return null
  try {
    return JSON.parse(s.slice(a, b + 1)) as { sections?: unknown; note?: unknown }
  } catch {
    return null
  }
}

interface RawSection {
  effectId?: unknown
  start?: unknown
  duration?: unknown
  fadeIn?: unknown
  fadeOut?: unknown
  volume?: unknown
}

export async function POST(req: Request) {
  const __t0 = Date.now()
  let __in = 0
  let __out = 0
  try {
    const body = (await req.json().catch(() => null)) as {
      mood?: string
      context?: { durationSec?: number; clipCount?: number; hasSpeech?: boolean }
    } | null
    const mood = typeof body?.mood === 'string' ? body.mood.trim().slice(0, MAX_MOOD) : ''
    if (!mood) {
      return NextResponse.json({ error: 'mood is required' }, { status: 400 })
    }
    const dur = Math.max(4, Math.min(600, Math.round(Number(body?.context?.durationSec) || 30)))
    const ctx = {
      durationSec: dur,
      clipCount: Math.max(0, Math.min(99, Math.round(Number(body?.context?.clipCount) || 0))),
      hasSpeech: body?.context?.hasSpeech === true,
    }

    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: SYSTEM_PROMPT.replace('{dur}', String(dur)) },
        {
          role: 'user',
          content: `Mood: ${mood}\nProject: ${JSON.stringify(ctx)}`,
        },
      ],
      thinking: { type: 'disabled' },
    })

    const raw = completion.choices[0]?.message?.content ?? ''
    const parsed = extractJson(raw)
    if (!parsed) {
      return NextResponse.json({
        sections: [],
        note: raw.trim().slice(0, 300) || 'The BGM director could not produce an arrangement — try rephrasing.',
      })
    }

    const VALID = new Set(MUSIC_EFFECTS.map((e) => e.id))
    const sections = (Array.isArray(parsed.sections) ? parsed.sections : [])
      .filter((s): s is RawSection => !!s && typeof s === 'object')
      .map((s) => ({
        effectId: typeof s.effectId === 'string' && VALID.has(s.effectId) ? s.effectId : null,
        // start is clamped INTO the project — a section can never begin past the end
        start: Math.max(0, Math.min(Math.max(0, dur - 2), Math.round((Number(s.start) || 0) * 100) / 100)),
        duration: Math.max(2, Math.min(dur, Math.round((Number(s.duration) || 0) * 100) / 100)),
        fadeIn: Math.max(0, Math.min(3, Math.round((Number(s.fadeIn) || 0) * 100) / 100)),
        fadeOut: Math.max(0, Math.min(3, Math.round((Number(s.fadeOut) || 0) * 100) / 100)),
        volume: Math.max(0.1, Math.min(1, Math.round((Number(s.volume) || 0.5) * 100) / 100)),
      }))
      .filter((s): s is { effectId: string; start: number; duration: number; fadeIn: number; fadeOut: number; volume: number } =>
        typeof s.effectId === 'string'
      )
      .sort((a, b) => a.start - b.start)
      .slice(0, MAX_SECTIONS)

    const note = typeof parsed.note === 'string' ? parsed.note.slice(0, 400) : ''
    __in = mood.length
    __out = note.length + sections.length * 90
    recordOp({ route: '/api/ai/bgm', ms: Date.now() - __t0, ok: true, inChars: __in, outChars: __out, ts: Date.now() })
    return NextResponse.json({ sections, note })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'BGM planning failed'
    recordOp({ route: '/api/ai/bgm', ms: Date.now() - __t0, ok: false, inChars: __in, outChars: __out, ts: Date.now() })
    console.error('[api/ai/bgm]', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
