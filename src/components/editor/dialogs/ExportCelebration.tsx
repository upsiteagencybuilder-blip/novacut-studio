'use client'

/**
 * UX60 Phase 8 (Days 55–56) — Export celebration pieces.
 *
 * ExportFilmStrip — a stylized 35mm-style progress strip: sprocket-hole
 * rows top/bottom, 16 frame cells that fill with the brand gradient as
 * the render advances, and a sweeping playhead. HONEST by design: the
 * cells are progress segments, NOT decoded frames — the tooltip
 * discloses that.
 *
 * ExportSuccessBurst — a one-shot restrained success moment behind the
 * green check: a single expanding ring + 12 brand-colored bits that fly
 * out once and end invisible (no loops, no confetti rain). All motion is
 * CSS-only; the global prefers-reduced-motion blanket plus the explicit
 * rules in globals.css still everything for vestibular users.
 */
import type { CSSProperties } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const CELLS = 16

export function ExportFilmStrip({ progress, finalizing }: { progress: number; finalizing?: boolean }) {
  const clamped = Math.min(1, Math.max(0, progress))
  return (
    <div
      className={cn('nc-filmstrip', finalizing && 'is-finalizing')}
      role="img"
      aria-label={`Render progress: ${Math.round(clamped * 100)} percent`}
      title="Stylized film-strip — segments fill as the render advances (a progress visualization, not decoded frames)"
    >
      <div className="nc-filmstrip-holes" aria-hidden="true" />
      <div className="nc-filmstrip-frames" aria-hidden="true">
        {Array.from({ length: CELLS }, (_, i) => {
          const fill = Math.min(1, Math.max(0, clamped * CELLS - i))
          return (
            <div
              key={i}
              className={cn('nc-filmstrip-cell', fill >= 1 && 'is-done', fill > 0 && fill < 1 && 'is-live')}
              style={fill > 0 && fill < 1 ? ({ '--nc-fill': `${fill * 100}%` } as CSSProperties) : undefined}
            />
          )
        })}
        <div className="nc-filmstrip-head" style={{ left: `${clamped * 100}%` }} />
      </div>
      <div className="nc-filmstrip-holes" aria-hidden="true" />
    </div>
  )
}

/* 12 one-shot bits — brand accent + the two aurora palette colors,
 * spread over 360° with varied distance/delay so the burst reads
 * organic but stays quiet. */
const BITS: Array<{ a: number; dist: number; d: number; s: number; c: string }> = [
  { a: 0, dist: 66, d: 0, s: 6, c: 'var(--nc-accent)' },
  { a: 30, dist: 52, d: 30, s: 5, c: 'var(--nc-aurora-1)' },
  { a: 60, dist: 72, d: 10, s: 6, c: 'var(--nc-aurora-2)' },
  { a: 90, dist: 58, d: 40, s: 5, c: 'var(--nc-accent)' },
  { a: 120, dist: 76, d: 15, s: 7, c: 'var(--nc-aurora-1)' },
  { a: 150, dist: 54, d: 55, s: 5, c: 'var(--nc-aurora-2)' },
  { a: 180, dist: 70, d: 5, s: 6, c: 'var(--nc-accent)' },
  { a: 210, dist: 56, d: 35, s: 5, c: 'var(--nc-aurora-1)' },
  { a: 240, dist: 80, d: 20, s: 7, c: 'var(--nc-aurora-2)' },
  { a: 270, dist: 60, d: 45, s: 5, c: 'var(--nc-accent)' },
  { a: 300, dist: 74, d: 10, s: 6, c: 'var(--nc-aurora-1)' },
  { a: 330, dist: 58, d: 50, s: 5, c: 'var(--nc-aurora-2)' },
]

export function ExportSuccessBurst() {
  return (
    <div className="nc-burst" aria-hidden="true">
      <span className="nc-burst-ring" />
      {BITS.map((b, i) => (
        <span
          key={i}
          className="nc-burst-bit"
          style={
            {
              width: b.s,
              height: b.s,
              background: b.c,
              '--nc-br': `${b.a}deg`,
              '--nc-bdist': `${b.dist}px`,
              '--nc-bd': `${b.d}ms`,
            } as CSSProperties
          }
        />
      ))}
      <CheckCircle2 className="nc-pop-in relative h-10 w-10 text-emerald-400" />
    </div>
  )
}
