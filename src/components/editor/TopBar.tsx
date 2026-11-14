'use client'

import {
  AlignJustify,
  Archive,
  CloudCheck,
  CloudOff,
  Download,
  FolderOpen,
  History,
  Keyboard,
  Languages,
  Loader2,
  MessageSquareHeart,
  Palette,
  Play,
  Redo2,
  SlidersVertical,
  Undo2,
  UserRound,
  Wand2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useEditor } from '@/lib/editor/store'
import { useLocale, useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { ConnectionPill, InstallApp, OfflineReadinessBadge, PWAUpdateToast } from '@/components/editor/pwa/PWAStatus'

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
  const locale = useLocale()
  const tLang = useTranslations('topbar')
  const projectName = useEditor((s) => s.project.name)
  const pastCount = useEditor((s) => s.past.length)
  const futureCount = useEditor((s) => s.future.length)
  const setProjectName = useEditor((s) => s.setProjectName)
  const openDialog = useEditor((s) => s.openDialog)
  // UX60 Phase 4 (Days 25-32) — progressive disclosure controls
  const simpleMode = useEditor((s) => s.simpleMode)
  const panelDensity = useEditor((s) => s.panelDensity)
  const flipSimple = (next: boolean) => {
    useEditor.getState().setSimpleMode(next)
    toast.success(next ? 'Simple mode — you see less, you lose nothing. This switch brings everything back.' : 'Expert mode — every pro control is back.')
  }

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
      <div className="flex flex-col leading-none max-sm:hidden">
        <span className="text-sm font-bold">NovaCut</span>
        <span className="mt-0.5 flex items-center gap-1.5 max-sm:hidden">
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
          className="h-8 w-20 border-(--nc-line) bg-(--nc-panel) text-xs focus-visible:ring-fuchsia-400/50 sm:w-44"
        />
        <AutosaveIndicator />
      </div>
      <div className="ml-2 hidden md:flex">
        <OfflineReadinessBadge />
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
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title={tLang('language')}
          aria-label={tLang('language')}
          data-nc-lang-btn
          onClick={() => {
            const next = locale === 'bn' ? 'en' : 'bn'
            document.cookie = `novacut.locale=${next}; path=/; max-age=31536000; samesite=lax`
            toast.success(tLang('languageSwitched'))
            setTimeout(() => window.location.reload(), 700)
          }}
        >
          <Languages className="h-4 w-4" />
          <span className="sr-only">{tLang('language')}</span>
        </Button>
        <div className="mx-1 h-5 w-px bg-(--nc-panel-strong)" />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Edit history (undo/redo stack)"
          aria-label="Edit history"
          data-nc-history-btn
          onClick={() => openDialog('history')}
        >
          <History className="h-4 w-4" />
        </Button>
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
      <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
        <div className="max-sm:hidden">
          <InstallApp />
        </div>
        {/* UX60 Phase 4 — Simple mode: the one switch (Days 25-26) */}
        <Button
          variant="ghost"
          size="sm"
          className={`h-8 gap-1 rounded-lg px-2 text-xs font-semibold ${simpleMode ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25' : 'text-muted-foreground hover:text-foreground'}`}
          title="Simple mode — hides pro-only controls (curves, wheels, LUTs, keyframes…). One switch brings them back."
          aria-label="Toggle Simple mode"
          aria-pressed={simpleMode}
          data-nc-simple-toggle
          onClick={() => flipSimple(!simpleMode)}
        >
          <Wand2 className="h-3.5 w-3.5" />
          <span>Simple</span>
        </Button>
        {/* UX60 Phase 4 — panel density (Days 31-32), persisted per device;
            desktop header control — mobile toggles via the Pro-wall card */}
        <div className="max-sm:hidden">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${panelDensity === 'compact' ? 'bg-amber-500/15 text-amber-300' : 'text-muted-foreground hover:text-foreground'}`}
              title="Display: panel density + Simple mode"
              aria-label="Display settings"
              data-nc-density-btn
            >
              <AlignJustify className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-60 p-2">
            <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Display
            </p>
            <div className="px-2 pb-2" data-nc-density-controls>
              <p className="pb-1 text-[11px] font-medium text-foreground/85">Panel density</p>
              <div className="flex gap-1">
                <button
                  type="button"
                  aria-pressed={panelDensity === 'comfortable'}
                  data-nc-density-comfortable
                  onClick={() => useEditor.getState().setPanelDensity('comfortable')}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors ${panelDensity === 'comfortable' ? 'border-emerald-400/70 bg-emerald-400/10 text-foreground' : 'border-(--nc-line) bg-(--nc-panel) text-muted-foreground hover:text-foreground'}`}
                >
                  Comfortable
                </button>
                <button
                  type="button"
                  aria-pressed={panelDensity === 'compact'}
                  data-nc-density-compact
                  onClick={() => useEditor.getState().setPanelDensity('compact')}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors ${panelDensity === 'compact' ? 'border-amber-400/70 bg-amber-400/10 text-foreground' : 'border-(--nc-line) bg-(--nc-panel) text-muted-foreground hover:text-foreground'}`}
                >
                  Compact
                </button>
              </div>
              <p className="pt-1.5 text-[9px] leading-snug text-muted-foreground/70">
                Compact tightens panel paddings — controls keep their touch size. Remembered per device.
              </p>
            </div>
            <div className="flex items-center gap-2 border-t border-(--nc-line) px-2 pt-2">
              <span className="flex-1 text-[11px] font-medium text-foreground/85">Simple mode</span>
              <Switch
                checked={simpleMode}
                onCheckedChange={flipSimple}
                aria-label="Simple mode"
                data-nc-simple-switch
              />
            </div>
          </PopoverContent>
        </Popover>
        </div>
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
          className="h-8 w-8 text-muted-foreground hover:text-foreground max-sm:hidden"
          title="Theme Studio"
          aria-label="Open Theme Studio panel"
          onClick={() => openDialog('theme')}
        >
          <Palette className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground max-sm:hidden"
          title="Keyboard shortcuts"
          aria-label="Keyboard shortcuts"
          onClick={() => openDialog('shortcuts')}
        >
          <Keyboard className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground max-sm:hidden"
          title="Send feedback"
          aria-label="Send feedback"
          onClick={() => openDialog('feedback')}
        >
          <MessageSquareHeart className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground max-sm:hidden"
          title="Account (optional sign-in)"
          aria-label="Account (optional sign-in)"
          onClick={() => openDialog('account')}
        >
          <UserRound className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          data-nc-tour="export"
          data-nc-guided="export"
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
