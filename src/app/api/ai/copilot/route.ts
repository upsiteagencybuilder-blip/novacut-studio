import { NextResponse } from 'next/server'

import { recordOp } from '@/lib/server/ai-ops'

import { COLOR_EFFECTS } from '@/lib/effects/color'
import { MOTION_EFFECTS } from '@/lib/effects/motion'
import { ALL_STICKER_DEFS } from '@/lib/editor/sticker-render'

export const runtime = 'nodejs'

/**
 * POST /api/ai/copilot
 * Body: { command: string, context?: object }
 * Returns: { actions: object[], note: string }
 *
 * The LLM translates a natural-language editing request into a STRICT JSON
 * action plan. The plan is only *generated* here — every action is validated
 * and applied client-side (src/lib/editor/copilot.ts) against the real
 * project state, so hallucinated ids can never touch the project.
 */

const MAX_COMMAND = 600
const MAX_ACTIONS = 16
const MAX_HISTORY_TURNS = 6

interface CopilotBody {
  command?: string
  context?: Record<string, unknown>
  /** Day 31 (v2) — recent conversation turns so follow-ups ("now make it red") resolve */
  history?: { role?: unknown; text?: unknown }[]
}

/** Human/LLM-readable catalog of every action the client executor accepts. */
function actionCatalog(): string {
  const looks = [...new Set(COLOR_EFFECTS.map((e) => e.family))].join(', ')
  const motions = [...new Set(MOTION_EFFECTS.map((e) => e.motion))].filter((m) => m !== 'none').join(' | ')
  const shapes = ALL_STICKER_DEFS.map((d) => d.id).join(', ')
  return [
    '- {"type":"addTitle","text":"<1..80 chars>","at":"playhead"|"start"|"end","size":16..120,"color":"#rrggbb","bold":true} — overlay text, keep it under ~12 words',
    `- {"type":"addSticker","emoji":"🔥"} or {"type":"addSticker","shape":"<id>"} — shape ids: ${shapes}`,
    `- {"type":"applyLook","family":"<family>","variant":1..5,"target":"selected"|"all"|"first"|"last"} — color-look families: ${looks}`,
    `- {"type":"setMotion","motion":"${motions}","target":"selected"|"all"|"first"|"last"}`,
    '- {"type":"setMotionIntensity","value":0..1,"target":"selected"|"all"}',
    '- {"type":"crossfade","duration":0.2..2} — fades between two adjacent clips on a track',
    '- {"type":"setSpeed","value":0.25..4,"target":"selected"} — media clips only',
    '- {"type":"setVolume","value":0..1,"target":"selected"|"all"}',
    '- {"type":"addAdjustmentLayer","family":"<family>","variant":1..5} — new overlay adjustment layer, optional look baked in (applies to every clip below it)',
    '- {"type":"setTransform","preset":"reset"|"zoom2"|"pip-tl"|"pip-br"|"dutch"|"mirror"|"flip-vert"|"ghost","target":"selected"|"first"|"last"}',
    '- {"type":"fadeIn","duration":0.1..3,"target":"selected"|"first"|"last"} / {"type":"fadeOut","duration":0.1..3,"target":"selected"|"first"|"last"} — visual+audio fades',
    '- {"type":"duplicateSelected"}',
    '- {"type":"trimSelected","duration":<seconds>} — set the selected media clip length',
    '- {"type":"styleTitle","color":"#rrggbb","size":16..140,"bold":true,"match":"<text an existing title contains>"} — RESTYLE an existing title (follow-ups like "make it red" / "bigger"); without "match" it restyles the most recent title. NEVER add a new title for this.',
    '- {"type":"addMarker"} / {"type":"splitAtPlayhead"} / {"type":"deleteSelected"}',
    '- {"type":"setBackgroundColor","color":"#rrggbb"}',
    '- {"type":"renameProject","name":"<1..60 chars>"}',
  ].join('\n')
}

const SYSTEM_PROMPT = `You are NovaCut Copilot v2 — the editing assistant inside the NovaCut video editor (a CapCut-style editor).
You translate the user's editing request into a JSON action plan. The plan may be a MULTI-STEP SEQUENCE executed in order from ONE instruction (e.g. “trailer intro” = title + motion + fades + crossfade).

Reply with STRICT JSON only — no markdown fences, no prose outside the JSON:
{"actions":[ <action>, ... ],"note":"<one short friendly sentence>"}

Available actions (maximum 16, executed in order):
${actionCatalog()}

Rules:
- Use ONLY the action types listed above. Never invent fields or ids.
- "selected" means the clip the user currently has selected; "all" for project-wide requests; "first" = earliest visual clip; "last" = the visual clip that ends latest (use for end-of-video fades).
- Multi-step requests: order actions so creations come before styling and the timeline reads naturally (title first, then looks/motion, then fades/crossfades). Combine everything the user asked for into ONE plan — never ask for more messages.
- Titles are overlay text (max ~12 words). If the user asks for spoken narration or a long script, return no addTitle action and mention the AI Voiceover tool in the note instead.
- Colors must be #rrggbb hex. Look families must match the list exactly (case-insensitive).
- If the request cannot map to any action, return {"actions":[],"note":"..."} with a brief helpful hint.
- The note must be in the SAME LANGUAGE as the user's command (Bangla command → Bangla note, English → English).`

/** Tolerant JSON extraction — models sometimes wrap JSON in fences or prose. */
function extractJson(raw: string): { actions?: unknown; note?: unknown } | null {
  let s = raw.trim()
  s = s
    .replace(/^```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim()
  const a = s.indexOf('{')
  const b = s.lastIndexOf('}')
  if (a === -1 || b <= a) return null
  try {
    return JSON.parse(s.slice(a, b + 1)) as { actions?: unknown; note?: unknown }
  } catch {
    return null
  }
}

/** sanitize the recent-turns payload — role/text strings only, hard length caps */
function sanitizeHistory(raw: unknown): string {
  if (!Array.isArray(raw)) return ''
  const lines: string[] = []
  for (const turn of raw.slice(-MAX_HISTORY_TURNS)) {
    if (!turn || typeof turn !== 'object') continue
    const role = (turn as { role?: unknown }).role === 'user' ? 'user' : 'assistant'
    const text = typeof (turn as { text?: unknown }).text === 'string' ? (turn as { text: string }).text.trim().slice(0, 240) : ''
    if (!text) continue
    lines.push(`${role}: ${text}`)
  }
  return lines.join('\n').slice(0, 1600)
}

export async function POST(req: Request) {
  const __t0 = Date.now()
  let __in = 0
  let __out = 0
  try {
    const body = (await req.json().catch(() => null)) as CopilotBody | null
    const command = typeof body?.command === 'string' ? body.command.trim().slice(0, MAX_COMMAND) : ''
    __in = command.length
    if (!command) {
      return NextResponse.json({ error: 'command is required' }, { status: 400 })
    }
    const context =
      body?.context && typeof body.context === 'object' && !Array.isArray(body.context)
        ? body.context
        : {}
    const recent = sanitizeHistory(body?.history)

    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `${recent ? `Conversation so far (oldest first):
${recent}

The new command may refer to it ("make it red" → the last title/sticker).

` : ''}Command: ${command}
Project: ${JSON.stringify(context).slice(0, 2500)}`,
        },
      ],
      thinking: { type: 'disabled' },
    })

    const raw = completion.choices[0]?.message?.content ?? ''
    const parsed = extractJson(raw)
    if (!parsed) {
      // model ignored the JSON contract — surface its prose as the note
      return NextResponse.json({
        actions: [],
        note: raw.trim().slice(0, 300) || 'The copilot could not produce a plan — try rephrasing.',
      })
    }

    const actions = Array.isArray(parsed.actions)
      ? parsed.actions
          .filter(
            (a): a is Record<string, unknown> =>
              !!a && typeof a === 'object' && typeof (a as { type?: unknown }).type === 'string'
          )
          .slice(0, MAX_ACTIONS)
      : []
    const note = typeof parsed.note === 'string' ? parsed.note.slice(0, 400) : ''
    __out = note.length + actions.length * 60
    recordOp({ route: '/api/ai/copilot', ms: Date.now() - __t0, ok: true, inChars: __in, outChars: __out, ts: Date.now() })

    return NextResponse.json({ actions, note })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Copilot planning failed'
    console.error('[api/ai/copilot]', e)
    recordOp({ route: '/api/ai/copilot', ms: Date.now() - __t0, ok: false, inChars: __in, outChars: __out, ts: Date.now() })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
