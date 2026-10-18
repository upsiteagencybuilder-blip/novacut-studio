# NovaCut Studio — Deploy Guide (Turso + Vercel, zero manual config)

Everything is wired so that **one clone → three commands → live site**.
No API keys are ever committed; the app runs fine even with zero env vars
(cloud features simply fall back to local mode).

---

## Architecture at a glance

```
Browser (PWA)                      Vercel (hnd1 · Tokyo)              Turso (ap-northeast-1)
┌─────────────────────┐            ┌──────────────────────┐           ┌──────────────────────┐
│ Editor = local-first │  /api/*   │ Next.js API routes   │  libSQL   │ CloudProject         │
│ IndexedDB + OPFS     │ ────────► │ src/lib/cloud/db.ts  │ ────────► │ ShareLink            │
│ works 100% offline   │           │ driver adapter       │           │ Feedback             │
└─────────────────────┘            └──────────────────────┘           └──────────────────────┘
```

- **Turso vars present** → `src/lib/cloud/db.ts` binds Prisma to Turso via `@prisma/adapter-libsql`.
- **Turso vars absent** → identical code path on a local SQLite file. Nothing breaks.
- `vercel.json` pins the serverless region to `hnd1` — same AWS region as the Turso DB, so API→DB latency stays ~1 ms.

---

## Step 1 — Pull the code

```bash
git pull origin main
bun install
```

## Step 2 — Configure (one time, two commands)

```bash
npm i -g vercel
vercel login
vercel link          # choose your NovaCut project
```

The secrets live in `.env` (git-ignored). It ships with your values already —
if you clone fresh, recreate it:

```bash
cp .env.example .env      # then paste your Turso URL + token
```

## Step 3 — Push env vars + go live

```bash
bun run env:push          # pushes TURSO_DATABASE_URL + TURSO_AUTH_TOKEN to Vercel (all 3 environments)
bun run db:init:turso     # one time: creates the tables in Turso (idempotent)
bun run deploy            # → vercel --prod → site is live
```

Or just **push to GitHub** — Vercel picks it up automatically once env vars are synced.

## Step 4 — Verify (30 seconds)

```bash
curl https://<your-app>.vercel.app/api/cloud/health
# { "ok": true, "backend": "turso", "latencyMs": 3, "service": "novacut-cloud" }
```

`bun run doctor` checks the same things locally.

---

## Scripts reference

| Script               | What it does                                            |
| -------------------- | ------------------------------------------------------- |
| `bun run doctor`     | Verify env, Turso reachability, schema readiness        |
| `bun run env:push`   | Push `.env` → Vercel (production/preview/development)   |
| `bun run db:init:turso` | Create tables in Turso (idempotent, safe to re-run)  |
| `bun run db:push`    | Local dev: push schema to the file SQLite DB            |
| `bun run deploy`     | `vercel --prod`                                         |

## API surface (already live)

| Endpoint                    | Method            | Purpose                              |
| --------------------------- | ----------------- | ------------------------------------ |
| `/api/cloud/health`         | GET               | Backend status + latency             |
| `/api/cloud/projects`       | GET/POST/DELETE   | Device-scoped project sync           |
| `/api/cloud/share`          | GET/POST          | Read-only snapshot share links       |

Client helpers: `src/lib/cloud/client.ts` (`cloudSyncProject`, `cloudShare`, …).

---

## ⚠ Security — do this once

The GitHub token and Turso token were shared through chat. Rotate both:

1. **GitHub** → Settings → Developer settings → Personal access tokens → **Regenerate**, then update your local git credential.
2. **Turso** → `turso db tokens create novacut` (new token) → update `.env` → `bun run env:push`.

Tokens live only in `.env` (git-ignored) and in Vercel's encrypted store — never in the repo.
