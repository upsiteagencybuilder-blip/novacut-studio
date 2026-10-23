'use client'

import { useMemo, useRef, useState } from 'react'
import type { Clip, EasingType, Keyframe, KeyframeProperty } from '@/lib/editor/types'
import { EASING_OPTIONS } from '@/lib/editor/constants'
import {
  applyEasing,
  baseValueForProperty,
  clamp,
  evaluateKeyframeProperty,
  formatTimecode,
  KEYFRAME_PROPERTIES,
  round2,
} from '@/lib/editor/utils'
import { useEditor } from '@/lib/editor/store'
import { cn } from '@/lib/utils'

/**
 * Keyframes v2 — per-property curve editor.
 * Visual value-vs-time graph for one keyframed property: draggable key dots
 * (drag = retime + revalue, snapped to the frame grid), double-click to add a
 * key at that time with the currently evaluated value, live playhead line and
 * a nine-preset easing chip row (with mini curve previews) applied to the
 * selected key — or to every key of the property when nothing is selected.
 */

const GRAPH_W = 320
const GRAPH_H = 150
const PAD_L = 36
const PAD_R = 10
const PAD_T = 12
const PAD_B = 18
const SAMPLES = 22

function keysFor(clip: Clip, property: KeyframeProperty): Keyframe[] {
  return (clip.keyframes ?? []).filter((k) => k.property === property).sort((a, b) => a.time - b.time)
}

/** mini easing preview path inside a 26×14 chip */
function easingChipPath(id: EasingType): string {
  const pts: string[] = []
  for (let i = 0; i <= 14; i++) {
    const p = i / 14
    const v = clamp(applyEasing(p, id), -0.35, 1.35)
    const x = 2 + p * 22
    const y = 12 - v * 10
    pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
  }
  return pts.join(' ')
}

export function KeyframeCurveEditor({ clip, fps }: { clip: Clip; fps: number }) {
  const updateKeyframe = useEditor((s) => s.updateKeyframe)
  const addKeyframeAt = useEditor((s) => s.addKeyframeAt)
  const currentTime = useEditor((s) => s.currentTime)

  const propsWithKeys = useMemo(
    () => KEYFRAME_PROPERTIES.filter((p) => (clip.keyframes ?? []).some((k) => k.property === p.id)),
    [clip.keyframes]
  )

  const [propSel, setPropSel] = useState<KeyframeProperty | null>(null)
  const prop = propSel && propsWithKeys.some((p) => p.id === propSel) ? propSel : propsWithKeys[0]?.id
  const meta = propsWithKeys.find((p) => p.id === prop) ?? propsWithKeys[0]
  const keys = useMemo(() => (prop ? keysFor(clip, prop) : []), [clip, prop])

  const [selectedKfId, setSelectedKfId] = useState<string | null>(null)
  const selectedKf = keys.find((k) => k.id === selectedKfId) ?? null

  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<string | null>(null)

  const duration = Math.max(clip.duration, 0.04)
  const innerW = GRAPH_W - PAD_L - PAD_R
  const innerH = GRAPH_H - PAD_T - PAD_B

  /* ---- value range: sample the whole curve so overshoot easings fit ---- */
  const { vMin, vMax, pathD } = useMemo(() => {
    const base = baseValueForProperty(clip, prop)
    const pts: { t: number; v: number }[] = []
    if (keys.length === 0) {
      pts.push({ t: 0, v: base }, { t: duration, v: base })
    } else if (keys.length === 1) {
      pts.push({ t: 0, v: keys[0].value }, { t: duration, v: keys[0].value })
    } else {
      for (let i = 0; i < keys.length - 1; i++) {
        const a = keys[i]
        const b = keys[i + 1]
        const seg = SAMPLES
        for (let s = 0; s <= seg; s++) {
          const p = s / seg
          pts.push({
            t: a.time + (b.time - a.time) * p,
            v: a.value + (b.value - a.value) * applyEasing(p, a.easing),
          })
        }
      }
      pts.unshift({ t: 0, v: keys[0].value })
      pts.push({ t: duration, v: keys[keys.length - 1].value })
    }
    let lo = Infinity
    let hi = -Infinity
    for (const pt of pts) {
      lo = Math.min(lo, pt.v)
      hi = Math.max(hi, pt.v)
    }
    const span = hi - lo
    const pad = span > 1e-6 ? span * 0.14 : Math.max(Math.abs(hi) * 0.2, 0.5)
    lo -= pad
    hi += pad
    const X = (t: number) => PAD_L + (t / duration) * innerW
    const Y = (v: number) => PAD_T + (1 - (v - lo) / (hi - lo)) * innerH
    const d = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'}${X(pt.t).toFixed(1)},${Y(pt.v).toFixed(1)}`).join(' ')
    return { vMin: lo, vMax: hi, pathD: d }
  }, [clip, keys, duration, innerW, innerH, prop])

  const X = (t: number) => PAD_L + (t / duration) * innerW
  const Y = (v: number) => PAD_T + (1 - (v - vMin) / (vMax - vMin)) * innerH

  const toGraph = (clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    return { gx: ((clientX - rect.left) / rect.width) * GRAPH_W, gy: ((clientY - rect.top) / rect.height) * GRAPH_H }
  }
  const graphToTime = (gx: number) => clamp(((gx - PAD_L) / innerW) * duration, 0, duration)
  const graphToValue = (gy: number) => clamp(vMax - ((gy - PAD_T) / innerH) * (vMax - vMin), meta.min, meta.max)

  const fmtVal = (v: number) => (Math.abs(v) >= 10 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(2))

  const applyEasingTo = (id: EasingType) => {
    if (selectedKf) {
      updateKeyframe(clip.id, selectedKf.id, { easing: id }, 'kf-ease')
      return
    }
    if (!keys.length) return
    useEditor.getState().pushHistory('kf-ease-all')
    for (const k of keys) updateKeyframe(clip.id, k.id, { easing: id }, false)
  }

  const playheadLocal = currentTime - clip.start
  const playheadVisible = playheadLocal >= 0 && playheadLocal <= duration

  if (!meta) return null

  return (
    <div className="space-y-1.5 rounded-lg border border-fuchsia-400/20 bg-(--nc-panel-soft) p-2">
      {/* property chips */}
      <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Keyframed properties">
        {propsWithKeys.map((p) => {
          const count = (clip.keyframes ?? []).filter((k) => k.property === p.id).length
          const active = p.id === prop
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-nc-kf-prop={p.id}
              onClick={() => {
                setPropSel(p.id)
                setSelectedKfId(null)
              }}
              className={cn(
                'flex h-7 items-center gap-1 rounded-md border px-2 text-[10px] font-medium transition-colors',
                active
                  ? 'border-fuchsia-400/50 bg-fuchsia-500/10 text-fuchsia-200'
                  : 'border-(--nc-line) text-muted-foreground hover:text-foreground'
              )}
            >
              {p.label}
              <span className="tabular-nums opacity-60">{count}</span>
            </button>
          )
        })}
      </div>

      {/* graph */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`}
        role="img"
        aria-label={`${meta.label} keyframe curve graph with ${keys.length} keys — drag keys to edit, double-click empty space to add`}
        data-nc-kf-graph={meta.id}
        className="h-auto w-full touch-none rounded-md border border-(--nc-line) bg-(--nc-panel)"
      >
        {/* grid */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={PAD_L}
            x2={GRAPH_W - PAD_R}
            y1={PAD_T + f * innerH}
            y2={PAD_T + f * innerH}
            stroke="currentColor"
            className="text-(--nc-line)"
            strokeWidth="0.5"
            pointerEvents="none"
          />
        ))}
        {/* axis labels */}
        <text x={4} y={PAD_T + 7} fontSize="8" fill="currentColor" className="text-muted-foreground" pointerEvents="none">
          {fmtVal(vMax)}
        </text>
        <text x={4} y={GRAPH_H - PAD_B} fontSize="8" fill="currentColor" className="text-muted-foreground" pointerEvents="none">
          {fmtVal(vMin)}
        </text>
        <text x={PAD_L} y={GRAPH_H - 5} fontSize="8" fill="currentColor" className="text-muted-foreground" pointerEvents="none">
          0:00
        </text>
        <text x={GRAPH_W - PAD_R} y={GRAPH_H - 5} fontSize="8" fill="currentColor" className="text-muted-foreground" textAnchor="end" pointerEvents="none">
          {formatTimecode(duration, fps)}
        </text>

        {/* double-click target */}
        <rect
          x={PAD_L}
          y={PAD_T}
          width={innerW}
          height={innerH}
          fill="transparent"
          onDoubleClick={(e) => {
            const g = toGraph(e.clientX, e.clientY)
            if (!g) return
            const t = graphToTime(g.gx)
            const v = evaluateKeyframeProperty(clip, meta.id, t) ?? baseValueForProperty(clip, meta.id)
            addKeyframeAt(clip.id, meta.id, t, round2(v))
            setSelectedKfId(null)
          }}
        />

        {/* curve */}
        <path d={pathD} fill="none" stroke="rgb(232 121 249)" strokeWidth="1.6" pointerEvents="none" />

        {/* playhead */}
        {playheadVisible && (
          <line
            x1={X(playheadLocal)}
            x2={X(playheadLocal)}
            y1={PAD_T - 4}
            y2={GRAPH_H - PAD_B}
            stroke="rgb(251 191 36)"
            strokeWidth="1"
            pointerEvents="none"
          />
        )}

        {/* key dots */}
        {keys.map((kf) => {
          const isSel = kf.id === selectedKfId
          return (
            <circle
              key={kf.id}
              cx={X(kf.time)}
              cy={Y(kf.value)}
              r={isSel ? 5.5 : 4}
              data-nc-kf-dot
              fill={isSel ? 'rgb(240 171 252)' : 'rgb(232 121 249)'}
              stroke={isSel ? '#fff' : 'rgba(0,0,0,0.45)'}
              strokeWidth={isSel ? 1.6 : 1}
              className="cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => {
                e.stopPropagation()
                e.preventDefault()
                ;(e.target as SVGElement).setPointerCapture?.(e.pointerId)
                setSelectedKfId(kf.id)
                useEditor.getState().pushHistory('kf-drag')
                dragRef.current = kf.id
              }}
              onPointerMove={(e) => {
                if (dragRef.current !== kf.id) return
                const g = toGraph(e.clientX, e.clientY)
                if (!g) return
                const t = Math.round(graphToTime(g.gx) * fps) / fps
                const v = graphToValue(g.gy)
                updateKeyframe(clip.id, kf.id, { time: round2(t), value: round2(v) }, false)
              }}
              onPointerUp={() => {
                dragRef.current = null
              }}
              onPointerCancel={() => {
                dragRef.current = null
              }}
            >
              <title>{`${meta.label} · ${formatTimecode(kf.time, fps)} · ${fmtVal(kf.value)}${meta.unit ?? ''} · ${kf.easing}`}</title>
            </circle>
          )
        })}
      </svg>

      <p className="text-[9px] leading-snug text-muted-foreground/60">
        Drag keys to retime and re-value · double-click the graph to add a key · pick an easing for the selected key
        {selectedKf ? '' : ' (none selected → applies to all keys)'}
      </p>

      {/* easing chips */}
      <div className="flex flex-wrap gap-1" role="group" aria-label="Easing presets">
        {EASING_OPTIONS.map((o) => {
          const active = selectedKf ? selectedKf.easing === o.id : false
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={active}
              data-nc-kf-ease={o.id}
              title={`${o.label}${selectedKf ? ' — apply to selected key' : ' — apply to all keys'}`}
              onClick={() => applyEasingTo(o.id)}
              className={cn(
                'flex h-8 items-center gap-1 rounded-md border px-1.5 transition-colors',
                active
                  ? 'border-fuchsia-400/60 bg-fuchsia-500/10 text-fuchsia-200'
                  : 'border-(--nc-line) text-muted-foreground hover:border-fuchsia-400/30 hover:text-foreground'
              )}
            >
              <svg width="26" height="14" viewBox="0 0 26 14" aria-hidden="true">
                <path d={easingChipPath(o.id)} fill="none" stroke="currentColor" strokeWidth="1.4" />
              </svg>
              <span className="text-[9px] leading-none">{o.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
