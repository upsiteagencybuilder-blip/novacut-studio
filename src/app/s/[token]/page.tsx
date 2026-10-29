import type { Metadata } from 'next'
import { cloudDb } from '@/lib/cloud/db'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ token: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params
  try {
    const link = await cloudDb.prisma.shareLink.findUnique({
      where: { token },
      select: { title: true },
    })
    return { title: link ? `${link.title} — NovaCut Share` : 'NovaCut Share' }
  } catch {
    return { title: 'NovaCut Share' }
  }
}

/** Read-only share view — fetches the snapshot server-side and counts the view. */
async function fetchShare(token: string) {
  const { prisma } = cloudDb
  const link = await prisma.shareLink.findUnique({ where: { token } })
  if (!link) return null
  await prisma.shareLink
    .update({ where: { token }, data: { views: { increment: 1 } } })
    .catch(() => null)
  return link
}

const KIND_COLORS: Record<string, string> = {
  video: 'bg-fuchsia-500/70 border-fuchsia-300/50',
  image: 'bg-violet-500/70 border-violet-300/50',
  audio: 'bg-emerald-500/70 border-emerald-300/50',
  text: 'bg-amber-500/70 border-amber-300/50',
  sticker: 'bg-sky-500/70 border-sky-300/50',
  adjustment: 'bg-rose-500/70 border-rose-300/50',
}

function kindColor(kind: string): string {
  return KIND_COLORS[kind] ?? 'bg-zinc-500/70 border-zinc-300/50'
}

interface SharedClip {
  id: string
  trackId: string
  kind: string
  name: string
  start: number
  duration: number
}

interface SharedPayload {
  name?: string
  fps?: number
  canvasWidth?: number
  canvasHeight?: number
  tracks?: { id: string; name: string; kind: string }[]
  clips?: SharedClip[]
}

function fmtDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default async function ShareViewerPage({ params }: PageProps) {
  const { token } = await params
  const link = await fetchShare(token).catch(() => null)

  if (!link) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-zinc-100">
        <div className="max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <p className="text-lg font-semibold">This share link doesn&apos;t exist</p>
          <p className="mt-2 text-sm text-zinc-400">
            The link may have been removed, or the token is mistyped. Shares are read-only snapshots —
            ask the author for a fresh link.
          </p>
          <a
            href="/"
            className="mt-5 inline-block rounded-xl bg-fuchsia-600 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-500"
          >
            Open NovaCut Studio
          </a>
        </div>
      </main>
    )
  }

  let payload: SharedPayload = {}
  try {
    payload = JSON.parse(link.payload) as SharedPayload
  } catch {
    payload = {}
  }

  const clips = Array.isArray(payload.clips) ? payload.clips : []
  const tracks = Array.isArray(payload.tracks) ? payload.tracks : []
  const total = Math.max(...clips.map((c) => c.start + c.duration), 0)
  const kindCounts = clips.reduce<Record<string, number>>((acc, c) => {
    acc[c.kind] = (acc[c.kind] ?? 0) + 1
    return acc
  }, {})

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* header */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-fuchsia-400">
              NovaCut share · read-only
            </p>
            <h1 className="mt-1 truncate text-2xl font-bold">{link.title}</h1>
            <p className="mt-1 text-xs text-zinc-400">
              {clips.length} clips · {fmtDuration(total)} · shared{' '}
              {new Date(link.createdAt).toLocaleDateString()} · {link.views + 1} views
            </p>
          </div>
          <a
            href="/"
            className="rounded-xl bg-fuchsia-600 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-500"
          >
            Open NovaCut Studio
          </a>
        </header>

        {/* stats row */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Project stats">
          {[
            { label: 'Clips', value: String(clips.length) },
            { label: 'Tracks', value: String(tracks.length) },
            { label: 'Duration', value: fmtDuration(total) },
            {
              label: 'Canvas',
              value:
                payload.canvasWidth && payload.canvasHeight
                  ? `${payload.canvasWidth}×${payload.canvasHeight}`
                  : '—',
            },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">{s.label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{s.value}</p>
            </div>
          ))}
        </section>

        {/* timeline visualization */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4" aria-label="Timeline overview">
          <p className="text-xs font-semibold text-zinc-300">Timeline overview</p>
          {clips.length === 0 || tracks.length === 0 ? (
            <p className="mt-3 text-xs text-zinc-500">This snapshot has no timeline content.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {tracks.map((t) => {
                const trackClips = clips.filter((c) => c.trackId === t.id)
                return (
                  <div key={t.id} className="flex items-center gap-2">
                    <span className="w-16 shrink-0 truncate text-[10px] text-zinc-500" title={t.name}>
                      {t.name || t.kind}
                    </span>
                    <div className="relative h-7 flex-1 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
                      {trackClips.map((c) => (
                        <div
                          key={c.id}
                          title={`${c.name} · ${c.duration.toFixed(1)}s`}
                          className={`absolute top-0.5 bottom-0.5 overflow-hidden rounded border px-1 text-[9px] leading-[22px] text-white/90 ${kindColor(c.kind)}`}
                          style={{
                            left: `${total > 0 ? (c.start / total) * 100 : 0}%`,
                            width: `${total > 0 ? Math.max((c.duration / total) * 100, 1.5) : 0}%`,
                          }}
                        >
                          <span className="block truncate">{c.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <p className="mt-3 text-[10px] text-zinc-600">
            {Object.entries(kindCounts)
              .map(([k, n]) => `${n} ${k}`)
              .join(' · ') || 'empty'}
          </p>
        </section>

        <p className="text-[10px] leading-relaxed text-zinc-600">
          Read-only snapshot — media files are not part of a share link. The full edit stays on the
          author&apos;s device until they back it up.
        </p>
      </div>
    </main>
  )
}
