import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { cloudDb } from '@/lib/cloud/db'

export const dynamic = 'force-dynamic'

const createSchema = z.object({
  deviceId: z.string().min(6).max(64),
  projectId: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  payload: z.string().max(20_000_000),
})

function makeToken(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24)
}

/** POST /api/cloud/share — publish a read-only snapshot, returns { token, url }. */
export async function POST(request: NextRequest) {
  const { prisma } = cloudDb
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation failed', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
      { status: 400 },
    )
  }

  const { deviceId, projectId, title, payload } = parsed.data
  try {
    const link = await prisma.shareLink.create({
      data: { token: makeToken(), deviceId, projectId, title, payload },
    })
    return NextResponse.json({ ok: true, token: link.token, id: link.id })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'share failed' },
      { status: 503 },
    )
  }
}

/** GET /api/cloud/share?token=… — fetch a snapshot (increments view counter). */
export async function GET(request: NextRequest) {
  const { prisma } = cloudDb
  const token = request.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 })

  try {
    const link = await prisma.shareLink.findUnique({ where: { token } })
    if (!link) return NextResponse.json({ error: 'not found' }, { status: 404 })
    await prisma.shareLink.update({ where: { token }, data: { views: { increment: 1 } } })
    return NextResponse.json({
      title: link.title,
      payload: link.payload,
      views: link.views + 1,
      createdAt: link.createdAt,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'share failed' },
      { status: 503 },
    )
  }
}
