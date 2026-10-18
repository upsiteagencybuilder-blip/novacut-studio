#!/usr/bin/env node
/**
 * Initialize the Turso database schema — idempotent (IF NOT EXISTS).
 *
 *   bun run db:init:turso
 *
 * Reads TURSO_DATABASE_URL / TURSO_AUTH_TOKEN from .env.
 * Mirrors prisma/schema.prisma exactly (SQLite dialect = libSQL).
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@libsql/client'

// ---- tiny .env loader (no dependency needed) ----
function loadEnv() {
  if (!existsSync('.env')) return
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
loadEnv()

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN

if (!url || !token) {
  console.error('✖ TURSO_DATABASE_URL / TURSO_AUTH_TOKEN missing. Add them to .env first.')
  process.exit(1)
}

const DDL = [
  `CREATE TABLE IF NOT EXISTS "CloudProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "duration" REAL NOT NULL DEFAULT 0,
    "clipCount" INTEGER NOT NULL DEFAULT 0,
    "thumbnail" TEXT,
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CloudProject_deviceId_localId_key" ON "CloudProject"("deviceId", "localId")`,
  `CREATE INDEX IF NOT EXISTS "CloudProject_deviceId_updatedAt_idx" ON "CloudProject"("deviceId", "updatedAt")`,
  `CREATE TABLE IF NOT EXISTS "ShareLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ShareLink_token_key" ON "ShareLink"("token")`,
  `CREATE INDEX IF NOT EXISTS "ShareLink_deviceId_createdAt_idx" ON "ShareLink"("deviceId", "createdAt")`,
  `CREATE TABLE IF NOT EXISTS "Feedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "rating" INTEGER,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS "Feedback_createdAt_idx" ON "Feedback"("createdAt")`,
]

const db = createClient({ url, authToken: token })

console.log(`→ Connecting to ${url.replace(/libsql:\/\//, 'libsql://***@')} …`)
try {
  await db.execute('SELECT 1')
} catch (err) {
  console.error('✖ Cannot reach Turso:', err.message)
  process.exit(1)
}

console.log(`→ Creating ${DDL.length} schema objects (idempotent)…`)
for (const sql of DDL) {
  await db.execute(sql)
}

const result = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
console.log('✔ Turso ready. Tables:', result.rows.map((r) => r.name).join(', '))
