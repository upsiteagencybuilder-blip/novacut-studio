/**
 * AI Copilot — client-side plan executor.
 *
 * The backend (/api/ai/copilot) only *generates* an action plan. Every action
 * passes through this module, which re-validates it against the real effect
 * registries and project state before touching the store — a hallucinated id
 * is skipped with a receipt, never applied. All patches use history=false so
 * multi-action plans stay undo-friendly (creations push their own history
 * entries; patches fold into them).
 */

import { COLOR_EFFECTS } from '@/lib/effects/color'
import { ALL_STICKER_DEFS } from './sticker-render'
import { BUILTIN_TRANSFORM_PRESETS, DEFAULT_COLOR_GRADE, DEFAULT_FILTERS } from './constants'
import { useEditor } from './store'
import { clamp, round2 } from './utils'
import type { Clip, MotionType } from './types'

export interface CopilotReceipt {
  applied: string[]
  skipped: string[]
}

interface CopilotAction {
  type?: unknown
  text?: unknown
  at?: unknown
  size?: unknown
  color?: unknown
  bold?: unknown
  emoji?: unknown
  shape?: unknown
  family?: unknown
  variant?: unknown
  target?: unknown
  motion?: unknown
  value?: unknown
  duration?: unknown
  name?: unknown
  preset?: unknown
  match?: unknown
}

const MOTION_VALUES: MotionType[] = [
  'none',
  'zoomIn',
  'zoomOut',
  'panLeft',
  'panRight',
  'panUp',
  'panDown',
  'rotate',
  'pulse',
  'zoomRotate',
  'kenBurns',
]
const MOTION_SET = new Set<string>(MOTION_VALUES)

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

type StoreState = ReturnType<typeof useEditor.getState>

/* ---------------- helpers ---------------- */

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : NaN
}

function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && HEX.test(v.trim())
}

function projectEnd(clips: Clip[]): number {
  return clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0)
}

function visualClips(clips: Clip[]): Clip[] {
  return clips.filter((c) => c.kind !== 'audio')
}

/** FX carriers are never plan targets — looks/transforms live on real clips */
function targetableClips(clips: Clip[]): Clip[] {
  return clips.filter((c) => c.kind !== 'audio' && c.kind !== 'adjustment')
}

/**
 * Resolve plan targets — v2 understands 'all', 'first', 'last' (the visual clip
 * ending latest — handy for “fade out at the end”), the current selection, and
 * falls back to the first visual clip when nothing is selected.
 */
function resolveTargets(target: unknown, st: StoreState): Clip[] {
  const clips = targetableClips(st.project.clips)
  if (target === 'all') return clips
  if (target === 'first') {
    const first = clips.slice().sort((x, y) => x.start - y.start)[0]
    return first ? [first] : []
  }
  if (target === 'last') {
    const sorted = clips.slice().sort((x, y) => x.start + x.duration - (y.start + y.duration))
    const last = sorted[sorted.length - 1]
    return last ? [last] : []
  }
  const sel = st.project.clips.filter((c) => st.selectedClipIds.includes(c.id) && c.kind !== 'audio' && c.kind !== 'adjustment')
  if (sel.length) return sel
  return clips.slice().sort((x, y) => x.start - y.start).slice(0, 1)
}

/** resolve a color-look family to a concrete effect (shared by looks + adjustment layers) */
function resolveLook(family: string, variant: number, r: CopilotReceipt) {
  const famName = family.trim().toLowerCase()
  if (!famName) {
    r.skipped.push('Look: family missing')
    return null
  }
  let candidates = COLOR_EFFECTS.filter((e) => e.family.toLowerCase() === famName)
  if (!candidates.length) {
    candidates = COLOR_EFFECTS.filter(
      (e) => e.family.toLowerCase().includes(famName) || famName.includes(e.family.toLowerCase())
    )
  }
  if (!candidates.length) {
    r.skipped.push(`Look "${family}" not found`)
    return null
  }
  return candidates[clamp(Math.round(variant) || 3, 1, candidates.length) - 1]
}

function placeCreatedClip(at: unknown, st: StoreState): void {
  const id = st.selectedClipIds[0]
  if (!id) return
  if (at === 'start') st.moveClip(id, 0, null, false)
  else if (at === 'end') st.moveClip(id, round2(projectEnd(st.project.clips)), null, false)
}

/* ---------------- per-action appliers ---------------- */

function applyAddTitle(a: CopilotAction, st: StoreState, r: CopilotReceipt): void {
  const text = str(a.text, 80)
  if (!text) {
    r.skipped.push('Title: empty text')
    return
  }
  st.addTextClip()
  const st2 = useEditor.getState()
  const id = st2.selectedClipIds[0]
  const clip = st2.project.clips.find((c) => c.id === id && c.kind === 'text')
  if (!clip || !id) {
    r.skipped.push('Title could not be created')
    return
  }
  placeCreatedClip(a.at, st2)
  const style: Record<string, unknown> = { content: text }
  const size = num(a.size)
  if (Number.isFinite(size)) style.fontSize = Math.round(clamp(size, 16, 140))
  if (isHexColor(a.color)) style.color = a.color.trim()
  if (typeof a.bold === 'boolean') style.bold = a.bold
  st2.updateClip(id, { textStyle: style }, false)
  r.applied.push(`Title "${text}" added`)
}

function applyAddSticker(a: CopilotAction, st: StoreState, r: CopilotReceipt): void {
  const emoji = str(a.emoji, 8)
  const shape = str(a.shape, 40).toLowerCase()
  if (emoji) {
    st.addStickerClip(emoji)
  } else if (shape) {
    const def = ALL_STICKER_DEFS.find((d) => d.id === shape || d.name.toLowerCase() === shape)
    if (!def) {
      r.skipped.push(`Sticker "${shape}" not found`)
      return
    }
    st.addStickerClip({ family: def.family, shape: def.id })
  } else {
    r.skipped.push('Sticker: needs an emoji or a known shape')
    return
  }
  const st2 = useEditor.getState()
  if (st2.selectedClipIds[0]) placeCreatedClip(a.at, st2)
  r.applied.push(emoji ? `Sticker ${emoji} added` : `Sticker "${shape}" added`)
}

function applyApplyLook(a: CopilotAction, st: StoreState, r: CopilotReceipt): void {
  const eff = resolveLook(str(a.family, 60), num(a.variant), r)
  if (!eff) return
  const targets = resolveTargets(a.target, st).filter((c) => c.kind !== 'audio')
  if (!targets.length) {
    r.skipped.push('Look: no visual clip to style')
    return
  }
  for (const t of targets) {
    if (t.kind === 'text' || t.kind === 'sticker') {
      // pixel grade does not render on text/sticker — filters layer only
      st.updateClip(t.id, { filters: { ...DEFAULT_FILTERS, ...eff.filters } }, false)
    } else {
      st.updateClip(
        t.id,
        {
          filters: { ...DEFAULT_FILTERS, ...eff.filters },
          colorGrade: { ...DEFAULT_COLOR_GRADE, ...(eff.grade ?? {}) },
        },
        false
      )
    }
  }
  r.applied.push(`Look ${eff.name} → ${targets.length} clip${targets.length === 1 ? '' : 's'}`)
}

function applySetMotion(a: CopilotAction, st: StoreState, r: CopilotReceipt): void {
  const motion = str(a.motion, 30)
  if (!MOTION_SET.has(motion)) {
    r.skipped.push(`Motion "${motion}" unknown`)
    return
  }
  const targets = resolveTargets(a.target, st)
  if (!targets.length) {
    r.skipped.push('Motion: no visual clip')
    return
  }
  const intensity = num(a.value)
  for (const t of targets) {
    st.updateClip(
      t.id,
      {
        motion: motion as MotionType,
        ...(Number.isFinite(intensity) ? { motionIntensity: clamp(intensity, 0, 1) } : {}),
      },
      false
    )
  }
  r.applied.push(`Motion ${motion} → ${targets.length} clip${targets.length === 1 ? '' : 's'}`)
}

function applySetMotionIntensity(a: CopilotAction, st: StoreState, r: CopilotReceipt): void {
  const v = num(a.value)
  if (!Number.isFinite(v)) {
    r.skipped.push('Motion intensity: number required')
    return
  }
  const targets = resolveTargets(a.target, st)
  if (!targets.length) {
    r.skipped.push('Motion intensity: no visual clip')
    return
  }
  for (const t of targets) st.updateClip(t.id, { motionIntensity: clamp(v, 0, 1) }, false)
  r.applied.push(`Motion intensity ${Math.round(clamp(v, 0, 1) * 100)}% → ${targets.length} clip${targets.length === 1 ? '' : 's'}`)
}

function applyCrossfade(a: CopilotAction, st: StoreState, r: CopilotReceipt): void {
  const d = Number.isFinite(num(a.duration)) ? clamp(num(a.duration), 0.2, 2) : 0.5
  const vis = visualClips(st.project.clips).sort((x, y) => x.start - y.start)
  const t = st.currentTime
  // prefer the pair around the playhead, fall back to the first adjacent pair
  const anchor = vis.find((c) => c.start <= t && t < c.start + c.duration)
  let out: Clip | undefined
  let inc: Clip | undefined
  if (anchor) {
    inc = vis
      .filter((c) => c.trackId === anchor.trackId && c.start > anchor.start)
      .sort((x, y) => x.start - y.start)[0]
    out = anchor
  }
  if (!out || !inc) {
    for (const c of vis) {
      const nx = vis.find((n) => n.trackId === c.trackId && n.start > c.start)
      if (nx) {
        out = c
        inc = nx
        break
      }
    }
  }
  if (!out || !inc) {
    r.skipped.push('Crossfade: needs two adjacent clips on one track')
    return
  }
  const fadeOut = round2(clamp(d, 0.05, out.duration * 0.6))
  const fadeIn = round2(clamp(d, 0.05, inc.duration * 0.6))
  st.updateClip(out.id, { fadeOut }, false)
  st.updateClip(inc.id, { fadeIn }, false)
  r.applied.push(`Crossfade ${d}s added`)
}

function applySetSpeed(a: CopilotAction, st: StoreState, r: CopilotReceipt): void {
  const v = num(a.value)
  if (!Number.isFinite(v) || v < 0.25 || v > 4) {
    r.skipped.push('Speed must be between 0.25× and 4×')
    return
  }
  const targets = resolveTargets(a.target, st).filter(
    (c) => (c.kind === 'video' || c.kind === 'audio') && Number.isFinite(c.sourceDuration)
  )
  if (!targets.length) {
    r.skipped.push('Speed applies to media clips only')
    return
  }
  for (const c of targets) {
    const duration = round2(Math.max(0.1, (c.duration * c.speed) / v))
    st.updateClip(c.id, { speed: round2(v), duration }, false)
  }
  r.applied.push(`Speed ${round2(v)}× → ${targets.length} clip${targets.length === 1 ? '' : 's'}`)
}

function applySetVolume(a: CopilotAction, st: StoreState, r: CopilotReceipt): void {
  const v = num(a.value)
  if (!Number.isFinite(v)) {
    r.skipped.push('Volume: number required')
    return
  }
  const targets = resolveTargets(a.target, st).filter((c) => c.kind === 'video' || c.kind === 'audio')
  if (!targets.length) {
    r.skipped.push('Volume applies to media clips only')
    return
  }
  for (const c of targets) st.updateClip(c.id, { volume: clamp(v, 0, 1) }, false)
  r.applied.push(`Volume ${Math.round(clamp(v, 0, 1) * 100)}% → ${targets.length} clip${targets.length === 1 ? '' : 's'}`)
}

function applyAddAdjustmentLayer(a: CopilotAction, st: StoreState, r: CopilotReceipt): void {
  const ok = st.addAdjustmentLayer()
  if (!ok) {
    r.skipped.push('Adjustment layer: unavailable inside an open compound clip')
    return
  }
  const st2 = useEditor.getState()
  const id = st2.selectedClipIds[0]
  const clip = st2.project.clips.find((c) => c.id === id && c.kind === 'adjustment')
  if (!clip || !id) {
    r.skipped.push('Adjustment layer could not be created')
    return
  }
  const famName = str(a.family, 60)
  if (famName) {
    const eff = resolveLook(famName, num(a.variant), r)
    if (eff) {
      st2.updateClip(
        id,
        {
          filters: { ...DEFAULT_FILTERS, ...eff.filters },
          colorGrade: { ...DEFAULT_COLOR_GRADE, ...(eff.grade ?? {}) },
        },
        false
      )
      r.applied.push(`Adjustment layer + ${eff.name}`)
      return
    }
  }
  r.applied.push('Adjustment layer added')
}

function applySetTransform(a: CopilotAction, st: StoreState, r: CopilotReceipt): void {
  const key = str(a.preset, 40).toLowerCase()
  const preset = BUILTIN_TRANSFORM_PRESETS.find(
    (p) => p.id === key || p.id.replace(/^xf-/, '') === key || p.name.toLowerCase() === key
  )
  if (!preset) {
    r.skipped.push(
      `Transform preset "${str(a.preset, 40)}" unknown — try: ${BUILTIN_TRANSFORM_PRESETS.map((p) => p.id.replace('xf-', '')).join(', ')}`
    )
    return
  }
  const targets = resolveTargets(a.target, st).filter(
    (c) => c.kind === 'video' || c.kind === 'image' || c.kind === 'text' || c.kind === 'sticker'
  )
  if (!targets.length) {
    r.skipped.push('Transform: no visual clip')
    return
  }
  for (const t of targets) st.updateClip(t.id, { transform: { ...t.transform, ...preset.transform } }, false)
  r.applied.push(`Transform ${preset.name} → ${targets.length} clip${targets.length === 1 ? '' : 's'}`)
}

function applyFade(a: CopilotAction, st: StoreState, r: CopilotReceipt, field: 'fadeIn' | 'fadeOut'): void {
  const d = num(a.duration)
  if (!Number.isFinite(d) || d <= 0) {
    r.skipped.push(`${field === 'fadeIn' ? 'Fade-in' : 'Fade-out'}: duration in seconds required`)
    return
  }
  const targets = resolveTargets(a.target, st)
  if (!targets.length) {
    r.skipped.push(`${field === 'fadeIn' ? 'Fade-in' : 'Fade-out'}: no clip`)
    return
  }
  const appliedDurations: number[] = []
  for (const t of targets) {
    const v = round2(clamp(d, 0.05, Math.max(0.05, t.duration * 0.8)))
    st.updateClip(t.id, { [field]: v }, false)
    appliedDurations.push(v)
  }
  const label = field === 'fadeIn' ? 'Fade-in' : 'Fade-out'
  r.applied.push(`${label} ${appliedDurations[0]}s → ${targets.length} clip${targets.length === 1 ? '' : 's'}`)
}

function applyDuplicateSelected(a: CopilotAction, st: StoreState, r: CopilotReceipt): void {
  void a
  const ids = st.selectedClipIds.slice()
  if (!ids.length) {
    r.skipped.push('Duplicate: nothing selected')
    return
  }
  const before = st.project.clips.length
  for (const id of ids) st.duplicateClip(id)
  const n = useEditor.getState().project.clips.length - before
  if (n > 0) r.applied.push(`${n} clip${n === 1 ? '' : 's'} duplicated`)
  else r.skipped.push('Duplicate failed')
}

function applyTrimSelected(a: CopilotAction, st: StoreState, r: CopilotReceipt): void {
  const d = num(a.duration)
  if (!Number.isFinite(d) || d <= 0) {
    r.skipped.push('Trim: duration in seconds required')
    return
  }
  const targets = st.project.clips.filter(
    (c) =>
      st.selectedClipIds.includes(c.id) &&
      (c.kind === 'video' || c.kind === 'audio' || c.kind === 'image') &&
      Number.isFinite(c.sourceDuration)
  )
  if (!targets.length) {
    r.skipped.push('Trim: select a media clip first (video / audio / image)')
    return
  }
  for (const c of targets) {
    const max = Math.max(0.1, (c.sourceDuration - c.trimStart) / c.speed)
    st.updateClip(c.id, { duration: round2(clamp(d, 0.1, max)) }, false)
  }
  r.applied.push(`Trimmed to ${round2(clamp(d, 0.1, 3600))}s → ${targets.length} clip${targets.length === 1 ? '' : 's'}`)
}

function applyStyleTitle(a: CopilotAction, st: StoreState, r: CopilotReceipt): void {
  const color = isHexColor(a.color) ? a.color.trim() : null
  const size = num(a.size)
  const bold = typeof a.bold === 'boolean' ? a.bold : null
  if (!color && !Number.isFinite(size) && bold === null) {
    r.skipped.push('Title style: provide a color (#rrggbb), size or bold')
    return
  }
  const texts = st.project.clips.filter((c) => c.kind === 'text')
  if (!texts.length) {
    r.skipped.push('Title style: no text clip on the timeline')
    return
  }
  const match = str(a.match, 60).toLowerCase()
  let targets = match ? texts.filter((c) => (c.textStyle?.content ?? '').toLowerCase().includes(match)) : []
  if (!targets.length && !match) {
    // follow-up default — the most recent title on the timeline
    const last = [...texts].sort((x, y) => x.start - y.start || st.project.clips.indexOf(x) - st.project.clips.indexOf(y)).slice(-1)[0]
    targets = last ? [last] : []
  }
  if (!targets.length) {
    r.skipped.push(`Title style: no title matching "${str(a.match, 60)}"`)
    return
  }
  for (const t of targets) {
    const style: Record<string, unknown> = { ...(t.textStyle ?? {}) }
    if (color) style.color = color
    if (Number.isFinite(size)) style.fontSize = Math.round(clamp(size, 16, 140))
    if (bold !== null) style.bold = bold
    st.updateClip(t.id, { textStyle: style }, false)
  }
  const bits = [color && `color ${color}`, Number.isFinite(size) && `size ${Math.round(clamp(size, 16, 140))}`, bold !== null && `bold ${bold}`].filter(Boolean).join(', ')
  r.applied.push(`Title restyled (${bits}) → ${targets.length} clip${targets.length === 1 ? '' : 's'}`)
}

function applySplit(st: StoreState, r: CopilotReceipt): void {
  const before = st.project.clips.length
  st.splitAtPlayhead()
  if (useEditor.getState().project.clips.length > before) r.applied.push('Split at playhead')
  else r.skipped.push('Split: playhead is not over a clip body')
}

function applyDeleteSelected(st: StoreState, r: CopilotReceipt): void {
  const n = st.selectedClipIds.length
  if (!n) {
    r.skipped.push('Delete: nothing selected')
    return
  }
  st.deleteSelected()
  r.applied.push(`${n} clip${n === 1 ? '' : 's'} deleted`)
}

/* ---------------- dispatcher ---------------- */

const APPLIERS: Record<string, (a: CopilotAction, st: StoreState, r: CopilotReceipt) => void> = {
  addTitle: applyAddTitle,
  addSticker: applyAddSticker,
  applyLook: applyApplyLook,
  setMotion: applySetMotion,
  setMotionIntensity: applySetMotionIntensity,
  crossfade: applyCrossfade,
  setSpeed: applySetSpeed,
  setVolume: applySetVolume,
  addAdjustmentLayer: applyAddAdjustmentLayer,
  setTransform: applySetTransform,
  styleTitle: applyStyleTitle,
  fadeIn: (a, st, r) => applyFade(a, st, r, 'fadeIn'),
  fadeOut: (a, st, r) => applyFade(a, st, r, 'fadeOut'),
  duplicateSelected: applyDuplicateSelected,
  trimSelected: applyTrimSelected,
  addMarker: (_a, st, r) => {
    if (st.addMarkerAtPlayhead()) r.applied.push('Marker added at playhead')
    else r.skipped.push('Marker: playhead already has one')
  },
  splitAtPlayhead: (_a, st, r) => applySplit(st, r),
  deleteSelected: (_a, st, r) => applyDeleteSelected(st, r),
  setBackgroundColor: (a, st, r) => {
    const color = str(a.color, 9)
    if (!isHexColor(color)) {
      r.skipped.push('Background color must be #rrggbb')
      return
    }
    st.setProjectBackground(color.trim())
    r.applied.push(`Background set to ${color.trim()}`)
  },
  renameProject: (a, st, r) => {
    const name = str(a.name, 60)
    if (!name) {
      r.skipped.push('Rename: empty name')
      return
    }
    st.setProjectName(name)
    r.applied.push(`Project renamed to "${name}"`)
  },
}

const MAX_PLAN_ACTIONS = 16

/**
 * Validate + apply a copilot plan. Never throws — bad actions land in `skipped`.
 *
 * Day 31 (v2): the WHOLE plan is one history group — one unconditional pre-plan
 * snapshot is pushed, every action runs (creations push entries that later fold
 * in), and endHistoryGroup collapses the group so ONE undo reverts the entire
 * multi-step sequence. Patch-only plans are undoable now too (v1 flaw: volume/
 * speed-only plans left no history entry at all).
 */
export function applyCopilotActions(actions: unknown[]): CopilotReceipt {
  const receipt: CopilotReceipt = { applied: [], skipped: [] }
  const st = useEditor.getState()
  const before = st.beginHistoryGroup()
  st.pushHistory() // unconditional pre-plan snapshot (no key → never merge-dropped)
  for (const raw of actions.slice(0, MAX_PLAN_ACTIONS)) {
    if (!raw || typeof raw !== 'object') continue
    const a = raw as CopilotAction
    const type = typeof a.type === 'string' ? a.type : ''
    const run = APPLIERS[type]
    if (!run) {
      receipt.skipped.push(`Unknown action "${type.slice(0, 30)}"`)
      continue
    }
    try {
      // always run against the freshest state — earlier actions may have replaced it
      run(a, useEditor.getState(), receipt)
    } catch (e) {
      receipt.skipped.push(`Action "${type}" failed: ${e instanceof Error ? e.message.slice(0, 60) : 'error'}`)
    }
  }
  // when nothing applied the snapshot is redundant but harmless (undo restores an identical state)
  useEditor.getState().endHistoryGroup(before)
  return receipt
}

/** Compact project snapshot for the copilot prompt (kept small on purpose). */
export function buildCopilotContext(st: StoreState): Record<string, unknown> {
  const selectedId = st.selectedClipIds[0]
  const selected = st.project.clips.find((c) => c.id === selectedId)
  return {
    projectName: st.project.name,
    canvas: { width: st.project.canvasWidth, height: st.project.canvasHeight },
    fps: st.project.fps,
    playhead: round2(st.currentTime),
    projectEnd: round2(projectEnd(st.project.clips)),
    clipCount: st.project.clips.length,
    clips: st.project.clips.slice(0, 30).map((c) => ({
      kind: c.kind,
      name: c.name.slice(0, 24),
      start: c.start,
      duration: c.duration,
    })),
    selected: selected ? { kind: selected.kind, name: selected.name.slice(0, 24) } : null,
  }
}

/* ---------------- Day 31 QA harness — real executor receipts ---------------- */

if (typeof window !== 'undefined') {
  ;(window as unknown as { __ncCopilotHarness?: unknown }).__ncCopilotHarness = { applyCopilotActions }
}
