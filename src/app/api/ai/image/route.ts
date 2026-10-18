import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * POST /api/ai/image
 * Body: { prompt: string, size?: string }
 * Returns: { imageBase64: string } — PNG bytes encoded as base64.
 */
const ALLOWED_SIZES = ['1024x1024', '768x1344', '864x1152', '1344x768', '1152x864', '1440x720', '720x1440'] as const
const DEFAULT_SIZE = '1344x768'

interface ImageBody {
  prompt?: string
  size?: string
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as ImageBody | null
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : ''
    if (!prompt) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
    }
    const size = ALLOWED_SIZES.includes((body?.size ?? '') as (typeof ALLOWED_SIZES)[number])
      ? (body!.size as (typeof ALLOWED_SIZES)[number])
      : DEFAULT_SIZE

    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const response = await zai.images.generations.create({ prompt, size })
    const base64 = response?.data?.[0]?.base64
    if (!base64) {
      return NextResponse.json({ error: 'Image generation returned no data' }, { status: 502 })
    }

    return NextResponse.json({ imageBase64: base64 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Image generation failed'
    console.error('[api/ai/image]', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
