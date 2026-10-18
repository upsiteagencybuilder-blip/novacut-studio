import { NextResponse } from 'next/server'
import { cloudDb } from '@/lib/cloud/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cloud/health
 * Reports which backend is live (turso | sqlite) and round-trip latency.
 */
export async function GET() {
  const { prisma, backend } = cloudDb
  const started = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({
      ok: true,
      backend,
      latencyMs: Date.now() - started,
      service: 'novacut-cloud',
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        backend,
        error: error instanceof Error ? error.message : 'database unreachable',
        service: 'novacut-cloud',
      },
      { status: 503 },
    )
  }
}
