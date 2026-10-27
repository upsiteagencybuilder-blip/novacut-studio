'use client'

/**
 * Pro Toolkit — the full professional post-production catalog inside NovaCut.
 *
 * Every industry tool, panel and role (Premiere / Resolve / After Effects /
 * Filmora taxonomy) mapped to what ships today:
 *   live    → taps deep-link straight into the shipped feature
 *   beta    → partially covered by a shipped equivalent
 *   planned → honest pro roadmap
 *   role    → industry job roles (reference credit roll)
 */

import { useMemo, useState } from 'react'
import { ArrowUpRight, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { useEditor } from '@/lib/editor/store'
import {
  PRO_CATALOG,
  PRO_SECTIONS,
  catalogCounts,
} from '@/lib/tools/catalog'
import type { ProTool, ToolAction, ToolSectionId } from '@/lib/tools/types'

/* ---------------- status styling (token-driven color combos) ---------------- */

const STATUS_META: Record<
  ProTool['status'],
  { label: string; dot: string; chip: string }
> = {
  live: {
    label: 'LIVE',
    dot: 'bg-emerald-400',
    chip: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  },
  beta: {
    label: 'BETA',
    dot: 'bg-amber-400',
    chip: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  },
  planned: {
    label: 'SOON',
    dot: 'bg-muted-foreground/50',
    chip: 'border-(--nc-line) bg-(--nc-panel-strong) text-muted-foreground',
  },
  role: {
    label: 'ROLE',
    dot: 'bg-violet-400',
    chip: 'border-violet-400/30 bg-violet-400/10 text-violet-300',
  },
}

type StatusFilter = 'all' | ProTool['status']

const STATUS_FILTERS: { id: Exclude<StatusFilter, 'all'>; label: string }[] = [
  { id: 'live', label: 'Live' },
  { id: 'beta', label: 'Beta' },
  { id: 'planned', label: 'Roadmap' },
  { id: 'role', label: 'Roles' },
]

/* ---------------- deep-link actions ---------------- */

/** AI catalog tools land on the sub-tab that actually hosts their controls */
const AI_SUBTAB_BY_TOOL: Record<string, 'assistant' | 'video' | 'create'> = {
  'ai-copilot-editing': 'assistant',
  'ai-text-to-video': 'create',
  'ai-silence-detection': 'video',
  'ai-audio-denoise': 'video',
  'ai-speech-to-text': 'video',
  'ai-caption-translate': 'video',
  'ai-text-to-speech': 'create',
}

function useToolAction() {
  const setPanelTab = useEditor((s) => s.setPanelTab)
  const setAiSubTab = useEditor((s) => s.setAiSubTab)
  const openDialog = useEditor((s) => s.openDialog)
  return useMemo(() => {
    /** effects-panel deep-link with a category preselected (mount-race safe) */
    const openEffectsCategory = (category: string) => {
      const w = window as unknown as { __ncEffectsCategoryRequest?: string }
      w.__ncEffectsCategoryRequest = category
      setPanelTab('effects')
      window.dispatchEvent(new CustomEvent('nc-effects-category', { detail: category }))
    }
    /** properties-panel deep-link — expands + scrolls to the requested section */
    const openPropsSection = (section: string) => {
      const w = window as unknown as { __ncPropsSectionRequest?: string; __ncPropsSectionTries?: number }
      w.__ncPropsSectionRequest = section
      w.__ncPropsSectionTries = 0
      if (!useEditor.getState().selectedClipIds.length) {
        toast('Select a clip first — then tap this tool to jump to its controls')
      }
      window.dispatchEvent(new CustomEvent('nc-props-section', { detail: section }))
    }
    const map: Record<ToolAction, (tool: ProTool) => void> = {
      'open-media': () => setPanelTab('media'),
      'open-text': () => setPanelTab('text'),
      'open-stickers': () => setPanelTab('stickers'),
      'open-effects': () => setPanelTab('effects'),
      'open-effects-color': () => openEffectsCategory('color'),
      'open-audio': () => setPanelTab('audio'),
      'open-ai': (tool) => {
        setAiSubTab(AI_SUBTAB_BY_TOOL[tool.id] ?? 'assistant')
        setPanelTab('ai')
      },
      'open-mixer': () => openDialog('mixer'),
      'open-export': () => {
        useEditor.getState().pause()
        openDialog('export')
      },
      'open-theme': () => openDialog('theme'),
      'open-projects': () => openDialog('projects'),
      'open-versions': () => openDialog('versions'),
      'open-shortcuts': () => openDialog('shortcuts'),
      'open-properties-filters': () => openPropsSection('filters'),
      'open-properties-grade': () => openPropsSection('grade'),
      'open-properties-lut': () => openPropsSection('lut'),
      'open-properties-scopes': () => openPropsSection('scopes'),
      'open-properties-animation': () => openPropsSection('animation'),
      'open-properties-speed-ramp': () => openPropsSection('speed-ramp'),
      'open-properties-audiofx': () => openPropsSection('audiofx'),
      'open-properties-transform': () => openPropsSection('transform'),
      'open-properties-adjustment': () => openPropsSection('adjustment'),
      'open-properties-curves': () => openPropsSection('curves'),
      'open-properties-wheels': () => openPropsSection('wheels'),
    }
    return map
  }, [setPanelTab, setAiSubTab, openDialog])
}

/* ---------------- tool card ---------------- */

function ToolCard({
  tool,
  onOpen,
}: {
  tool: ProTool
  onOpen: Record<ToolAction, (tool: ProTool) => void>
  showSection?: boolean
}) {
  const meta = STATUS_META[tool.status]
  const actionable = tool.status === 'live' && tool.action

  const body = (
    <>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={`size-1.5 shrink-0 rounded-full ${meta.dot}`} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold leading-tight text-foreground">
          {tool.name}
        </span>
        {actionable ? (
          <ArrowUpRight className="size-3 shrink-0 text-emerald-300" aria-hidden />
        ) : (
          <span className={`shrink-0 rounded-full border px-1.5 py-px text-[8px] font-bold leading-[1.4] tracking-wide ${meta.chip}`}>
            {meta.label}
          </span>
        )}
      </div>
      <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-muted-foreground">{tool.desc}</p>
    </>
  )

  if (actionable) {
    return (
      <button
        type="button"
        onClick={() => onOpen[tool.action as ToolAction](tool)}
        title={`${tool.name} — open in NovaCut`}
        className="nc-glass block w-full rounded-lg p-2.5 text-left transition hover:border-emerald-400/40 hover:bg-(--nc-panel-strong) focus-visible:outline-2 focus-visible:outline-emerald-400/60 active:scale-[0.98]"
      >
        {body}
      </button>
    )
  }
  return (
    <div className="nc-glass rounded-lg p-2.5" title={tool.name}>
      {body}
    </div>
  )
}

/* ================= panel ================= */

export function ProToolkitPanel() {
  const counts = useMemo(() => catalogCounts(), [])
  const [query, setQuery] = useState('')
  const [section, setSection] = useState<ToolSectionId | 'all'>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const onOpen = useToolAction()

  const q = query.trim().toLowerCase()

  const results = useMemo(() => {
    return PRO_CATALOG.filter((t) => {
      if (section !== 'all' && t.section !== section) return false
      if (status !== 'all' && t.status !== status) return false
      if (q && !(t.name.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q) || t.group.toLowerCase().includes(q))) {
        return false
      }
      return true
    })
  }, [q, section, status])

  // group results by their sub-group label, preserving first-appearance order
  const groups = useMemo(() => {
    const map = new Map<string, ProTool[]>()
    for (const t of results) {
      const list = map.get(t.group)
      if (list) list.push(t)
      else map.set(t.group, [t])
    }
    return Array.from(map.entries())
  }, [results])

  const activeSection = PRO_SECTIONS.find((s) => s.id === section)

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {/* header — the panel chrome already carries the title, this row carries the numbers */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">{counts.total}</span> tools catalogued
        </span>
        <span className="flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden />
          {counts.live} live now
        </span>
      </div>

      {/* search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${counts.total} pro tools…`}
          aria-label="Search the pro toolkit catalog"
          className="h-9 w-full rounded-lg border border-(--nc-line) bg-(--nc-panel) pl-8 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus:border-(--nc-accent)/50 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery('')}
            className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-(--nc-panel-strong) hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      {/* section chips */}
      <div className="-mx-0.5 flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          aria-pressed={section === 'all'}
          onClick={() => setSection('all')}
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${
            section === 'all'
              ? 'nc-gradient border-transparent text-white'
              : 'border-(--nc-line) bg-(--nc-panel) text-muted-foreground hover:text-foreground'
          }`}
        >
          All · {counts.total}
        </button>
        {PRO_SECTIONS.map((s) => {
          const active = section === s.id
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={active}
              onClick={() => setSection(s.id)}
              title={s.blurb}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${
                active
                  ? 'nc-gradient border-transparent text-white'
                  : 'border-(--nc-line) bg-(--nc-panel) text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="mr-1 opacity-80" aria-hidden>{s.emoji}</span>
              {s.label} · {counts.bySection[s.id]}
            </button>
          )
        })}
      </div>

      {/* status chips — toggleable; tap the active chip to clear */}
      <div className="-mx-0.5 flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {STATUS_FILTERS.map((f) => {
          const active = status === f.id
          const n = counts[f.id as 'live' | 'beta' | 'planned' | 'role']
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={active}
              onClick={() => setStatus(active ? 'all' : f.id)}
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[9.5px] font-semibold transition ${
                active
                  ? 'border-(--nc-accent)/50 bg-(--nc-accent)/15 text-foreground'
                  : 'border-(--nc-line) text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label} · {n}
            </button>
          )
        })}
      </div>

      {/* section blurb */}
      {activeSection && (
        <p className="-mt-1 text-[10px] leading-snug text-muted-foreground">
          <span className="mr-1" aria-hidden>{activeSection.emoji}</span>
          {activeSection.blurb}
        </p>
      )}

      {/* results — container queries drive the column count so the same panel
          breathes in the narrow desktop rail AND the wide mobile sheet */}
      <div className="@container nc-scroll min-h-0 flex-1 space-y-4 overflow-y-auto pb-2 lg:max-h-[calc(100vh-23rem)]">
        {groups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-(--nc-line-strong) p-6 text-center">
            <p className="text-xs font-medium text-foreground">No tools match “{query}”</p>
            <p className="mt-1 text-[10px] text-muted-foreground">Try a shorter term, or clear the status filter.</p>
          </div>
        ) : (
          groups.map(([group, tools]) => (
            <section key={group}>
              <h4 className="mb-1.5 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {group}
                <span className="h-px flex-1 bg-(--nc-line)" aria-hidden />
                <span className="tabular-nums">{tools.length}</span>
              </h4>
              <div className="grid grid-cols-1 gap-1.5 @[400px]:grid-cols-2">
                {tools.map((t) => (
                  <ToolCard key={t.id} tool={t} onOpen={onOpen} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  )
}

export default ProToolkitPanel
