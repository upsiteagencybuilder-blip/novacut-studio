/**
 * NovaCut cloud DB — one client, two runtimes.
 *
 *  • TURSO_DATABASE_URL + TURSO_AUTH_TOKEN present (Vercel production)
 *      → Prisma Client bound to Turso through @prisma/adapter-libsql.
 *  • Otherwise (local dev / offline sandbox)
 *      → plain Prisma Client on the file SQLite database.
 *
 * The editor itself is local-first (IndexedDB); this layer powers the
 * optional cloud features (project sync, share links, feedback).
 */
import { PrismaClient } from '@prisma/client'

export type CloudBackend = 'turso' | 'sqlite'

interface CloudDb {
  prisma: PrismaClient
  backend: CloudBackend
}

const globalForCloud = globalThis as unknown as { __novaCutCloudDb?: CloudDb }

function createCloudDb(): CloudDb {
  const tursoUrl = process.env.TURSO_DATABASE_URL
  const tursoToken = process.env.TURSO_AUTH_TOKEN

  if (tursoUrl && tursoToken) {
    // lazy require keeps the adapter out of the edge/browser bundle graph
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaLibSQL } = require('@prisma/adapter-libsql') as typeof import('@prisma/adapter-libsql')

    // adapter-libsql v6 accepts the client Config directly and owns the client
    const adapter = new PrismaLibSQL({ url: tursoUrl, authToken: tursoToken })
    return { prisma: new PrismaClient({ adapter }), backend: 'turso' }
  }

  return { prisma: new PrismaClient(), backend: 'sqlite' }
}

export function getCloudDb(): CloudDb {
  if (!globalForCloud.__novaCutCloudDb) {
    globalForCloud.__novaCutCloudDb = createCloudDb()
  }
  return globalForCloud.__novaCutCloudDb
}

export const cloudDb = getCloudDb()
