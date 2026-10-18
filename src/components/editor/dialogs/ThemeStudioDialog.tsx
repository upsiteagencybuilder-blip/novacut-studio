'use client'

/**
 * Theme Studio — the Chroma Engine control room.
 * Eight curated palettes × backdrop × glass × corners × custom accent,
 * with a live miniature of the editor that re-tints in real time.
 */
import {
  Check,
  CircleDot,
  Layers,
  Lightbulb,
  Monitor,
  Moon,
  Palette,
  RotateCcw,
  Sparkles,
  Square,
  Sun,
  Wand2,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useEditor } from '@/lib/editor/store'
import { useThemeStore } from '@/lib/design/theme-store'
import {
  ACCENT_SWATCHES,
  PALETTES,
  type BackdropStyle,
  type GlassLevel,
  type PaletteMeta,
  type RadiusLevel,
} from '@/lib/design/themes'

/* ------------------------- palette preview card ------------------------- */

function PaletteCard({ palette, active, onSelect }: { palette: PaletteMeta; active: boolean; onSelect: () => void }) {
  const p = palette.preview
  const isLight = palette.mode === 'light'
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={cn(
        'group relative overflow-hidden rounded-xl border p-0 text-left transition-all',
        active
          ? 'border-(--nc-accent) shadow-[0_0_14px_var(--nc-accent-glow)]'
          : 'border-(--nc-line) hover:border-(--nc-line-strong) hover:shadow-[0_2px_14px_rgba(0,0,0,0.25)]',
      )}
    >
      {/* preview strip */}
      <div className="relative h-16 w-full overflow-hidden" style={{ background: p.bg }}>
        <div
          className="absolute inset-x-0 bottom-0 h-1.5"
          style={{ background: `linear-gradient(100deg, ${p.gradFrom}, ${p.gradVia} 45%, ${p.gradTo})` }}
        />
        {/* mock chrome */}
        <div className="absolute left-2 top-2 flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 rounded-md" style={{ background: `linear-gradient(120deg, ${p.gradFrom}, ${p.gradVia})` }} />
          <span className="h-1.5 w-10 rounded-full" style={{ background: isLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.22)' }} />
        </div>
        {/* mock clips */}
        <div className="absolute bottom-2.5 left-2 flex items-end gap-1">
          <span className="h-4 w-9 rounded-[3px]" style={{ background: p.brand, opacity: 0.85 }} />
          <span className="h-6 w-12 rounded-[3px]" style={{ background: p.gradVia, opacity: 0.8 }} />
          <span className="h-3 w-7 rounded-[3px]" style={{ background: isLight ? '#10b981' : '#34d399', opacity: 0.85 }} />
        </div>
        <div
          className="absolute inset-y-0 right-6 w-px"
          style={{ background: p.accent, boxShadow: `0 0 7px ${p.accent}` }}
        />
        {/* mode badge */}
        <span
          className="absolute right-2 top-2 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider"
          style={{ background: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)', color: isLight ? '#10201a' : '#fff' }}
        >
          {isLight ? <Sun className="size-2.5" /> : <Moon className="size-2.5" />}
          {palette.mode}
        </span>
      </div>

      {/* label */}
      <div className="flex items-center gap-2 bg-(--nc-panel) px-2.5 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold leading-tight">{palette.name}</p>
          <p className="mt-0.5 flex items-center gap-1">
            {[p.gradFrom, p.gradVia, p.gradTo].map((c) => (
              <span key={c} className="size-2 rounded-full ring-1 ring-black/20" style={{ background: c }} />
            ))}
          </p>
        </div>
        <span
          className={cn(
            'flex size-4.5 shrink-0 items-center justify-center rounded-full transition-all',
            active ? 'bg-(--nc-accent) text-white' : 'border border-(--nc-line-strong) text-transparent',
          )}
        >
          <Check className="size-3" strokeWidth={3} />
        </span>
      </div>
    </button>
  )
}

/* ------------------------------ segmented ------------------------------ */

function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string; icon?: React.ComponentType<{ className?: string }> }[]
  value: T
  onChange: (v: T) => void
  ariaLabel: string
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="grid grid-cols-4 gap-1.5">
      {options.map((o) => {
        const Icon = o.icon
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex h-11 flex-col items-center justify-center gap-1 rounded-lg border text-[10px] font-medium transition-all',
              active
                ? 'border-(--nc-accent)/70 bg-(--nc-accent)/10 text-foreground shadow-[0_0_10px_var(--nc-accent-glow-soft)]'
                : 'border-(--nc-line) text-muted-foreground hover:border-(--nc-line-strong) hover:text-foreground',
            )}
          >
            {Icon && <Icon className="size-3.5" />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------ mini preview ------------------------------ */

function LiveMiniPreview() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-(--nc-line)">
      {/* top chrome */}
      <div className="nc-glass-strong flex items-center gap-2 px-3 py-2">
        <span className="nc-gradient nc-glow flex h-5 w-5 items-center justify-center rounded-md">
          <PlayIcon />
        </span>
        <span className="nc-gradient-text text-[10px] font-bold tracking-wide">NovaCut · live preview</span>
        <span className="ml-auto rounded-full border border-(--nc-accent)/40 bg-(--nc-accent)/10 px-1.5 py-0.5 text-[8px] font-semibold text-(--nc-accent-300)">
          4K
        </span>
      </div>
      {/* stage + clips */}
      <div className="nc-timeline-bg relative flex h-24 items-center justify-center bg-background">
        <div className="nc-stage nc-gradient flex h-14 w-24 items-center justify-center rounded-lg">
          <PlayIcon />
        </div>
        {/* playhead */}
        <div className="absolute inset-y-0 right-1/3 w-px bg-(--nc-accent) shadow-[0_0_7px_var(--nc-playhead-glow)]" />
      </div>
      {/* timeline strip */}
      <div className="flex items-center gap-1.5 border-t border-(--nc-line) bg-(--nc-panel-soft) px-3 py-2.5">
        <span className="h-5 w-16 rounded-md border border-(--nc-brand)/40 bg-(--nc-brand)/15" />
        <span className="h-6 w-24 rounded-md border border-(--nc-accent)/40 bg-(--nc-accent)/20 shadow-[0_0_10px_var(--nc-accent-glow-soft)]" />
        <span className="h-5 w-12 rounded-md border border-(--nc-audio)/40 bg-(--nc-audio)/15" />
        <span className="h-5 w-9 rounded-md border border-(--nc-texttrack)/40 bg-(--nc-texttrack)/15" />
        <span className="ml-auto flex items-center gap-1 text-[9px] text-muted-foreground">
          <CircleDot className="size-3 text-(--nc-danger)" /> REC
        </span>
      </div>
    </div>
  )
}

function PlayIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M8 5.5v13l11-6.5-11-6.5z" fill="white" />
    </svg>
  )
}

/* ------------------------------ the dialog ------------------------------ */

const BACKDROP_OPTIONS: { value: BackdropStyle; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'aurora', label: 'Aurora', icon: Sparkles },
  { value: 'spotlight', label: 'Spotlight', icon: Lightbulb },
  { value: 'grid', label: 'Grid', icon: Square },
  { value: 'plain', label: 'Plain', icon: Monitor },
]

const GLASS_OPTIONS: { value: GlassLevel; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'soft', label: 'Soft', icon: Layers },
  { value: 'medium', label: 'Medium', icon: Layers },
  { value: 'strong', label: 'Strong', icon: Layers },
]

const RADIUS_OPTIONS: { value: RadiusLevel; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'sharp', label: 'Sharp', icon: Square },
  { value: 'soft', label: 'Soft', icon: Square },
  { value: 'round', label: 'Round', icon: Square },
  { value: 'pill', label: 'Pill', icon: Wand2 },
]

export function ThemeStudioDialog() {
  const open = useEditor((s) => s.activeDialog === 'theme')
  const openDialog = useEditor((s) => s.openDialog)
  const config = useThemeStore((s) => s.config)
  const update = useThemeStore((s) => s.update)
  const reset = useThemeStore((s) => s.reset)

  if (!config) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) openDialog(null)
      }}
    >
      <DialogContent className="nc-glass-strong flex max-h-[86dvh] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b border-(--nc-line) px-5 pb-3 pt-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="nc-gradient nc-glow flex h-7 w-7 items-center justify-center rounded-lg">
              <Palette className="size-3.5 text-white" />
            </span>
            Theme Studio
            <span className="nc-gradient-text ml-1 text-[9px] font-bold tracking-[0.25em]">CHROMA ENGINE</span>
          </DialogTitle>
          <DialogDescription>
            Craft your signature look — every panel, clip and glow follows instantly.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-5 px-5 py-4">
            {/* live preview */}
            <LiveMiniPreview />

            {/* palettes */}
            <section aria-label="Color palettes">
              <SectionTitle icon={Palette} title="Palettes" hint={`${PALETTES.length} curated color worlds`} />
              <div role="radiogroup" aria-label="Color palette" className="grid grid-cols-2 gap-2.5">
                {PALETTES.map((p) => (
                  <PaletteCard
                    key={p.id}
                    palette={p}
                    active={config.palette === p.id}
                    onSelect={() => update({ palette: p.id })}
                  />
                ))}
              </div>
            </section>

            <Separator className="bg-(--nc-line)" />

            {/* custom accent */}
            <section aria-label="Custom accent">
              <SectionTitle icon={Wand2} title="Custom accent" hint={config.accent ? 'Override active' : 'Palette default'} />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => update({ accent: null })}
                  className={cn(
                    'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-medium transition-all',
                    !config.accent
                      ? 'border-(--nc-accent)/70 bg-(--nc-accent)/10 text-foreground'
                      : 'border-(--nc-line) text-muted-foreground hover:text-foreground',
                  )}
                >
                  <RotateCcw className="size-3" />
                  Auto
                </button>
                {ACCENT_SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={config.accent === c}
                    aria-label={`Accent ${c}`}
                    onClick={() => update({ accent: c })}
                    className={cn(
                      'size-7 rounded-full ring-2 transition-all hover:scale-110',
                      config.accent === c ? 'ring-(--nc-foreground) scale-110' : 'ring-transparent',
                    )}
                    style={{ background: c, boxShadow: `0 0 10px ${c}66` }}
                  />
                ))}
                <label
                  className={cn(
                    'relative flex size-7 cursor-pointer items-center justify-center overflow-hidden rounded-full ring-2 transition-all hover:scale-110',
                    config.accent && !ACCENT_SWATCHES.includes(config.accent)
                      ? 'ring-(--nc-foreground) scale-110'
                      : 'ring-(--nc-line-strong)',
                  )}
                  style={{
                    background: config.accent && !ACCENT_SWATCHES.includes(config.accent)
                      ? config.accent
                      : 'conic-gradient(#f43f5e, #f97316, #fbbf24, #34d399, #2dd4bf, #c026d3, #f43f5e)',
                  }}
                  title="Pick any color"
                >
                  <input
                    type="color"
                    value={config.accent ?? '#d946ef'}
                    onChange={(e) => update({ accent: e.target.value })}
                    className="absolute inset-0 size-full cursor-pointer opacity-0"
                    aria-label="Custom accent color"
                  />
                </label>
              </div>
            </section>

            <Separator className="bg-(--nc-line)" />

            {/* backdrop */}
            <section aria-label="Backdrop style">
              <SectionTitle icon={Sparkles} title="Backdrop" hint="Behind the whole studio" />
              <Segmented options={BACKDROP_OPTIONS} value={config.backdrop} onChange={(v) => update({ backdrop: v })} ariaLabel="Backdrop style" />
            </section>

            {/* glass + radius */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <section aria-label="Glass intensity">
                <SectionTitle icon={Layers} title="Glass" hint="Frost strength" />
                <div className="grid grid-cols-3 gap-1.5">
                  {GLASS_OPTIONS.map((o) => {
                    const active = config.glass === o.value
                    return (
                      <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => update({ glass: o.value })}
                        className={cn(
                          'h-10 rounded-lg border text-[10px] font-medium transition-all',
                          active
                            ? 'border-(--nc-accent)/70 bg-(--nc-accent)/10 text-foreground'
                            : 'border-(--nc-line) text-muted-foreground hover:border-(--nc-line-strong) hover:text-foreground',
                        )}
                      >
                        {o.label}
                      </button>
                    )
                  })}
                </div>
              </section>
              <section aria-label="Corner radius">
                <SectionTitle icon={Square} title="Corners" hint="Shape language" />
                <Segmented options={RADIUS_OPTIONS} value={config.radius} onChange={(v) => update({ radius: v })} ariaLabel="Corner radius" />
              </section>
            </div>

            {/* reset */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-(--nc-line) bg-(--nc-panel-soft) px-3 py-2.5">
              <p className="text-[10px] leading-snug text-muted-foreground">
                Your theme is saved on this device and applied everywhere — editor, dialogs and PWA chrome.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0 border-(--nc-line-strong) text-xs hover:border-(--nc-accent)/50"
                onClick={reset}
              >
                <RotateCcw className="size-3" />
                Reset all
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SectionTitle({ icon: Icon, title, hint }: { icon: React.ComponentType<{ className?: string }>; title: string; hint: string }) {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <Icon className="size-3.5 text-(--nc-accent-300)" />
      <h3 className="text-[11px] font-semibold uppercase tracking-wider">{title}</h3>
      <span className="ml-auto text-[9px] text-muted-foreground">{hint}</span>
    </div>
  )
}

export default ThemeStudioDialog
