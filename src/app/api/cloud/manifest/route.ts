import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { cloudDb } from '@/lib/cloud/db'

export const dynamic = 'force-dynamic'

/**
 * Day 41 — Media manifest sync.
 *
 *  POST   /api/cloud/manifest   { deviceId, localId, assets[] }  → replace-set
 *  GET    /api/cloud/manifest?deviceId=…&localId=…                → entries + summary
 *  DELETE /api/cloud/manifest?deviceId=…&localId=…                → clear
 *
 * The manifest is the sha-256 hash map of the media a backup references.
 * Replace-set semantics keep it consistent with the payload it describes.
 */

const entrySchema = z.object({
  assetId: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  kind: z.enum(['video', 'image', 'audio', 'lut']),
  mimeType: z.string().min(1).max(120),
  size: z.number().int().min(0).max(2_000_000_000),
  duration: z.number().min(0).max(3600 * 6),
  width: z.number().int().min(0).max(20_000),
  height: z.number().int().min(0).max(20_000),
  hash: z.string().regex(/^[0-9a-f]{64}$/, 'hash must be sha-256 hex'),
})

const postSchema = z.object({
  deviceId: z.string().min(6).max(64),
  localId: z.string().min(1).max(64),
  assets: z.array(entrySchema).max(500),
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

  const { deviceId, localId, assets } = parsed.data
  try {
    const written = await prisma.$transaction(async (tx) => {
      await tx.cloudAsset.deleteMany({ where: { deviceId, projectId: localId } })
      if (assets.length > 0) {
        await tx.cloudAsset.createMany({
          data: assets.map((a) => ({ ...a, deviceId, projectId: localId })),
        })
      }
      return assets.length
    })
    const totalBytes = assets.reduce((sum, a) => sum + a.size, 0)
    return NextResponse.json({ ok: true, count: written, totalBytes, syncedAt: new Date().toISOString() })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'manifest sync failed' },
      { status: 503 },
    )
  }
}

export async function GET(request: NextRequest) {
  const { prisma } = cloudDb
  const deviceId = request.nextUrl.searchParams.get('deviceId')
  const localId = request.nextUrl.searchParams.get('localId')
  if (!deviceId || !localId) {
    return NextResponse.json({ error: 'deviceId and localId are required' }, { status: 400 })
  }

  try {
    const assets = await prisma.cloudAsset.findMany({
      where: { deviceId, projectId: localId },
      orderBy: { name: 'asc' },
      select: {
        assetId: true,
        name: true,
        kind: true,
        mimeType: true,
        size: true,
        duration: true,
        width: true,
        height: true,
        hash: true,
        updatedAt: true,
      },
    })
    return NextResponse.json({
      assets,
      count: assets.length,
      totalBytes: assets.reduce((sum, a) => sum + a.size, 0),
      syncedAt: assets[0]?.updatedAt ?? null,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'manifest read failed' },
      { status: 503 },
    )
  }
}

export async function DELETE(request: NextRequest) {
  const { prisma } = cloudDb
  const deviceId = request.nextUrl.searchParams.get('deviceId')
  const localId = request.nextUrl.searchParams.get('localId')
  if (!deviceId || !localId) {
    return NextResponse.json({ error: 'deviceId and localId are required' }, { status: 400 })
  }

  try {
    await prisma.cloudAsset.deleteMany({ where: { deviceId, projectId: localId } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'manifest delete failed' },
      { status: 503 },
    )
  }
}
