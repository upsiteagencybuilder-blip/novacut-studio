import { NextResponse } from 'next/server'

import { recordOp } from '@/lib/server/ai-ops'

import { BACKGROUND_PRESETS } from '@/lib/editor/asset-registry'
import { ALL_STICKER_DEFS } from '@/lib/editor/sticker-render'

export const runtime = 'nodejs'

/**
 * POST /api/ai/assets  (Day 39 — AI asset search)
 * Body: { query: string }
 * Returns: { results: { kind: 'sticker'|'background', id, name, reason }[], note }
 *
 * The LLM matches a natural-language query against the REAL asset registry
 * (sticker shapes + gradient backgrounds, cataloged in the prompt) and every
 * returned id is validated server-side — hallucinated assets can never reach
 * the client. Placement happens client-side through the real store APIs.
 */

const MAX_QUERY = 200
const MAX_RESULTS = 9

function catalog(): string {
  const shapes = ALL_STICKER_DEFS.map((d) => `${d.id} (${d.name})`).join(', ')
  const bgs = BACKGROUND_PRESETS.map((b) => `${b.id} (${b.name} — ${b.tags.join('/')})`).join(', ')
  return `STICKER SHAPE IDS: ${shapes}\n\nBACKGROUND IDS: ${bgs}`
}

const SYSTEM_PROMPT = `You are NovaCut's asset search assistant. The user describes what they want (a sticker, decoration, or a background for their video); you pick the BEST matching assets from the registry below.

Reply with STRICT JSON only — no markdown fences, no prose outside:
{"results":[{"kind":"sticker","id":"<shape id>","reason":"<short why>"},{"kind":"background","id":"<bg id>","reason":"<short why>"}],"note":"<one short friendly sentence>"}

Registry:
${catalog()}

Rules:
- Return 3–${MAX_RESULTS} results, best match FIRST, mixing kinds when both fit (e.g. "cozy coffee vlog" → a coffee sticker + the Warm paper background).
- ids MUST be copied EXACTLY from the registry. Never invent ids or kinds.
- kind is "sticker" (uses the shape id) or "background" (uses the bg id).
- Each reason ≤ 6 words, in the SAME LANGUAGE as the query.`

/** Tolerant JSON extraction — models sometimes wrap JSON in fences or prose. */
function extractJson(raw: string): { results?: unknown; note?: unknown } | null {
  let s = raw.trim()
  s = s
    .replace(/^```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim()
  const a = s.indexOf('{')
  const b = s.lastIndexOf('}')
  if (a === -1 || b <= a) return null
  try {
    return JSON.parse(s.slice(a, b + 1)) as { results?: unknown; note?: unknown }
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  const __t0 = Date.now()
  let __in = 0
  let __out = 0
  try {
    const body = (await req.json().catch(() => null)) as { query?: string } | null
    const query = typeof body?.query === 'string' ? body.query.trim().slice(0, MAX_QUERY) : ''
    if (!query) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 })
    }

    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: SYSTEM_PROMPT },
        { role: 'user', content: query },
      ],
      thinking: { type: 'disabled' },
    })

    const raw = completion.choices[0]?.message?.content ?? ''
    const parsed = extractJson(raw)
    if (!parsed) {
      return NextResponse.json({
        results: [],
        note: raw.trim().slice(0, 300) || 'The asset search could not parse a result — try rephrasing.',
      })
    }

    const shapeIds = new Set(ALL_STICKER_DEFS.map((d) => d.id))
    const bgIds = new Set(BACKGROUND_PRESETS.map((b) => b.id))
    const results = (Array.isArray(parsed.results) ? parsed.results : [])
      .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
      .map((r) => {
        const kind = r.kind === 'background' ? 'background' : r.kind === 'sticker' ? 'sticker' : null
        const id = typeof r.id === 'string' ? r.id : ''
        const valid = kind === 'sticker' ? shapeIds.has(id) : kind === 'background' ? bgIds.has(id) : false
        return {
          kind,
          id,
          name:
            kind === 'sticker'
              ? (ALL_STICKER_DEFS.find((d) => d.id === id)?.name ?? id)
              : (BACKGROUND_PRESETS.find((b) => b.id === id)?.name ?? id),
          reason: typeof r.reason === 'string' ? r.reason.trim().slice(0, 60) : '',
          valid,
        }
      })
      .filter((r) => r.valid && r.kind)
      .slice(0, MAX_RESULTS)

    const note = typeof parsed.note === 'string' ? parsed.note.slice(0, 300) : ''
    __in = query.length
    __out = note.length + results.length * 70
    recordOp({ route: '/api/ai/assets', ms: Date.now() - __t0, ok: true, inChars: __in, outChars: __out, ts: Date.now() })
    return NextResponse.json({ results, note })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Asset search failed'
    recordOp({ route: '/api/ai/assets', ms: Date.now() - __t0, ok: false, inChars: __in, outChars: __out, ts: Date.now() })
    console.error('[api/ai/assets]', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
