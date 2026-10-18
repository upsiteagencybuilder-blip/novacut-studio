'use client'

import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { FilePlus2, Film, FolderOpen, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useEditor } from '@/lib/editor/store'
import * as db from '@/lib/editor/db'
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

function byUpdatedAtDesc(a: Project, b: Project): number {
  return b.updatedAt - a.updatedAt
}

export function ProjectsDialog() {
  const open = useEditor((s) => s.activeDialog === 'projects')
  const currentId = useEditor((s) => s.project.id)
  const openDialog = useEditor((s) => s.openDialog)
  const newProject = useEditor((s) => s.newProject)
  const openProject = useEditor((s) => s.openProject)

  const [list, setList] = useState<Project[] | null>(null)
  const [, setLoading] = useState(false)

  // load projects every time the dialog opens
  useEffect(() => {
    if (!open) return
    let alive = true
    const load = async () => {
      try {
        const projects = await db.listProjects()
        if (alive) setList(projects.sort(byUpdatedAtDesc))
      } catch {
        /* ignore */
      } finally {
        if (alive) setLoading(false)
      }
    }
    void load()
    return () => {
      alive = false
    }
  }, [open])

  const refreshList = async () => {
    const projects = await db.listProjects()
    setList(projects.sort(byUpdatedAtDesc))
  }

  const handleNew = () => {
    newProject()
    toast.success('New project created')
    openDialog(null)
  }

  const handleOpen = async (id: string) => {
    await openProject(id)
    toast.success('Project opened')
    openDialog(null)
  }

  const handleDelete = async (id: string) => {
    await db.deleteProject(id)
    if (id === currentId) newProject()
    await refreshList()
    toast.success('Project deleted')
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          openDialog(null)
          setList(null)
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FolderOpen className="h-4 w-4 text-fuchsia-400" />
            Your projects
          </DialogTitle>
          <DialogDescription>Everything is stored locally in your browser (IndexedDB).</DialogDescription>
        </DialogHeader>

        <Button
          variant="ghost"
          className="nc-gradient nc-glow-hover h-10 w-full rounded-xl font-semibold text-white hover:opacity-90"
          onClick={handleNew}
        >
          <FilePlus2 className="h-4 w-4" />
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
                  <Film className={cn('h-4 w-4 shrink-0', current ? 'text-fuchsia-300' : 'text-muted-foreground')} />
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
                            className="h-8 w-8 text-rose-400/80 hover:bg-rose-500/10 hover:text-rose-300"
                            title="Delete project"
                          >
                            <Trash2 className="h-4 w-4" />
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
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default ProjectsDialog
