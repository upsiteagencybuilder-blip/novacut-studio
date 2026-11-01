import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { cloudDb } from '@/lib/cloud/db'

export const dynamic = 'force-dynamic'

/**
 * Day 47 — In-app feedback → the existing Feedback model.
 *
 *  POST /api/feedback  { deviceId, rating? (1–5), message }  → store
 *  GET  /api/feedback?deviceId=…                             → my recent count
 *
 * Honest limits: message ≤ 2000 chars; at most 5 messages per device per
 * hour (429 explains it — no silent drops).
 */

const postSchema = z.object({
  deviceId: z.string().min(6).max(64),
  rating: z.number().int().min(1).max(5).optional(),
  message: z.string().min(1).max(2000),
})

const RATE_LIMIT = 5
const RATE_WINDOW_MS = 60 * 60 * 1000

export async function POST(request: NextRequest) {
  const { prisma } = cloudDb
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const parsed = postSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation failed', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
      { status: 400 },
    )
  }

  const { deviceId, rating, message } = parsed.data
  try {
    const recent = await prisma.feedback.count({
      where: { deviceId, createdAt: { gte: new Date(Date.now() - RATE_WINDOW_MS) } },
    })
    if (recent >= RATE_LIMIT) {
      return NextResponse.json(
        { error: `Feedback limit reached (${RATE_LIMIT} per hour) — thanks for the enthusiasm, try again later` },
        { status: 429 },
      )
    }
    const row = await prisma.feedback.create({ data: { deviceId, rating, message } })
    const total = await prisma.feedback.count({ where: { deviceId } })
    return NextResponse.json({ ok: true, id: row.id, sentThisHour: recent + 1, totalFromDevice: total })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'feedback failed' },
      { status: 503 },
    )
  }
}

export async function GET(request: NextRequest) {
  const { prisma } = cloudDb
  const deviceId = request.nextUrl.searchParams.get('deviceId')
  if (!deviceId) {
    return NextResponse.json({ error: 'deviceId is required' }, { status: 400 })
  }
  try {
    const total = await prisma.feedback.count({ where: { deviceId } })
    const last = await prisma.feedback.findFirst({
      where: { deviceId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, rating: true },
    })
    return NextResponse.json({ total, last: last ?? null })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'feedback read failed' },
      { status: 503 },
    )
  }
}
