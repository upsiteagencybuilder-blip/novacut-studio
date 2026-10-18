import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { cloudDb } from '@/lib/cloud/db'

export const dynamic = 'force-dynamic'

const upsertSchema = z.object({
  deviceId: z.string().min(6).max(64),
  localId: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  duration: z.number().min(0).max(3600 * 6),
  clipCount: z.number().int().min(0).max(2000),
  thumbnail: z.string().max(200_000).optional(),
  data: z.string().max(20_000_000),
})

/**
 * GET /api/cloud/projects?deviceId=…            → project metadata list
 * GET /api/cloud/projects?deviceId=…&localId=…  → one full project (with data)
 */
export async function GET(request: NextRequest) {
  const { prisma } = cloudDb
  const deviceId = request.nextUrl.searchParams.get('deviceId')
  const localId = request.nextUrl.searchParams.get('localId')

  if (!deviceId) {
    return NextResponse.json({ error: 'deviceId is required' }, { status: 400 })
  }

  try {
    if (localId) {
      const project = await prisma.cloudProject.findUnique({
        where: { deviceId_localId: { deviceId, localId } },
      })
      if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 })
      return NextResponse.json({ project })
    }

    const projects = await prisma.cloudProject.findMany({
      where: { deviceId },
      orderBy: { updatedAt: 'desc' },
      select: {
        localId: true,
        name: true,
        duration: true,
        clipCount: true,
        thumbnail: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    return NextResponse.json({ projects })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'sync failed' },
      { status: 503 },
    )
  }
}

/** POST /api/cloud/projects — upsert a project snapshot (full sync). */
export async function POST(request: NextRequest) {
  const { prisma } = cloudDb
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const parsed = upsertSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation failed', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
      { status: 400 },
    )
  }

  const { deviceId, localId, ...data } = parsed.data
  try {
    const project = await prisma.cloudProject.upsert({
      where: { deviceId_localId: { deviceId, localId } },
      create: { deviceId, localId, ...data },
      update: data,
    })
    return NextResponse.json({
      ok: true,
      syncedAt: project.updatedAt,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'sync failed' },
      { status: 503 },
    )
  }
}

/** DELETE /api/cloud/projects?deviceId=…&localId=… — remove a synced copy. */
export async function DELETE(request: NextRequest) {
  const { prisma } = cloudDb
  const deviceId = request.nextUrl.searchParams.get('deviceId')
  const localId = request.nextUrl.searchParams.get('localId')

  if (!deviceId || !localId) {
    return NextResponse.json({ error: 'deviceId and localId are required' }, { status: 400 })
  }

  try {
    await prisma.cloudProject.delete({
      where: { deviceId_localId: { deviceId, localId } },
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true }) // already gone — idempotent
  }
}
