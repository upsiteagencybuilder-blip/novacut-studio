'use client'

import {
  Archive,
  CloudCheck,
  CloudOff,
  Download,
  FolderOpen,
  Keyboard,
  Loader2,
  MessageSquareHeart,
  Palette,
  Play,
  Redo2,
  SlidersVertical,
  Undo2,
} from 'lucide-react'
import { useEditor } from '@/lib/editor/store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConnectionPill, InstallApp, PWAUpdateToast } from '@/components/editor/pwa/PWAStatus'

function AutosaveIndicator() {
  const autosave = useEditor((s) => s.autosave)
  return (
    <div className="flex w-fit items-center gap-1 text-[10px] text-muted-foreground">
      {autosave === 'saving' && (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Saving…</span>
        </>
      )}
      {autosave === 'saved' && (
        <>
          <CloudCheck className="h-3 w-3 text-emerald-400" />
          <span>Saved</span>
        </>
      )}
      {autosave === 'error' && (
        <>
          <CloudOff className="h-3 w-3 text-rose-400" />
          <span>Retrying</span>
        </>
      )}
      {autosave === 'idle' && (
        <>
          <CloudCheck className="h-3 w-3" />
          <span>Ready</span>
        </>
      )}
    </div>
  )
}

export function TopBar() {
  const projectName = useEditor((s) => s.project.name)
  const pastCount = useEditor((s) => s.past.length)
  const futureCount = useEditor((s) => s.future.length)
  const setProjectName = useEditor((s) => s.setProjectName)
  const openDialog = useEditor((s) => s.openDialog)

  // Directly bound to the store: the store value always mirrors what was just typed,
  // so a controlled input never fights the cursor — and undo/redo renames just work.

  return (
    <header className="nc-glass-strong relative z-40 flex h-14 shrink-0 items-center gap-2 border-b border-(--nc-line) px-3">
      {/* logo */}
      <button
        type="button"
        onClick={() => openDialog('theme')}
        title="Theme Studio — change the whole look"
        aria-label="Open Theme Studio"
        className="nc-gradient nc-glow flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform hover:scale-105 active:scale-95"
      >
        <Play className="h-4 w-4 fill-white text-white" />
      </button>
      <div className="flex flex-col leading-none">
        <span className="text-sm font-bold">NovaCut</span>
        <span className="mt-0.5 flex items-center gap-1.5">
          <span className="nc-gradient-text text-[9px] tracking-[0.3em]">STUDIO</span>
          <Badge variant="outline" className="border-fuchsia-400/40 px-1 py-0 text-[8px] text-fuchsia-300">
            BETA
          </Badge>
        </span>
      </div>

      {/* project name + autosave + connection */}
      <div className="ml-3 flex flex-col gap-0.5">
        <Input
          value={projectName}
          aria-label="Project name"
          onChange={(e) => setProjectName(e.target.value)}
          className="h-8 w-44 border-(--nc-line) bg-(--nc-panel) text-xs focus-visible:ring-fuchsia-400/50"
        />
        <AutosaveIndicator />
      </div>
      <div className="ml-2 hidden md:flex">
        <ConnectionPill />
      </div>

      {/* undo / redo — centered */}
      <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 sm:flex">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
          disabled={pastCount === 0}
          onClick={() => useEditor.getState().undo()}
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
          disabled={futureCount === 0}
          onClick={() => useEditor.getState().redo()}
        >
          <Redo2 className="h-4 w-4" />
        </Button>
        <div className="mx-1 h-5 w-px bg-(--nc-panel-strong)" />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Version history"
          aria-label="Version history"
          onClick={() => openDialog('versions')}
        >
          <Archive className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Audio mixer"
          aria-label="Audio mixer"
          onClick={() => openDialog('mixer')}
        >
          <SlidersVertical className="h-4 w-4" />
        </Button>
      </div>

      {/* right actions */}
      <div className="ml-auto flex items-center gap-1.5">
        <InstallApp />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Projects"
          aria-label="Projects"
          onClick={() => openDialog('projects')}
        >
          <FolderOpen className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Theme Studio"
          aria-label="Open Theme Studio panel"
          onClick={() => openDialog('theme')}
        >
          <Palette className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Keyboard shortcuts"
          aria-label="Keyboard shortcuts"
          onClick={() => openDialog('shortcuts')}
        >
          <Keyboard className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Send feedback"
          aria-label="Send feedback"
          onClick={() => openDialog('feedback')}
        >
          <MessageSquareHeart className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="nc-gradient nc-glow-hover h-8 rounded-lg px-3.5 text-xs font-semibold text-white"
          onClick={() => {
            useEditor.getState().pause()
            openDialog('export')
          }}
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </Button>
      </div>
      <PWAUpdateToast />
    </header>
  )
}

export default TopBar
