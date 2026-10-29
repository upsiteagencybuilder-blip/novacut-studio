import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * POST /api/ai/tts
 * Body: { text: string (<= 1024 chars), voice?: string, speed?: number (0.5..2) }
 * Returns: { audioBase64: string, mimeType: 'audio/wav' }
 * Long scripts must be chunked by the client (max 900 chars per request recommended).
 * NOTE: the SDK documents a `volume` param but this backend silently ignores it
 * (measured RMS ratio 0.83 vs theory 4.0) — loudness is handled on the placed
 * clip instead (real gain + Day 29 true-peak normalize).
 */
const ALLOWED_VOICES = ['tongtong', 'chuichui', 'xiaochen', 'jam', 'kazi', 'douji', 'luodo'] as const
const DEFAULT_VOICE = 'tongtong'
const MAX_TEXT_LENGTH = 1024

interface TtsBody {
  text?: string
  voice?: string
  speed?: number
  volume?: number
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as TtsBody | null
    const text = typeof body?.text === 'string' ? body.text : ''
    if (!text.trim()) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 })
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json({ error: `text is too long (max ${MAX_TEXT_LENGTH} chars — split it client-side)` }, { status: 400 })
    }
    const voice = ALLOWED_VOICES.includes((body?.voice ?? '') as (typeof ALLOWED_VOICES)[number])
      ? (body!.voice as (typeof ALLOWED_VOICES)[number])
      : DEFAULT_VOICE
    const speedRaw = typeof body?.speed === 'number' && Number.isFinite(body.speed) ? body.speed : 1
    const speed = Math.min(2, Math.max(0.5, speedRaw))

    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const response = (await zai.audio.tts.create({
      input: text,
      voice,
      speed,
      response_format: 'wav',
      stream: false,
    })) as { arrayBuffer: () => Promise<ArrayBuffer> }
    const arrayBuffer = await response.arrayBuffer()
    const base64 = Buffer.from(new Uint8Array(arrayBuffer)).toString('base64')

    return NextResponse.json({ audioBase64: base64, mimeType: 'audio/wav' })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Speech synthesis failed'
    console.error('[api/ai/tts]', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
