'use client'

/**
 * NovaCut Studio — editor shell & layout orchestrator.
 * Desktop: 3-column studio layout + timeline.
 * Mobile: preview-first with bottom sheet panels.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Music,
  Settings2,
  WandSparkles,
  Type,
  SmilePlus,
  FolderOpen,
} from 'lucide-react'
import { useEditor } from '@/lib/editor/store'
import { projectDuration, clamp } from '@/lib/editor/utils'
import { TopBar } from '@/components/editor/TopBar'
import { LeftPanel } from '@/components/editor/panels/LeftPanel'
import { PreviewPane } from '@/components/editor/preview/PreviewPane'
import { PropertiesPanel } from '@/components/editor/preview/PropertiesPanel'
import { Timeline } from '@/components/editor/timeline/Timeline'
import { ExportDialog } from '@/components/editor/dialogs/ExportDialog'
import { ProjectsDialog } from '@/components/editor/dialogs/ProjectsDialog'
import { ShortcutsDialog } from '@/components/editor/dialogs/ShortcutsDialog'
import { MixerDialog } from '@/components/editor/dialogs/MixerDialog'
import { VersionsDialog } from '@/components/editor/dialogs/VersionsDialog'
import { ThemeStudioDialog } from '@/components/editor/dialogs/ThemeStudioDialog'
import { ThemeProvider } from '@/components/editor/theme/ThemeProvider'
import { OnboardingOverlay } from '@/components/editor/panels/OnboardingOverlay'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

function useDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(true)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return isDesktop
}

/* ---------------- keyboard shortcuts ---------------- */

function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useEditor.getState()
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
      ) {
        return
      }
      if (s.activeDialog) return

      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()

      if (mod && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
        return
      }
      if (mod && key === 'y') {
        e.preventDefault()
        s.redo()
        return
      }
      if (mod && key === 'e') {
        e.preventDefault()
        s.pause()
        s.openDialog('export')
        return
      }

      switch (e.key) {
        case ' ':
          e.preventDefault()
          s.togglePlay()
          break
        case 'ArrowLeft':
          e.preventDefault()
          if (e.shiftKey) s.setCurrentTime(s.currentTime - 1)
          else s.frameStep(-1)
          break
        case 'ArrowRight':
          e.preventDefault()
          if (e.shiftKey) s.setCurrentTime(s.currentTime + 1)
          else s.frameStep(1)
          break
        case 'Home':
          e.preventDefault()
          s.setCurrentTime(0)
          break
        case 'End':
          e.preventDefault()
          s.setCurrentTime(projectDuration(s.project))
          break
        case 's':
        case 'S': {
          const before = s.project.clips.length
          s.splitAtPlayhead()
          if (useEditor.getState().project.clips.length > before) toast.success('Clip split ✂️')
          break
        }
        case 'd':
        case 'D': {
          const id = s.selectedClipIds[0]
          if (id) s.duplicateClip(id)
          break
        }
        case 'Delete':
        case 'Backspace':
          e.preventDefault()
          s.deleteSelected()
          break
        case 'm':
        case 'M': {
          const clip = s.project.clips.find((c) => c.id === s.selectedClipIds[0])
          if (clip) s.updateClip(clip.id, { muted: !clip.muted }, true)
          break
        }
        case '+':
        case '=':
          s.setZoom(s.zoom * 1.25)
          break
        case '-':
        case '_':
          s.setZoom(s.zoom / 1.25)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/* ---------------- timeline resizer ---------------- */

function useTimelineHeight() {
  const [height, setHeight] = useState(292)
  const dragging = useRef<{ startY: number; startH: number } | null>(null)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = { startY: e.clientY, startH: 0 }
    setHeight((h) => {
      dragging.current = { startY: e.clientY, startH: h }
      return h
    })
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    const delta = dragging.current.startY - e.clientY
    setHeight(clamp(dragging.current.startH + delta, 150, 520))
  }, [])

  const onPointerUp = useCallback(() => {
    dragging.current = null
  }, [])

  return { height, onPointerDown, onPointerMove, onPointerUp }
}

/* ---------------- mobile bottom bar ---------------- */

const MOBILE_TABS = [
  { id: 'media', label: 'Media', icon: FolderOpen },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'stickers', label: 'Stickers', icon: SmilePlus },
  { id: 'effects', label: 'Effects', icon: WandSparkles },
  { id: 'audio', label: 'Audio', icon: Music },
] as const

function MobileBar({ onOpenPanel, onOpenProps, propsActive }: { onOpenPanel: () => void; onOpenProps: () => void; propsActive: boolean }) {
  const panelTab = useEditor((s) => s.panelTab)
  return (
    <nav className="flex h-14 shrink-0 items-center justify-around border-t border-(--nc-line) bg-(--nc-chrome) px-1 pb-[env(safe-area-inset-bottom)] lg:hidden">
      {MOBILE_TABS.map((tab) => {
        const Icon = tab.icon
        const active = propsActive === false && panelTab === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            onClick={onOpenPanel}
            className={`flex h-11 flex-col items-center justify-center gap-0.5 rounded-lg px-2 ${active ? 'text-white' : 'text-muted-foreground'}`}
          >
            <Icon className={`size-[18px] ${active ? 'text-fuchsia-400' : ''}`} />
            <span className="text-[8px] leading-none">{tab.label}</span>
          </button>
        )
      })}
      <button
        type="button"
        onClick={onOpenProps}
        className={`flex h-11 flex-col items-center justify-center gap-0.5 rounded-lg px-2 ${propsActive ? 'text-white' : 'text-muted-foreground'}`}
      >
        <Settings2 className={`size-[18px] ${propsActive ? 'text-fuchsia-400' : ''}`} />
        <span className="text-[8px] leading-none">Edit</span>
      </button>
    </nav>
  )
}

/* ================= shell ================= */

export function EditorShell() {
  const ready = useEditor((s) => s.ready)
  const init = useEditor((s) => s.init)
  const panelTab = useEditor((s) => s.panelTab)
  const isDesktop = useDesktop()
  const keyboard = useKeyboardShortcuts()
  const timeline = useTimelineHeight()
  const [mobileSheet, setMobileSheet] = useState<'tools' | 'props' | null>(null)
  void keyboard

  useEffect(() => {
    void init()
  }, [init])

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-(--nc-accent)/30 border-t-(--nc-accent-400)" />
      </div>
    )
  }

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* animated backdrop */}
      <div className="nc-aurora" aria-hidden />

      <ThemeProvider />

      <TopBar />

      {isDesktop ? (
        <>
          <main className="relative z-10 flex min-h-0 flex-1">
            <aside className="h-full w-[318px] shrink-0 border-r border-(--nc-line) bg-(--nc-panel-soft)">
              <LeftPanel />
            </aside>
            <section className="h-full min-w-0 flex-1">
              <PreviewPane />
            </section>
            <aside className="h-full w-[318px] shrink-0 border-l border-(--nc-line) bg-(--nc-panel-soft)">
              <PropertiesPanel />
            </aside>
          </main>
          {/* timeline resize handle */}
          <div
            role="separator"
            aria-orientation="horizontal"
            onPointerDown={timeline.onPointerDown}
            onPointerMove={timeline.onPointerMove}
            onPointerUp={timeline.onPointerUp}
            className="group relative z-20 flex h-2 shrink-0 cursor-row-resize items-center justify-center"
          >
            <div className="h-[3px] w-16 rounded-full bg-(--nc-line-strong) transition-colors group-hover:bg-(--nc-accent-glow)" />
          </div>
          <section className="relative z-10 shrink-0 border-t border-(--nc-line)" style={{ height: timeline.height }}>
            <Timeline />
          </section>
        </>
      ) : (
        <>
          <main className="relative z-10 flex min-h-0 flex-1 flex-col">
            <section className="min-h-0 flex-1">
              <PreviewPane />
            </section>
            <section className="h-[218px] shrink-0 border-t border-(--nc-line)">
              <Timeline />
            </section>
          </main>
          <MobileBar
            propsActive={mobileSheet === 'props'}
            onOpenPanel={() => setMobileSheet('tools')}
            onOpenProps={() => setMobileSheet('props')}
          />
          <Sheet open={mobileSheet === 'tools'} onOpenChange={(o) => !o && setMobileSheet(null)}>
            <SheetContent side="bottom" className="h-[78dvh] rounded-t-2xl border-(--nc-line) bg-(--nc-sheet) p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Editing tools</SheetTitle>
                <SheetDescription>Import media, add text, stickers and effects.</SheetDescription>
              </SheetHeader>
              <LeftPanel />
            </SheetContent>
          </Sheet>
          <Sheet open={mobileSheet === 'props'} onOpenChange={(o) => !o && setMobileSheet(null)}>
            <SheetContent side="bottom" className="h-[78dvh] rounded-t-2xl border-(--nc-line) bg-(--nc-sheet) p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Properties</SheetTitle>
                <SheetDescription>Edit the selected clip properties.</SheetDescription>
              </SheetHeader>
              <PropertiesPanel />
            </SheetContent>
          </Sheet>
        </>
      )}

      {/* global dialogs */}
      <ExportDialog />
      <ProjectsDialog />
      <ShortcutsDialog />
      <MixerDialog />
      <VersionsDialog />
      <ThemeStudioDialog />
      <OnboardingOverlay />
    </div>
  )
}

export default EditorShell
