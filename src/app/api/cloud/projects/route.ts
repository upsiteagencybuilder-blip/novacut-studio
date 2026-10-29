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
  folder: z.string().max(60).optional(),
})

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  folder: z.string().max(60).optional(),
})

/** POST /api/cloud/projects?action=duplicate — server-side copy with a rewritten payload id. */
async function duplicateProject(request: NextRequest) {
  const { prisma } = cloudDb
  const deviceId = request.nextUrl.searchParams.get('deviceId')
  const localId = request.nextUrl.searchParams.get('localId')
  if (!deviceId || !localId) {
    return NextResponse.json({ error: 'deviceId and localId are required' }, { status: 400 })
  }

  try {
    const source = await prisma.cloudProject.findUnique({
      where: { deviceId_localId: { deviceId, localId } },
    })
    if (!source) return NextResponse.json({ error: 'not found' }, { status: 404 })

    // the copy gets its OWN project id so a restore never collides with the original
    const newLocalId = `${localId}-c${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}`
    let payload: Record<string, unknown> = {}
    try {
      payload = JSON.parse(source.data) as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: 'source payload is not valid JSON' }, { status: 500 })
    }
    payload.id = newLocalId
    payload.name = `${source.name} copy`
    if (typeof payload.createdAt === 'number') payload.createdAt = Date.now()
    if (typeof payload.updatedAt === 'number') payload.updatedAt = Date.now()

    const copy = await prisma.$transaction(async (tx) => {
      const row = await tx.cloudProject.create({
        data: {
          deviceId,
          localId: newLocalId,
          name: `${source.name} copy`,
          duration: source.duration,
          clipCount: source.clipCount,
          thumbnail: source.thumbnail,
          data: JSON.stringify(payload),
          folder: source.folder,
        },
      })
      // manifest rows carry over (asset ids are shared) — binaries do not;
      // "Upload media" fills them for the copy on demand
      const manifest = await tx.cloudAsset.findMany({
        where: { deviceId, projectId: localId },
      })
      if (manifest.length > 0) {
        await tx.cloudAsset.createMany({
          data: manifest.map((m) => ({
            deviceId,
            projectId: newLocalId,
            assetId: m.assetId,
            name: m.name,
            kind: m.kind,
            mimeType: m.mimeType,
            size: m.size,
            duration: m.duration,
            width: m.width,
            height: m.height,
            hash: m.hash,
            data: null,
            uploadedAt: null,
          })),
        })
      }
      return row
    })

    return NextResponse.json({
      ok: true,
      duplicate: {
        localId: copy.localId,
        name: copy.name,
        folder: copy.folder,
        clipCount: copy.clipCount,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'duplicate failed' },
      { status: 503 },
    )
  }
}

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
        folder: true,
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
  if (request.nextUrl.searchParams.get('action') === 'duplicate') {
    return duplicateProject(request)
  }
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

/** PATCH /api/cloud/projects?deviceId=…&localId=… — rename / move to folder (Day 49). */
export async function PATCH(request: NextRequest) {
  const { prisma } = cloudDb
  const deviceId = request.nextUrl.searchParams.get('deviceId')
  const localId = request.nextUrl.searchParams.get('localId')
  if (!deviceId || !localId) {
    return NextResponse.json({ error: 'deviceId and localId are required' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success || (parsed.data.name === undefined && parsed.data.folder === undefined)) {
    return NextResponse.json({ error: 'nothing to update (name / folder expected)' }, { status: 400 })
  }

  try {
    const updated = await prisma.cloudProject.update({
      where: { deviceId_localId: { deviceId, localId } },
      data: parsed.data,
      select: { localId: true, name: true, folder: true, updatedAt: true },
    })
    // keep the payload's project name in sync with the cloud row
    if (parsed.data.name !== undefined) {
      const row = await prisma.cloudProject.findUnique({
        where: { deviceId_localId: { deviceId, localId } },
        select: { data: true },
      })
      if (row) {
        try {
          const payload = JSON.parse(row.data) as Record<string, unknown>
          payload.name = parsed.data.name
          await prisma.cloudProject.update({
            where: { deviceId_localId: { deviceId, localId } },
            data: { data: JSON.stringify(payload) },
          })
        } catch {
          /* payload rewrite is best-effort — the row name is already updated */
        }
      }
    }
    return NextResponse.json({ ok: true, project: updated })
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
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
    await prisma.cloudAsset.deleteMany({ where: { deviceId, projectId: localId } })
    await prisma.cloudProject.delete({
      where: { deviceId_localId: { deviceId, localId } },
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true }) // already gone — idempotent
  }
}
