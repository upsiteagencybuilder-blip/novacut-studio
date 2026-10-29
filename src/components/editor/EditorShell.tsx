'use client'

/**
 * NovaCut Studio — editor shell & layout orchestrator.
 * Desktop: 3-column studio layout + timeline.
 * Mobile: preview-first with bottom sheet panels.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Briefcase,
  Music,
  Settings2,
  WandSparkles,
  Type,
  SmilePlus,
  FolderOpen,
  Sparkles,
} from 'lucide-react'
import { useEditor } from '@/lib/editor/store'
import { projectDuration, clamp, formatTimecode } from '@/lib/editor/utils'
import { TopBar } from '@/components/editor/TopBar'
import { LeftPanel } from '@/components/editor/panels/LeftPanel'
import { PreviewPane } from '@/components/editor/preview/PreviewPane'
import { PropertiesPanel } from '@/components/editor/preview/PropertiesPanel'
import { Timeline } from '@/components/editor/timeline/Timeline'
import { ExportDialog } from '@/components/editor/dialogs/ExportDialog'
import { ProjectsDialog } from '@/components/editor/dialogs/ProjectsDialog'
import { SessionProvider } from 'next-auth/react'
import { ShortcutsDialog } from '@/components/editor/dialogs/ShortcutsDialog'
import { FeedbackDialog } from '@/components/editor/dialogs/FeedbackDialog'
import { AccountDialog } from '@/components/editor/dialogs/AccountDialog'
import { MixerDialog } from '@/components/editor/dialogs/MixerDialog'
import { VersionsDialog } from '@/components/editor/dialogs/VersionsDialog'
import { ThemeStudioDialog } from '@/components/editor/dialogs/ThemeStudioDialog'
import { ThemeProvider } from '@/components/editor/theme/ThemeProvider'
import { OnboardingOverlay } from '@/components/editor/panels/OnboardingOverlay'
import { startCloudAutosave } from '@/lib/cloud/autosave'
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
      if (mod && key === 's') {
        e.preventDefault()
        void s.saveNow()
        toast.success('Project saved')
        return
      }
      if (mod && key === 'e') {
        e.preventDefault()
        s.pause()
        s.openDialog('export')
        return
      }
      if (mod && key === 'c') {
        e.preventDefault()
        if (s.selectedClipIds.length) {
          s.copySelected()
          toast(`${s.selectedClipIds.length} clip${s.selectedClipIds.length > 1 ? 's' : ''} copied`)
        }
        return
      }
      if (mod && e.shiftKey && key === 'x') {
        // MUST be checked before plain Ctrl+X (cut) — Ctrl+Shift+X clears In & Out
        e.preventDefault()
        if (s.inPoint !== null || s.outPoint !== null) {
          s.clearInOut()
          toast('In & Out points cleared')
        }
        return
      }
      if (mod && key === 'x') {
        e.preventDefault()
        if (s.selectedClipIds.length) {
          s.cutSelected()
          toast('Clip cut to clipboard')
        }
        return
      }
      if (mod && e.altKey && key === 'v') {
        // paste attributes BEFORE plain Ctrl+V — applies look & motion to the selection
        e.preventDefault()
        if (!s.copiedAttributes) {
          toast('Copy FX from a clip first (Properties → Copy FX)')
          return
        }
        const n = s.pasteAttributes()
        if (n > 0) toast.success(`Attributes pasted onto ${n} clip${n > 1 ? 's' : ''}`)
        else toast('Select a clip to paste onto')
        return
      }
      if (mod && key === 'v') {
        e.preventDefault()
        if (s.hasClipboard) {
          const before = s.project.clips.length
          s.pasteAtPlayhead()
          const added = useEditor.getState().project.clips.length - before
          if (added > 0) toast.success(`${added} clip${added > 1 ? 's' : ''} pasted at playhead`)
        }
        return
      }
      if (mod && key === 'a') {
        e.preventDefault()
        s.selectAll()
        return
      }
      if (mod && key === 'k') {
        // Premiere-style split alias (S also splits)
        e.preventDefault()
        const before = s.project.clips.length
        s.splitAtPlayhead()
        if (useEditor.getState().project.clips.length > before) toast.success('Clip split ✂️')
        return
      }
      if (mod && key === 'd') {
        // Premiere-style duplicate alias (D also duplicates) — batch-aware
        e.preventDefault()
        if (s.selectedClipIds.length > 1) {
          const n = s.selectedClipIds.length
          s.duplicateSelected()
          toast.success(`${n} clips duplicated`)
        } else {
          const id = s.selectedClipIds[0]
          if (id) s.duplicateClip(id)
        }
        return
      }
      if (mod && e.shiftKey && key === 'g') {
        // MUST be checked before plain Ctrl+G (group) — Ctrl+Shift+G ungroups
        e.preventDefault()
        const open = s.project.clips.find((c) => c.kind === 'nested' && c.nested?.open)
        if (open) {
          const n = open.nested?.memberIds?.length ?? 0
          if (s.exitNestedSession()) toast.success(`Compound saved — ${n} clip${n === 1 ? '' : 's'} packed inside`)
          return
        }
        if (s.ungroupSelectedClip()) toast.success('Compound dissolved back to clips')
        else toast('Select a single compound clip to ungroup')
        return
      }
      if (mod && key === 'g') {
        e.preventDefault()
        if (s.selectedClipIds.length > 1) {
          const n = s.selectedClipIds.length
          if (s.groupSelectedClips()) toast.success(`Grouped ${n} clips into a compound`)
          else toast('Compounds cannot nest — select plain clips only')
        }
        return
      }
      // any other Ctrl/Cmd combination must never fall through to the
      // single-letter shortcuts below (Ctrl+S used to split the clip!)
      if (mod) return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          s.togglePlay()
          break
        case 'ArrowLeft':
          e.preventDefault()
          if (e.altKey) s.nudgeSelected(-(e.shiftKey ? 1 : 1 / Math.max(1, s.project.fps)))
          else if (e.shiftKey) s.setCurrentTime(s.currentTime - 1)
          else s.frameStep(-1)
          break
        case 'ArrowRight':
          e.preventDefault()
          if (e.altKey) s.nudgeSelected(e.shiftKey ? 1 : 1 / Math.max(1, s.project.fps))
          else if (e.shiftKey) s.setCurrentTime(s.currentTime + 1)
          else s.frameStep(1)
          break
        case 'ArrowUp':
          e.preventDefault()
          if (s.jumpEdit(-1)) toast(`Edit point ${formatTimecode(s.currentTime, s.project.fps)}`, { duration: 1200 })
          break
        case 'ArrowDown':
          e.preventDefault()
          if (s.jumpEdit(1)) toast(`Edit point ${formatTimecode(useEditor.getState().currentTime, s.project.fps)}`, { duration: 1200 })
          break
        case 'Home':
          e.preventDefault()
          s.setCurrentTime(0)
          break
        case 'End':
          e.preventDefault()
          s.setCurrentTime(projectDuration(s.project))
          break
        case 'j':
        case 'J':
          s.jklAction('j')
          break
        case 'k':
        case 'K':
          s.jklAction('k')
          break
        case 'l':
        case 'L':
          s.jklAction('l')
          break
        case 'i':
        case 'I':
          if (e.shiftKey) {
            // go to In point
            if (s.inPoint !== null) s.setCurrentTime(s.inPoint)
          } else {
            s.markIn()
            toast(`In ${formatTimecode(useEditor.getState().inPoint ?? 0, s.project.fps)}`, { duration: 1200 })
          }
          break
        case 'o':
        case 'O':
          if (e.shiftKey) {
            if (s.outPoint !== null) s.setCurrentTime(s.outPoint)
          } else {
            s.markOut()
            toast(`Out ${formatTimecode(useEditor.getState().outPoint ?? 0, s.project.fps)}`, { duration: 1200 })
          }
          break
        case 'b':
        case 'B':
          s.setToolMode(s.toolMode === 'razor' ? 'select' : 'razor')
          toast(s.toolMode === 'razor' ? 'Blade tool — click a clip to cut it' : 'Select tool', { duration: 1400 })
          break
        case 'v':
        case 'V':
          s.setToolMode('select')
          break
        case 'g':
        case 'G':
          s.setToolMode('ripple')
          toast('Ripple edit — drags close the gap', { duration: 1400 })
          break
        case 'n':
        case 'N':
          s.setToolMode('roll')
          toast('Roll edit — drag the cut between adjacent clips', { duration: 1400 })
          break
        case 'y':
        case 'Y':
          s.setToolMode('slip')
          toast('Slip — drag a clip body to slide its media window', { duration: 1400 })
          break
        case 'u':
        case 'U':
          s.setToolMode('slide')
          toast('Slide — neighbors absorb the move', { duration: 1400 })
          break
        case 'q':
        case 'Q': {
          const ok = s.rippleTrimEndToPlayhead()
          toast[ok ? 'success' : 'info'](ok ? 'Trimmed to playhead — gap closed (Q)' : 'No clip under the playhead', { duration: 1600 })
          break
        }
        case 'w':
        case 'W': {
          const ok = s.rippleTrimStartToPlayhead()
          toast[ok ? 'success' : 'info'](ok ? 'Head trimmed / pulled to playhead (W)' : 'Nothing to trim here', { duration: 1600 })
          break
        }
        case "'": {
          // Premiere: apostrophe = Lift (remove range, keep gap)
          const ok = s.liftInOut()
          toast[ok ? 'success' : 'info'](ok ? 'Range lifted — gap kept' : 'Mark In (I) and Out (O) first', { duration: 1800 })
          break
        }
        case ';': {
          // Premiere: semicolon = Extract (remove range, ripple closed)
          const ok = s.extractInOut()
          toast[ok ? 'success' : 'info'](ok ? 'Range extracted — gap closed' : 'Mark In (I) and Out (O) first', { duration: 1800 })
          break
        }
        case 'z':
        case 'Z':
          if (e.shiftKey) {
            e.preventDefault()
            s.zoomFit()
          }
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
          if (s.selectedClipIds.length > 1) {
            const n = s.selectedClipIds.length
            s.duplicateSelected()
            toast.success(`${n} clips duplicated`)
          } else {
            const id = s.selectedClipIds[0]
            if (id) s.duplicateClip(id)
          }
          break
        }
        case 'Escape':
          if (s.selectedClipIds.length) {
            s.selectClip(null)
            toast('Selection cleared', { duration: 900 })
          }
          break
        case 'Delete':
        case 'Backspace':
          e.preventDefault()
          if (e.shiftKey) {
            s.rippleDeleteSelected()
            toast('Clips removed — gap closed (ripple delete)')
          } else {
            s.deleteSelected()
          }
          break
        case 'Escape':
          if (s.toolMode === 'razor') {
            s.setToolMode('select')
            break
          }
          if (s.selectedClipIds.length) s.selectClip(null)
          break
        case 'm':
        case 'M': {
          if (e.shiftKey) {
            if (s.addMarkerAtPlayhead()) toast.success('Marker added at playhead')
          } else {
            const clip = s.project.clips.find((c) => c.id === s.selectedClipIds[0])
            if (clip) s.updateClip(clip.id, { muted: !clip.muted }, true)
          }
          break
        }
        case '[':
          e.preventDefault()
          if (s.jumpMarker(-1)) toast(`Marker ${formatTimecode(s.currentTime, s.project.fps)}`, { duration: 1100 })
          else toast('No previous marker', { duration: 900 })
          break
        case ']':
          e.preventDefault()
          if (s.jumpMarker(1)) toast(`Marker ${formatTimecode(s.currentTime, s.project.fps)}`, { duration: 1100 })
          else toast('No next marker', { duration: 900 })
          break
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
  const [viewportH, setViewportH] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight : 900,
  )
  const dragging = useRef<{ startY: number; startH: number } | null>(null)

  // keep the upper studio row (rail needs ~312px) from being covered by the
  // timeline on short viewports — shrink the timeline instead.
  useEffect(() => {
    const onResize = () => setViewportH(window.innerHeight)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

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

  // top bar (56) + resizer (8) + minimum upper-row height for the tool rail (312)
  const maxFittingHeight = Math.max(150, viewportH - 56 - 8 - 312)
  const effectiveHeight = Math.min(height, maxFittingHeight)

  return { height: effectiveHeight, onPointerDown, onPointerMove, onPointerUp }
}

/* ---------------- mobile bottom bar ---------------- */

const MOBILE_TABS = [
  { id: 'media', label: 'Media', icon: FolderOpen },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'stickers', label: 'Stickers', icon: SmilePlus },
  { id: 'effects', label: 'Effects', icon: WandSparkles },
  { id: 'audio', label: 'Audio', icon: Music },
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'pro', label: 'Pro', icon: Briefcase },
] as const

function MobileBar({ onOpenPanel, onOpenProps, propsActive }: { onOpenPanel: () => void; onOpenProps: () => void; propsActive: boolean }) {
  const panelTab = useEditor((s) => s.panelTab)
  return (
    <nav className="flex h-14 shrink-0 items-stretch justify-around border-t border-(--nc-line) bg-(--nc-chrome) px-0.5 pb-[env(safe-area-inset-bottom)] lg:hidden">
      {MOBILE_TABS.map((tab) => {
        const Icon = tab.icon
        const active = propsActive === false && panelTab === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            aria-pressed={active}
            onClick={() => {
              // switch the tool panel to this tab, then open the tools sheet
              useEditor.getState().setPanelTab(tab.id)
              onOpenPanel()
            }}
            className={`flex h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 ${active ? 'text-white' : 'text-muted-foreground'}`}
          >
            <Icon className={`size-[18px] ${active ? 'text-fuchsia-400' : ''}`} />
            <span className="max-w-full truncate text-[8px] leading-none">{tab.label}</span>
          </button>
        )
      })}
      <button
        type="button"
        onClick={onOpenProps}
        className={`flex h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 ${propsActive ? 'text-white' : 'text-muted-foreground'}`}
      >
        <Settings2 className={`size-[18px] ${propsActive ? 'text-fuchsia-400' : ''}`} />
        <span className="max-w-full truncate text-[8px] leading-none">Edit</span>
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

  // Day 44 — cloud auto-save engine (self-gating: only fires when the user
  // enabled it; the editor stays local-first regardless)
  useEffect(() => {
    startCloudAutosave()
  }, [])

  // manifest app-shortcut: /?action=export opens the export dialog once ready
  useEffect(() => {
    if (!ready) return
    if (new URLSearchParams(window.location.search).get('action') === 'export') {
      useEditor.getState().openDialog('export')
    }
  }, [ready])

  // properties section deep-links (Pro Toolkit color tools): on mobile the
  // props sheet must open first — re-dispatch while the request is still
  // unconsumed (sections consume the flag on mount). Bounded retries keep
  // this a loop-free handoff when no matching section exists (no selection).
  useEffect(() => {
    if (isDesktop) return
    const onSection = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail
      if (!detail) return
      setMobileSheet('props')
      window.setTimeout(() => {
        const w = window as unknown as { __ncPropsSectionRequest?: string; __ncPropsSectionTries?: number }
        if (w.__ncPropsSectionRequest === detail && (w.__ncPropsSectionTries ?? 0) < 2) {
          w.__ncPropsSectionTries = (w.__ncPropsSectionTries ?? 0) + 1
          window.dispatchEvent(new CustomEvent('nc-props-section', { detail }))
        }
      }, 200)
    }
    window.addEventListener('nc-props-section', onSection)
    return () => window.removeEventListener('nc-props-section', onSection)
  }, [isDesktop])

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-(--nc-accent)/30 border-t-(--nc-accent-400)" />
      </div>
    )
  }

  return (
    <SessionProvider>
      <div className="relative flex h-screen flex-col overflow-hidden bg-background text-foreground">
        {/* animated backdrop */}
        <div className="nc-aurora" aria-hidden />

        <ThemeProvider />

        <TopBar />

      {isDesktop ? (
        <>
          <main className="relative z-10 flex min-h-0 flex-1">
            <aside className="h-full w-[318px] shrink-0 overflow-hidden border-r border-(--nc-line) bg-(--nc-panel-soft)">
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
      <FeedbackDialog />
      <AccountDialog />
      <MixerDialog />
      <VersionsDialog />
      <ThemeStudioDialog />
      <OnboardingOverlay />
      </div>
    </SessionProvider>
  )
}

export default EditorShell
