/**
 * Procedural sticker art — vector shapes, social elements and vlog elements
 * drawn straight to the canvas so every sticker family renders identically in
 * preview AND export (fully deterministic: only `tLocal` drives animation,
 * never Math.random).
 *
 * The engine hands us a context already translated to the sticker center and
 * rotated/scaled by its animation; `drawStickerArt` only paints the artwork
 * centered on the origin inside a `size x size` box.
 */
import type { StickerFamily, StickerStyle } from './types'

export interface StickerDef {
  id: string
  name: string
  /** panel + timeline glyph (emoji fallback preview) */
  glyph: string
  family: Exclude<StickerFamily, 'emoji'>
  fill: string
  stroke: string
  strokeWidth: number
}

/* ================================================================ definitions */

export const STICKER_SHAPE_DEFS: StickerDef[] = [
  { id: 'circle', name: 'Circle', glyph: '⏺', family: 'shape', fill: '#f97316', stroke: '#ffffff', strokeWidth: 0 },
  { id: 'ring', name: 'Ring', glyph: '⭕', family: 'shape', fill: '#00000000', stroke: '#f97316', strokeWidth: 14 },
  { id: 'square', name: 'Square', glyph: '⬛', family: 'shape', fill: '#facc15', stroke: '#ffffff', strokeWidth: 0 },
  { id: 'rounded', name: 'Rounded', glyph: '🟧', family: 'shape', fill: '#f97316', stroke: '#ffffff', strokeWidth: 0 },
  { id: 'triangle', name: 'Triangle', glyph: '🔺', family: 'shape', fill: '#ef4444', stroke: '#ffffff', strokeWidth: 0 },
  { id: 'diamond', name: 'Diamond', glyph: '🔶', family: 'shape', fill: '#f59e0b', stroke: '#ffffff', strokeWidth: 0 },
  { id: 'pentagon', name: 'Pentagon', glyph: '⬟', family: 'shape', fill: '#10b981', stroke: '#ffffff', strokeWidth: 0 },
  { id: 'hexagon', name: 'Hexagon', glyph: '⬢', family: 'shape', fill: '#8b5cf6', stroke: '#ffffff', strokeWidth: 0 },
  { id: 'octagon', name: 'Octagon', glyph: '🛑', family: 'shape', fill: '#ef4444', stroke: '#ffffff', strokeWidth: 0 },
  { id: 'star5', name: 'Star', glyph: '⭐', family: 'shape', fill: '#facc15', stroke: '#f97316', strokeWidth: 0 },
  { id: 'star4', name: 'Sparkle', glyph: '✨', family: 'shape', fill: '#fde047', stroke: '#ffffff', strokeWidth: 0 },
  { id: 'burst', name: 'Burst', glyph: '💥', family: 'shape', fill: '#fb923c', stroke: '#fef08a', strokeWidth: 0 },
  { id: 'heart', name: 'Heart', glyph: '❤️', family: 'shape', fill: '#ef4444', stroke: '#ffffff', strokeWidth: 0 },
  { id: 'arrow', name: 'Arrow', glyph: '➡️', family: 'shape', fill: '#f97316', stroke: '#ffffff', strokeWidth: 0 },
  { id: 'chevron', name: 'Chevron', glyph: '⏩', family: 'shape', fill: '#22d3ee', stroke: '#ffffff', strokeWidth: 0 },
  { id: 'line', name: 'Line', glyph: '➖', family: 'shape', fill: '#00000000', stroke: '#f97316', strokeWidth: 12 },
  { id: 'cross', name: 'Cross', glyph: '✖️', family: 'shape', fill: '#00000000', stroke: '#ef4444', strokeWidth: 14 },
  { id: 'drop', name: 'Pin Drop', glyph: '📍', family: 'shape', fill: '#ef4444', stroke: '#ffffff', strokeWidth: 0 },
]

export const STICKER_SOCIAL_DEFS: StickerDef[] = [
  { id: 'like', name: 'Like', glyph: '👍', family: 'social', fill: '#1877f2', stroke: '#ffffff', strokeWidth: 6 },
  { id: 'love', name: 'Love', glyph: '💗', family: 'social', fill: '#ffffff', stroke: '#ef4444', strokeWidth: 6 },
  { id: 'comment', name: 'Comment', glyph: '💬', family: 'social', fill: '#ffffff', stroke: '#111827', strokeWidth: 5 },
  { id: 'share', name: 'Share', glyph: '↗️', family: 'social', fill: '#1877f2', stroke: '#ffffff', strokeWidth: 6 },
  { id: 'subscribe', name: 'Subscribe', glyph: '📺', family: 'social', fill: '#ef4444', stroke: '#ffffff', strokeWidth: 0 },
  { id: 'bell', name: 'Notify Bell', glyph: '🔔', family: 'social', fill: '#facc15', stroke: '#111827', strokeWidth: 5 },
  { id: 'live', name: 'LIVE Badge', glyph: '🔴', family: 'social', fill: '#ef4444', stroke: '#ffffff', strokeWidth: 0 },
  { id: 'follower', name: '+1 Follower', glyph: '🧑‍🤝‍🧑', family: 'social', fill: '#111827', stroke: '#ffffff', strokeWidth: 0 },
  { id: 'views', name: 'View Count', glyph: '👁️', family: 'social', fill: '#111827', stroke: '#ffffff', strokeWidth: 0 },
  { id: 'gift', name: 'Gift', glyph: '🎁', family: 'social', fill: '#8b5cf6', stroke: '#ffffff', strokeWidth: 6 },
]

export const STICKER_VLOG_DEFS: StickerDef[] = [
  { id: 'arrow-curve', name: 'Curved Arrow', glyph: '↩️', family: 'vlog', fill: '#00000000', stroke: '#f97316', strokeWidth: 10 },
  { id: 'arrow-double', name: 'Double Arrow', glyph: '↔️', family: 'vlog', fill: '#00000000', stroke: '#22d3ee', strokeWidth: 10 },
  { id: 'callout', name: 'Callout Box', glyph: '🏷️', family: 'vlog', fill: '#facc15', stroke: '#111827', strokeWidth: 5 },
  { id: 'speech', name: 'Speech Bubble', glyph: '🗨️', family: 'vlog', fill: '#ffffff', stroke: '#111827', strokeWidth: 5 },
  { id: 'thought', name: 'Thought Bubble', glyph: '💭', family: 'vlog', fill: '#ffffff', stroke: '#64748b', strokeWidth: 5 },
  { id: 'frame', name: 'Focus Frame', glyph: '🔲', family: 'vlog', fill: '#00000000', stroke: '#ffffff', strokeWidth: 10 },
  { id: 'progress', name: 'Progress Bar', glyph: '📊', family: 'vlog', fill: '#ef4444', stroke: '#ffffff', strokeWidth: 5 },
  { id: 'location', name: 'Location Tag', glyph: '📍', family: 'vlog', fill: '#ef4444', stroke: '#ffffff', strokeWidth: 0 },
  { id: 'cursor', name: 'Cursor', glyph: '🖱️', family: 'vlog', fill: '#111827', stroke: '#ffffff', strokeWidth: 5 },
  { id: 'zoom-hint', name: 'Zoom Hint', glyph: '🔍', family: 'vlog', fill: '#111827', stroke: '#ffffff', strokeWidth: 5 },
]

export const ALL_STICKER_DEFS = [...STICKER_SHAPE_DEFS, ...STICKER_SOCIAL_DEFS, ...STICKER_VLOG_DEFS]

export function findStickerDef(shape: string | undefined, family: StickerFamily | undefined): StickerDef | undefined {
  if (!shape) return undefined
  return ALL_STICKER_DEFS.find((d) => d.id === shape && d.family === (family ?? 'shape'))
}

/* ================================================================ path helpers */

function polyPath(ctx: CanvasRenderingContext2D, points: [number, number][]) {
  ctx.beginPath()
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
  ctx.closePath()
}

function regularPoly(ctx: CanvasRenderingContext2D, n: number, r: number, rot = -Math.PI / 2) {
  const pts: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const a = rot + (i * 2 * Math.PI) / n
    pts.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  polyPath(ctx, pts)
}

function starPath(ctx: CanvasRenderingContext2D, spikes: number, rOuter: number, rInner: number) {
  const pts: [number, number][] = []
  for (let i = 0; i < spikes * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / spikes
    const r = i % 2 === 0 ? rOuter : rInner
    pts.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  polyPath(ctx, pts)
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

/** cardioid-ish heart from two arcs + bezier tip */
function heartPath(ctx: CanvasRenderingContext2D, s: number) {
  const r = s * 0.26
  ctx.beginPath()
  ctx.moveTo(0, s * 0.38)
  ctx.bezierCurveTo(-s * 0.5, -s * 0.02, -r, -s * 0.42, 0, -s * 0.12)
  ctx.moveTo(0, s * 0.38)
  ctx.bezierCurveTo(s * 0.5, -s * 0.02, r, -s * 0.42, 0, -s * 0.12)
  ctx.closePath()
}

function dropPath(ctx: CanvasRenderingContext2D, s: number) {
  ctx.beginPath()
  ctx.arc(0, -s * 0.12, s * 0.32, Math.PI * 0.62, Math.PI * 0.38, false)
  ctx.lineTo(0, s * 0.42)
  ctx.closePath()
}

function speechPath(ctx: CanvasRenderingContext2D, s: number, r: number) {
  roundedRectPath(ctx, -s * 0.44, -s * 0.4, s * 0.88, s * 0.62, r)
  ctx.moveTo(-s * 0.12, s * 0.18)
  ctx.lineTo(-s * 0.28, s * 0.44)
  ctx.lineTo(s * 0.06, s * 0.2)
  ctx.closePath()
}

function arrowShaft(ctx: CanvasRenderingContext2D, s: number, head: number) {
  // right-pointing block arrow: shaft + triangular head
  const w = s * 0.22
  ctx.beginPath()
  ctx.moveTo(-s * 0.46, -w / 2)
  ctx.lineTo(s * 0.05, -w / 2)
  ctx.lineTo(s * 0.05, -head)
  ctx.lineTo(s * 0.46, 0)
  ctx.lineTo(s * 0.05, head)
  ctx.lineTo(s * 0.05, w / 2)
  ctx.lineTo(-s * 0.46, w / 2)
  ctx.closePath()
}

function paint(ctx: CanvasRenderingContext2D, style: StickerStyle, fillOn: boolean) {
  const fill = style.fill
  const sw = style.strokeWidth ?? 0
  if (fillOn && fill && fill !== '#00000000' && !isTransparent(fill)) {
    ctx.fillStyle = fill
    ctx.fill()
  }
  if (sw > 0 && style.stroke && !isTransparent(style.stroke)) {
    ctx.strokeStyle = style.stroke
    ctx.lineWidth = sw
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.stroke()
  }
}

function isTransparent(c: string) {
  const v = c.trim()
  return v === 'transparent' || v === 'none' || v === '#00000000' || /#([0-9a-f]{2})000000/i.test(v) || /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0\s*\)/i.test(v)
}

function bubbleDots(ctx: CanvasRenderingContext2D, fill: string) {
  ctx.fillStyle = fill
  for (const dx of [-0.16, 0, 0.16]) {
    ctx.beginPath()
    ctx.arc(dx * 300, -0.08 * 300, 26, 0, Math.PI * 2)
    ctx.fill()
  }
}

function bellGlyph(ctx: CanvasRenderingContext2D, s: number) {
  ctx.beginPath()
  ctx.moveTo(-s * 0.26, s * 0.14)
  ctx.quadraticCurveTo(-s * 0.26, -s * 0.38, 0, -s * 0.4)
  ctx.quadraticCurveTo(s * 0.26, -s * 0.38, s * 0.26, s * 0.14)
  ctx.lineTo(s * 0.34, s * 0.22)
  ctx.lineTo(-s * 0.34, s * 0.22)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.arc(0, s * 0.32, s * 0.09, 0, Math.PI * 2)
  ctx.fill()
}

function drawGlyphCentered(ctx: CanvasRenderingContext2D, glyph: string, size: number) {
  ctx.font = `${size * 0.62}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(glyph, 0, 0)
}

/* ================================================================ shape renderers */

function drawShape(ctx: CanvasRenderingContext2D, id: string, style: StickerStyle, s: number) {
  const half = s / 2
  switch (id) {
    case 'circle':
      ctx.beginPath()
      ctx.arc(0, 0, half * 0.92, 0, Math.PI * 2)
      paint(ctx, style, true)
      break
    case 'ring':
      ctx.beginPath()
      ctx.arc(0, 0, half * 0.86, 0, Math.PI * 2)
      paint(ctx, style, false)
      break
    case 'square':
      ctx.beginPath()
      ctx.rect(-half * 0.84, -half * 0.84, half * 1.68, half * 1.68)
      paint(ctx, style, true)
      break
    case 'rounded':
      roundedRectPath(ctx, -half * 0.84, -half * 0.84, half * 1.68, half * 1.68, s * 0.2)
      paint(ctx, style, true)
      break
    case 'triangle':
      regularPoly(ctx, 3, half * 0.9)
      paint(ctx, style, true)
      break
    case 'diamond':
      polyPath(ctx, [[0, -half * 0.9], [half * 0.9, 0], [0, half * 0.9], [-half * 0.9, 0]])
      paint(ctx, style, true)
      break
    case 'pentagon':
      regularPoly(ctx, 5, half * 0.9)
      paint(ctx, style, true)
      break
    case 'hexagon':
      regularPoly(ctx, 6, half * 0.9, 0)
      paint(ctx, style, true)
      break
    case 'octagon':
      regularPoly(ctx, 8, half * 0.9, Math.PI / 8)
      paint(ctx, style, true)
      break
    case 'star5':
      starPath(ctx, 5, half * 0.95, half * 0.42)
      paint(ctx, style, true)
      break
    case 'star4':
      starPath(ctx, 4, half * 0.95, half * 0.28)
      paint(ctx, style, true)
      break
    case 'burst':
      starPath(ctx, 12, half * 0.95, half * 0.62)
      paint(ctx, style, true)
      break
    case 'heart':
      heartPath(ctx, s)
      paint(ctx, style, true)
      break
    case 'arrow':
      arrowShaft(ctx, s, s * 0.32)
      paint(ctx, style, true)
      break
    case 'chevron':
      polyPath(ctx, [[-half * 0.7, -half * 0.8], [0, 0], [-half * 0.7, half * 0.8], [half * 0.05, half * 0.8], [half * 0.7, 0], [half * 0.05, -half * 0.8]])
      paint(ctx, style, true)
      break
    case 'line':
      roundedRectPath(ctx, -half * 0.9, -s * 0.06, half * 1.8, s * 0.12, s * 0.06)
      paint(ctx, style, false)
      break
    case 'cross':
      ctx.save()
      ctx.beginPath()
      roundedRectPath(ctx, -half * 0.8, -s * 0.07, half * 1.6, s * 0.14, s * 0.05)
      paint(ctx, style, false)
      ctx.rotate(Math.PI / 2)
      ctx.beginPath()
      roundedRectPath(ctx, -half * 0.8, -s * 0.07, half * 1.6, s * 0.14, s * 0.05)
      paint(ctx, style, false)
      ctx.restore()
      break
    case 'drop':
      dropPath(ctx, s)
      paint(ctx, style, true)
      break
    default:
      ctx.beginPath()
      ctx.arc(0, 0, half * 0.9, 0, Math.PI * 2)
      paint(ctx, style, true)
  }
}

/* ================================================================ element renderers */

function drawSocial(ctx: CanvasRenderingContext2D, id: string, style: StickerStyle, s: number) {
  switch (id) {
    case 'like':
      roundedRectPath(ctx, -s * 0.4, -s * 0.4, s * 0.8, s * 0.8, s * 0.2)
      ctx.fillStyle = style.fill ?? '#f97316'
      ctx.fill()
      if ((style.strokeWidth ?? 0) > 0) {
        ctx.strokeStyle = style.stroke ?? '#ffffff'
        ctx.lineWidth = style.strokeWidth!
        ctx.stroke()
      }
      drawGlyphCentered(ctx, '👍', s * 0.62)
      break
    case 'love':
      heartPath(ctx, s * 1.15)
      ctx.fillStyle = style.stroke ?? '#ef4444'
      ctx.fill()
      heartPath(ctx, s * 0.92)
      ctx.fillStyle = '#ef4444'
      ctx.fill()
      break
    case 'comment':
      speechPath(ctx, s, s * 0.18)
      paint(ctx, style, true)
      bubbleDots(ctx, style.stroke ?? '#111827')
      break
    case 'share':
      ctx.beginPath()
      ctx.moveTo(-s * 0.34, s * 0.3)
      ctx.quadraticCurveTo(-s * 0.3, -s * 0.16, s * 0.14, -s * 0.2)
      ctx.strokeStyle = style.fill ?? '#f97316'
      ctx.lineWidth = s * 0.13
      ctx.lineCap = 'round'
      ctx.stroke()
      polyPath(ctx, [[s * 0.05, -s * 0.44], [s * 0.48, -s * 0.2], [s * 0.05, s * 0.04]])
      ctx.fillStyle = style.fill ?? '#f97316'
      ctx.fill()
      break
    case 'subscribe':
      roundedRectPath(ctx, -s * 0.46, -s * 0.22, s * 0.92, s * 0.44, s * 0.22)
      ctx.fillStyle = style.fill ?? '#f97316'
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.font = `700 ${s * 0.2}px ui-sans-serif, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('SUBSCRIBE', 0, s * 0.02)
      break
    case 'bell':
      ctx.fillStyle = style.fill ?? '#f97316'
      bellGlyph(ctx, s)
      if ((style.strokeWidth ?? 0) > 0) {
        ctx.strokeStyle = style.stroke ?? '#ffffff'
        ctx.lineWidth = style.strokeWidth!
        ctx.lineJoin = 'round'
        bellGlyph(ctx, s)
        ctx.stroke()
      }
      break
    case 'live':
      roundedRectPath(ctx, -s * 0.36, -s * 0.16, s * 0.72, s * 0.32, s * 0.1)
      ctx.fillStyle = style.fill ?? '#f97316'
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(-s * 0.24, 0, s * 0.06, 0, Math.PI * 2)
      ctx.fill()
      ctx.font = `800 ${s * 0.17}px ui-sans-serif, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('LIVE', s * 0.06, s * 0.02)
      break
    case 'follower':
      roundedRectPath(ctx, -s * 0.42, -s * 0.15, s * 0.84, s * 0.3, s * 0.15)
      ctx.fillStyle = style.fill ?? '#f97316'
      ctx.fill()
      if ((style.strokeWidth ?? 0) > 0) {
        ctx.strokeStyle = style.stroke ?? '#ffffff'
        ctx.lineWidth = style.strokeWidth!
        ctx.stroke()
      }
      ctx.fillStyle = '#ffffff'
      ctx.font = `700 ${s * 0.16}px ui-sans-serif, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('+1 Follower', 0, s * 0.02)
      break
    case 'views':
      roundedRectPath(ctx, -s * 0.4, -s * 0.14, s * 0.8, s * 0.28, s * 0.14)
      ctx.fillStyle = style.fill ?? '#f97316'
      ctx.fill()
      drawGlyphCentered(ctx, '👁️', s * 0.34)
      ctx.save()
      ctx.translate(s * 0.16, 0)
      ctx.fillStyle = '#ffffff'
      ctx.font = `700 ${s * 0.15}px ui-sans-serif, system-ui, sans-serif`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText('1.2M', s * 0.0, s * 0.01)
      ctx.restore()
      break
    case 'gift':
      ctx.fillStyle = style.fill ?? '#f97316'
      roundedRectPath(ctx, -s * 0.36, -s * 0.16, s * 0.72, s * 0.52, s * 0.07)
      ctx.fill()
      roundedRectPath(ctx, -s * 0.42, -s * 0.32, s * 0.84, s * 0.18, s * 0.06)
      ctx.fill()
      ctx.strokeStyle = style.stroke ?? '#ffffff'
      ctx.lineWidth = s * 0.06
      ctx.beginPath()
      ctx.moveTo(0, -s * 0.32)
      ctx.lineTo(0, s * 0.36)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(-s * 0.13, -s * 0.4, s * 0.11, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(s * 0.13, -s * 0.4, s * 0.11, 0, Math.PI * 2)
      ctx.stroke()
      break
    default:
      drawShape(ctx, 'circle', style, s)
  }
}

function drawVlog(ctx: CanvasRenderingContext2D, id: string, style: StickerStyle, s: number) {
  switch (id) {
    case 'arrow-curve':
      ctx.beginPath()
      ctx.moveTo(-s * 0.32, s * 0.34)
      ctx.quadraticCurveTo(s * 0.3, s * 0.3, s * 0.24, -s * 0.22)
      if (!isTransparent(style.fill ?? '#00000000')) {
        ctx.strokeStyle = style.fill ?? '#f97316'
      } else {
        ctx.strokeStyle = style.stroke ?? '#f97316'
      }
      ctx.lineWidth = style.strokeWidth ?? s * 0.1
      ctx.lineCap = 'round'
      ctx.stroke()
      polyPath(ctx, [[s * 0.06, -s * 0.1], [s * 0.42, -s * 0.28], [s * 0.36, s * 0.12]])
      ctx.fillStyle = ctx.strokeStyle
      ctx.fill()
      break
    case 'arrow-double':
      ctx.strokeStyle = style.stroke ?? '#22d3ee'
      ctx.lineWidth = style.strokeWidth ?? s * 0.1
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(-s * 0.36, 0)
      ctx.lineTo(s * 0.36, 0)
      ctx.stroke()
      ctx.fillStyle = ctx.strokeStyle
      polyPath(ctx, [[-s * 0.14, -s * 0.18], [-s * 0.46, 0], [-s * 0.14, s * 0.18]])
      ctx.fill()
      polyPath(ctx, [[s * 0.14, -s * 0.18], [s * 0.46, 0], [s * 0.14, s * 0.18]])
      ctx.fill()
      break
    case 'callout':
      roundedRectPath(ctx, -s * 0.44, -s * 0.3, s * 0.88, s * 0.42, s * 0.08)
      paint(ctx, style, true)
      polyPath(ctx, [[-s * 0.2, s * 0.12], [-s * 0.3, s * 0.44], [s * 0.02, s * 0.12]])
      paint(ctx, style, true)
      ctx.fillStyle = isTransparent(style.fill ?? '') ? '#ffffff' : style.fill!
      ctx.font = `700 ${s * 0.16}px ui-sans-serif, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('NEW DROP', 0, -s * 0.09)
      break
    case 'speech':
      speechPath(ctx, s, s * 0.2)
      paint(ctx, style, true)
      bubbleDots(ctx, style.stroke ?? '#111827')
      break
    case 'thought': {
      ctx.beginPath()
      ctx.arc(-s * 0.1, -s * 0.05, s * 0.3, 0, Math.PI * 2)
      ctx.arc(s * 0.22, -s * 0.12, s * 0.22, 0, Math.PI * 2)
      ctx.arc(s * 0.08, s * 0.12, s * 0.24, 0, Math.PI * 2)
      ctx.arc(-s * 0.26, s * 0.1, s * 0.2, 0, Math.PI * 2)
      ctx.rect(-s * 0.3, -s * 0.24, s * 0.6, s * 0.4)
      paint(ctx, style, true)
      ctx.fillStyle = style.stroke ?? '#64748b'
      ctx.beginPath()
      ctx.arc(-s * 0.32, s * 0.34, s * 0.05, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(-s * 0.42, s * 0.44, s * 0.032, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'frame': {
      const w = s * 0.62
      const c = s * 0.16
      ctx.strokeStyle = style.stroke ?? '#ffffff'
      ctx.lineWidth = style.strokeWidth ?? s * 0.08
      ctx.lineCap = 'round'
      const corners: [number, number, number][] = [
        [-w, -w, 0], [w - c, -w, 0], [w, -w, 1], [w, -w + c, 1],
        [w, w, 2], [w - c, w, 2], [-w, w, 3], [-w, w - c, 3],
      ]
      ctx.beginPath()
      for (let i = 0; i < corners.length; i += 2) {
        const [x1, y1] = corners[i]
        const [x2, y2] = corners[i + 1]
        const cx = x1
        const cy = y2
        ctx.moveTo(x1, y1)
        ctx.quadraticCurveTo(cx, cy, x2, y2)
      }
      ctx.stroke()
      break
    }
    case 'progress':
      roundedRectPath(ctx, -s * 0.44, -s * 0.05, s * 0.88, s * 0.1, s * 0.05)
      ctx.fillStyle = '#ffffff88'
      ctx.fill()
      roundedRectPath(ctx, -s * 0.44, -s * 0.05, s * 0.52, s * 0.1, s * 0.05)
      ctx.fillStyle = style.fill ?? '#f97316'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(-s * 0.44 + s * 0.52, 0, s * 0.09, 0, Math.PI * 2)
      ctx.fillStyle = style.stroke ?? '#ffffff'
      ctx.fill()
      if ((style.strokeWidth ?? 0) > 0) {
        roundedRectPath(ctx, -s * 0.46, -s * 0.09, s * 0.92, s * 0.18, s * 0.09)
        ctx.strokeStyle = style.stroke ?? '#ffffff'
        ctx.lineWidth = style.strokeWidth! * 0.4
        ctx.stroke()
      }
      break
    case 'location':
      dropPath(ctx, s)
      ctx.fillStyle = style.fill ?? '#f97316'
      ctx.fill()
      if ((style.strokeWidth ?? 0) > 0) {
        ctx.strokeStyle = style.stroke ?? '#ffffff'
        ctx.lineWidth = style.strokeWidth!
        ctx.lineJoin = 'round'
        dropPath(ctx, s)
        ctx.stroke()
      }
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(0, -s * 0.12, s * 0.11, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'cursor':
      polyPath(ctx, [[-s * 0.18, -s * 0.4], [-s * 0.18, s * 0.3], [0.0, s * 0.16], [s * 0.1, s * 0.4], [s * 0.2, s * 0.34], [s * 0.1, s * 0.12], [s * 0.26, s * 0.08]])
      paint(ctx, style, true)
      break
    case 'zoom-hint':
      ctx.beginPath()
      ctx.arc(-s * 0.06, -s * 0.06, s * 0.3, 0, Math.PI * 2)
      paint(ctx, style, false)
      ctx.beginPath()
      ctx.moveTo(s * 0.16, s * 0.16)
      ctx.lineTo(s * 0.4, s * 0.4)
      ctx.strokeStyle = style.stroke ?? '#ffffff'
      ctx.lineWidth = s * 0.12
      ctx.lineCap = 'round'
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-s * 0.18, -s * 0.06)
      ctx.lineTo(s * 0.06, -s * 0.06)
      ctx.moveTo(-s * 0.06, -s * 0.18)
      ctx.lineTo(-s * 0.06, s * 0.06)
      ctx.strokeStyle = style.stroke ?? '#ffffff'
      ctx.lineWidth = s * 0.07
      ctx.stroke()
      break
    default:
      drawShape(ctx, 'rounded', style, s)
  }
}

/* ================================================================ public API */

/**
 * Paint sticker artwork centered on the current origin inside a size×size box.
 * Caller owns transforms, animation, alpha and bounds.
 */
export function drawStickerArt(ctx: CanvasRenderingContext2D, style: StickerStyle, tLocal: number) {
  const family = style.family ?? 'emoji'
  if (family === 'emoji') {
    ctx.font = `${style.size}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(style.emoji, 0, 0)
    return
  }
  if (family === 'shape') drawShape(ctx, style.shape ?? 'circle', style, style.size)
  else if (family === 'social') drawSocial(ctx, style.shape ?? 'like', style, style.size)
  else drawVlog(ctx, style.shape ?? 'arrow-curve', style, style.size)
  void tLocal
}

/** Panel/timeline glyph for any sticker style (emoji itself, or def glyph) */
export function stickerGlyph(style: StickerStyle | undefined): string {
  if (!style) return '✨'
  if ((style.family ?? 'emoji') === 'emoji') return style.emoji || '✨'
  const def = findStickerDef(style.shape, style.family)
  return def?.glyph ?? '⬡'
}

/** Panel/timeline display name */
export function stickerName(style: StickerStyle | undefined): string {
  if (!style) return 'Sticker'
  if ((style.family ?? 'emoji') === 'emoji') return `Sticker ${style.emoji}`
  const def = findStickerDef(style.shape, style.family)
  return def ? `${def.name} Sticker` : 'Sticker'
}
