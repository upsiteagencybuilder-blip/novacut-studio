import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createHash } from 'node:crypto'
import { cloudDb } from '@/lib/cloud/db'

export const dynamic = 'force-dynamic'

/**
 * Day 42 — Asset upload pipeline.
 *
 *  POST /api/cloud/assets  { deviceId, projectId, assetId, dataBase64 }
 *        → stores the binary on the CloudAsset row AFTER verifying the
 *          decoded payload's sha-256 matches the manifest hash (integrity
 *          is enforced server-side, not trusted from the client).
 *  GET  /api/cloud/assets?deviceId=…&projectId=…                → upload status list
 *  GET  /api/cloud/assets?deviceId=…&projectId=…&assetId=…      → one binary (base64)
 *
 * Caps (documented, enforced): 12 MB per asset payload, 64 MB stored per
 * device — responses use 413 when exceeded. Binaries live as base64 TEXT;
 * the deployment database is SQLite-dialect (local dev + Turso).
 */

const PER_ASSET_CAP = 12 * 1024 * 1024 // base64 string length cap
const PER_DEVICE_QUOTA = 64 * 1024 * 1024 // sum of stored base64 per device

const postSchema = z.object({
  deviceId: z.string().min(6).max(64),
  projectId: z.string().min(1).max(64),
  assetId: z.string().min(1).max(64),
  dataBase64: z.string().min(1).max(PER_ASSET_CAP),
})

/** POST — upload one asset binary with server-side hash verification. */
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

  const { deviceId, projectId, assetId, dataBase64 } = parsed.data

  try {
    const row = await prisma.cloudAsset.findUnique({
      where: { deviceId_projectId_assetId: { deviceId, projectId, assetId } },
    })
    if (!row) {
      return NextResponse.json(
        { error: 'no manifest entry for this asset — sync the manifest first (Day 41)' },
        { status: 404 },
      )
    }

    const buffer = Buffer.from(dataBase64, 'base64')
    const actualHash = createHash('sha256').update(buffer).digest('hex')
    if (actualHash !== row.hash) {
      return NextResponse.json(
        { error: 'hash mismatch — payload does not match the manifest entry', expected: row.hash, actual: actualHash },
        { status: 400 },
      )
    }

    // per-device stored quota — approximated from manifest sizes × 1.34 (base64 overhead)
    const rows = await prisma.cloudAsset.findMany({
      where: { deviceId, uploadedAt: { not: null } },
      select: { size: true },
    })
    const storedBytes = rows.reduce((sum, r) => sum + Math.ceil(r.size * 1.34), 0)
    const incoming = Math.ceil(dataBase64.length)
    if (storedBytes + incoming > PER_DEVICE_QUOTA) {
      return NextResponse.json(
        { error: 'device storage quota exceeded (64 MB of stored media)', storedBytes },
        { status: 413 },
      )
    }

    const updated = await prisma.cloudAsset.update({
      where: { deviceId_projectId_assetId: { deviceId, projectId, assetId } },
      data: { data: dataBase64, uploadedAt: new Date() },
    })
    return NextResponse.json({
      ok: true,
      assetId,
      bytes: buffer.length,
      hashVerified: true,
      uploadedAt: updated.uploadedAt,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'asset upload failed' },
      { status: 503 },
    )
  }
}

/** GET — upload status list, or one binary when assetId is given. */
export async function GET(request: NextRequest) {
  const { prisma } = cloudDb
  const deviceId = request.nextUrl.searchParams.get('deviceId')
  const projectId = request.nextUrl.searchParams.get('projectId')
  const assetId = request.nextUrl.searchParams.get('assetId')
  if (!deviceId || !projectId) {
    return NextResponse.json({ error: 'deviceId and projectId are required' }, { status: 400 })
  }

  try {
    if (assetId) {
      const row = await prisma.cloudAsset.findUnique({
        where: { deviceId_projectId_assetId: { deviceId, projectId, assetId } },
        select: { assetId: true, name: true, mimeType: true, data: true, uploadedAt: true },
      })
      if (!row || !row.data) return NextResponse.json({ error: 'binary not found' }, { status: 404 })
      return NextResponse.json({
        assetId: row.assetId,
        name: row.name,
        mimeType: row.mimeType,
        dataBase64: row.data,
        uploadedAt: row.uploadedAt,
      })
    }

    const rows = await prisma.cloudAsset.findMany({
      where: { deviceId, projectId },
      select: { assetId: true, name: true, size: true, uploadedAt: true },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({
      assets: rows.map((r) => ({
        assetId: r.assetId,
        name: r.name,
        size: r.size,
        uploaded: r.uploadedAt !== null,
        uploadedAt: r.uploadedAt,
      })),
      uploadedCount: rows.filter((r) => r.uploadedAt !== null).length,
      count: rows.length,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'asset read failed' },
      { status: 503 },
    )
  }
}

/** DELETE — remove stored binaries for a project (manifest rows stay). */
export async function DELETE(request: NextRequest) {
  const { prisma } = cloudDb
  const deviceId = request.nextUrl.searchParams.get('deviceId')
  const projectId = request.nextUrl.searchParams.get('projectId')
  if (!deviceId || !projectId) {
    return NextResponse.json({ error: 'deviceId and projectId are required' }, { status: 400 })
  }
  try {
    await prisma.cloudAsset.updateMany({
      where: { deviceId, projectId, uploadedAt: { not: null } },
      data: { data: null, uploadedAt: null },
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'asset delete failed' },
      { status: 503 },
    )
  }
}
