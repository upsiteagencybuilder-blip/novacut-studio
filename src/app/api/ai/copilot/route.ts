import { NextResponse } from 'next/server'

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
const MAX_ACTIONS = 12

interface CopilotBody {
  command?: string
  context?: Record<string, unknown>
}

/** Human/LLM-readable catalog of every action the client executor accepts. */
function actionCatalog(): string {
  const looks = [...new Set(COLOR_EFFECTS.map((e) => e.family))].join(', ')
  const motions = [...new Set(MOTION_EFFECTS.map((e) => e.motion))].filter((m) => m !== 'none').join(' | ')
  const shapes = ALL_STICKER_DEFS.map((d) => d.id).join(', ')
  return [
    '- {"type":"addTitle","text":"<1..80 chars>","at":"playhead"|"start"|"end","size":16..120,"color":"#rrggbb","bold":true} — overlay text, keep it under ~12 words',
    `- {"type":"addSticker","emoji":"🔥"} or {"type":"addSticker","shape":"<id>"} — shape ids: ${shapes}`,
    `- {"type":"applyLook","family":"<family>","variant":1..5,"target":"selected"|"all"} — color-look families: ${looks}`,
    `- {"type":"setMotion","motion":"${motions}","target":"selected"|"all"}`,
    '- {"type":"setMotionIntensity","value":0..1,"target":"selected"|"all"}',
    '- {"type":"crossfade","duration":0.2..2} — fades between two adjacent clips on a track',
    '- {"type":"setSpeed","value":0.25..4,"target":"selected"} — media clips only',
    '- {"type":"setVolume","value":0..1,"target":"selected"|"all"}',
    '- {"type":"addMarker"} / {"type":"splitAtPlayhead"} / {"type":"deleteSelected"}',
    '- {"type":"setBackgroundColor","color":"#rrggbb"}',
    '- {"type":"renameProject","name":"<1..60 chars>"}',
  ].join('\n')
}

const SYSTEM_PROMPT = `You are NovaCut Copilot — the editing assistant inside the NovaCut video editor (a CapCut-style editor).
You translate the user's editing request into a JSON action plan.

Reply with STRICT JSON only — no markdown fences, no prose outside the JSON:
{"actions":[ <action>, ... ],"note":"<one short friendly sentence>"}

Available actions (maximum 12, executed in order):
${actionCatalog()}

Rules:
- Use ONLY the action types listed above. Never invent fields or ids.
- "selected" means the clip the user currently has selected; use "all" only for project-wide requests like "all clips" or "every clip".
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

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as CopilotBody | null
    const command = typeof body?.command === 'string' ? body.command.trim().slice(0, MAX_COMMAND) : ''
    if (!command) {
      return NextResponse.json({ error: 'command is required' }, { status: 400 })
    }
    const context =
      body?.context && typeof body.context === 'object' && !Array.isArray(body.context)
        ? body.context
        : {}

    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Command: ${command}\nProject: ${JSON.stringify(context).slice(0, 2500)}`,
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

    return NextResponse.json({ actions, note })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Copilot planning failed'
    console.error('[api/ai/copilot]', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
