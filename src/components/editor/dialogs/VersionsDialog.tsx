'use client'

/**
 * Version history — named project snapshots.
 *
 * Two destinations (Day 43):
 *   • On this device — IndexedDB snapshots (local-first, unchanged behavior)
 *   • Cloud          — ordinal snapshots via /api/cloud/versions (newest 20
 *     kept per project; restore pulls the full JSON and reopens the project)
 *
 * Both flows share the 2-click confirm pattern for restore/delete.
 */
import { useCallback, useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Archive, CloudUpload, History, Loader2, RotateCcw, TriangleAlert, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useEditor } from '@/lib/editor/store'
import * as idb from '@/lib/editor/db'
import {
  cloudHealth,
  cloudListVersions,
  cloudLoadVersion,
  cloudDeleteVersion,
  type CloudVersionMeta,
} from '@/lib/cloud/client'
import { isCloudProjectPayload } from '@/lib/cloud/backup'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

type Destination = 'device' | 'cloud'
type ConfirmAction = { id: string; action: 'restore' | 'delete' }

function VersionMetaLine({ clips, duration, at }: { clips: number; duration?: number; at: string }) {
  return (
    <p className="text-[10px] text-muted-foreground">
      {clips} clips
      {typeof duration === 'number' && duration > 0 && ` · ${duration.toFixed(1)}s`} ·{' '}
      {formatDistanceToNow(new Date(at), { addSuffix: true })}
    </p>
  )
}

function ActionButtons({
  id,
  busy,
  confirm,
  onRestore,
  onDelete,
}: {
  id: string
  busy: boolean
  confirm: ConfirmAction | null
  onRestore: (id: string) => void
  onDelete: (id: string) => void
}) {
  const confirmingRestore = confirm?.id === id && confirm.action === 'restore'
  const confirmingDelete = confirm?.id === id && confirm.action === 'delete'
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        title={confirmingRestore ? 'Click again to confirm restore' : 'Restore this snapshot'}
        onClick={() => onRestore(id)}
        className={cn(
          'h-8 border px-2.5 text-xs',
          confirmingRestore
            ? 'border-amber-400/50 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200'
            : 'border-(--nc-line-strong) text-muted-foreground hover:border-fuchsia-400/50 hover:text-foreground'
        )}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
        {confirmingRestore ? 'Confirm' : 'Restore'}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title={confirmingDelete ? 'Click again to confirm delete' : 'Delete snapshot'}
        onClick={() => onDelete(id)}
        className={cn(
          'h-8 w-8 text-rose-400/80 hover:bg-rose-500/10 hover:text-rose-300',
          confirmingDelete && 'bg-rose-500/15 text-rose-300'
        )}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}

export function VersionsDialog() {
  const open = useEditor((s) => s.activeDialog === 'versions')
  const versions = useEditor((s) => s.versions)
  const versionsLoaded = useEditor((s) => s.versionsLoaded)
  const loadVersions = useEditor((s) => s.loadVersions)
  const saveVersion = useEditor((s) => s.saveVersion)
  const restoreVersion = useEditor((s) => s.restoreVersion)
  const deleteVersion = useEditor((s) => s.deleteVersion)
  const openDialog = useEditor((s) => s.openDialog)

  const [destination, setDestination] = useState<Destination>('device')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null)

  // cloud state
  const [cloudList, setCloudList] = useState<CloudVersionMeta[] | null>(null)
  const [cloudOk, setCloudOk] = useState<boolean | null>(null)
  const [cloudBusy, setCloudBusy] = useState(false)

  // load snapshots every time the dialog opens
  useEffect(() => {
    if (open) void loadVersions()
  }, [open, loadVersions])

  const refreshCloud = useCallback(async () => {
    setCloudList(null)
    try {
      const h = await cloudHealth()
      setCloudOk(h.ok)
      if (!h.ok) return
      const list = await cloudListVersions(useEditor.getState().project.id)
      setCloudList(list)
    } catch {
      setCloudOk(false)
    }
  }, [])

  useEffect(() => {
    if (open && destination === 'cloud') void refreshCloud()
  }, [open, destination, refreshCloud])

  // auto-clear the 2-click confirm state
  useEffect(() => {
    if (!confirm) return
    const t = setTimeout(() => setConfirm(null), 3200)
    return () => clearTimeout(t)
  }, [confirm])

  const handleSave = async () => {
    setSaving(true)
    try {
      const project = useEditor.getState().project
      if (destination === 'device') {
        await saveVersion(name.trim() || undefined)
        toast.success('Snapshot saved on this device')
      } else {
        if (cloudOk === false) throw new Error('Cloud unreachable')
        const res = await import('@/lib/cloud/client').then((m) =>
          m.cloudSaveVersion({
            localId: project.id,
            label: name.trim() || undefined,
            clipCount: project.clips.length,
            duration: Math.max(...project.clips.map((c) => c.start + c.duration), 0),
            data: JSON.stringify(project),
          }),
        )
        toast.success(`Snapshot v${res.version} saved to the cloud`)
        await refreshCloud()
      }
      setName('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the snapshot')
    } finally {
      setSaving(false)
    }
  }

  const handleRestoreDevice = async (id: string) => {
    if (confirm?.id !== id || confirm.action !== 'restore') {
      setConfirm({ id, action: 'restore' })
      return
    }
    setConfirm(null)
    setRestoringId(id)
    try {
      await restoreVersion(id)
      toast.success('Version restored — timeline replaced by the snapshot')
      openDialog(null)
    } catch {
      toast.error('Restore failed')
    } finally {
      setRestoringId(null)
    }
  }

  const handleRestoreCloud = async (id: string) => {
    if (confirm?.id !== id || confirm.action !== 'restore') {
      setConfirm({ id, action: 'restore' })
      return
    }
    setConfirm(null)
    setRestoringId(id)
    try {
      const localId = useEditor.getState().project.id
      const raw = await cloudLoadVersion(localId, id)
      const parsed: unknown = JSON.parse(raw)
      if (!isCloudProjectPayload(parsed)) throw new Error('The cloud snapshot is corrupted or from an older build')
      await idb.saveProject(parsed)
      await useEditor.getState().openProject(parsed.id)
      toast.success(`Restored "${parsed.name}" from the cloud version history`)
      openDialog(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Restore failed')
    } finally {
      setRestoringId(null)
    }
  }

  const handleDeleteDevice = async (id: string) => {
    if (confirm?.id !== id || confirm.action !== 'delete') {
      setConfirm({ id, action: 'delete' })
      return
    }
    setConfirm(null)
    try {
      await deleteVersion(id)
      toast.success('Snapshot deleted')
    } catch {
      toast.error('Delete failed')
    }
  }

  const handleDeleteCloud = async (id: string) => {
    if (confirm?.id !== id || confirm.action !== 'delete') {
      setConfirm({ id, action: 'delete' })
      return
    }
    setConfirm(null)
    setCloudBusy(true)
    try {
      await cloudDeleteVersion(useEditor.getState().project.id, id)
      toast.success('Cloud snapshot deleted')
      await refreshCloud()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setCloudBusy(false)
    }
  }

  const busy = destination === 'device' ? restoringId !== null : cloudBusy || restoringId !== null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && openDialog(null)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Archive className="h-4 w-4 text-fuchsia-400" />
            Version history
          </DialogTitle>
          <DialogDescription>
            Named snapshots of this project — keep them on this device or in the cloud.
          </DialogDescription>
        </DialogHeader>

        {/* destination toggle */}
        <div
          role="tablist"
          aria-label="Snapshot destination"
          className="grid grid-cols-2 gap-1.5 rounded-xl border border-(--nc-line) bg-(--nc-panel) p-1.5"
        >
          {(
            [
              { id: 'device', label: 'On this device' },
              { id: 'cloud', label: 'Cloud' },
            ] as const
          ).map((t) => {
            const active = destination === t.id
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setDestination(t.id)}
                className={cn(
                  'flex h-8 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold transition',
                  active
                    ? 'nc-gradient text-white shadow-[0_0_14px_var(--nc-accent-glow-soft)]'
                    : 'text-muted-foreground hover:bg-(--nc-panel-strong) hover:text-foreground'
                )}
              >
                {t.id === 'cloud' ? <CloudUpload className="size-3.5" /> : <Archive className="size-3.5" />}
                {t.label}
              </button>
            )
          })}
        </div>

        {/* save snapshot */}
        <div className="flex items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !saving) void handleSave()
            }}
            placeholder={`Snapshot name (saves to ${destination === 'device' ? 'this device' : 'the cloud'})`}
            aria-label="Snapshot name"
            className="h-9 flex-1 border-(--nc-line) bg-(--nc-panel) text-xs focus-visible:ring-fuchsia-400/50"
          />
          <Button
            variant="ghost"
            disabled={saving || (destination === 'cloud' && cloudOk === false)}
            onClick={() => void handleSave()}
            className="nc-gradient nc-glow-hover h-9 shrink-0 rounded-lg px-3 text-xs font-semibold text-white hover:opacity-90"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
            Save snapshot
          </Button>
        </div>

        {/* ================= device list ================= */}
        {destination === 'device' && (
          !versionsLoaded ? (
            <div className="space-y-2">
              <div className="h-14 animate-pulse rounded-xl bg-(--nc-panel)" />
              <div className="h-14 animate-pulse rounded-xl bg-(--nc-panel)" />
            </div>
          ) : versions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-(--nc-line-strong) p-5 text-center">
              <Archive className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-xs text-muted-foreground">
                No snapshots yet — save one before big changes.
              </p>
            </div>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-0.5">
              {versions.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center gap-3 rounded-xl border border-(--nc-line) bg-(--nc-panel-soft) p-3"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-(--nc-panel)">
                    <History className="h-4 w-4 text-fuchsia-300" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{v.name}</p>
                    <VersionMetaLine clips={v.project.clips.length} at={new Date(v.createdAt).toISOString()} />
                  </div>
                  <ActionButtons
                    id={v.id}
                    busy={busy}
                    confirm={confirm}
                    onRestore={(id) => void handleRestoreDevice(id)}
                    onDelete={(id) => void handleDeleteDevice(id)}
                  />
                </div>
              ))}
            </div>
          )
        )}

        {/* ================= cloud list ================= */}
        {destination === 'cloud' && (
          cloudOk === false ? (
            <p className="flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/5 p-2.5 text-[10px] leading-relaxed text-amber-200">
              <TriangleAlert className="size-3.5 shrink-0" />
              Cloud unreachable — cloud snapshots need TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.
            </p>
          ) : cloudList === null ? (
            <div className="space-y-2">
              <div className="h-14 animate-pulse rounded-xl bg-(--nc-panel)" />
              <div className="h-14 animate-pulse rounded-xl bg-(--nc-panel)" />
            </div>
          ) : cloudList.length === 0 ? (
            <div className="rounded-xl border border-dashed border-(--nc-line-strong) p-5 text-center">
              <CloudUpload className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-xs text-muted-foreground">
                No cloud snapshots yet — save one to start this project&apos;s history (newest 20 kept).
              </p>
            </div>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-0.5">
              {cloudList.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center gap-3 rounded-xl border border-(--nc-line) bg-(--nc-panel-soft) p-3"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-(--nc-panel) text-[10px] font-bold text-fuchsia-300">
                    v{v.version}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{v.label}</p>
                    <VersionMetaLine clips={v.clipCount} duration={v.duration} at={v.createdAt} />
                  </div>
                  <ActionButtons
                    id={v.id}
                    busy={busy}
                    confirm={confirm}
                    onRestore={(id) => void handleRestoreCloud(id)}
                    onDelete={(id) => void handleDeleteCloud(id)}
                  />
                </div>
              ))}
            </div>
          )
        )}

        <p className="text-[9.5px] leading-relaxed text-muted-foreground/70">
          {destination === 'cloud'
            ? 'Cloud snapshots store the full project structure (media stays in this browser unless uploaded via cloud backup). Newest 20 kept per project.'
            : 'Device snapshots live in this browser only — they never leave the device.'}
        </p>
      </DialogContent>
    </Dialog>
  )
}

export default VersionsDialog
