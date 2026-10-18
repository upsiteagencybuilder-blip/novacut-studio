/**
 * NovaCut Studio — Text effects (150 definitions)
 *
 * 15 animation families × 10 style variants. Each effect pairs an extended
 * TextAnimation id (see TextAnimation in editor types) with an optional
 * TextStyle patch (vivid colors / strokes / glows).
 *
 * previewCss references keyframes that the preview stylesheet (Task 9-d) must
 * define, format: `ncTx<PascalAnimation> <duration>s <easing> both` — loop
 * families use `infinite` instead of `both`.
 */

import type { TextStyle } from '@/lib/editor/types'
import type { TextEffect } from './types'

/* ---------------- style variants (10 per family) ---------------- */

interface StyleVariant {
  suffix: string
  tag: string
  style?: Partial<TextStyle>
}

const STYLE_VARIANTS: StyleVariant[] = [
  { suffix: 'Clean', tag: 'clean', style: { color: '#ffffff' } },
  {
    suffix: 'Amber Glow',
    tag: 'amber-glow',
    style: { color: '#fbbf24', shadow: true, shadowColor: 'rgba(251,191,36,0.9)', shadowBlur: 32 },
  },
  {
    suffix: 'Outlined',
    tag: 'outlined',
    style: { color: '#ffffff', strokeWidth: 6, strokeColor: '#000000', shadow: false },
  },
  {
    suffix: 'Shadow Pop',
    tag: 'shadow-pop',
    style: { color: '#f0abfc', bold: true, shadow: true, shadowColor: 'rgba(88,28,135,0.75)', shadowBlur: 22 },
  },
  {
    suffix: 'Bold Pink',
    tag: 'bold-pink',
    style: { color: '#fb7185', bold: true, strokeWidth: 3, strokeColor: '#4c0519' },
  },
  {
    suffix: 'Elegant White',
    tag: 'elegant-white',
    style: { color: '#ffffff', bold: false, italic: true, fontFamily: 'Playfair Display', letterSpacing: 2 },
  },
  {
    suffix: 'Retro Stroke',
    tag: 'retro-stroke',
    style: { color: '#fef08a', strokeWidth: 8, strokeColor: '#7c2d12', fontFamily: 'Bangers', shadow: false },
  },
  {
    suffix: 'Minimal',
    tag: 'minimal',
    style: { color: '#ffffff', bold: false, fontFamily: 'Inter', letterSpacing: 5, shadow: false },
  },
  {
    suffix: 'Cinematic',
    tag: 'cinematic',
    style: { color: '#f5f5f4', fontFamily: 'Anton', letterSpacing: 6, shadow: true, shadowColor: 'rgba(0,0,0,0.7)', shadowBlur: 26 },
  },
  {
    suffix: 'Ultra',
    tag: 'ultra',
    style: {
      color: '#34d399',
      bold: true,
      strokeWidth: 4,
      strokeColor: '#022c22',
      shadow: true,
      shadowColor: 'rgba(52,211,153,0.75)',
      shadowBlur: 30,
    },
  },
]

/* ---------------- family definitions (data) ---------------- */

interface TextFamilySpec {
  family: string
  /** extended animation id from the TextAnimation union */
  animation: TextEffect['animation']
  /** css timing function used in previewCss */
  easing: string
  /** loop families animate while the clip plays */
  loop: boolean
}

const FAMILIES: TextFamilySpec[] = [
  { family: 'Slide Left', animation: 'slideLeft', easing: 'cubic-bezier(.22,1,.36,1)', loop: false },
  { family: 'Slide Right', animation: 'slideRight', easing: 'cubic-bezier(.22,1,.36,1)', loop: false },
  { family: 'Slide Down', animation: 'slideDown', easing: 'cubic-bezier(.22,1,.36,1)', loop: false },
  { family: 'Bounce In', animation: 'bounceIn', easing: 'cubic-bezier(.34,1.56,.64,1)', loop: false },
  { family: 'Elastic', animation: 'elastic', easing: 'cubic-bezier(.16,1.3,.3,1)', loop: false },
  { family: 'Zoom Blur', animation: 'zoomBlur', easing: 'cubic-bezier(.16,1,.3,1)', loop: false },
  { family: 'Flip X', animation: 'flipX', easing: 'cubic-bezier(.22,1,.36,1)', loop: false },
  { family: 'Rotate In', animation: 'rotateIn', easing: 'cubic-bezier(.34,1.3,.64,1)', loop: false },
  { family: 'Tracking In', animation: 'trackingIn', easing: 'cubic-bezier(.16,1,.3,1)', loop: false },
  { family: 'Blur In', animation: 'blurIn', easing: 'cubic-bezier(.16,1,.3,1)', loop: false },
  { family: 'Swing', animation: 'swing', easing: 'ease-in-out', loop: false },
  { family: 'Wave Loop', animation: 'waveLoop', easing: 'ease-in-out', loop: true },
  { family: 'Shake Loop', animation: 'shakeLoop', easing: 'linear', loop: true },
  { family: 'Neon Flicker', animation: 'neonFlicker', easing: 'linear', loop: true },
  { family: 'Glitch Loop', animation: 'glitchLoop', easing: 'steps(2,end)', loop: true },
]

/** intro families cycle through these durations (deterministic offset per family) */
const INTRO_DURATIONS = [0.4, 0.6, 0.8, 1.0, 0.6, 1.2, 0.8, 1.0, 1.5, 2.0]
/** loop families cycle through these durations */
const LOOP_DURATIONS = [1.5, 2.0, 2.5, 2.0, 1.5, 2.5, 2.0, 1.5, 2.0, 2.5]

/* ---------------- generation ---------------- */

function pascal(anim: string): string {
  return anim.charAt(0).toUpperCase() + anim.slice(1)
}

function kebab(anim: string): string {
  return anim.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
}

export const TEXT_EFFECTS: TextEffect[] = []

for (let fi = 0; fi < FAMILIES.length; fi++) {
  const fam = FAMILIES[fi]
  const base = fam.loop ? LOOP_DURATIONS : INTRO_DURATIONS
  const keyframesName = `ncTx${pascal(fam.animation)}`
  const kindTag = fam.loop ? 'loop' : 'intro'
  for (let i = 0; i < STYLE_VARIANTS.length; i++) {
    const variant = STYLE_VARIANTS[i]
    const duration = base[(i + fi) % base.length]
    const fill = fam.loop ? 'infinite' : 'both'
    TEXT_EFFECTS.push({
      id: `text-${kebab(fam.animation)}-${String(i + 1).padStart(2, '0')}`,
      name: `${fam.family} · ${variant.suffix}`,
      family: fam.family,
      category: 'text',
      tags: ['text', kindTag, kebab(fam.animation), variant.tag],
      animation: fam.animation,
      animationDuration: duration,
      ...(variant.style ? { style: variant.style } : {}),
      previewCss: `${keyframesName} ${duration}s ${fam.easing} ${fill}`,
    })
  }
}
