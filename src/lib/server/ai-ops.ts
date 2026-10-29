/**
 * NovaCut Studio — AI ops ledger (Day 40).
 *
 * A tiny in-memory ring buffer recording every AI API call: route, latency,
 * outcome and character counts. Aggregates power the AI Ops dashboard
 * (latency/cost visible). Honest scope: session-scoped (since server start),
 * estimates only — token counts are chars/4 and the price table is a
 * documented directional model, not a bill.
 */

export interface AiOpRecord {
  route: string
  ms: number
  ok: boolean
  /** input chars (prompt / text) */
  inChars: number
  /** output chars (completion text) */
  outChars: number
  /** non-LLM payload size (TTS audio / image PNG bytes) */
  bytes?: number
  ts: number
}

const MAX_RECORDS = 400

/**
 * Next.js dev compiles each route with its own module graph — a plain module
 * array would fork per route. Anchor the ledger on globalThis so every route
 * instance shares one ledger.
 */
interface OpsGlobal {
  __ncAiOps?: AiOpRecord[]
}
const g = globalThis as OpsGlobal
const records: AiOpRecord[] = (g.__ncAiOps ??= [])

export function recordOp(op: AiOpRecord): void {
  records.push(op)
  if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS)
}

export interface RouteStats {
  route: string
  calls: number
  errors: number
  avgMs: number
  p95Ms: number
  estTokensIn: number
  estTokensOut: number
  /** directional USD estimate (LLM routes only — non-LLM routes report 0) */
  estCostUsd: number
  lastTs: number
}

/** directional price model — documented in the dashboard as ESTIMATES ONLY */
const PRICE_PER_M_TOKEN_IN = 0.6
const PRICE_PER_M_TOKEN_OUT = 2.2
/** routes that are LLM text completions (cost-estimable); others track latency only */
const LLM_ROUTES = new Set(['/api/ai/copilot', '/api/ai/assistant', '/api/ai/bgm', '/api/ai/assets'])

export function opsSnapshot(): { routes: RouteStats[]; totalCalls: number; sinceTs: number } {
  const byRoute = new Map<string, AiOpRecord[]>()
  for (const r of records) {
    const list = byRoute.get(r.route) ?? []
    list.push(r)
    byRoute.set(r.route, list)
  }
  const routes: RouteStats[] = []
  for (const [route, list] of byRoute) {
    const sortedMs = [...list].map((r) => r.ms).sort((a, b) => a - b)
    const p95 = sortedMs[Math.min(sortedMs.length - 1, Math.floor(sortedMs.length * 0.95))]
    const calls = list.length
    const errors = list.filter((r) => !r.ok).length
    const inChars = list.reduce((a, r) => a + r.inChars, 0)
    const outChars = list.reduce((a, r) => a + r.outChars, 0)
    const estTokensIn = Math.round(inChars / 4)
    const estTokensOut = Math.round(outChars / 4)
    const estCostUsd = LLM_ROUTES.has(route)
      ? (estTokensIn / 1e6) * PRICE_PER_M_TOKEN_IN + (estTokensOut / 1e6) * PRICE_PER_M_TOKEN_OUT
      : 0
    routes.push({
      route,
      calls,
      errors,
      avgMs: Math.round(list.reduce((a, r) => a + r.ms, 0) / calls),
      p95Ms: p95 ?? 0,
      estTokensIn,
      estTokensOut,
      estCostUsd: Math.round(estCostUsd * 1e5) / 1e5,
      lastTs: list[list.length - 1]!.ts,
    })
  }
  routes.sort((a, b) => b.calls - a.calls)
  return { routes, totalCalls: records.length, sinceTs: records[0]?.ts ?? Date.now() }
}
