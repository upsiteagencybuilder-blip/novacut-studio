'use client'

/**
 * Version history — save named snapshots of the project to IndexedDB,
 * restore them (2-click confirm) or delete them.
 */
import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Archive, History, Loader2, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useEditor } from '@/lib/editor/store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

type ConfirmAction = { id: string; action: 'restore' | 'delete' }

export function VersionsDialog() {
  const open = useEditor((s) => s.activeDialog === 'versions')
  const versions = useEditor((s) => s.versions)
  const versionsLoaded = useEditor((s) => s.versionsLoaded)
  const loadVersions = useEditor((s) => s.loadVersions)
  const saveVersion = useEditor((s) => s.saveVersion)
  const restoreVersion = useEditor((s) => s.restoreVersion)
  const deleteVersion = useEditor((s) => s.deleteVersion)
  const openDialog = useEditor((s) => s.openDialog)

  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null)

  // load snapshots every time the dialog opens
  useEffect(() => {
    if (open) void loadVersions()
  }, [open, loadVersions])

  // auto-clear the 2-click confirm state
  useEffect(() => {
    if (!confirm) return
    const t = setTimeout(() => setConfirm(null), 3200)
    return () => clearTimeout(t)
  }, [confirm])

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveVersion(name.trim() || undefined)
      setName('')
      toast.success('Snapshot saved')
    } catch {
      toast.error('Could not save the snapshot')
    } finally {
      setSaving(false)
    }
  }

  const handleRestore = async (id: string) => {
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

  const handleDelete = async (id: string) => {
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

  return (
    <Dialog open={open} onOpenChange={(o) => !o && openDialog(null)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Archive className="h-4 w-4 text-fuchsia-400" />
            Version history
          </DialogTitle>
          <DialogDescription>
            Snapshots are stored locally for this project — restore one anytime.
          </DialogDescription>
        </DialogHeader>

        {/* save snapshot */}
        <div className="flex items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !saving) void handleSave()
            }}
            placeholder="Snapshot name (optional)"
            aria-label="Snapshot name"
            className="h-9 flex-1 border-(--nc-line) bg-(--nc-panel) text-xs focus-visible:ring-fuchsia-400/50"
          />
          <Button
            variant="ghost"
            disabled={saving}
            onClick={() => void handleSave()}
            className="nc-gradient nc-glow-hover h-9 shrink-0 rounded-lg px-3 text-xs font-semibold text-white hover:opacity-90"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
            Save snapshot
          </Button>
        </div>

        {/* list */}
        {!versionsLoaded ? (
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
            {versions.map((v) => {
              const confirmingRestore = confirm?.id === v.id && confirm.action === 'restore'
              const confirmingDelete = confirm?.id === v.id && confirm.action === 'delete'
              return (
                <div
                  key={v.id}
                  className="flex items-center gap-3 rounded-xl border border-(--nc-line) bg-(--nc-panel-soft) p-3"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-(--nc-panel)">
                    <History className="h-4 w-4 text-fuchsia-300" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{v.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {v.project.clips.length} clips ·{' '}
                      {formatDistanceToNow(new Date(v.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={restoringId === v.id}
                      title={confirmingRestore ? 'Click again to confirm restore' : 'Restore this snapshot'}
                      onClick={() => void handleRestore(v.id)}
                      className={cn(
                        'h-8 border px-2.5 text-xs',
                        confirmingRestore
                          ? 'border-amber-400/50 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200'
                          : 'border-(--nc-line-strong) text-muted-foreground hover:border-fuchsia-400/50 hover:text-foreground'
                      )}
                    >
                      {restoringId === v.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      {confirmingRestore ? 'Confirm' : 'Restore'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={confirmingDelete ? 'Click again to confirm delete' : 'Delete snapshot'}
                      onClick={() => void handleDelete(v.id)}
                      className={cn(
                        'h-8 w-8 text-rose-400/80 hover:bg-rose-500/10 hover:text-rose-300',
                        confirmingDelete && 'bg-rose-500/15 text-rose-300'
                      )}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default VersionsDialog
