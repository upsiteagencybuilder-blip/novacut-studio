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
import type { LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useEditor } from '@/lib/editor/store'
import type { PanelTab } from '@/lib/editor/types'
import { rovingGridKeydown } from '@/lib/editor/roving'
import { useLabel } from '@/lib/i18n/labels'
import { AudioPanel } from './AudioPanel'
import { AIPanel } from './AIPanel'
import { EffectsPanel } from './EffectsPanel'
import { MediaPanel } from './MediaPanel'
import { ProToolkitPanel } from './ProToolkitPanel'
import { StickerPanel } from './StickerPanel'
import { TextPanel } from './TextPanel'

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
          {panelTab === 'media' && <MediaPanel />}
          {panelTab === 'text' && <TextPanel />}
          {panelTab === 'stickers' && <StickerPanel />}
          {panelTab === 'effects' && <EffectsPanel />}
          {panelTab === 'audio' && <AudioPanel />}
          {panelTab === 'ai' && <AIPanel />}
          {panelTab === 'pro' && <ProToolkitPanel />}
        </div>
      </div>
    </div>
  )
}

export default LeftPanel
