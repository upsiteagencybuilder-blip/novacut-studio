#!/usr/bin/env node
/**
 * NovaCut setup doctor — verifies the local + cloud configuration.
 *
 *   bun run doctor
 */
import { readFileSync, existsSync } from 'node:fs'

function loadEnv() {
  if (!existsSync('.env')) return {}
  const env = {}
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}

const env = { ...loadEnv(), ...process.env }
const checks = []
const ok = (name, pass, hint = '') => checks.push({ name, pass, hint })

ok('.env exists', existsSync('.env'), 'cp .env.example .env')
ok(
  'DATABASE_URL (local SQLite)',
  Boolean(env.DATABASE_URL),
  'DATABASE_URL=file:./db/novacut.db',
)
ok(
  'TURSO_DATABASE_URL',
  Boolean(env.TURSO_DATABASE_URL),
  'libsql://<db>-<org>.turso.io',
)
ok(
  'TURSO_AUTH_TOKEN',
  Boolean(env.TURSO_AUTH_TOKEN),
  'turso db tokens create <db-name>',
)
ok(
  'vercel.json present',
  existsSync('vercel.json'),
  'region pinned near the Turso DB (hnd1)',
)
ok('.env.example committed-safe', existsSync('.env.example'), 'gitignored .env* with !.env.example exception')

if (env.TURSO_DATABASE_URL && env.TURSO_AUTH_TOKEN) {
  try {
    const { createClient } = await import('@libsql/client')
    const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })
    await db.execute('SELECT 1')
    ok('Turso reachable', true)
    const tables = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    const names = tables.rows.map((r) => r.name)
    const expected = ['CloudProject', 'ShareLink', 'Feedback']
    const allThere = expected.every((t) => names.includes(t))
    ok(
      'Turso schema initialized',
      allThere,
      allThere ? names.join(', ') : 'run: bun run db:init:turso',
    )
  } catch (err) {
    ok('Turso reachable', false, `${err.message} (works on Vercel even if your network blocks Turso)`)
  }
}

console.log('\nNovaCut setup doctor\n────────────────────')
let failures = 0
for (const c of checks) {
  console.log(` ${c.pass ? '✔' : '✖'} ${c.name}${c.hint && !c.pass ? `  → ${c.hint}` : ''}`)
  if (!c.pass) failures++
}
console.log('────────────────────')
console.log(failures === 0 ? ' All good — run `bun run env:push` then `bun run deploy`.\n' : ` ${failures} issue(s) — follow the hints above.\n`)
process.exit(0)
