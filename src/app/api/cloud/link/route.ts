import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/server/auth'
import { cloudDb } from '@/lib/cloud/db'

export const dynamic = 'force-dynamic'

/**
 * Day 48 — device linking (session-gated).
 *
 *  POST /api/cloud/link  { deviceName? }   → link THIS deviceId to the signed-in account (upsert)
 *  GET   /api/cloud/link                  → the account's linked devices (session required)
 *  DELETE /api/cloud/link?deviceId=…      → unlink one device (session required)
 *
 * 401 without a session — the scaffold stays strictly opt-in.
 */

const postSchema = z.object({
  deviceName: z.string().min(1).max(60).optional(),
})

async function requireUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  const user = session?.user as { id?: string } | undefined
  return user?.id ?? null
}

export async function POST(request: NextRequest) {
  const userId = await requireUserId()
  if (!userId) return NextResponse.json({ error: 'sign in to link a device' }, { status: 401 })

  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const parsed = postSchema.safeParse(body ?? {})
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation failed' }, { status: 400 })
  }

  const deviceId = request.headers.get('x-novacut-device') ?? ''
  if (deviceId.length < 6) {
    return NextResponse.json({ error: 'x-novacut-device header required' }, { status: 400 })
  }

  try {
    const link = await cloudDb.prisma.deviceLink.upsert({
      where: { deviceId },
      create: { userId, deviceId, deviceName: parsed.data.deviceName ?? '' },
      update: { userId, deviceName: parsed.data.deviceName ?? '' },
    })
    return NextResponse.json({ ok: true, linked: { deviceId: link.deviceId, deviceName: link.deviceName, userId } })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'link failed' },
      { status: 503 },
    )
  }
}

export async function GET() {
  const userId = await requireUserId()
  if (!userId) return NextResponse.json({ error: 'sign in required' }, { status: 401 })

  try {
    const devices = await cloudDb.prisma.deviceLink.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { deviceId: true, deviceName: true, createdAt: true, updatedAt: true },
    })
    return NextResponse.json({ devices, count: devices.length })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'link read failed' },
      { status: 503 },
    )
  }
}

export async function DELETE(request: NextRequest) {
  const userId = await requireUserId()
  if (!userId) return NextResponse.json({ error: 'sign in required' }, { status: 401 })
  const deviceId = request.nextUrl.searchParams.get('deviceId')
  if (!deviceId) return NextResponse.json({ error: 'deviceId is required' }, { status: 400 })

  try {
    await cloudDb.prisma.deviceLink.deleteMany({ where: { deviceId, userId } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'unlink failed' },
      { status: 503 },
    )
  }
}
