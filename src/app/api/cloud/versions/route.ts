import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { cloudDb } from '@/lib/cloud/db'

export const dynamic = 'force-dynamic'

/**
 * Day 43 — Cloud project versioning.
 *
 *  POST   /api/cloud/versions  { deviceId, localId, label?, data, clipCount, duration }
 *         → ordinal = max+1 per (device, project); history capped at the
 *           newest 20 (oldest pruned); returns { id, version, createdAt }.
 *  GET    /api/cloud/versions?deviceId=…&localId=…              → light list (no data)
 *  GET    /api/cloud/versions?deviceId=…&localId=…&versionId=…  → full snapshot
 *  DELETE /api/cloud/versions?deviceId=…&localId=…&versionId=…  → remove one
 */

const HISTORY_CAP = 20

const postSchema = z.object({
  deviceId: z.string().min(6).max(64),
  localId: z.string().min(1).max(64),
  label: z.string().max(120).optional(),
  clipCount: z.number().int().min(0).max(2000),
  duration: z.number().min(0).max(3600 * 6),
  data: z.string().max(20_000_000),
})

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

  const { deviceId, localId, label, clipCount, duration, data } = parsed.data
  try {
    const created = await prisma.$transaction(async (tx) => {
      const last = await tx.cloudVersion.findFirst({
        where: { deviceId, projectId: localId },
        orderBy: { version: 'desc' },
        select: { version: true },
      })
      const version = (last?.version ?? 0) + 1
      const row = await tx.cloudVersion.create({
        data: {
          deviceId,
          projectId: localId,
          version,
          label: label?.trim() || `v${version}`,
          data,
          clipCount,
          duration,
        },
      })

      // prune beyond the newest HISTORY_CAP
      const stale = await tx.cloudVersion.findMany({
        where: { deviceId, projectId: localId },
        orderBy: { version: 'desc' },
        skip: HISTORY_CAP,
        select: { id: true },
      })
      if (stale.length > 0) {
        await tx.cloudVersion.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } })
      }
      return row
    })

    return NextResponse.json({
      ok: true,
      id: created.id,
      version: created.version,
      label: created.label,
      createdAt: created.createdAt,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'version save failed' },
      { status: 503 },
    )
  }
}

export async function GET(request: NextRequest) {
  const { prisma } = cloudDb
  const deviceId = request.nextUrl.searchParams.get('deviceId')
  const localId = request.nextUrl.searchParams.get('localId')
  const versionId = request.nextUrl.searchParams.get('versionId')
  if (!deviceId || !localId) {
    return NextResponse.json({ error: 'deviceId and localId are required' }, { status: 400 })
  }

  try {
    if (versionId) {
      const row = await prisma.cloudVersion.findFirst({
        where: { id: versionId, deviceId, projectId: localId },
      })
      if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })
      return NextResponse.json({ version: row })
    }

    const versions = await prisma.cloudVersion.findMany({
      where: { deviceId, projectId: localId },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        label: true,
        clipCount: true,
        duration: true,
        createdAt: true,
      },
    })
    return NextResponse.json({ versions })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'version read failed' },
      { status: 503 },
    )
  }
}

export async function DELETE(request: NextRequest) {
  const { prisma } = cloudDb
  const deviceId = request.nextUrl.searchParams.get('deviceId')
  const localId = request.nextUrl.searchParams.get('localId')
  const versionId = request.nextUrl.searchParams.get('versionId')
  if (!deviceId || !localId || !versionId) {
    return NextResponse.json({ error: 'deviceId, localId and versionId are required' }, { status: 400 })
  }

  try {
    await prisma.cloudVersion.deleteMany({ where: { id: versionId, deviceId, projectId: localId } })
    return NextResponse.json({ ok: true }) // idempotent
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'version delete failed' },
      { status: 503 },
    )
  }
}
