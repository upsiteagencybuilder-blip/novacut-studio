/**
 * NovaCut Studio — AI Asset Search registry (Day 39).
 *
 * A small, honest asset catalog for the AI asset search: sticker shapes and
 * emojis come from the existing sticker library; backgrounds are 12 procedural
 * gradient presets rendered on-device to full-resolution PNGs when placed.
 * The /api/ai/assets route validates every returned id against THIS registry,
 * so the LLM can never invent an asset.
 */

export interface BackgroundPreset {
  id: string
  name: string
  /** css gradient string (also used as the preview swatch) */
  css: string
  /** hint words for the LLM catalog line + result cards */
  tags: string[]
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  { id: 'bg-sunset', name: 'Sunset blend', css: 'linear-gradient(135deg,#f97316,#db2777,#7c3aed)', tags: ['warm', 'sunset', 'orange', 'pink', 'vlog'] },
  { id: 'bg-ocean', name: 'Ocean depth', css: 'linear-gradient(160deg,#0ea5e9,#0369a1,#082f49)', tags: ['cool', 'sea', 'water', 'travel', 'calm'] },
  { id: 'bg-forest', name: 'Forest mist', css: 'linear-gradient(150deg,#22c55e,#15803d,#052e16)', tags: ['green', 'nature', 'forest', 'outdoor'] },
  { id: 'bg-neon', name: 'Neon night', css: 'linear-gradient(135deg,#d946ef,#7c3aed,#1e1b4b)', tags: ['neon', 'night', 'gaming', 'purple', 'hype'] },
  { id: 'bg-gold', name: 'Golden hour', css: 'linear-gradient(135deg,#fbbf24,#f59e0b,#78350f)', tags: ['gold', 'warm', 'premium', 'product'] },
  { id: 'bg-cotton', name: 'Cotton candy', css: 'linear-gradient(135deg,#f9a8d4,#a5f3fc,#c7d2fe)', tags: ['soft', 'pastel', 'cute', 'beauty'] },
  { id: 'bg-ink', name: 'Ink studio', css: 'linear-gradient(160deg,#3f3f46,#18181b,#000000)', tags: ['dark', 'studio', 'moody', 'product'] },
  { id: 'bg-paper', name: 'Warm paper', css: 'linear-gradient(150deg,#fef3c7,#fde68a,#fcd34d)', tags: ['light', 'warm', 'craft', 'food'] },
  { id: 'bg-aurora', name: 'Aurora sky', css: 'linear-gradient(135deg,#34d399,#22d3ee,#818cf8)', tags: ['aurora', 'tech', 'cool', 'intro'] },
  { id: 'bg-rose', name: 'Rose lounge', css: 'linear-gradient(135deg,#fb7185,#e11d48,#881337)', tags: ['red', 'romance', 'fashion', 'warm'] },
  { id: 'bg-arctic', name: 'Arctic clean', css: 'linear-gradient(160deg,#f0f9ff,#e0f2fe,#bae6fd)', tags: ['light', 'clean', 'minimal', 'white'] },
  { id: 'bg-ember', name: 'Ember dark', css: 'linear-gradient(150deg,#7f1d1d,#450a0a,#1c1917)', tags: ['dark', 'red', 'epic', 'trailer'] },
]

/**
 * Render a background preset to a PNG blob at the given canvas size.
 * The gradient fills the frame; a soft radial vignette adds depth so
 * overlaid titles stay readable.
 */
export async function renderBackgroundPreset(
  preset: BackgroundPreset,
  width: number,
  height: number
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')

  // parse "linear-gradient(<deg>deg, c1, c2, ...)" — NovaCut presets only
  const open = preset.css.indexOf('(')
  const close = preset.css.lastIndexOf(')')
  const inner = preset.css.slice(open + 1, close)
  const parts = inner.split(',').map((p) => p.trim())
  const deg = parseFloat(parts[0] ?? '135') || 135
  const colors = parts.slice(1).filter(Boolean)

  const rad = ((deg - 90) * Math.PI) / 180
  const cx = width / 2
  const cy = height / 2
  const len = Math.abs(width * Math.cos(rad)) + Math.abs(height * Math.sin(rad))
  const g = ctx.createLinearGradient(
    cx - (Math.cos(rad) * len) / 2,
    cy - (Math.sin(rad) * len) / 2,
    cx + (Math.cos(rad) * len) / 2,
    cy + (Math.sin(rad) * len) / 2
  )
  colors.forEach((c, i) => g.addColorStop(colors.length === 1 ? 0 : i / (colors.length - 1), c))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, width, height)

  // soft vignette for depth
  const v = ctx.createRadialGradient(cx, cy, Math.min(width, height) * 0.35, cx, cy, Math.max(width, height) * 0.75)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,0.22)')
  ctx.fillStyle = v
  ctx.fillRect(0, 0, width, height)

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png')
  )
}
