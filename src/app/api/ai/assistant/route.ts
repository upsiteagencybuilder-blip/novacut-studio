import { NextResponse } from 'next/server'

import { recordOp } from '@/lib/server/ai-ops'

export const runtime = 'nodejs'

/**
 * POST /api/ai/assistant
 * Text-in → text-out helper modes used by the AI panel:
 *  - mode "script":    topic → short-form video script / hook ideas / caption ideas
 *  - mode "translate": transcript translation before auto-captions are built
 *  - mode "titles":    topic → 8 YouTube thumbnail title ideas (Day 36)
 *  - mode "storyboard": topic → JSON shot list that scaffolds the timeline (Day 37)
 * Returns: { text: string }
 */

const MAX_INPUT = 4000

interface AssistantBody {
  mode?: 'script' | 'translate' | 'titles' | 'storyboard'
  topic?: string
  kind?: 'script' | 'hooks' | 'captions'
  tone?: string
  seconds?: number
  language?: string
  text?: string
}

function scriptSystem(kind: string, language: string, tone: string, seconds: number): string {
  const langLine = `Write the response in ${language}.`
  if (kind === 'hooks') {
    return `You are a short-form video strategist. Generate exactly 8 scroll-stopping hook ideas (one line each, numbered) for the given topic. Punchy, specific, no clichés. ${langLine} Output plain text only — no markdown, no headings.`
  }
  if (kind === 'captions') {
    return `You are a social media copywriter. Generate exactly 6 caption ideas for the given topic — short, catchy, at most one emoji each, numbered. ${langLine} Output plain text only — no markdown, no headings.`
  }
  return `You are a professional short-form video scriptwriter. Write a punchy ${Math.round(seconds)}-second voiceover script for the given topic: a strong hook in the first line, 3-4 tight beats, and a call to action at the end. Mark optional b-roll ideas in [square brackets] on their own lines. Tone: ${tone}. ${langLine} Output plain text only — no markdown, no headings.`
}

export async function POST(req: Request) {
  const __t0 = Date.now()
  let __in = 0
  let __out = 0
  try {
    const body = (await req.json().catch(() => null)) as AssistantBody | null
    const mode =
      body?.mode === 'translate'
        ? 'translate'
        : body?.mode === 'titles'
          ? 'titles'
          : body?.mode === 'storyboard'
            ? 'storyboard'
            : 'script'

    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()

    let content = ''
    if (mode === 'storyboard') {
      const topic = typeof body?.topic === 'string' ? body.topic.trim().slice(0, 300) : ''
      if (!topic) {
        return NextResponse.json({ error: 'topic is required' }, { status: 400 })
      }
      const seconds = Math.min(90, Math.max(10, Math.round(Number(body?.seconds) || 30)))
      const language = typeof body?.language === 'string' && body.language.trim() ? body.language.trim().slice(0, 30) : 'English'
      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: 'assistant',
            content:
              `You are a video storyboard director. Turn the topic into a shot list for a ~${seconds}-second short video. ` +
              `Reply with STRICT JSON only — no markdown fences, no prose outside:\n` +
              `{"shots":[{"title":"<2-3 words>","description":"<one concrete b-roll/camera line>","seconds":<2..8>}]}\n` +
              `4-8 shots whose seconds sum to about ${seconds}. Shot 1 is the hook, the last is the payoff/CTA. ` +
              `Titles and descriptions in ${language}. Titles stay tiny (they render on a slate).`,
          },
          { role: 'user', content: topic },
        ],
        thinking: { type: 'disabled' },
      })
      content = completion.choices[0]?.message?.content ?? ''
      // storyboard mode returns JSON — pass it through for the client to parse
      const a = content.indexOf('{')
      const b = content.lastIndexOf('}')
      const json = a !== -1 && b > a ? content.slice(a, b + 1) : ''
      try {
        const parsed = JSON.parse(json) as { shots?: unknown }
        if (!Array.isArray(parsed.shots) || !parsed.shots.length) {
          return NextResponse.json({ error: 'The storyboard came back empty — try again' }, { status: 502 })
        }
        const shots = parsed.shots
          .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
          .map((s) => ({
            title: typeof s.title === 'string' ? s.title.trim().slice(0, 40) : '',
            description: typeof s.description === 'string' ? s.description.trim().slice(0, 120) : '',
            seconds: Math.max(1.5, Math.min(8, Math.round((Number(s.seconds) || 3) * 10) / 10)),
          }))
          .filter((s) => s.title)
          .slice(0, 8)
        if (!shots.length) {
          return NextResponse.json({ error: 'The storyboard came back empty — try again' }, { status: 502 })
        }
        return NextResponse.json({ shots })
      } catch {
        return NextResponse.json({ error: 'The storyboard JSON was malformed — try again' }, { status: 502 })
      }
    }
    if (mode === 'titles') {
      const topic = typeof body?.topic === 'string' ? body.topic.trim().slice(0, 200) : ''
      if (!topic) {
        return NextResponse.json({ error: 'topic is required' }, { status: 400 })
      }
      const language = typeof body?.language === 'string' && body.language.trim() ? body.language.trim().slice(0, 30) : 'English'
      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: 'assistant',
            content:
              `You are a YouTube thumbnail title strategist. Generate exactly 8 thumbnail title ideas for the video topic. ` +
              `Each is ONE short punchy line (max 5 words, readable at small sizes), numbered 1-8, mixing formulas: a bold claim, a question, a number, a contrast. ` +
              `Write them in ${language}. Output plain text only — no markdown, no quotes, no headings.`,
          },
          { role: 'user', content: topic },
        ],
        thinking: { type: 'disabled' },
      })
      content = completion.choices[0]?.message?.content ?? ''
    } else if (mode === 'translate') {
      const text = typeof body?.text === 'string' ? body.text.trim().slice(0, MAX_INPUT) : ''
      const language = typeof body?.language === 'string' && body.language.trim() ? body.language.trim().slice(0, 30) : 'English'
      if (!text) {
        return NextResponse.json({ error: 'text is required' }, { status: 400 })
      }
      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: 'assistant',
            content:
              `You are a professional subtitle translator. Translate the user's transcript into ${language}. ` +
              'Keep the meaning natural and spoken-style (captions will show this text). Preserve sentence punctuation. ' +
              'Output ONLY the translated text — no notes, no quotes, no language labels.',
          },
          { role: 'user', content: text },
        ],
        thinking: { type: 'disabled' },
      })
      content = completion.choices[0]?.message?.content ?? ''
    } else {
      const topic = typeof body?.topic === 'string' ? body.topic.trim().slice(0, 200) : ''
      if (!topic) {
        return NextResponse.json({ error: 'topic is required' }, { status: 400 })
      }
      const kind = body?.kind === 'hooks' ? 'hooks' : body?.kind === 'captions' ? 'captions' : 'script'
      const language = typeof body?.language === 'string' && body.language.trim() ? body.language.trim().slice(0, 30) : 'English'
      const tone = typeof body?.tone === 'string' && body.tone.trim() ? body.tone.trim().slice(0, 40) : 'energetic and friendly'
      const seconds = Math.min(120, Math.max(10, Math.round(Number(body?.seconds ?? 30)) || 30))
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'assistant', content: scriptSystem(kind, language, tone, seconds) },
          { role: 'user', content: topic },
        ],
        thinking: { type: 'disabled' },
      })
      content = completion.choices[0]?.message?.content ?? ''
    }

    const text = content.trim()
    if (!text) {
      recordOp({ route: '/api/ai/assistant', ms: Date.now() - __t0, ok: false, inChars: __in, outChars: 0, ts: Date.now() })
      return NextResponse.json({ error: 'The assistant returned an empty response' }, { status: 502 })
    }
    __out = text.length
    recordOp({ route: '/api/ai/assistant', ms: Date.now() - __t0, ok: true, inChars: __in, outChars: __out, ts: Date.now() })
    return NextResponse.json({ text: text.slice(0, MAX_INPUT) })
  } catch (e) {
    recordOp({ route: '/api/ai/assistant', ms: Date.now() - __t0, ok: false, inChars: __in, outChars: __out, ts: Date.now() })
    const message = e instanceof Error ? e.message : 'Assistant request failed'
    console.error('[api/ai/assistant]', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
