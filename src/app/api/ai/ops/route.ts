import { NextResponse } from 'next/server'

import { opsSnapshot } from '@/lib/server/ai-ops'

export const runtime = 'nodejs'
/** live snapshot — never cache (Next otherwise serves the first empty GET forever) */
export const dynamic = 'force-dynamic'

/**
 * GET /api/ai/ops  (Day 40 — AI ops dashboard feed)
 * Returns per-route aggregates (calls, errors, avg/p95 latency, estimated
 * tokens + directional cost) from the in-memory session ledger.
 */
export async function GET() {
  try {
    const snap = opsSnapshot()
    return NextResponse.json({
      ...snap,
      priceModel: { perMTokensIn: 0.6, perMTokensOut: 2.2, note: 'directional estimates — chars/4 tokens, not a bill' },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Ops snapshot failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
