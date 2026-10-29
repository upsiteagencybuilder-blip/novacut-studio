import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * POST /api/ai/assistant
 * Text-in → text-out helper modes used by the AI panel:
 *  - mode "script":    topic → short-form video script / hook ideas / caption ideas
 *  - mode "translate": transcript translation before auto-captions are built
 *  - mode "titles":    topic → 8 YouTube thumbnail title ideas (Day 36)
 * Returns: { text: string }
 */

const MAX_INPUT = 4000

interface AssistantBody {
  mode?: 'script' | 'translate' | 'titles'
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
  try {
    const body = (await req.json().catch(() => null)) as AssistantBody | null
    const mode = body?.mode === 'translate' ? 'translate' : body?.mode === 'titles' ? 'titles' : 'script'

    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()

    let content = ''
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
      return NextResponse.json({ error: 'The assistant returned an empty response' }, { status: 502 })
    }
    return NextResponse.json({ text: text.slice(0, MAX_INPUT) })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Assistant request failed'
    console.error('[api/ai/assistant]', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
