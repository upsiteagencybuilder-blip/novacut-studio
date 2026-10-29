'use client'

/**
 * Projects dialog — two tabs:
 *   • On this device — IndexedDB projects (local-first, unchanged behavior)
 *   • Cloud backup   — Turso-backed snapshots via /api/cloud/* (backend auto-
 *     selects Turso in production, local SQLite fallback in dev/offline)
 *
 * Cloud semantics: a backup stores the project STRUCTURE keyed to this
 * device (deviceId + localId upsert). Restoring replaces the local copy
 * with the cloud version; media binaries stay in this browser (stated in
 * the dialog), so a same-device restore is complete.
 */

import { useCallback, useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  CloudUpload,
  FileCheck2,
  FilePlus2,
  Film,
  FolderOpen,
  History,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { toast } from 'sonner'
import { useEditor } from '@/lib/editor/store'
import * as db from '@/lib/editor/db'
import {
  cloudDeleteProject,
  cloudGetManifest,
  cloudHealth,
  cloudListProjects,
  cloudLoadProject,
  cloudSyncManifest,
  cloudSyncProject,
  getDeviceId,
  type CloudHealth,
  type CloudProjectMeta,
  type ManifestSummary,
} from '@/lib/cloud/client'
import { captureThumbnail, isCloudProjectPayload } from '@/lib/cloud/backup'
import { buildProjectManifest, checkManifestAgainstLocal } from '@/lib/cloud/manifest'
import { formatBytes } from '@/lib/editor/utils'
import { cn } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Project } from '@/lib/editor/types'

type Tab = 'device' | 'cloud'

function byUpdatedAtDesc(a: Project, b: Project): number {
  return b.updatedAt - a.updatedAt
}

interface BackupReceipt {
  manifestCount: number
  totalBytes: number
  missing: number
}

/**
 * Day 41 — shared backup flow: structure payload + media manifest.
 * Returns a receipt so both entry points can toast the same truth.
 */
async function backupWithManifest(project: Project): Promise<BackupReceipt> {
  await cloudSyncProject({
    localId: project.id,
    name: project.name,
    duration: Math.max(...project.clips.map((c) => c.start + c.duration), 0),
    clipCount: project.clips.length,
    thumbnail: captureThumbnail(),
    data: JSON.stringify(project),
  })

  const manifest = await buildProjectManifest(project)
  await cloudSyncManifest(getDeviceId(), project.id, manifest.entries)
  return {
    manifestCount: manifest.entries.length,
    totalBytes: manifest.totalBytes,
    missing: manifest.missing.length,
  }
}

/* ================= cloud tab ================= */

function HealthPill({ health }: { health: CloudHealth | null }) {
  if (!health) {
    return (
      <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" aria-hidden />
        Checking cloud…
      </span>
    )
  }
  if (!health.ok) {
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-[10px] text-amber-300" title={health.error}>
        <TriangleAlert className="size-3 shrink-0" aria-hidden />
        <span className="truncate">Cloud unreachable — backups disabled</span>
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
      <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" aria-hidden />
      {health.backend === 'turso' ? 'Turso cloud' : 'Local SQLite (dev fallback)'}
      <span className="tabular-nums opacity-70">· {health.latencyMs ?? '?'} ms</span>
    </span>
  )
}

function CloudTab({ onRestored }: { onRestored: () => void }) {
  const [health, setHealth] = useState<CloudHealth | null>(null)
  const [list, setList] = useState<CloudProjectMeta[] | null>(null)
  const [backingUp, setBackingUp] = useState(false)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [manifest, setManifest] = useState<ManifestSummary | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [verifyNote, setVerifyNote] = useState<string | null>(null)

  const currentProject = useEditor((s) => s.project)

  const refresh = useCallback(async () => {
    const deviceId = getDeviceId()
    const [h, projects] = await Promise.all([
      cloudHealth().catch(() => null),
      cloudListProjects(deviceId).catch(() => null),
    ])
    setHealth(h)
    setList(projects)
  }, [])

  const refreshManifest = useCallback(async () => {
    setVerifyNote(null)
    try {
      const m = await cloudGetManifest(getDeviceId(), useEditor.getState().project.id)
      setManifest(m)
    } catch {
      setManifest(null)
    }
  }, [])

  useEffect(() => {
    void refresh()
    void refreshManifest()
  }, [refresh, refreshManifest])

  const handleVerify = async () => {
    if (!manifest || verifying) return
    setVerifying(true)
    setVerifyNote(null)
    try {
      const results = await checkManifestAgainstLocal(manifest.assets)
      const match = results.filter((r) => r.status === 'match').length
      const mismatch = results.filter((r) => r.status === 'mismatch').length
      const missing = results.filter((r) => r.status === 'missing').length
      setVerifyNote(
        `${match}/${results.length} match${mismatch ? ` · ${mismatch} changed` : ''}${missing ? ` · ${missing} missing` : ''}`,
      )
      if (mismatch === 0 && missing === 0) toast.success(`All ${match} media hashes verified`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Verification failed')
    } finally {
      setVerifying(false)
    }
  }

  const handleBackupCurrent = async () => {
    if (backingUp) return
    setBackingUp(true)
    try {
      const project = useEditor.getState().project
      const receipt = await backupWithManifest(project)
      toast.success(
        `"${project.name}" backed up — structure + media manifest (${receipt.manifestCount} files · ${formatBytes(receipt.totalBytes)})`,
      )
      if (receipt.missing > 0) {
        toast.warning(`${receipt.missing} referenced media file(s) are missing on this device — manifest covers the rest`)
      }
      await Promise.all([refresh(), refreshManifest()])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cloud backup failed')
    } finally {
      setBackingUp(false)
    }
  }

  const handleRestore = async (meta: CloudProjectMeta) => {
    if (restoringId) return
    setRestoringId(meta.localId)
    try {
      const raw = await cloudLoadProject(getDeviceId(), meta.localId)
      const parsed: unknown = JSON.parse(raw)
      if (!isCloudProjectPayload(parsed)) throw new Error('The cloud backup is corrupted or from an older build')
      await db.saveProject(parsed)
      await useEditor.getState().openProject(parsed.id)
      toast.success(`Restored "${parsed.name}" from the cloud`)
      onRestored()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Restore failed')
    } finally {
      setRestoringId(null)
    }
  }

  const handleDelete = async (localId: string) => {
    if (deletingId) return
    setDeletingId(localId)
    try {
      await cloudDeleteProject(localId)
      toast.success('Cloud backup removed')
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove the backup')
    } finally {
      setDeletingId(null)
    }
  }

  const cloudUnavailable = health !== null && !health.ok

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <HealthPill health={health} />
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          aria-label="Refresh cloud backups"
          onClick={() => void refresh()}
        >
          <RefreshCw className="size-3.5" />
        </Button>
      </div>

      <Button
        type="button"
        disabled={backingUp || cloudUnavailable}
        onClick={() => void handleBackupCurrent()}
        className="nc-gradient nc-glow-hover h-10 w-full rounded-xl font-semibold text-white hover:opacity-90"
      >
        {backingUp ? <Loader2 className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
        {backingUp ? 'Backing up…' : 'Back up current project'}
      </Button>

      {cloudUnavailable && (
        <p className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-2.5 text-[10px] leading-relaxed text-amber-200">
          The cloud database isn&apos;t reachable right now. Backups need the deployment to have
          TURSO_DATABASE_URL and TURSO_AUTH_TOKEN configured.
        </p>
      )}

      {/* Day 41 — media manifest strip for the CURRENT project */}
      <div className="rounded-xl border border-(--nc-line) bg-(--nc-panel-soft) p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold">
            <FileCheck2 className="size-3.5 shrink-0 text-sky-300" />
            Media manifest
          </p>
          {manifest && manifest.count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 border border-(--nc-line-strong) px-2 text-[10px] hover:border-fuchsia-400/50 hover:text-foreground"
              disabled={verifying || cloudUnavailable}
              onClick={() => void handleVerify()}
            >
              {verifying ? <Loader2 className="size-3 animate-spin" /> : <ShieldCheck className="size-3" />}
              Verify hashes
            </Button>
          )}
        </div>
        {manifest && manifest.count > 0 ? (
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            {manifest.count} file{manifest.count === 1 ? '' : 's'} · {formatBytes(manifest.totalBytes)} · sha-256
            {manifest.syncedAt && ` · synced ${formatDistanceToNow(new Date(manifest.syncedAt), { addSuffix: true })}`}
            {verifyNote && <span className="text-emerald-300"> · {verifyNote}</span>}
          </p>
        ) : (
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            No manifest synced for this project yet — a cloud backup stores the sha-256 hash map of every
            media file it references.
          </p>
        )}
      </div>

      {list === null ? (
        <div className="space-y-2">
          <div className="h-14 animate-pulse rounded-xl bg-(--nc-panel)" />
          <div className="h-14 animate-pulse rounded-xl bg-(--nc-panel)" />
        </div>
      ) : list.length === 0 ? (
        <p className="rounded-xl border border-(--nc-line) bg-(--nc-panel-soft) p-4 text-center text-xs text-muted-foreground">
          No cloud backups yet — back up the current project to create one.
        </p>
      ) : (
        <div className="max-h-72 space-y-2 overflow-y-auto pr-0.5">
          {list.map((m) => {
            const isCurrent = m.localId === currentProject.id
            return (
              <div
                key={m.localId}
                className={cn(
                  'flex items-center gap-3 rounded-xl border p-3',
                  isCurrent ? 'border-fuchsia-400/50 bg-fuchsia-500/5' : 'border-(--nc-line) bg-(--nc-panel-soft)'
                )}
              >
                <Film className={cn('size-4 shrink-0', isCurrent ? 'text-fuchsia-300' : 'text-muted-foreground')} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {m.clipCount} clips · synced {formatDistanceToNow(new Date(m.updatedAt), { addSuffix: true })}
                  </p>
                </div>
                {isCurrent && (
                  <Badge variant="outline" className="shrink-0 border-emerald-400/40 text-[9px] text-emerald-300">
                    Current
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={cloudUnavailable}
                  className="h-8 shrink-0 border border-(--nc-line-strong) px-3 text-xs hover:border-fuchsia-400/50 hover:text-foreground"
                  onClick={() => void handleRestore(m)}
                >
                  {restoringId === m.localId ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <History className="size-3.5" />
                  )}
                  Restore
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0 text-rose-400/80 hover:bg-rose-500/10 hover:text-rose-300"
                      title="Remove cloud backup"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove cloud backup?</AlertDialogTitle>
                      <AlertDialogDescription>
                        &quot;{m.name}&quot; will be deleted from the cloud. Your local copy stays on this
                        device.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-rose-500/90 text-white hover:bg-rose-500"
                        onClick={() => void handleDelete(m.localId)}
                      >
                        Remove
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-[9.5px] leading-relaxed text-muted-foreground/70">
        Backups save the project structure PLUS a sha-256 manifest of every referenced media file.
        Binaries still live in this browser — same-device restores are complete; other devices can
        see exactly which files they are missing.
      </p>
    </div>
  )
}

/* ================= device tab ================= */

function DeviceTab() {
  const currentId = useEditor((s) => s.project.id)
  const newProject = useEditor((s) => s.newProject)
  const openDialog = useEditor((s) => s.openDialog)

  const [list, setList] = useState<Project[] | null>(null)
  const [backingUpId, setBackingUpId] = useState<string | null>(null)

  const refreshList = useCallback(async () => {
    const projects = await db.listProjects()
    setList(projects.sort(byUpdatedAtDesc))
  }, [])

  useEffect(() => {
    void refreshList()
  }, [refreshList])

  const handleNew = () => {
    newProject()
    toast.success('New project created')
    openDialog(null)
  }

  const handleOpen = async (id: string) => {
    await useEditor.getState().openProject(id)
    toast.success('Project opened')
    openDialog(null)
  }

  const handleBackup = async (project: Project) => {
    if (backingUpId) return
    setBackingUpId(project.id)
    try {
      const receipt = await backupWithManifest(project)
      toast.success(
        `"${project.name}" backed up — structure + media manifest (${receipt.manifestCount} files · ${formatBytes(receipt.totalBytes)})`,
      )
      if (receipt.missing > 0) {
        toast.warning(`${receipt.missing} referenced media file(s) missing on this device`)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cloud backup failed')
    } finally {
      setBackingUpId(null)
    }
  }

  const handleDelete = async (id: string) => {
    await db.deleteProject(id)
    if (id === currentId) newProject()
    await refreshList()
    toast.success('Project deleted')
  }

  return (
    <div className="space-y-3">
      <Button
        variant="ghost"
        className="nc-gradient nc-glow-hover h-10 w-full rounded-xl font-semibold text-white hover:opacity-90"
        onClick={handleNew}
      >
        <FilePlus2 className="size-4" />
        New project
      </Button>

      {list === null ? (
        <div className="space-y-2">
          <div className="h-14 animate-pulse rounded-xl bg-(--nc-panel)" />
          <div className="h-14 animate-pulse rounded-xl bg-(--nc-panel)" />
        </div>
      ) : list.length === 0 ? (
        <p className="rounded-xl border border-(--nc-line) bg-(--nc-panel-soft) p-4 text-center text-xs text-muted-foreground">
          No saved projects yet — your current project auto-saves as you edit.
        </p>
      ) : (
        <div className="max-h-72 space-y-2 overflow-y-auto pr-0.5">
          {list.map((p) => {
            const current = p.id === currentId
            return (
              <div
                key={p.id}
                className={cn(
                  'flex items-center gap-3 rounded-xl border p-3',
                  current ? 'border-fuchsia-400/50 bg-fuchsia-500/5' : 'border-(--nc-line) bg-(--nc-panel-soft)'
                )}
              >
                <Film className={cn('size-4 shrink-0', current ? 'text-fuchsia-300' : 'text-muted-foreground')} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {p.clips.length} clips · edited{' '}
                    {formatDistanceToNow(new Date(p.updatedAt), { addSuffix: true })}
                  </p>
                </div>
                {current ? (
                  <Badge variant="outline" className="shrink-0 border-emerald-400/40 text-[9px] text-emerald-300">
                    Current
                  </Badge>
                ) : (
                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 border border-(--nc-line-strong) px-3 text-xs hover:border-fuchsia-400/50 hover:text-foreground"
                      onClick={() => void handleOpen(p.id)}
                    >
                      Open
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-rose-400/80 hover:bg-rose-500/10 hover:text-rose-300"
                          title="Delete project"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete project?</AlertDialogTitle>
                          <AlertDialogDescription>
                            &quot;{p.name}&quot; will be permanently removed. Clips won&apos;t be removed from the
                            media library.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-rose-500/90 text-white hover:bg-rose-500"
                            onClick={() => void handleDelete(p.id)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-sky-300/80 hover:bg-sky-400/10 hover:text-sky-200"
                  title="Back up this project to the cloud"
                  disabled={backingUpId === p.id}
                  onClick={() => void handleBackup(p)}
                >
                  {backingUpId === p.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CloudUpload className="size-4" />
                  )}
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ================= dialog ================= */

export function ProjectsDialog() {
  const open = useEditor((s) => s.activeDialog === 'projects')
  const openDialog = useEditor((s) => s.openDialog)

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) openDialog(null)
      }}
    >
      <DialogContent className="max-w-lg">
        {open && <ProjectsBody />}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Mounted only while the dialog is open (Radix unmounts on close), so the
 * tab state resets to "device" on every open without an effect.
 */
function ProjectsBody() {
  const openDialog = useEditor((s) => s.openDialog)
  const [tab, setTab] = useState<Tab>('device')

  const handleRestored = useCallback(() => {
    openDialog(null)
  }, [openDialog])

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-base">
          <FolderOpen className="size-4 text-fuchsia-400" />
          Your projects
        </DialogTitle>
        <DialogDescription>
          Local-first in your browser (IndexedDB) — optional cloud backups via Turso.
        </DialogDescription>
      </DialogHeader>

      <div role="tablist" aria-label="Project locations" className="grid grid-cols-2 gap-1.5 rounded-xl border border-(--nc-line) bg-(--nc-panel) p-1.5">
        {(
          [
            { id: 'device', label: 'On this device' },
            { id: 'cloud', label: 'Cloud backup' },
          ] as const
        ).map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex h-8 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold transition',
                active
                  ? 'nc-gradient text-white shadow-[0_0_14px_var(--nc-accent-glow-soft)]'
                  : 'text-muted-foreground hover:bg-(--nc-panel-strong) hover:text-foreground'
              )}
            >
              {t.id === 'cloud' ? <CloudUpload className="size-3.5" /> : <FolderOpen className="size-3.5" />}
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'device' ? <DeviceTab /> : <CloudTab onRestored={handleRestored} />}
    </>
  )
}

export default ProjectsDialog
