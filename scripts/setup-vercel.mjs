#!/usr/bin/env node
/**
 * Push every variable in .env to Vercel — automatically, all environments.
 *
 *   bun run env:push
 *
 * One-time prerequisites (2 commands):
 *   npm i -g vercel
 *   vercel login            && vercel link
 *
 * Everything else is automatic: every KEY=VALUE in .env is pushed to
 * Production / Preview / Development, then the script prints the deploy step.
 */
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const SKIP = new Set(['DATABASE_URL']) // local-only value; Vercel uses Turso

function loadEnv() {
  if (!existsSync('.env')) {
    console.error('✖ .env not found. Create it:  cp .env.example .env  and fill values.')
    process.exit(1)
  }
  const vars = []
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !SKIP.has(m[1])) vars.push([m[1], m[2]])
  }
  return vars
}

function sh(cmd, args) {
  return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'] }).toString()
}

function vercelEnvAdd(key, value, env) {
  // `vercel env add KEY ENV` reads the value from stdin
  execFileSync('vercel', ['env', 'add', key, env, '--force'], {
    input: `${value}\n`,
    stdio: ['pipe', 'ignore', 'inherit'],
    shell: process.platform === 'win32',
  })
}

const vars = loadEnv()
if (vars.length === 0) {
  console.error('✖ No pushable variables found in .env.')
  process.exit(1)
}

// verify vercel CLI + link
try {
  sh('vercel', ['whoami'])
} catch {
  console.error('✖ Vercel CLI not logged in. Run:\n  npm i -g vercel\n  vercel login')
  process.exit(1)
}
try {
  sh('vercel', ['ls', '--yes'])
} catch {
  console.error('✖ Project not linked. Run:  vercel link')
  process.exit(1)
}

const ENVIRONMENTS = ['production', 'preview', 'development']
console.log(`→ Pushing ${vars.length} variable(s) × ${ENVIRONMENTS.length} environments to Vercel…\n`)

for (const [key, value] of vars) {
  for (const env of ENVIRONMENTS) {
    try {
      vercelEnvAdd(key, value, env)
      console.log(`  ✔ ${key} → ${env}`)
    } catch {
      console.log(`  ⚠ ${key} → ${env} (skipped)`)
    }
  }
}

console.log(`
✔ Environment synced.

Next — deploy (pick one):
  · From here:  bun run deploy          (runs: vercel --prod)
  · From GitHub: push to main and Vercel deploys automatically.

After the first deploy, verify the cloud backend:
  curl https://<your-app>.vercel.app/api/cloud/health
  → { "ok": true, "backend": "turso", … }

⚠ SECURITY: rotate any token that was ever pasted into a chat or ticket.
  Turso: turso db tokens invalidate → create new → update .env → bun run env:push
  GitHub: Settings → Developer settings → Tokens → regenerate.
`)
