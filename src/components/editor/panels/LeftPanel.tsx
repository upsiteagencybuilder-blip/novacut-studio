'use client'

/**
 * Left tool panel — icon rail (Media / Text / Stickers / Effects / Audio)
 * plus the switchable content area. State lives in the editor store.
 */
import {
  Briefcase,
  CircleHelp,
  FolderOpen,
  Music,
  SmilePlus,
  Sparkles,
  Type,
  WandSparkles,
} from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useEditor } from '@/lib/editor/store'
import type { PanelTab } from '@/lib/editor/types'
import { rovingGridKeydown } from '@/lib/editor/roving'
import { useLabel } from '@/lib/i18n/labels'
import { MediaPanel } from './MediaPanel'
// UX60 Phase 7 (Days 49–50) — panels lazy-mount on their FIRST open, not at
// startup. MediaPanel stays static (default tab, quickstart checklist).
// Once visited a panel STAYS mounted (hidden with [hidden]) so re-switching
// is instant and panel state (scroll, filters, drafts) survives — the
// deactivation side-effects panels used to run on unmount moved to an
// `active` prop contract (EffectsPanel previews, SoundBrowser preview,
// AudioPanel voiceover recording).
const TextPanel = lazy(() => import('./TextPanel').then((m) => ({ default: m.TextPanel })))
const StickerPanel = lazy(() => import('./StickerPanel').then((m) => ({ default: m.StickerPanel })))
const EffectsPanel = lazy(() => import('./EffectsPanel').then((m) => ({ default: m.EffectsPanel })))
const AudioPanel = lazy(() => import('./AudioPanel').then((m) => ({ default: m.AudioPanel })))
const AIPanel = lazy(() => import('./AIPanel').then((m) => ({ default: m.AIPanel })))
const ProToolkitPanel = lazy(() => import('./ProToolkitPanel').then((m) => ({ default: m.ProToolkitPanel })))
import { PanelSkeleton, PanelGridSkeleton } from './PanelSkeleton'

/**
 * UX60 Phase 6 (Days 41–43) — the canonical panel order. Alt+1..Alt+9 in
 * the global keydown layer jumps straight to these tabs; the rail exposes
 * the same order with arrow-key roving.
 */
export const PANEL_TAB_ORDER: PanelTab[] = [
  'media',
  'text',
  'stickers',
  'effects',
  'audio',
  'ai',
  'pro',
]

interface TabDef {
  id: PanelTab
  label: string
  icon: LucideIcon
}

const TABS: TabDef[] = [
  { id: 'media', label: 'Media', icon: FolderOpen },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'stickers', label: 'Stickers', icon: SmilePlus },
  { id: 'effects', label: 'Effects', icon: WandSparkles },
  { id: 'audio', label: 'Audio', icon: Music },
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'pro', label: 'Pro', icon: Briefcase },
]

const PANEL_TITLES: Record<PanelTab, string> = {
  media: 'Media library',
  text: 'Text & titles',
  stickers: 'Stickers',
  effects: 'Effects',
  audio: 'Audio',
  ai: 'AI magic',
  pro: 'Pro toolkit',
}

const PANEL_POSITION: Record<PanelTab, number> = {
  media: 1,
  text: 2,
  stickers: 3,
  effects: 4,
  audio: 5,
  ai: 6,
  pro: 7,
}

/**
 * UX60 Phase 7 (Days 49–52) — mount-on-first-open keep-alive wrapper.
 * First activation renders the children behind a Suspense skeleton while the
 * lazy chunk evaluates; afterwards the panel stays mounted and is simply
 * hidden when inactive (instant re-switching, preserved panel state).
 */
function KeepAlive({ active, skeleton, children }: { active: boolean; skeleton: ReactNode; children: ReactNode }) {
  const [visited, setVisited] = useState(active)
  // mark-during-render (React's sanctioned derived-state adjustment): the
  // first activation permanently marks this panel visited — no effect needed.
  if (active && !visited) {
    setVisited(true)
  }
  return (
    <div hidden={!active} className="h-full" data-nc-keep-alive={visited ? '' : undefined}>
      {visited ? (
        <Suspense fallback={skeleton}>{children}</Suspense>
      ) : null}
    </div>
  )
}

export function LeftPanel() {
  const panelTab = useEditor((s) => s.panelTab)
  const setPanelTab = useEditor((s) => s.setPanelTab)
  const openDialog = useEditor((s) => s.openDialog)
  const mediaCount = useEditor((s) => s.media.length)
  const simpleMode = useEditor((s) => s.simpleMode)
  const panelDensity = useEditor((s) => s.panelDensity)
  const l = useLabel()

  // UX60 Phase 4 (Days 27-28) — Simple mode declutters the rail: the Pro
  // toolkit wall is a pro-only surface. Expert layout unchanged.
  const visibleTabs = simpleMode ? TABS.filter((t) => t.id !== 'pro') : TABS

  return (
    <div className="flex h-full min-h-0">
      {/* ------- icon rail — UX60 Phase 6: aria-labelled + arrow-key roving ------- */}
      <nav
        className="flex w-14 shrink-0 flex-col items-center gap-1.5 overflow-x-hidden overflow-y-auto border-r border-(--nc-line) py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label={l('Tool panels — arrows move, Alt+1–9 jumps')}
        data-nc-rail
        onKeyDown={rovingGridKeydown}
      >
        {visibleTabs.map((tab) => {
          const Icon = tab.icon
          const active = panelTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              title={`${l(tab.label)} ${l('panel')} — Alt+${PANEL_POSITION[tab.id]}`}
              aria-pressed={active}
              aria-label={`${l(tab.label)} ${l('panel')} — Alt+${PANEL_POSITION[tab.id]}`}
              data-nc-guided={`panel-${tab.id}`}
              data-nc-item
              onClick={() => setPanelTab(tab.id)}
              className={
                active
                  ? 'nc-gradient nc-glow flex h-11 w-11 flex-col items-center justify-center gap-[3px] rounded-xl text-white shadow-lg transition-transform hover:scale-[1.04]'
                  : 'flex h-11 w-11 flex-col items-center justify-center gap-[3px] rounded-xl text-muted-foreground transition hover:bg-(--nc-panel) hover:text-foreground'
              }
            >
              <Icon className="size-[18px]" />
              <span className="text-[8px] font-medium leading-none">{l(tab.label)}</span>
            </button>
          )
        })}

        <div className="mt-auto">
          <button
            type="button"
            title={l('Keyboard shortcuts')}
            aria-label={l('Keyboard shortcuts')}
            onClick={() => openDialog('shortcuts')}
            className="flex h-11 w-11 flex-col items-center justify-center gap-[3px] rounded-xl text-muted-foreground transition hover:bg-(--nc-panel) hover:text-foreground"
          >
            <CircleHelp className="size-[18px]" />
            <span className="text-[8px] font-medium leading-none">{l('Help')}</span>
          </button>
        </div>
      </nav>

      {/* ------- content area ------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-11 shrink-0 items-center justify-between border-b border-(--nc-line) px-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {l(PANEL_TITLES[panelTab])}
          </span>
          {panelTab === 'media' && mediaCount > 0 && (
            <Badge
              variant="secondary"
              className="rounded-full border-0 bg-(--nc-panel-strong) px-1.5 text-[9px] text-muted-foreground"
            >
              {mediaCount}
            </Badge>
          )}
        </header>

        <div
          className={`min-h-0 flex-1 overflow-y-auto p-3 ${panelDensity === 'compact' ? 'nc-density-compact' : ''}`}
          data-nc-panel-body
        >
          <KeepAlive active={panelTab === 'media'} skeleton={<PanelGridSkeleton />}>
            <MediaPanel />
          </KeepAlive>
          <KeepAlive active={panelTab === 'text'} skeleton={<PanelSkeleton />}>
            <TextPanel />
          </KeepAlive>
          <KeepAlive active={panelTab === 'stickers'} skeleton={<PanelGridSkeleton />}>
            <StickerPanel />
          </KeepAlive>
          <KeepAlive active={panelTab === 'effects'} skeleton={<PanelGridSkeleton />}>
            <EffectsPanel active={panelTab === 'effects'} />
          </KeepAlive>
          <KeepAlive active={panelTab === 'audio'} skeleton={<PanelSkeleton />}>
            <AudioPanel active={panelTab === 'audio'} />
          </KeepAlive>
          <KeepAlive active={panelTab === 'ai'} skeleton={<PanelSkeleton />}>
            <AIPanel />
          </KeepAlive>
          <KeepAlive active={panelTab === 'pro'} skeleton={<PanelGridSkeleton />}>
            <ProToolkitPanel />
          </KeepAlive>
        </div>
      </div>
    </div>
  )
}

export default LeftPanel
