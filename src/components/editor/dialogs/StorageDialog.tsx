'use client'

/**
 * Day 60 — Storage manager dialog: quota report + honest cleanup.
 * The panel body is exported separately so the Projects dialog can embed it
 * as a tab. Every number is measured live (navigator.storage.estimate + real
 * IndexedDB row scans); every destructive action is confirmed inline.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  Database,
  HardDrive,
  History,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { toast } from 'sonner'
import { useEditor } from '@/lib/editor/store'
import {
  clearAllVersions,
  clearSWCaches,
  deleteOrphanAssets,
  factoryReset,
  formatBytesLocal,
  getStorageReport,
  type StorageReport,
} from '@/lib/editor/storage-manager'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

function StatRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-(--nc-sheet) px-2.5 py-1.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-right">
        <span className="font-mono text-[11px] tabular-nums">{value}</span>
        {hint && <span className="ml-1.5 text-[9px] text-muted-foreground/70">{hint}</span>}
      </span>
    </div>
  )
}

export function StoragePanel() {
  const [report, setReport] = useState<StorageReport | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<'orphans' | 'versions' | 'sw' | 'reset' | null>(null)
  const media = useEditor((s) => s.media)

  const refresh = useCallback(async () => {
    setBusy('refresh')
    try {
      setReport(await getStorageReport(media.map((m) => m.id)))
    } catch {
      toast.error('Could not read the storage report')
    } finally {
      setBusy(null)
    }
  }, [media])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const pct =
    report?.usageBytes != null && report?.quotaBytes ? Math.min(100, Math.round((report.usageBytes / report.quotaBytes) * 100)) : null

  const runOrphans = async () => {
    if (!report?.orphanIds.length) return
    setBusy('orphans')
    try {
      const n = await deleteOrphanAssets(report.orphanIds)
      toast.success(`Removed ${n} orphaned media blob${n === 1 ? '' : 's'} (${formatBytesLocal(report.orphanBytes)})`)
      setConfirming(null)
      await refresh()
    } catch {
      toast.error('Orphan cleanup failed')
    } finally {
      setBusy(null)
    }
  }

  const runVersions = async () => {
    setBusy('versions')
    try {
      const n = await clearAllVersions()
      toast.success(`Deleted ${n} version snapshot${n === 1 ? '' : 's'}`)
      setConfirming(null)
      await refresh()
    } catch {
      toast.error('Version cleanup failed')
    } finally {
      setBusy(null)
    }
  }

  const runSW = async () => {
    setBusy('sw')
    try {
      const n = await clearSWCaches()
      toast.success(`Cleared ${n} shell cache${n === 1 ? '' : 's'} — they rebuild on the next online session`)
      setConfirming(null)
      await refresh()
    } catch {
      toast.error('Cache cleanup failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3" data-nc-storage-panel>
      {/* quota bar */}
      <div className="rounded-xl border border-(--nc-line) bg-(--nc-panel) p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <HardDrive className="h-4 w-4 shrink-0 text-teal-400" />
            <div className="min-w-0">
              <p className="text-xs font-semibold">Browser storage</p>
              <p className="text-[10px] text-muted-foreground">
                {report?.usageBytes != null
                  ? `${formatBytesLocal(report.usageBytes)} used of ${report.quotaBytes ? formatBytesLocal(report.quotaBytes) : 'unknown quota'}`
                  : 'estimate() unavailable in this browser — per-store counts below are still real'}
                {report?.persisted === true && ' · persistent storage granted'}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Refresh storage report"
            disabled={busy !== null}
            onClick={() => void refresh()}
            className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
          >
            {busy === 'refresh' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
        {pct != null && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-(--nc-panel-strong)">
            <div
              className={
                'h-full rounded-full transition-all ' + (pct > 85 ? 'bg-rose-500' : pct > 65 ? 'bg-amber-500' : 'nc-gradient')
              }
              style={{ width: `${Math.max(2, pct)}%` }}
            />
          </div>
        )}
        <div className="mt-2 space-y-1.5">
          <StatRow label="Media blobs (IndexedDB)" value={`${report?.mediaCount ?? '—'} · ${formatBytesLocal(report?.mediaBytes ?? 0)}`} />
          <StatRow label="Projects (IndexedDB)" value={String(report?.projectCount ?? '—')} />
          <StatRow label="Version snapshots" value={String(report?.versionCount ?? '—')} />
          <StatRow
            label="Orphaned media (no project references it)"
            value={`${report?.orphanIds.length ?? '—'} · ${formatBytesLocal(report?.orphanBytes ?? 0)}`}
          />
        </div>
      </div>

      {/* cleanup actions */}
      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
          <Database className="h-3.5 w-3.5" />
          Cleanup
        </p>

        {/* orphans */}
        <div className="rounded-xl border border-(--nc-line) bg-(--nc-panel) p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 text-[11px]">
              Remove orphaned media blobs
              {report && report.orphanIds.length === 0 && (
                <Badge variant="outline" className="ml-1.5 border-emerald-400/40 bg-emerald-500/10 px-1 py-0 text-[8px] text-emerald-300">
                  none found
                </Badge>
              )}
            </p>
            {confirming === 'orphans' ? (
              <span className="flex shrink-0 items-center gap-1">
                <Button size="sm" className="h-7 px-2 text-[10px]" disabled={busy !== null} onClick={() => void runOrphans()}>
                  Confirm
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => setConfirming(null)}>
                  Cancel
                </Button>
              </span>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                disabled={!report || report.orphanIds.length === 0 || busy !== null}
                onClick={() => setConfirming('orphans')}
                className="h-7 shrink-0 px-2 text-[10px] text-foreground"
              >
                {busy === 'orphans' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                Remove
              </Button>
            )}
          </div>
          <p className="mt-1 text-[9px] text-muted-foreground/70">
            Local blobs referenced by no stored project — the current session&apos;s media is always protected.
          </p>
        </div>

        {/* versions */}
        <div className="rounded-xl border border-(--nc-line) bg-(--nc-panel) p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1.5 text-[11px]">
              <History className="h-3.5 w-3.5 shrink-0" />
              Delete all version snapshots ({report?.versionCount ?? '—'})
            </p>
            {confirming === 'versions' ? (
              <span className="flex shrink-0 items-center gap-1">
                <Button size="sm" variant="destructive" className="h-7 px-2 text-[10px]" disabled={busy !== null} onClick={() => void runVersions()}>
                  Confirm
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => setConfirming(null)}>
                  Cancel
                </Button>
              </span>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                disabled={!report || report.versionCount === 0 || busy !== null}
                onClick={() => setConfirming('versions')}
                className="h-7 shrink-0 px-2 text-[10px] text-foreground"
              >
                {busy === 'versions' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* SW caches */}
        <div className="rounded-xl border border-(--nc-line) bg-(--nc-panel) p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 text-[11px]">Clear offline shell caches</p>
            {confirming === 'sw' ? (
              <span className="flex shrink-0 items-center gap-1">
                <Button size="sm" className="h-7 px-2 text-[10px]" disabled={busy !== null} onClick={() => void runSW()}>
                  Confirm
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => setConfirming(null)}>
                  Cancel
                </Button>
              </span>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() => setConfirming('sw')}
                className="h-7 shrink-0 px-2 text-[10px] text-foreground"
              >
                {busy === 'sw' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                Clear
              </Button>
            )}
          </div>
          <p className="mt-1 text-[9px] text-muted-foreground/70">The service worker rebuilds them on the next online session.</p>
        </div>

        {/* factory reset */}
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-rose-200">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
              Factory reset — wipe everything local
            </p>
            {confirming === 'reset' ? (
              <span className="flex shrink-0 items-center gap-1">
                <Button size="sm" variant="destructive" className="h-7 px-2 text-[10px]" onClick={() => void factoryReset()}>
                  Wipe &amp; reload
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => setConfirming(null)}>
                  Cancel
                </Button>
              </span>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() => setConfirming('reset')}
                className="h-7 shrink-0 px-2 text-[10px] text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
              >
                Reset
              </Button>
            )}
          </div>
          <p className="mt-1 text-[9px] text-rose-200/60">
            Deletes IndexedDB (projects, media, versions), localStorage and caches, then reloads. Cloud backups are untouched.
          </p>
        </div>
      </div>

      <p className="flex items-start gap-1.5 text-[10px] text-muted-foreground/70">
        <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
        Every number here is measured live from this device — nothing is estimated from typical values.
      </p>
    </div>
  )
}

export function StorageDialog() {
  const open = useEditor((s) => s.activeDialog === 'storage')
  const openDialog = useEditor((s) => s.openDialog)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && openDialog(null)}>
      <DialogContent className="max-h-[92dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <HardDrive className="h-4 w-4 text-teal-400" />
            Storage manager
          </DialogTitle>
          <DialogDescription>Quota, local persistence and cleanup — all measured on this device.</DialogDescription>
        </DialogHeader>
        <StoragePanel />
      </DialogContent>
    </Dialog>
  )
}
