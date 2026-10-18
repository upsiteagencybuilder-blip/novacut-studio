'use client'

/**
 * Left tool panel — icon rail (Media / Text / Stickers / Effects / Audio)
 * plus the switchable content area. State lives in the editor store.
 */
import {
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
import { AudioPanel } from './AudioPanel'
import { AIPanel } from './AIPanel'
import { EffectsPanel } from './EffectsPanel'
import { MediaPanel } from './MediaPanel'
import { StickerPanel } from './StickerPanel'
import { TextPanel } from './TextPanel'

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
]

const PANEL_TITLES: Record<PanelTab, string> = {
  media: 'Media library',
  text: 'Text & titles',
  stickers: 'Stickers',
  effects: 'Effects',
  audio: 'Audio',
  ai: 'AI magic',
}

export function LeftPanel() {
  const panelTab = useEditor((s) => s.panelTab)
  const setPanelTab = useEditor((s) => s.setPanelTab)
  const openDialog = useEditor((s) => s.openDialog)
  const mediaCount = useEditor((s) => s.media.length)

  return (
    <div className="flex h-full min-h-0">
      {/* ------- icon rail ------- */}
      <nav className="flex w-14 shrink-0 flex-col items-center gap-1.5 border-r border-(--nc-line) py-3">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active = panelTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              title={`${tab.label} panel`}
              aria-pressed={active}
              onClick={() => setPanelTab(tab.id)}
              className={
                active
                  ? 'nc-gradient nc-glow flex h-11 w-11 flex-col items-center justify-center gap-[3px] rounded-xl text-white shadow-lg transition-transform hover:scale-[1.04]'
                  : 'flex h-11 w-11 flex-col items-center justify-center gap-[3px] rounded-xl text-muted-foreground transition hover:bg-(--nc-panel) hover:text-foreground'
              }
            >
              <Icon className="size-[18px]" />
              <span className="text-[8px] font-medium leading-none">{tab.label}</span>
            </button>
          )
        })}

        <div className="mt-auto">
          <button
            type="button"
            title="Keyboard shortcuts"
            onClick={() => openDialog('shortcuts')}
            className="flex h-11 w-11 flex-col items-center justify-center gap-[3px] rounded-xl text-muted-foreground transition hover:bg-(--nc-panel) hover:text-foreground"
          >
            <CircleHelp className="size-[18px]" />
            <span className="text-[8px] font-medium leading-none">Help</span>
          </button>
        </div>
      </nav>

      {/* ------- content area ------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-11 shrink-0 items-center justify-between border-b border-(--nc-line) px-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {PANEL_TITLES[panelTab]}
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

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {panelTab === 'media' && <MediaPanel />}
          {panelTab === 'text' && <TextPanel />}
          {panelTab === 'stickers' && <StickerPanel />}
          {panelTab === 'effects' && <EffectsPanel />}
          {panelTab === 'audio' && <AudioPanel />}
          {panelTab === 'ai' && <AIPanel />}
        </div>
      </div>
    </div>
  )
}

export default LeftPanel
