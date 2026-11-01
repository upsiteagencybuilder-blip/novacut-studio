# NovaCut Studio v1.0.0 — Vercel + Turso Deploy Checklist

Release day (Day 90) checklist for shipping NovaCut Studio to production.
Local development runs on plain SQLite (`db/custom.db`); production binds the same
Prisma schema to **Turso** through `@prisma/adapter-libsql` (see
`src/lib/cloud/db.ts` and `scripts/init-turso.mjs`).

---

## 1. Turso database

- [ ] `turso db create novacut-prod` — create the production database
- [ ] `turso db show novacut-prod --url` → copy **libsql** URL
      (`libsql://novacut-prod-<org>.turso.io`)
- [ ] `turso db tokens create novacut-prod` → copy the auth token
      (store it in a secrets vault, never in git)
- [ ] Optional replicas: `turso db replicate novacut-prod <region>` near user bases
- [ ] Push the schema: `bun run db:init:turso`
      (runs `scripts/init-turso.mjs` — creates `CloudProject`, `CloudAsset`,
      `NextAuth` tables on Turso; verify with `turso db shell novacut-prod ".tables"`)

## 2. Vercel project

- [ ] Import the `novacut` repo into Vercel (framework preset: **Next.js**,
      build command `bun run build` if using Bun, otherwise default `next build`)
- [ ] Node/Bun version pinned (`.node-version` / Vercel settings)
- [ ] Set **Environment Variables** (Production + Preview):

| Key | Value | Notes |
| --- | --- | --- |
| `TURSO_DATABASE_URL` | `libsql://novacut-prod-<org>.turso.io` | production DB |
| `TURSO_AUTH_TOKEN` | (token from step 1) | secret — rotate every 90 days |
| `DATABASE_URL` | `file:./db/novacut.db` | fallback only; cloud/db.ts prefers Turso |
| `NEXTAUTH_URL` | `https://<your-domain>` | only if sign-in (Day 48 scaffold) is enabled |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` | same condition |

- [ ] Confirm `src/lib/cloud/db.ts` detects `TURSO_DATABASE_URL` in the
      Function logs (first request logs the active engine)

## 3. Verify the deployment

- [ ] `curl -s https://<your-domain>/api/cloud/health` → `{"ok":true}`
      and the response names the Turso engine (not the SQLite dev fallback)
- [ ] Cloud backup round-trip from the browser: Projects → Cloud →
      "Back up current project" → Refresh → project appears; delete + restore works
- [ ] Binary asset upload (Day 42 path) round-trips with server-side hash verification
- [ ] PWA: manifest served (`/manifest.webmanifest` shows `"version": "1.0.0"`),
      service worker registers (`/sw.js`, cache `novacut-v5`), install prompt offered
- [ ] Export pipeline smoke test on production: WebM/MP4/GIF/PNG/WAV paths
      (MediaRecorder/canvas are fully client-side — no server changes needed)
- [ ] Tool wall footer shows `Live · 297 / Roadmap · 283` (honesty catalog intact)

## 4. Post-deploy

- [ ] Tag pushed: `git tag v1.0.0 && git push origin v1.0.0`
- [ ] GitHub release notes link to `docs/RELEASE-v1.0.0.md`
- [ ] Turso backups enabled (point-in-time restore on the paid tier)
- [ ] Watch Vercel Functions logs for the first 24 h (500s / latency outliers)

---

**Rollback plan:** redeploy the previous Vercel build (instant rollback in the
dashboard); Turso data is independent of app deploys — schema changes in this
release are additive (folder chip, version columns), so the previous build also
runs against the same database.
