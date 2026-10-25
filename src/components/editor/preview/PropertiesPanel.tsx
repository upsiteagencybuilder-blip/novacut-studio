'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Activity,
  AlignCenter,
  AlignLeft,
  AlignRight,
  AudioLines,
  Blend,
  Bold,
  CaseUpper,
  ChevronDown,
  Copy,
  Crop,
  Diamond,
  DiamondPlus,
  Film,
  FlipHorizontal2,
  FlipVertical2,
  Gauge,
  Image as ImageIcon,
  Italic,
  Layers,
  Move,
  Palette,
  Pipette,
  Rewind,
  RotateCcw,
  RotateCw,
  Settings2,
  SlidersHorizontal,
  Snowflake,
  Sparkles,
  Sticker,
  Strikethrough,
  Sun,
  Timer,
  Trash2,
  Type,
  Underline,
  VolumeX,
  Wand2,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEditor } from '@/lib/editor/store'
import { getEngine } from '@/lib/editor/engine'
import { transitionPairsForTrack } from '@/lib/editor/transitionBridge'
import { toast } from 'sonner'
import {
  BLEND_MODES,
  CANVAS_PRESETS,
  DEFAULT_CHROMA_KEY,
  DEFAULT_COLOR_GRADE,
  DEFAULT_FILTERS,
  EASING_OPTIONS,
  TEXT_FONTS,
} from '@/lib/editor/constants'
import { clamp, computeHistogram, formatTimecode, KEYFRAME_PROPERTIES } from '@/lib/editor/utils'
import { KeyframeCurveEditor } from '@/components/editor/preview/KeyframeCurve'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type {
  BlendMode,
  ChromaKey,
  Clip,
  ClipAudioFx,
  ClipKind,
  ClipFit,
  ColorGrade,
  EasingType,
  Filters,
  Keyframe,
  KeyframeProperty,
  StickerAnimation,
  StickerStyle,
  TextAnimation,
  TextStyle,
  Transform,
} from '@/lib/editor/types'

/* ================================================================ meta */

const KIND_META: Record<ClipKind, { label: string; icon: LucideIcon }> = {
  video: { label: 'Video', icon: Film },
  image: { label: 'Image', icon: ImageIcon },
  audio: { label: 'Audio', icon: AudioLines },
  text: { label: 'Text', icon: Type },
  sticker: { label: 'Sticker', icon: Sticker },
  nested: { label: 'Compound', icon: Layers },
}

const TEXT_ANIMATION_GROUPS: { label: string; items: { value: TextAnimation; label: string }[] }[] = [
  {
    label: 'Basic',
    items: [
      { value: 'none', label: 'None' },
      { value: 'fadeIn', label: 'Fade In' },
      { value: 'slideUp', label: 'Slide Up' },
      { value: 'pop', label: 'Pop' },
      { value: 'typewriter', label: 'Typewriter' },
      { value: 'wipe', label: 'Wipe' },
    ],
  },
  {
    label: 'Slides',
    items: [
      { value: 'slideLeft', label: 'Slide Left' },
      { value: 'slideRight', label: 'Slide Right' },
      { value: 'slideDown', label: 'Slide Down' },
    ],
  },
  {
    label: 'Pop & Spin',
    items: [
      { value: 'bounceIn', label: 'Bounce In' },
      { value: 'elastic', label: 'Elastic' },
      { value: 'flipX', label: 'Flip X' },
      { value: 'rotateIn', label: 'Rotate In' },
      { value: 'swing', label: 'Swing' },
    ],
  },
  {
    label: 'Cinematic',
    items: [
      { value: 'zoomBlur', label: 'Zoom Blur' },
      { value: 'trackingIn', label: 'Tracking In' },
      { value: 'blurIn', label: 'Blur In' },
    ],
  },
  {
    label: 'Title scrolls',
    items: [
      { value: 'roll', label: 'Roll (end credits)' },
      { value: 'crawl', label: 'Crawl (news ticker)' },
    ],
  },
  {
    label: 'Loops',
    items: [
      { value: 'waveLoop', label: 'Wave Loop' },
      { value: 'shakeLoop', label: 'Shake Loop' },
      { value: 'neonFlicker', label: 'Neon Flicker' },
      { value: 'glitchLoop', label: 'Glitch Loop' },
    ],
  },
]

const STICKER_ANIMATIONS: { value: StickerAnimation; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'pop', label: 'Pop' },
  { value: 'float', label: 'Float' },
  { value: 'spin', label: 'Spin' },
  { value: 'pulse', label: 'Pulse' },
]

const fmtPct = (v: number) => `${Math.round(v * 100)}%`
const fmtDeg = (v: number) => `${Math.round(v)}°`
const fmtPx = (v: number) => `${Math.round(v)}px`
const fmtX = (v: number) => `${Math.round(v * 100) / 100}×`
const fmtSec = (v: number) => `${Math.round(v * 100) / 100}s`
const fmtNum = (v: number) => String(Math.round(v * 100) / 100)
const fmtDb = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}dB`
const fmtHz = (v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}kHz` : `${Math.round(v)}Hz`)

/* ================================================================ section deep-links */

/**
 * Deep-link target ids shared with the Pro Toolkit catalog actions
 * (open-properties-*). Requested via the `nc-props-section` event or the
 * `__ncPropsSectionRequest` pending flag (covers the mobile-sheet mount race).
 */
export type PropsSectionId = 'filters' | 'grade' | 'lut' | 'scopes' | 'animation'

/**
 * Focus a section on a properties deep-link: expands (via callback), scrolls
 * into view and flashes a highlight ring. Returns a ref to attach to the
 * section element.
 */
function usePropsSectionFocus(sectionId: PropsSectionId | undefined, onTarget?: () => void) {
  const ref = useRef<HTMLElement | null>(null)
  const cbRef = useRef(onTarget)
  useEffect(() => {
    cbRef.current = onTarget
  })

  useEffect(() => {
    if (!sectionId) return
    let flashTimer: number | undefined
    const focus = () => {
      cbRef.current?.()
      window.setTimeout(() => {
        const el = ref.current
        if (!el) return
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        el.classList.remove('nc-section-flash')
        // restart the animation even when the same section is targeted twice
        void el.offsetWidth
        el.classList.add('nc-section-flash')
        window.clearTimeout(flashTimer)
        flashTimer = window.setTimeout(() => el.classList.remove('nc-section-flash'), 1700)
      }, 60)
    }
    const onEvt = (e: Event) => {
      if ((e as CustomEvent<string>).detail === sectionId) focus()
    }
    window.addEventListener('nc-props-section', onEvt)
    // mount race: the request fired before this panel (mobile sheet) mounted
    const w = window as unknown as { __ncPropsSectionRequest?: string }
    if (w.__ncPropsSectionRequest === sectionId) {
      w.__ncPropsSectionRequest = undefined
      focus()
    }
    return () => {
      window.removeEventListener('nc-props-section', onEvt)
      window.clearTimeout(flashTimer)
    }
  }, [sectionId])

  return ref
}

/** color inputs only accept #rgb/#rrggbb — normalize anything else */
function toHexInput(v: string): string {
  const s = v.trim()
  if (/^#[0-9a-f]{6}$/i.test(s)) return s
  const short = /^#[0-9a-f]{3}$/i.exec(s)
  if (short) {
    const [r, g, b] = s.slice(1).split('')
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return '#000000'
}

/** parse hex/rgb/rgba css colors into channels (alpha defaults to 1) */
function parseColorChannels(v: string): { r: number; g: number; b: number; a: number } {
  const s = v.trim()
  const hex = /^#([0-9a-f]{3,8})$/i.exec(s)
  if (hex) {
    let h = hex[1]
    if (h.length === 3) h = h.split('').map((c) => c + c).join('')
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
    return { r, g, b, a }
  }
  const m = /^rgba?\(([^)]+)\)$/i.exec(s)
  if (m) {
    const parts = m[1].split(',').map((p) => parseFloat(p.trim()))
    return { r: parts[0] || 0, g: parts[1] || 0, b: parts[2] || 0, a: parts[3] === undefined ? 1 : parts[3] }
  }
  return { r: 0, g: 0, b: 0, a: 0.55 }
}

/** rebuild an rgba() string keeping the original rgb channels at a new alpha */
function recolorWithAlpha(hex: string, alpha: number): string {
  const c = parseColorChannels(hex)
  return `rgba(${c.r},${c.g},${c.b},${Math.round(alpha * 100) / 100})`
}

/* ================================================================ shared row helpers */

function SliderRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
  accessory,
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
  format?: (v: number) => string
  /** optional right-side control (e.g. keyframe diamond) */
  accessory?: ReactNode
}) {
  // clamp only what the thumb shows — the real value may exceed the range (e.g. corner-drag scale)
  const safe = Math.min(Math.max(value, min), max)
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <Slider
        className="h-4 flex-1"
        min={min}
        max={max}
        step={step}
        value={[safe]}
        onValueChange={(v) => onChange(v[0] ?? min)}
      />
      {accessory}
      <span className="w-10 shrink-0 text-right font-mono text-[10px] tabular-nums text-foreground/70">
        {format ? format(value) : fmtNum(value)}
      </span>
    </div>
  )
}

function SelectRow({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  children: ReactNode
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger size="sm" className="h-8 flex-1 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  )
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <input
        type="color"
        value={toHexInput(value)}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-10 cursor-pointer rounded-md border border-(--nc-line) bg-transparent p-0.5"
      />
    </label>
  )
}

function ToggleButton({
  title,
  active,
  onClick,
  children,
}: {
  title: string
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-lg border transition-colors',
        active
          ? 'nc-gradient border-transparent text-white'
          : 'border-(--nc-line) text-muted-foreground hover:bg-(--nc-panel) hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

function Section({
  title,
  icon: Icon,
  onReset,
  sectionId,
  children,
}: {
  title: string
  icon: LucideIcon
  onReset?: () => void
  /** deep-link target for Pro Toolkit `open-properties-*` actions */
  sectionId?: PropsSectionId
  children: ReactNode
}) {
  const ref = usePropsSectionFocus(sectionId)
  return (
    <section ref={ref} className="space-y-3 rounded-xl border border-(--nc-line) bg-(--nc-panel-soft) p-3">
      <div className="flex items-center gap-1.5">
        <Icon className="h-[13px] w-[13px] text-muted-foreground" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {onReset && (
          <button
            type="button"
            title={`Reset ${title.toLowerCase()}`}
            onClick={onReset}
            className="ml-auto rounded-md p-1 text-muted-foreground transition-colors hover:bg-(--nc-panel) hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

function ClipActionsRow({ duplicateId }: { duplicateId: string }) {
  const deleteSelected = useEditor((s) => s.deleteSelected)
  const duplicateClip = useEditor((s) => s.duplicateClip)
  return (
    <div className="flex gap-2 pt-1">
      <Button
        variant="ghost"
        size="sm"
        className="h-9 flex-1 border border-rose-500/30 text-xs text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
        onClick={deleteSelected}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-9 flex-1 border border-(--nc-line) text-xs text-muted-foreground hover:bg-(--nc-panel) hover:text-foreground"
        onClick={() => duplicateClip(duplicateId)}
      >
        <Copy className="h-3.5 w-3.5" />
        Duplicate
      </Button>
    </div>
  )
}

/* ================================================================ text / sticker sections */

function TextSection({ clip }: { clip: Clip }) {
  const updateClip = useEditor((s) => s.updateClip)
  const pushHistory = useEditor((s) => s.pushHistory)
  const style = clip.textStyle as TextStyle

  const patch = (p: Partial<TextStyle>, history: boolean | string) =>
    updateClip(clip.id, { textStyle: p }, history)

  return (
    <Section title="Text" icon={Type}>
      <Textarea
        rows={2}
        value={style.content}
        onFocus={() => pushHistory()}
        onChange={(e) => patch({ content: e.target.value }, 'txt-content')}
        className="min-h-0 resize-none bg-(--nc-panel) text-xs"
      />

      <SelectRow label="Font" value={style.fontFamily} onChange={(v) => patch({ fontFamily: v }, true)}>
        {TEXT_FONTS.map((f) => (
          <SelectItem key={f.family} value={f.family} className="text-xs" style={{ fontFamily: f.family }}>
            {f.label}
          </SelectItem>
        ))}
      </SelectRow>

      <SliderRow
        label="Size"
        min={16}
        max={220}
        step={1}
        value={style.fontSize}
        onChange={(v) => patch({ fontSize: v }, 'txt-size')}
        format={fmtPx}
      />

      {/* bold / italic / caps / underline / strike / align */}
      <div className="flex flex-wrap items-center gap-1.5">
        <ToggleButton title="Bold" active={style.bold} onClick={() => patch({ bold: !style.bold }, true)}>
          <Bold className="h-3.5 w-3.5" />
        </ToggleButton>
        <ToggleButton title="Italic" active={style.italic} onClick={() => patch({ italic: !style.italic }, true)}>
          <Italic className="h-3.5 w-3.5" />
        </ToggleButton>
        <ToggleButton
          title="Uppercase"
          active={style.textTransform === 'uppercase'}
          onClick={() => patch({ textTransform: style.textTransform === 'uppercase' ? 'none' : 'uppercase' }, true)}
        >
          <CaseUpper className="h-3.5 w-3.5" />
        </ToggleButton>
        <ToggleButton title="Underline" active={!!style.underline} onClick={() => patch({ underline: !style.underline }, true)}>
          <Underline className="h-3.5 w-3.5" />
        </ToggleButton>
        <ToggleButton title="Strikethrough" active={!!style.strike} onClick={() => patch({ strike: !style.strike }, true)}>
          <Strikethrough className="h-3.5 w-3.5" />
        </ToggleButton>
        <div className="ml-auto flex items-center gap-0.5 rounded-lg border border-(--nc-line) p-0.5">
          {(['left', 'center', 'right'] as const).map((a) => (
            <button
              key={a}
              type="button"
              title={`Align ${a}`}
              onClick={() => patch({ align: a }, true)}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                style.align === a
                  ? 'nc-gradient text-white'
                  : 'text-muted-foreground hover:bg-(--nc-panel) hover:text-foreground'
              )}
            >
              {a === 'left' ? (
                <AlignLeft className="h-3.5 w-3.5" />
              ) : a === 'center' ? (
                <AlignCenter className="h-3.5 w-3.5" />
              ) : (
                <AlignRight className="h-3.5 w-3.5" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* colors */}
      <div className="flex gap-3">
        <ColorField label="Color" value={style.color} onChange={(v) => patch({ color: v }, 'txt-color')} />
        <ColorField
          label="Stroke"
          value={style.strokeColor}
          onChange={(v) => patch({ strokeColor: v }, 'txt-stroke-color')}
        />
      </div>
      <SliderRow
        label="Stroke"
        min={0}
        max={20}
        step={1}
        value={style.strokeWidth}
        onChange={(v) => patch({ strokeWidth: v }, 'txt-stroke')}
        format={fmtPx}
      />

      {/* shadow */}
      <div className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-[11px] text-muted-foreground">Shadow</span>
        <Switch
          checked={style.shadow}
          onCheckedChange={(on) => patch({ shadow: on }, true)}
          className="ml-auto"
        />
      </div>
      {style.shadow && (
        <>
          <SliderRow
            label="Blur"
            min={0}
            max={60}
            step={1}
            value={style.shadowBlur}
            onChange={(v) => patch({ shadowBlur: v }, 'txt-shadow')}
            format={fmtPx}
          />
          <div className="flex gap-3">
            <ColorField
              label="Shadow color"
              value={style.shadowColor}
              onChange={(hex) => {
                const cur = parseColorChannels(style.shadowColor)
                patch({ shadowColor: recolorWithAlpha(hex, cur.a) }, 'txt-shadow-color')
              }}
            />
            <div className="min-w-0 flex-1">
              <SliderRow
                label="Shadow opacity"
                min={0}
                max={1}
                step={0.05}
                value={parseColorChannels(style.shadowColor).a}
                onChange={(v) => {
                  const cur = parseColorChannels(style.shadowColor)
                  patch({ shadowColor: `rgba(${cur.r},${cur.g},${cur.b},${Math.round(v * 100) / 100})` }, 'txt-shadow-alpha')
                }}
                format={fmtPct}
              />
            </div>
          </div>
          <SliderRow
            label="Distance"
            min={0}
            max={40}
            step={1}
            value={style.shadowDistance ?? 2}
            onChange={(v) => patch({ shadowDistance: v }, 'txt-shadow-dist')}
            format={fmtPx}
          />
          <SliderRow
            label="Angle"
            min={0}
            max={360}
            step={5}
            value={style.shadowAngle ?? 90}
            onChange={(v) => patch({ shadowAngle: v }, 'txt-shadow-ang')}
            format={fmtDeg}
          />
        </>
      )}

      {/* background plate */}
      <div className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-[11px] text-muted-foreground">BG plate</span>
        <Switch
          checked={style.background !== null}
          onCheckedChange={(on) => patch({ background: on ? '#000000' : null }, true)}
          className="ml-auto"
        />
      </div>
      {style.background !== null && (
        <>
          <ColorField
            label="BG color"
            value={style.background}
            onChange={(v) => patch({ background: v }, 'txt-bg')}
          />
          <SliderRow
            label="Padding"
            min={0}
            max={40}
            step={1}
            value={style.backgroundPadding}
            onChange={(v) => patch({ backgroundPadding: v }, 'txt-pad')}
            format={fmtPx}
          />
        </>
      )}

      <SliderRow
        label="Spacing"
        min={0}
        max={30}
        step={1}
        value={style.letterSpacing}
        onChange={(v) => patch({ letterSpacing: v }, 'txt-spacing')}
        format={fmtPx}
      />
      <SliderRow
        label="Leading"
        min={0.8}
        max={2}
        step={0.05}
        value={style.lineHeight}
        onChange={(v) => patch({ lineHeight: v }, 'txt-lh')}
        format={fmtNum}
      />

      <SelectRow
        label="Anim"
        value={style.animation}
        onChange={(v) => patch({ animation: v as TextAnimation }, true)}
      >
        {TEXT_ANIMATION_GROUPS.map((group) => (
          <SelectGroup key={group.label}>
            <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {group.label}
            </SelectLabel>
            {group.items.map((a) => (
              <SelectItem key={a.value} value={a.value} className="text-xs">
                {a.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectRow>
      <SliderRow
        label="Speed"
        min={0.1}
        max={2}
        step={0.05}
        value={style.animationDuration}
        onChange={(v) => patch({ animationDuration: v }, 'txt-adur')}
        format={fmtSec}
      />
    </Section>
  )
}

function StickerSection({ clip }: { clip: Clip }) {
  const updateClip = useEditor((s) => s.updateClip)
  const style = clip.sticker as StickerStyle
  const family = style.family ?? 'emoji'

  const patch = (p: Partial<StickerStyle>, history: boolean | string) =>
    updateClip(clip.id, { sticker: p }, history)

  return (
    <Section title="Sticker" icon={Sticker}>
      <SliderRow
        label="Size"
        min={40}
        max={400}
        step={1}
        value={style.size}
        onChange={(v) => patch({ size: v }, 'stk-size')}
        format={fmtPx}
      />
      <SelectRow
        label="Anim"
        value={style.animation}
        onChange={(v) => patch({ animation: v as StickerAnimation }, true)}
      >
        {STICKER_ANIMATIONS.map((a) => (
          <SelectItem key={a.value} value={a.value} className="text-xs">
            {a.label}
          </SelectItem>
        ))}
      </SelectRow>

      {/* fill / outline — procedural families only */}
      {family !== 'emoji' && (
        <>
          <div className="flex items-end gap-3">
            <ColorField label="Fill" value={style.fill ?? '#f97316'} onChange={(v) => patch({ fill: v }, 'stk-fill')} />
            <ColorField label="Outline" value={style.stroke ?? '#ffffff'} onChange={(v) => patch({ stroke: v }, 'stk-stroke')} />
          </div>
          <SliderRow
            label="Outline W"
            min={0}
            max={24}
            step={1}
            value={style.strokeWidth ?? 0}
            onChange={(v) => patch({ strokeWidth: v }, 'stk-sw')}
            format={fmtPx}
          />
        </>
      )}
    </Section>
  )
}

/* ================================================================ pro sections (v2) */

type KeyframePropMeta = (typeof KEYFRAME_PROPERTIES)[number]

/** Collapsible section shell matching the static `Section` styling */
function CollapsibleSection({
  title,
  icon: Icon,
  open,
  onOpenChange,
  onReset,
  hint,
  sectionId,
  children,
}: {
  title: string
  icon: LucideIcon
  open: boolean
  onOpenChange: (open: boolean) => void
  onReset?: () => void
  hint?: string
  /** deep-link target for Pro Toolkit `open-properties-*` actions */
  sectionId?: PropsSectionId
  children: ReactNode
}) {
  const ref = usePropsSectionFocus(sectionId, () => onOpenChange(true))
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <section ref={ref} className="rounded-xl border border-(--nc-line) bg-(--nc-panel-soft)">
        <div className="flex items-center gap-1.5 px-3 py-2.5">
          <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
            <Icon className="h-[13px] w-[13px] shrink-0 text-muted-foreground" />
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
            <ChevronDown
              className={cn(
                'ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
                open && 'rotate-180'
              )}
            />
          </CollapsibleTrigger>
          {onReset && (
            <button
              type="button"
              title={`Reset ${title.toLowerCase()}`}
              onClick={onReset}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-(--nc-panel) hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
        </div>
        <CollapsibleContent>
          <div className="space-y-3 px-3 pb-3">
            {hint && <p className="text-[10px] leading-snug text-muted-foreground/60">{hint}</p>}
            {children}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  )
}

function KeyframeRow({
  clipId,
  kf,
  meta,
  fps,
}: {
  clipId: string
  kf: Keyframe
  meta: KeyframePropMeta
  fps: number
}) {
  const updateKeyframe = useEditor((s) => s.updateKeyframe)
  const removeKeyframe = useEditor((s) => s.removeKeyframe)
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-16 shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
        {formatTimecode(kf.time, fps)}
      </span>
      <Input
        type="number"
        aria-label={`${meta.label} key value`}
        min={meta.min}
        max={meta.max}
        step={meta.step}
        value={kf.value}
        onChange={(e) => {
          const raw = e.target.value
          if (raw === '') return
          const v = Number(raw)
          if (!Number.isFinite(v)) return
          updateKeyframe(clipId, kf.id, { value: clamp(v, meta.min, meta.max) }, `kf-val-${kf.id}`)
        }}
        className="h-7 w-16 shrink-0 border-(--nc-line) bg-(--nc-panel) px-2 font-mono text-[11px] tabular-nums"
      />
      {meta.unit && <span className="-ml-1 shrink-0 text-[9px] text-muted-foreground">{meta.unit}</span>}
      <Select
        value={kf.easing}
        onValueChange={(v) => updateKeyframe(clipId, kf.id, { easing: v as EasingType }, true)}
      >
        <SelectTrigger size="sm" className="h-7 min-w-0 flex-1 text-[11px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {EASING_OPTIONS.map((o) => (
            <SelectItem key={o.id} value={o.id} className="text-[11px]">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button
        type="button"
        title="Delete keyframe"
        onClick={() => removeKeyframe(clipId, kf.id)}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-300"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

function KeyframePropertyCard({
  clip,
  meta,
  fps,
}: {
  clip: Clip
  meta: KeyframePropMeta
  fps: number
}) {
  const addKeyframeAtPlayhead = useEditor((s) => s.addKeyframeAtPlayhead)
  const keys = useMemo(
    () => (clip.keyframes ?? []).filter((k) => k.property === meta.id).sort((a, b) => a.time - b.time),
    [clip.keyframes, meta.id]
  )
  return (
    <div className="space-y-1.5 rounded-lg border border-(--nc-line) bg-(--nc-panel-soft) p-2">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-medium text-foreground/80">{meta.label}</span>
        {keys.length > 0 && (
          <Badge variant="outline" className="h-4 rounded px-1 text-[9px] tabular-nums text-muted-foreground">
            {keys.length}
          </Badge>
        )}
        <button
          type="button"
          title={`Add ${meta.label} key at playhead`}
          onClick={() => addKeyframeAtPlayhead(clip.id, meta.id)}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-md border border-(--nc-line) text-muted-foreground transition-colors hover:border-fuchsia-400/40 hover:text-fuchsia-300"
        >
          <DiamondPlus className="h-3.5 w-3.5" />
        </button>
      </div>
      {keys.length > 0 && (
        <p className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-fuchsia-300/80">
          <Diamond className="h-2.5 w-2.5 fill-current" />
          Animated by keyframes
        </p>
      )}
      {keys.map((kf) => (
        <KeyframeRow key={kf.id} clipId={clip.id} kf={kf} meta={meta} fps={fps} />
      ))}
    </div>
  )
}

function AnimationSection({ clip, fps }: { clip: Clip; fps: number }) {
  const [openOverride, setOpenOverride] = useState<boolean | null>(null)
  const hasKeys = (clip.keyframes ?? []).length > 0
  const open = openOverride ?? hasKeys
  const props = KEYFRAME_PROPERTIES.filter(
    (p) => p.id !== 'volume' || clip.kind === 'video' || clip.kind === 'audio'
  )
  return (
    <CollapsibleSection
      title="Animation"
      icon={SlidersHorizontal}
      open={open}
      onOpenChange={setOpenOverride}
      sectionId="animation"
      hint="Move the playhead and add keys — values animate between keys with your chosen easing."
    >
      {hasKeys && <KeyframeCurveEditor clip={clip} fps={fps} />}
      {props.map((p) => (
        <KeyframePropertyCard key={p.id} clip={clip} meta={p} fps={fps} />
      ))}
    </CollapsibleSection>
  )
}

function BlendSection({ clip }: { clip: Clip }) {
  const updateClip = useEditor((s) => s.updateClip)
  const [open, setOpen] = useState(false)
  return (
    <CollapsibleSection title="Blend Mode" icon={Blend} open={open} onOpenChange={setOpen}>
      <SelectRow
        label="Mode"
        value={clip.blendMode ?? 'source-over'}
        onChange={(v) => updateClip(clip.id, { blendMode: v as BlendMode }, `blend-${clip.id}`)}
      >
        {BLEND_MODES.map((b) => (
          <SelectItem key={b.id} value={b.id} className="text-xs">
            {b.label}
          </SelectItem>
        ))}
      </SelectRow>
      <p className="text-[10px] leading-snug text-muted-foreground/60">
        How this clip composites over the layers beneath it.
      </p>
    </CollapsibleSection>
  )
}

function ChromaSection({ clip }: { clip: Clip }) {
  const updateClip = useEditor((s) => s.updateClip)
  const [open, setOpen] = useState(false)
  const ck = clip.chromaKey ?? DEFAULT_CHROMA_KEY
  const patch = (p: Partial<ChromaKey>) => updateClip(clip.id, { chromaKey: p }, `chroma-${clip.id}`)
  return (
    <CollapsibleSection
      title="Green Screen"
      icon={Pipette}
      open={open}
      onOpenChange={setOpen}
      hint="Film your subject against a solid green/blue screen, enable this, pick the screen color."
    >
      <div className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-[11px] text-muted-foreground">Enable</span>
        <span className="flex-1 text-[10px] text-muted-foreground/70">key out the backdrop</span>
        <Switch checked={ck.enabled} onCheckedChange={(on) => patch({ enabled: on })} />
      </div>
      {ck.enabled && (
        <>
          <ColorField label="Key color" value={ck.color} onChange={(v) => patch({ color: v })} />
          <SliderRow
            label="Similar"
            min={0}
            max={1}
            step={0.01}
            value={ck.similarity}
            onChange={(v) => patch({ similarity: v })}
            format={fmtPct}
          />
          <SliderRow
            label="Smooth"
            min={0}
            max={1}
            step={0.01}
            value={ck.smoothness}
            onChange={(v) => patch({ smoothness: v })}
            format={fmtPct}
          />
        </>
      )}
    </CollapsibleSection>
  )
}

function GradeSection({ clip }: { clip: Clip }) {
  const updateClip = useEditor((s) => s.updateClip)
  const [open, setOpen] = useState(false)
  const g = clip.colorGrade ?? DEFAULT_COLOR_GRADE
  const patch = (p: Partial<ColorGrade>) => updateClip(clip.id, { colorGrade: p }, `grade-${clip.id}`)
  const isDefault =
    g.temperature === 0 && g.tint === 0 && g.shadows === 0 && g.highlights === 0 && g.vibrance === 1
  return (
    <CollapsibleSection
      title="Color Grade"
      icon={Palette}
      open={open}
      onOpenChange={setOpen}
      sectionId="grade"
      onReset={isDefault ? undefined : () => updateClip(clip.id, { colorGrade: { ...DEFAULT_COLOR_GRADE } }, true)}
    >
      <SliderRow
        label="Temp"
        min={-1}
        max={1}
        step={0.01}
        value={g.temperature}
        onChange={(v) => patch({ temperature: v })}
        format={fmtNum}
      />
      <SliderRow
        label="Tint"
        min={-1}
        max={1}
        step={0.01}
        value={g.tint}
        onChange={(v) => patch({ tint: v })}
        format={fmtNum}
      />
      <SliderRow
        label="Shadows"
        min={-1}
        max={1}
        step={0.01}
        value={g.shadows}
        onChange={(v) => patch({ shadows: v })}
        format={fmtNum}
      />
      <SliderRow
        label="Highlights"
        min={-1}
        max={1}
        step={0.01}
        value={g.highlights}
        onChange={(v) => patch({ highlights: v })}
        format={fmtNum}
      />
      <SliderRow
        label="Vibrance"
        min={0}
        max={2}
        step={0.01}
        value={g.vibrance}
        onChange={(v) => patch({ vibrance: v })}
        format={fmtNum}
      />
    </CollapsibleSection>
  )
}

function LutSection({ clip }: { clip: Clip }) {
  const updateClip = useEditor((s) => s.updateClip)
  const media = useEditor((s) => s.media)
  const [open, setOpen] = useState(false)
  const luts = useMemo(() => media.filter((m) => m.kind === 'lut'), [media])
  return (
    <CollapsibleSection title="LUT" icon={Sparkles} open={open} onOpenChange={setOpen} sectionId="lut">
      {luts.length === 0 ? (
        <p className="text-[10px] leading-snug text-muted-foreground/60">
          No LUTs yet — import a .cube file from the Media panel.
        </p>
      ) : (
        <>
          <SelectRow
            label="LUT"
            value={clip.lutId ?? 'none'}
            onChange={(v) => updateClip(clip.id, { lutId: v === 'none' ? null : v }, true)}
          >
            <SelectItem value="none" className="text-xs">
              None
            </SelectItem>
            {luts.map((l) => (
              <SelectItem key={l.id} value={l.id} className="text-xs">
                {l.name}
              </SelectItem>
            ))}
          </SelectRow>
          {clip.lutId && (
            <SliderRow
              label="Mix"
              min={0}
              max={1}
              step={0.01}
              value={clip.lutIntensity ?? 1}
              onChange={(v) => updateClip(clip.id, { lutIntensity: v }, `lut-int-${clip.id}`)}
              format={fmtPct}
            />
          )}
        </>
      )}
    </CollapsibleSection>
  )
}

/* ================================================================ scopes */

/**
 * Scopes — live RGB histogram of the playhead frame. Samples the preview
 * canvas through the engine (post-composite pixels: filters, grade, LUT and
 * chroma all included) and redraws throttled while the playhead moves.
 */
function ScopesSection() {
  const [open, setOpen] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const currentTime = useEditor((s) => s.currentTime)
  const lastDrawRef = useRef(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const pixels = getEngine().sampleFrame(128)
    if (!pixels) return
    const hist = computeHistogram(pixels)
    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.fillRect(0, 0, w, h)
    // quarter grid
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    for (let gx = 1; gx < 4; gx++) {
      ctx.beginPath()
      ctx.moveTo((gx / 4) * w, 0)
      ctx.lineTo((gx / 4) * w, h)
      ctx.stroke()
    }
    let max = 1
    for (const ch of [hist.r, hist.g, hist.b]) for (const v of ch) if (v > max) max = v
    ctx.globalCompositeOperation = 'screen'
    const channels: [number[], string][] = [
      [hist.r, '#fb7185'],
      [hist.g, '#4ade80'],
      [hist.b, '#38bdf8'],
    ]
    for (const [data, color] of channels) {
      ctx.beginPath()
      ctx.moveTo(0, h)
      for (let x = 0; x < 256; x++) {
        ctx.lineTo((x / 255) * w, h - (data[x] / max) * (h - 2))
      }
      ctx.lineTo(w, h)
      ctx.closePath()
      ctx.globalAlpha = 0.72
      ctx.fillStyle = color
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
  }, [])

  // redraw when the frame changes — throttled so playback stays smooth
  useEffect(() => {
    if (!open) return
    const now = performance.now()
    if (now - lastDrawRef.current < 160) return
    lastDrawRef.current = now
    draw()
  }, [open, currentTime, draw])

  return (
    <CollapsibleSection
      title="Scopes"
      icon={Activity}
      open={open}
      onOpenChange={setOpen}
      sectionId="scopes"
      hint="Read the tonal balance before grading — spikes at the edges mean crushed blacks or blown highlights."
    >
      <canvas
        ref={canvasRef}
        width={256}
        height={72}
        aria-label="RGB histogram of the playhead frame"
        role="img"
        className="w-full rounded-lg border border-(--nc-line)"
      />
      <p className="text-[10px] leading-snug text-muted-foreground/60">
        Red · green · blue histogram of the composite frame — updates with the playhead.
      </p>
    </CollapsibleSection>
  )
}

/* ================================================================ crop */

const CROP_MAX = 0.45
const r3 = (v: number) => Math.round(v * 1000) / 1000

/* ================================================================ audio FX */

/** One-tap audio FX recipes — each is a partial ClipAudioFx patch. */
const AUDIO_FX_PRESETS: { id: string; label: string; patch: Partial<ClipAudioFx> }[] = [
  { id: 'clarity', label: 'Dialogue Clarity', patch: { highPass: 90, eqMid: 3, eqHigh: 2, compressor: true, compAmount: 0.45 } },
  { id: 'telephone', label: 'Telephone', patch: { highPass: 500, lowPass: 2800, compressor: true, compAmount: 0.5 } },
  { id: 'radio', label: 'Radio Lo-Fi', patch: { highPass: 800, lowPass: 3400, eqMid: 6 } },
  { id: 'warm', label: 'Warm Tape', patch: { eqLow: 4, eqHigh: -3 } },
  { id: 'bright', label: 'Bright Air', patch: { eqHigh: 5, eqMid: -2 } },
  { id: 'underwater', label: 'Underwater', patch: { lowPass: 600, reverbMix: 0.35, reverbSize: 0.7 } },
  { id: 'stadium', label: 'Stadium Reverb', patch: { reverbMix: 0.55, reverbSize: 0.85, eqHigh: -4 } },
  { id: 'slapback', label: 'Slapback Echo', patch: { delayMix: 0.45, delayTime: 0.28, delayFeedback: 0.25 } },
  { id: 'hallecho', label: 'Hall Echo', patch: { delayMix: 0.4, delayTime: 0.45, delayFeedback: 0.5, reverbMix: 0.3 } },
  { id: 'chorus', label: 'Chorus Thick', patch: { modKind: 'chorus', modAmount: 0.6 } },
  { id: 'flanger', label: 'Jet Flanger', patch: { modKind: 'flanger', modAmount: 0.7 } },
  { id: 'panl', label: 'Pan Left', patch: { pan: -0.75 } },
  { id: 'panr', label: 'Pan Right', patch: { pan: 0.75 } },
]

/**
 * Per-clip audio FX chain — pan, 3-band EQ, high/low-pass filters, compressor,
 * reverb, delay and modulation (chorus/flanger/phaser). The engine builds the
 * matching WebAudio nodes for preview AND export.
 */
function AudioFxSection({ clip }: { clip: Clip }) {
  const updateClip = useEditor((s) => s.updateClip)
  const fx: Partial<ClipAudioFx> = clip.audioFx ?? {}

  const patch = (p: Partial<ClipAudioFx>, history: boolean | string = 'audio-fx') =>
    updateClip(clip.id, { audioFx: p as ClipAudioFx }, history)

  const applyPreset = (p: Partial<ClipAudioFx>) => {
    // presets start from a clean slate so toggles (e.g. compressor off) reset too
    updateClip(clip.id, { audioFx: { ...p } as ClipAudioFx }, true)
    toast.success(`Audio FX preset applied`)
  }

  const pan = fx.pan ?? 0
  const hasFx = !!clip.audioFx && Object.values(clip.audioFx).some((v) => v !== undefined && v !== 0 && v !== 'none' && v !== false)

  return (
    <Section
      title="Audio FX"
      icon={AudioLines}
      onReset={clip.audioFx ? () => updateClip(clip.id, { audioFx: null }, true) : undefined}
    >
      {!hasFx && (
        <p className="text-[10px] leading-snug text-muted-foreground/60">
          Pan, EQ, filters, compressor, reverb, echo and modulation for this clip&apos;s sound — heard in preview and baked into exports.
        </p>
      )}

      {/* presets */}
      <div className="flex flex-wrap gap-1.5">
        {AUDIO_FX_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => applyPreset(p.patch)}
            className="rounded-full border border-(--nc-line) bg-(--nc-panel) px-2.5 py-1 text-[10px] text-muted-foreground transition hover:border-emerald-400/50 hover:text-foreground"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* pan */}
      <SliderRow
        label="Pan"
        min={-1}
        max={1}
        step={0.05}
        value={pan}
        onChange={(v) => patch({ pan: v })}
        format={(v) => (Math.abs(v) < 0.02 ? 'Center' : v < 0 ? `L ${Math.round(-v * 100)}` : `R ${Math.round(v * 100)}`)}
      />

      {/* 3-band EQ */}
      <SliderRow label="EQ Low" min={-24} max={24} step={1} value={fx.eqLow ?? 0} onChange={(v) => patch({ eqLow: v })} format={fmtDb} />
      <SliderRow label="EQ Mid" min={-24} max={24} step={1} value={fx.eqMid ?? 0} onChange={(v) => patch({ eqMid: v })} format={fmtDb} />
      <SliderRow label="EQ High" min={-24} max={24} step={1} value={fx.eqHigh ?? 0} onChange={(v) => patch({ eqHigh: v })} format={fmtDb} />

      {/* filters */}
      <SliderRow
        label="Cut Low"
        min={0}
        max={800}
        step={10}
        value={fx.highPass ?? 0}
        onChange={(v) => patch({ highPass: v })}
        format={(v) => (v > 20 ? fmtHz(v) : 'Off')}
      />
      <SliderRow
        label="Cut High"
        min={0}
        max={18000}
        step={100}
        value={fx.lowPass ?? 0}
        onChange={(v) => patch({ lowPass: v })}
        format={(v) => (v > 0 ? fmtHz(v) : 'Off')}
      />

      {/* compressor */}
      <div className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-[11px] text-muted-foreground">Comp</span>
        <span className="flex-1 text-[10px] text-muted-foreground/60">even out loud/quiet parts</span>
        <Switch checked={!!fx.compressor} onCheckedChange={(on) => patch({ compressor: on }, true)} aria-label="Compressor" />
      </div>
      {fx.compressor && (
        <SliderRow
          label="Amount"
          min={0}
          max={1}
          step={0.05}
          value={fx.compAmount ?? 0.5}
          onChange={(v) => patch({ compAmount: v })}
          format={fmtPct}
        />
      )}

      {/* reverb */}
      <SliderRow
        label="Reverb"
        min={0}
        max={1}
        step={0.05}
        value={fx.reverbMix ?? 0}
        onChange={(v) => patch({ reverbMix: v })}
        format={fmtPct}
      />
      {(fx.reverbMix ?? 0) > 0.001 && (
        <SliderRow
          label="Room"
          min={0.2}
          max={1}
          step={0.05}
          value={fx.reverbSize ?? 0.6}
          onChange={(v) => patch({ reverbSize: v })}
          format={(v) => (v < 0.4 ? 'Room' : v < 0.7 ? 'Hall' : 'Stadium')}
        />
      )}

      {/* delay */}
      <SliderRow
        label="Echo"
        min={0}
        max={1}
        step={0.05}
        value={fx.delayMix ?? 0}
        onChange={(v) => patch({ delayMix: v })}
        format={fmtPct}
      />
      {(fx.delayMix ?? 0) > 0.001 && (
        <>
          <SliderRow label="Time" min={0.05} max={0.9} step={0.01} value={fx.delayTime ?? 0.25} onChange={(v) => patch({ delayTime: v })} format={fmtSec} />
          <SliderRow label="Repeat" min={0} max={0.85} step={0.05} value={fx.delayFeedback ?? 0.3} onChange={(v) => patch({ delayFeedback: v })} format={fmtPct} />
        </>
      )}

      {/* modulation */}
      <SelectRow
        label="Modulate"
        value={fx.modKind ?? 'none'}
        onChange={(v) => patch({ modKind: v as ClipAudioFx['modKind'] }, true)}
      >
        <SelectItem value="none" className="text-[11px]">None</SelectItem>
        <SelectItem value="chorus" className="text-[11px]">Chorus — thicker</SelectItem>
        <SelectItem value="flanger" className="text-[11px]">Flanger — jet sweep</SelectItem>
        <SelectItem value="phaser" className="text-[11px]">Phaser — swoosh</SelectItem>
      </SelectRow>
      {fx.modKind && fx.modKind !== 'none' && (
        <SliderRow
          label="Depth"
          min={0}
          max={1}
          step={0.05}
          value={fx.modAmount ?? 0.5}
          onChange={(v) => patch({ modAmount: v })}
          format={fmtPct}
        />
      )}
    </Section>
  )
}

function CropSection({ clip }: { clip: Clip }) {
  const project = useEditor((s) => s.project)
  const media = useEditor((s) => s.media)
  const updateClip = useEditor((s) => s.updateClip)
  const asset = media.find((m) => m.id === clip.mediaId)

  const crop = clip.crop ?? { x: 0, y: 0, width: 1, height: 1 }
  const insetL = clamp(crop.x, 0, CROP_MAX)
  const insetT = clamp(crop.y, 0, CROP_MAX)
  const insetR = clamp(1 - (crop.x + crop.width), 0, CROP_MAX)
  const insetB = clamp(1 - (crop.y + crop.height), 0, CROP_MAX)
  const hasCrop = !!clip.crop

  const setInsets = (next: { l: number; r: number; t: number; b: number }) => {
    const l = clamp(next.l, 0, CROP_MAX)
    const r = clamp(next.r, 0, Math.min(CROP_MAX, 0.9 - l))
    const t = clamp(next.t, 0, CROP_MAX)
    const b = clamp(next.b, 0, Math.min(CROP_MAX, 0.9 - t))
    updateClip(clip.id, { crop: { x: r3(l), y: r3(t), width: r3(1 - l - r), height: r3(1 - t - b) } }, 'crop')
  }

  const applyRatio = (rw: number, rh: number) => {
    const srcW = asset?.width || project.canvasWidth
    const srcH = asset?.height || project.canvasHeight
    const srcRatio = srcW / srcH
    const target = rw / rh
    let w = 1
    let h = 1
    if (srcRatio > target) w = target / srcRatio
    else h = srcRatio / target
    updateClip(clip.id, { crop: { x: r3((1 - w) / 2), y: r3((1 - h) / 2), width: r3(w), height: r3(h) } }, true)
  }

  return (
    <Section title="Crop" icon={Crop} onReset={hasCrop ? () => updateClip(clip.id, { crop: null }, true) : undefined}>
      <p className="text-[10px] leading-snug text-muted-foreground/60">
        Trim frame edges without moving the picture. Presets crop to a centered aspect ratio.
      </p>
      <SliderRow
        label="Left"
        min={0}
        max={CROP_MAX}
        step={0.01}
        value={insetL}
        onChange={(v) => setInsets({ l: v, r: insetR, t: insetT, b: insetB })}
        format={fmtPct}
      />
      <SliderRow
        label="Right"
        min={0}
        max={CROP_MAX}
        step={0.01}
        value={insetR}
        onChange={(v) => setInsets({ l: insetL, r: v, t: insetT, b: insetB })}
        format={fmtPct}
      />
      <SliderRow
        label="Top"
        min={0}
        max={CROP_MAX}
        step={0.01}
        value={insetT}
        onChange={(v) => setInsets({ l: insetL, r: insetR, t: v, b: insetB })}
        format={fmtPct}
      />
      <SliderRow
        label="Bottom"
        min={0}
        max={CROP_MAX}
        step={0.01}
        value={insetB}
        onChange={(v) => setInsets({ l: insetL, r: insetR, t: insetT, b: v })}
        format={fmtPct}
      />
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => applyRatio(project.canvasWidth, project.canvasHeight)}>
          Fill frame
        </Button>
        <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => applyRatio(1, 1)}>
          1:1
        </Button>
        <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => applyRatio(4, 5)}>
          4:5
        </Button>
        <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => applyRatio(9, 16)}>
          9:16
        </Button>
        <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => applyRatio(16, 9)}>
          16:9
        </Button>
      </div>
    </Section>
  )
}

/* ================================================================ single clip editor */

/** Inspector for compound (nested) clips — enter / ungroup, contents list */
function NestedClipPanel({ clip }: { clip: Clip }) {
  const children = clip.nested?.children ?? []
  const span = children.reduce((m, c) => Math.max(m, c.start + c.duration), 0)

  return (
    <section
      data-nc-compound-panel
      className="space-y-3 rounded-xl border border-violet-400/30 bg-violet-950/20 p-3"
    >
      <div className="flex items-center gap-1.5">
        <Layers className="h-[13px] w-[13px] text-violet-300" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-violet-200/80">Compound clip</h3>
        <span className="ml-auto rounded-full bg-violet-400/20 px-1.5 text-[9px] font-semibold leading-[14px] text-violet-200">
          ⧉ {children.length}
        </span>
      </div>

      <div className="space-y-1.5 text-[11px] text-muted-foreground">
        <div className="flex justify-between gap-2">
          <span>Duration</span>
          <span className="font-mono text-foreground">{formatTimecode(clip.duration, 30)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>Start</span>
          <span className="font-mono text-foreground">{formatTimecode(clip.start, 30)}</span>
        </div>
      </div>

      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">Contents</p>
        <ul className="max-h-40 space-y-1 overflow-y-auto pr-1">
          {children.map((c) => (
            <li key={c.id} className="flex items-center gap-1.5 rounded-md bg-(--nc-panel) px-2 py-1 text-[11px]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
              <span className="min-w-0 flex-1 truncate text-foreground/90">{c.name}</span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{c.duration.toFixed(2)}s</span>
            </li>
          ))}
          {children.length === 0 && <li className="px-2 py-1 text-[11px] text-muted-foreground">Empty compound</li>}
        </ul>
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          data-nc-open-compound
          className="h-8 flex-1 gap-1.5 bg-violet-600 text-[11px] hover:bg-violet-500"
          onClick={() => {
            if (useEditor.getState().enterNestedClip(clip.id)) {
              toast.success(`Entered ${clip.name} — edits apply to its contents`)
            } else {
              toast('Exit the current compound first')
            }
          }}
        >
          <Layers className="size-3.5" />
          Open compound
        </Button>
        <Button
          size="sm"
          variant="outline"
          data-nc-ungroup
          className="h-8 flex-1 gap-1.5 text-[11px]"
          onClick={() => {
            if (useEditor.getState().ungroupSelectedClip()) toast.success('Compound dissolved back to clips')
          }}
        >
          <X className="size-3.5" />
          Ungroup
        </Button>
      </div>

      <p className="text-[10px] leading-snug text-muted-foreground/60">
        A compound is one timeline block that plays its {children.length} clip{children.length === 1 ? '' : 's'} ({span.toFixed(2)}s of content).
        Transform, filters and FX are applied inside — open the compound to edit them.
      </p>
    </section>
  )
}

function SingleClipEditor({ clip }: { clip: Clip }) {
  const project = useEditor((s) => s.project)
  const media = useEditor((s) => s.media)
  const updateClip = useEditor((s) => s.updateClip)
  const replaceClipMedia = useEditor((s) => s.replaceClipMedia)
  const insertFreezeFrame = useEditor((s) => s.insertFreezeFrame)
  const extractAudioFromVideo = useEditor((s) => s.extractAudioFromVideo)
  const currentTime = useEditor((s) => s.currentTime)
  const addKeyframeAtPlayhead = useEditor((s) => s.addKeyframeAtPlayhead)
  const removeKeyframe = useEditor((s) => s.removeKeyframe)

  // compounds get their own inspector — transform/FX belong to their contents
  if (clip.kind === 'nested') return <NestedClipPanel clip={clip} />

  const meta = KIND_META[clip.kind]
  const KindIcon = meta.icon
  const isVisual = clip.kind !== 'audio'

  const patchTransform = (key: 'x' | 'y' | 'scale' | 'rotation' | 'opacity', v: number) => {
    const patch: Partial<Transform> = {}
    patch[key] = v
    updateClip(clip.id, { transform: patch }, `prop-${key}`)
  }

  /* --- one-click keyframing from the Transform sliders (Sector 9) --- */
  const keyAtPlayhead = (prop: KeyframeProperty): Keyframe | undefined => {
    const eps = 0.5 / (project.fps || 30) + 0.001
    return (clip.keyframes ?? []).find((k) => k.property === prop && Math.abs(k.time - currentTime) <= eps)
  }

  const toggleKeyframe = (prop: KeyframeProperty) => {
    const existing = keyAtPlayhead(prop)
    if (existing) {
      removeKeyframe(clip.id, existing.id)
      toast('Keyframe removed')
    } else {
      addKeyframeAtPlayhead(clip.id, prop)
      toast.success(`Keyframed ${KEYFRAME_PROPERTIES.find((p) => p.id === prop)?.label ?? prop} at playhead`)
    }
  }

  const kfDiamond = (prop: KeyframeProperty) => {
    const kf = keyAtPlayhead(prop)
    const anyKeys = (clip.keyframes ?? []).some((k) => k.property === prop)
    return (
      <button
        type="button"
        title={kf ? 'Remove keyframe at playhead' : anyKeys ? 'Add keyframe at playhead' : 'Keyframe this property at the playhead'}
        aria-label={kf ? `Remove ${prop} keyframe at playhead` : `Add ${prop} keyframe at playhead`}
        aria-pressed={!!kf}
        onClick={() => toggleKeyframe(prop)}
        className={cn(
          'shrink-0 rounded p-0.5 transition-colors',
          kf ? 'text-amber-400' : anyKeys ? 'text-muted-foreground/70 hover:text-foreground' : 'text-muted-foreground/40 hover:text-foreground',
        )}
      >
        <Diamond className={cn('size-3', kf && 'fill-current')} />
      </button>
    )
  }

  const nudgeRotation = (delta: number) => {
    let r = clip.transform.rotation + delta
    if (r > 180) r -= 360
    if (r < -180) r += 360
    updateClip(clip.id, { transform: { rotation: r } }, 'rotation')
  }

  const patchFilter = (key: keyof Filters, v: number) => {
    const patch: Partial<Filters> = {}
    patch[key] = v
    updateClip(clip.id, { filters: patch }, `flt-${key}`)
  }

  const changeSpeed = (newSpeed: number) => {
    // speed changes must keep the source span: duration ∝ 1/speed
    updateClip(
      clip.id,
      { speed: newSpeed, duration: Math.max(0.1, (clip.duration * clip.speed) / newSpeed) },
      'speed'
    )
  }

  return (
    <>
      {/* clip header card */}
      <div className="nc-glass flex items-center gap-2.5 rounded-xl p-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${clip.color}22` }}
        >
          <KindIcon className="h-4 w-4" style={{ color: clip.color }} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{clip.name}</p>
          <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: clip.color }} />
            {meta.label}
          </p>
        </div>
        <span className="shrink-0 rounded-md border border-(--nc-line) bg-(--nc-panel) px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
          {formatTimecode(clip.duration, project.fps)}
        </span>
      </div>

      {/* transform — visual kinds */}
      {isVisual && (
        <Section
          title="Transform"
          icon={Move}
          onReset={() =>
            updateClip(clip.id, { transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, flipX: false, flipY: false } }, true)
          }
        >
          <SliderRow
            label="X"
            min={-1}
            max={1}
            step={0.01}
            value={clip.transform.x}
            onChange={(v) => patchTransform('x', v)}
            format={fmtNum}
            accessory={kfDiamond('x')}
          />
          <SliderRow
            label="Y"
            min={-1}
            max={1}
            step={0.01}
            value={clip.transform.y}
            onChange={(v) => patchTransform('y', v)}
            format={fmtNum}
            accessory={kfDiamond('y')}
          />
          <SliderRow
            label="Scale"
            min={0.05}
            max={3}
            step={0.01}
            value={clip.transform.scale}
            onChange={(v) => patchTransform('scale', v)}
            format={fmtX}
            accessory={kfDiamond('scale')}
          />
          <SliderRow
            label="Rotate"
            min={-180}
            max={180}
            step={1}
            value={clip.transform.rotation}
            onChange={(v) => patchTransform('rotation', v)}
            format={fmtDeg}
            accessory={kfDiamond('rotation')}
          />
          <SliderRow
            label="Opacity"
            min={0}
            max={1}
            step={0.01}
            value={clip.transform.opacity}
            onChange={(v) => patchTransform('opacity', v)}
            format={fmtPct}
            accessory={kfDiamond('opacity')}
          />

          {/* quick mirror + 90° rotate actions */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 flex-1 gap-1 px-1.5 text-[11px]"
              onClick={() => nudgeRotation(-90)}
              title="Rotate 90° counter-clockwise"
            >
              <RotateCcw className="h-3 w-3" /> −90°
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 flex-1 gap-1 px-1.5 text-[11px]"
              onClick={() => nudgeRotation(90)}
              title="Rotate 90° clockwise"
            >
              <RotateCw className="h-3 w-3" /> +90°
            </Button>
            <Button
              variant={clip.transform.flipX ? 'default' : 'outline'}
              size="sm"
              className="h-7 flex-1 gap-1 px-1.5 text-[11px]"
              onClick={() => updateClip(clip.id, { transform: { flipX: !clip.transform.flipX } }, true)}
              aria-pressed={!!clip.transform.flipX}
              title="Mirror horizontally"
            >
              <FlipHorizontal2 className="h-3 w-3" /> Flip H
            </Button>
            <Button
              variant={clip.transform.flipY ? 'default' : 'outline'}
              size="sm"
              className="h-7 flex-1 gap-1 px-1.5 text-[11px]"
              onClick={() => updateClip(clip.id, { transform: { flipY: !clip.transform.flipY } }, true)}
              aria-pressed={!!clip.transform.flipY}
              title="Mirror vertically"
            >
              <FlipVertical2 className="h-3 w-3" /> Flip V
            </Button>
          </div>

          {/* keyframe legend — the diamonds next to X/Y/Scale/Rotate/Opacity */}
          <p className="flex items-center gap-1 text-[10px] leading-snug text-muted-foreground/60">
            <Diamond className="size-2.5 fill-current text-amber-400" />
            tap a diamond to key that property at the playhead — values animate between keys (Animation section below)
          </p>

          {/* fit mode — how the source fills the canvas (video / image) */}
          {(clip.kind === 'video' || clip.kind === 'image') && (
            <div className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[11px] text-muted-foreground">Fit</span>
              <Select
                value={clip.fit ?? 'cover'}
                onValueChange={(v) => updateClip(clip.id, { fit: v as ClipFit }, true)}
              >
                <SelectTrigger className="h-7 flex-1 text-[11px]" aria-label="Fit mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cover">Cover — fill &amp; crop</SelectItem>
                  <SelectItem value="contain">Contain — fit inside</SelectItem>
                  <SelectItem value="stretch">Stretch — distort</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </Section>
      )}

      {/* crop — video / image */}
      {(clip.kind === 'video' || clip.kind === 'image') && <CropSection clip={clip} />}

      {/* animation keyframes — every clip kind */}
      <AnimationSection clip={clip} fps={project.fps} />

      {/* media — video / audio */}
      {(clip.kind === 'video' || clip.kind === 'audio') && (
        <Section title="Media" icon={Gauge}>
          <SliderRow
            label="Speed"
            min={0.25}
            max={4}
            step={0.05}
            value={clip.speed}
            onChange={changeSpeed}
            format={fmtX}
          />
          <SliderRow
            label="Volume"
            min={0}
            max={1}
            step={0.01}
            value={clip.volume}
            onChange={(v) => updateClip(clip.id, { volume: v }, 'clip-vol')}
            format={fmtPct}
          />
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-[11px] text-muted-foreground">Mute</span>
            <span className="flex flex-1 items-center gap-1 text-[10px] text-muted-foreground">
              <VolumeX className="h-3 w-3" />
              silence this clip
            </span>
            <Switch
              checked={clip.muted}
              onCheckedChange={(on) => updateClip(clip.id, { muted: on }, true)}
            />
          </div>

          {/* reverse playback — video only */}
          {clip.kind === 'video' && (
            <div className="space-y-1 rounded-lg border border-(--nc-line) bg-(--nc-panel-soft) p-2">
              <div className="flex items-center gap-2">
                <span className="flex flex-1 items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Rewind className="h-3 w-3" />
                  Reverse playback
                </span>
                <Switch
                  checked={clip.reverse ?? false}
                  onCheckedChange={(on) => updateClip(clip.id, { reverse: on }, true)}
                  aria-label="Reverse playback"
                />
              </div>
              <p className="text-[10px] leading-snug text-muted-foreground/60">
                Plays backwards frame-by-frame; audio is muted while reversed.
              </p>
            </div>
          )}

          {/* freeze frame — video only */}
          {clip.kind === 'video' && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-full gap-1.5 text-[11px]"
              onClick={async () => {
                const ok = await insertFreezeFrame()
                if (ok) toast.success('Freeze frame inserted ❄️ — 3s still, clips ripple right')
                else toast('Move the playhead over a video clip first')
              }}
            >
              <Snowflake className="h-3.5 w-3.5" />
              Freeze frame at playhead
            </Button>
          )}

          {/* extract audio — detach the soundtrack into an editable audio clip */}
          {clip.kind === 'video' && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-full gap-1.5 text-[11px]"
              onClick={async () => {
                const res = await extractAudioFromVideo()
                if (res === 'ok') toast.success('Audio extracted — editable clip on the audio track, video sound muted')
                else if (res === 'no-audio') toast.error('This video has no audio track to extract')
                else toast('Could not extract audio from this clip')
              }}
            >
              <AudioLines className="h-3.5 w-3.5" />
              Extract audio to track
            </Button>
          )}

          {/* replace source — swap media keeping the timeline slot */}
          {clip.mediaId &&
            (() => {
              const compatible = media.filter((m) =>
                clip.kind === 'audio' ? m.kind === 'audio' : m.kind === 'video' || m.kind === 'image' || m.kind === 'lut'
              )
              if (compatible.length < 1) return null
              return (
                <div className="flex items-center gap-2">
                  <span className="w-14 shrink-0 text-[11px] text-muted-foreground">Source</span>
                  <Select
                    value={clip.mediaId}
                    onValueChange={(v) => {
                      if (replaceClipMedia(clip.id, v)) toast.success('Media replaced — position & duration kept')
                    }}
                  >
                    <SelectTrigger className="h-7 flex-1 text-[11px]" aria-label="Replace source media">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {compatible.map((m) => (
                        <SelectItem key={m.id} value={m.id} className="text-[11px]">
                          {m.kind === 'lut' ? 'LUT' : m.kind} · {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )
            })()}

          {/* auto-duck — audio clips only */}
          {clip.kind === 'audio' && (
            <div className="space-y-1 rounded-lg border border-(--nc-line) bg-(--nc-panel-soft) p-2">
              <div className="flex items-center gap-2">
                <span className="flex flex-1 items-center gap-1.5 text-[11px] text-muted-foreground">
                  <AudioLines className="h-3 w-3" />
                  Auto-duck under video audio
                </span>
                <Switch
                  checked={clip.autoDuck ?? false}
                  onCheckedChange={(on) => updateClip(clip.id, { autoDuck: on }, true)}
                />
              </div>
              <p className="text-[10px] leading-snug text-muted-foreground/60">
                Music volume automatically lowers while video sound plays.
              </p>
              {(clip.autoDuck ?? false) && (
                <SliderRow
                  label="Depth"
                  min={0}
                  max={0.95}
                  step={0.05}
                  value={clip.duckDepth ?? 0.68}
                  onChange={(v) => updateClip(clip.id, { duckDepth: v }, 'duck-depth')}
                  format={fmtPct}
                />
              )}
            </div>
          )}
        </Section>
      )}

      {/* per-clip audio FX chain — video / audio */}
      {(clip.kind === 'video' || clip.kind === 'audio') && <AudioFxSection clip={clip} />}

      {/* filters — CSS layer renders on every visual clip kind */}
      {clip.kind !== 'audio' && (
        <Section
          title="Filters"
          icon={Wand2}
          sectionId="filters"
          onReset={() => updateClip(clip.id, { filters: { ...DEFAULT_FILTERS } }, true)}
        >
          <SliderRow
            label="Bright"
            min={0}
            max={2}
            step={0.01}
            value={clip.filters.brightness}
            onChange={(v) => patchFilter('brightness', v)}
            format={fmtNum}
          />
          <SliderRow
            label="Contrast"
            min={0}
            max={2}
            step={0.01}
            value={clip.filters.contrast}
            onChange={(v) => patchFilter('contrast', v)}
            format={fmtNum}
          />
          <SliderRow
            label="Saturate"
            min={0}
            max={2}
            step={0.01}
            value={clip.filters.saturation}
            onChange={(v) => patchFilter('saturation', v)}
            format={fmtNum}
          />
          <SliderRow
            label="Hue"
            min={-180}
            max={180}
            step={1}
            value={clip.filters.hue}
            onChange={(v) => patchFilter('hue', v)}
            format={fmtDeg}
          />
          <SliderRow
            label="Blur"
            min={0}
            max={20}
            step={0.1}
            value={clip.filters.blur}
            onChange={(v) => patchFilter('blur', v)}
            format={fmtPx}
          />
          <SliderRow
            label="Sepia"
            min={0}
            max={1}
            step={0.01}
            value={clip.filters.sepia}
            onChange={(v) => patchFilter('sepia', v)}
            format={fmtPct}
          />
          <SliderRow
            label="Gray"
            min={0}
            max={1}
            step={0.01}
            value={clip.filters.grayscale}
            onChange={(v) => patchFilter('grayscale', v)}
            format={fmtPct}
          />
          <SliderRow
            label="Invert"
            min={0}
            max={1}
            step={0.01}
            value={clip.filters.invert}
            onChange={(v) => patchFilter('invert', v)}
            format={fmtPct}
          />
        </Section>
      )}

      {/* pro color pipeline — video / image */}
      {(clip.kind === 'video' || clip.kind === 'image') && (
        <>
          <GradeSection clip={clip} />
          <LutSection clip={clip} />
          <ChromaSection clip={clip} />
          <ScopesSection />
        </>
      )}

      {/* text style */}
      {clip.kind === 'text' && clip.textStyle && <TextSection clip={clip} />}

      {/* sticker style */}
      {clip.kind === 'sticker' && clip.sticker && <StickerSection clip={clip} />}

      {/* blend mode — visual kinds */}
      {isVisual && <BlendSection clip={clip} />}

      {/* fade */}
      <Section title="Fade" icon={Sun}>
        <TransitionHint clip={clip} />
        <SliderRow
          label="In"
          min={0}
          max={3}
          step={0.05}
          value={clip.fadeIn}
          onChange={(v) => updateClip(clip.id, { fadeIn: v }, 'fade-in')}
          format={fmtSec}
        />
        <SliderRow
          label="Out"
          min={0}
          max={3}
          step={0.05}
          value={clip.fadeOut}
          onChange={(v) => updateClip(clip.id, { fadeOut: v }, 'fade-out')}
          format={fmtSec}
        />
      </Section>

      {/* image duration */}
      {clip.kind === 'image' && (
        <Section title="Duration" icon={Timer}>
          <SliderRow
            label="Length"
            min={0.5}
            max={30}
            step={0.1}
            value={clip.duration}
            onChange={(v) => updateClip(clip.id, { duration: v }, 'img-dur')}
            format={fmtSec}
          />
        </Section>
      )}

      <ClipActionsRow duplicateId={clip.id} />
    </>
  )
}

/**
 * Read-only hint when the selected clip is part of an armed transition
 * (true crossfade bridge or wipe mask) — mirrors the timeline chips.
 */
function TransitionHint({ clip }: { clip: Clip }) {
  // selector must return a STABLE reference (project.clips) — filtering inside
  // the selector would allocate a new array per snapshot and loop forever
  const allClips = useEditor((s) => s.project.clips)
  const trackClips = useMemo(() => allClips.filter((c) => c.trackId === clip.trackId), [allClips, clip.trackId])
  const pair = useMemo(() => {
    const pairs = transitionPairsForTrack(trackClips)
    return pairs.find((p) => p.outgoingId === clip.id || p.incomingId === clip.id) ?? null
  }, [trackClips, clip.id])
  if (!pair) return null
  const isOutgoing = pair.outgoingId === clip.id
  const label = isOutgoing
    ? `True crossfade with the next clip · ${pair.window.toFixed(2)}s — this clip keeps playing underneath`
    : clip.wipe
      ? `Wipe reveal (${clip.wipe === 'barnDoors' ? 'barn doors' : clip.wipe}) from the previous clip · ${pair.window.toFixed(2)}s`
      : `True crossfade with the previous clip · ${pair.window.toFixed(2)}s window`
  return <p className="text-[10px] leading-snug text-fuchsia-300/80">{label}</p>
}

/* ================================================================ multi select */

function MultiSelectPanel({ count, firstId }: { count: number; firstId: string | undefined }) {
  return (
    <>
      <div className="nc-glass rounded-xl p-4 text-center">
        <p className="text-sm font-medium">{count} clips selected</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Select a single clip to edit its properties.
        </p>
      </div>
      {firstId && <ClipActionsRow duplicateId={firstId} />}
    </>
  )
}

/* ================================================================ project panel (nothing selected) */

/** Transient text fields — remounts via key when the real canvas size changes */
function CanvasSizeInputs({
  width,
  height,
  onApply,
}: {
  width: number
  height: number
  onApply: (w: number, h: number) => void
}) {
  const [wText, setWText] = useState(String(width))
  const [hText, setHText] = useState(String(height))

  const apply = () => {
    const w = Math.round(clamp(Number(wText) || width, 256, 3840) / 2) * 2
    const h = Math.round(clamp(Number(hText) || height, 256, 3840) / 2) * 2
    onApply(w, h)
  }

  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground">Custom size</Label>
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          aria-label="Canvas width"
          min={256}
          max={3840}
          step={2}
          value={wText}
          onChange={(e) => setWText(e.target.value)}
          className="h-8 flex-1 border-(--nc-line) bg-(--nc-panel) text-xs"
        />
        <span className="text-[10px] text-muted-foreground">×</span>
        <Input
          type="number"
          aria-label="Canvas height"
          min={256}
          max={3840}
          step={2}
          value={hText}
          onChange={(e) => setHText(e.target.value)}
          className="h-8 flex-1 border-(--nc-line) bg-(--nc-panel) text-xs"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0 border-(--nc-line) text-xs hover:border-fuchsia-400/40 hover:text-foreground"
          onClick={apply}
        >
          Apply
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground/60">
        256–3840 px · rounded to even numbers (recommended).
      </p>
    </div>
  )
}

function ProjectPanel() {
  const project = useEditor((s) => s.project)
  const setProjectName = useEditor((s) => s.setProjectName)
  const setCanvasSize = useEditor((s) => s.setCanvasSize)
  const setFps = useEditor((s) => s.setFps)
  const setProjectBackground = useEditor((s) => s.setProjectBackground)
  const openDialog = useEditor((s) => s.openDialog)

  const presetId =
    CANVAS_PRESETS.find((p) => p.width === project.canvasWidth && p.height === project.canvasHeight)?.id ??
    '16:9'

  return (
    <>
      <Section title="Project" icon={Settings2}>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Name</Label>
          <Input
            value={project.name}
            onChange={(e) => setProjectName(e.target.value)}
            className="h-8 border-(--nc-line) bg-(--nc-panel) text-xs"
          />
        </div>

        <SelectRow
          label="Canvas"
          value={presetId}
          onChange={(v) => {
            const preset = CANVAS_PRESETS.find((p) => p.id === v)
            if (preset) setCanvasSize(preset.width, preset.height)
          }}
        >
          {CANVAS_PRESETS.map((p) => (
            <SelectItem key={p.id} value={p.id} className="text-xs">
              {p.label}
            </SelectItem>
          ))}
        </SelectRow>

        {/* custom canvas size */}
        <CanvasSizeInputs
          key={`${project.canvasWidth}x${project.canvasHeight}`}
          width={project.canvasWidth}
          height={project.canvasHeight}
          onApply={setCanvasSize}
        />

        <SelectRow label="FPS" value={String(project.fps)} onChange={(v) => setFps(Number(v))}>
          {[24, 30, 60].map((f) => (
            <SelectItem key={f} value={String(f)} className="text-xs">
              {f} fps
            </SelectItem>
          ))}
        </SelectRow>

        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-[11px] text-muted-foreground">BG</span>
          <input
            type="color"
            title="Background color"
            value={toHexInput(project.backgroundColor)}
            onChange={(e) => setProjectBackground(e.target.value)}
            className="h-8 w-10 cursor-pointer rounded-md border border-(--nc-line) bg-transparent p-0.5"
          />
          <span className="font-mono text-[10px] text-muted-foreground">{project.backgroundColor}</span>
        </div>
      </Section>

      <div className="nc-glass space-y-2.5 rounded-xl p-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Select a clip on the timeline to edit its transform, filters, speed and more.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="h-8 border-(--nc-line) text-xs hover:border-fuchsia-400/40 hover:text-foreground"
          onClick={() => openDialog('shortcuts')}
        >
          View shortcuts
        </Button>
      </div>
    </>
  )
}

/* ================================================================ root panel */

export function PropertiesPanel() {
  const project = useEditor((s) => s.project)
  const selectedIds = useEditor((s) => s.selectedClipIds)

  const clip = selectedIds.length === 1 ? project.clips.find((c) => c.id === selectedIds[0]) : undefined

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-(--nc-line) px-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Properties</h2>
        {clip && (
          <Badge variant="outline" className="ml-auto text-[9px] uppercase tracking-wide text-muted-foreground">
            {KIND_META[clip.kind].label}
          </Badge>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {clip ? (
          <SingleClipEditor clip={clip} />
        ) : selectedIds.length > 1 ? (
          <MultiSelectPanel count={selectedIds.length} firstId={selectedIds[0]} />
        ) : (
          <ProjectPanel />
        )}
      </div>
    </div>
  )
}

export default PropertiesPanel
