import { NextResponse } from 'next/server'

import { recordOp } from '@/lib/server/ai-ops'

export const runtime = 'nodejs'

/**
 * POST /api/ai/transcribe
 * Body: { audioBase64: string (WAV 16k mono), languageHint?: string (accepted, informational only) }
 * Returns: { text: string } — full transcript (ASR provides no timestamps).
 */
interface TranscribeBody {
  audioBase64?: string
  languageHint?: string
}

export async function POST(req: Request) {
  const __t0 = Date.now()
  let __in = 0
  try {
    const body = (await req.json().catch(() => null)) as TranscribeBody | null
    const audioBase64 = body?.audioBase64
    if (typeof audioBase64 !== 'string' || audioBase64.length === 0) {
      return NextResponse.json({ error: 'audioBase64 is required' }, { status: 400 })
    }

    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const response = (await zai.audio.asr.create({ file_base64: audioBase64 })) as { text?: string }
    const text = typeof response?.text === 'string' ? response.text.trim() : ''
    if (!text) {
      return NextResponse.json({ error: 'No speech detected in the selected audio' }, { status: 422 })
    }

    recordOp({ route: '/api/ai/transcribe', ms: Date.now() - __t0, ok: true, inChars: __in, outChars: text.length, ts: Date.now() })
    return NextResponse.json({ text })
  } catch (e) {
    recordOp({ route: '/api/ai/transcribe', ms: Date.now() - __t0, ok: false, inChars: __in, outChars: 0, ts: Date.now() })
    const message = e instanceof Error ? e.message : 'Transcription failed'
    console.error('[api/ai/transcribe]', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
