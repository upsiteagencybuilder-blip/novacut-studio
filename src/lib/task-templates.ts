'use client'

/**
 * UX60 Phase 3 (Days 17-18) — task template gallery.
 *
 * Where built-in templates (lib/templates.ts) ship an honest edit STRUCTURE of
 * placeholders, task templates are FULL PRE-CUT PROJECTS for a named
 * job-to-be-done: every media slot arrives pre-timed with motion, fades and a
 * tuned look, the titles arrive pre-styled (gradient fills, animations,
 * background pills), and a music slot waits for the user's track. Applying one
 * starts the step-by-step guided walkthrough (Days 19-20) — the template does
 * ~80% of the work, the user personalizes in ≤5 edits.
 *
 * Pure data + a store builder (store.applyTaskTemplate). Media slots stay
 * honest placeholders rendered on the preview until the user swaps them.
 */
import type { Filters, MotionType, TextStyle } from '@/lib/editor/types'

export interface TaskSlotSpec {
  kind: 'video' | 'image'
  name: string
  duration: number
  motion: MotionType
  motionIntensity: number
  fadeIn: number
  fadeOut: number
  /** preset look beyond the default (saturation, contrast…) */
  filters?: Partial<Filters>
}

export interface TaskOverlaySpec {
  text: string
  /** seconds from template start */
  start: number
  duration: number
  /** full style payload merged over the default text style */
  style: Partial<TextStyle>
}

export interface TaskTemplateStep {
  /** guided-target key — matches data-nc-guided attributes on real UI */
  key: 'timeline' | 'preview' | 'panel-audio' | 'export'
  title: string
  body: string
}

export interface TaskTemplate {
  id: string
  name: string
  tagline: string
  category: 'Reels' | 'YouTube' | 'Promo' | 'Outro'
  canvas: { width: number; height: number }
  fps: number
  accent: string
  slots: TaskSlotSpec[]
  overlays: TaskOverlaySpec[]
  music?: { name: string; duration: number }
  /** exactly 5 steps — the guided banner walks them with live highlighting */
  steps: TaskTemplateStep[]
}

/** shared 5-step walkthrough — steps reference REAL guided targets */
const STANDARD_STEPS: TaskTemplateStep[] = [
  {
    key: 'timeline',
    title: 'Swap in your footage',
    body: 'Select a ▶ placeholder on the timeline, then drop your clip or photo from the Media panel. Motion, fades and timing are already set.',
  },
  {
    key: 'preview',
    title: 'Restyle the title',
    body: 'Select the styled title in the preview — use the floating toolbar or Properties → Text. It is already animated; just make it yours.',
  },
  {
    key: 'panel-audio',
    title: 'Add your music',
    body: 'Open the Audio panel and drop a track onto the music placeholder — it is timed and faded to fit the cut.',
  },
  {
    key: 'preview',
    title: 'Play it back',
    body: 'Press Space and watch the pre-cut edit. Trims and swaps stay one gesture away.',
  },
  {
    key: 'export',
    title: 'Export your video',
    body: 'Everything renders locally. Open Export, pick your platform preset and ship it.',
  },
]

export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: 'task-reels-hook',
    name: 'Reels hook',
    tagline: 'Scroll-stopping 3-word hook, three fast cuts, CTA outro — vertical and beat-ready.',
    category: 'Reels',
    canvas: { width: 1080, height: 1920 },
    fps: 30,
    accent: '#f43f5e',
    slots: [
      { kind: 'video', name: 'Hook footage (best shot first)', duration: 2.8, motion: 'zoomIn', motionIntensity: 0.5, fadeIn: 0, fadeOut: 0.2, filters: { saturation: 1.25, contrast: 1.08 } },
      { kind: 'video', name: 'Quick cut 1', duration: 2.2, motion: 'panRight', motionIntensity: 0.45, fadeIn: 0, fadeOut: 0.15 },
      { kind: 'video', name: 'Quick cut 2', duration: 2.2, motion: 'zoomIn', motionIntensity: 0.55, fadeIn: 0, fadeOut: 0.15 },
      { kind: 'video', name: 'Payoff shot', duration: 3.6, motion: 'kenBurns', motionIntensity: 0.4, fadeIn: 0, fadeOut: 0.3 },
      { kind: 'image', name: 'CTA card', duration: 3.2, motion: 'pulse', motionIntensity: 0.3, fadeIn: 0.2, fadeOut: 0.6 },
    ],
    overlays: [
      {
        text: 'STOP SCROLLING',
        start: 0,
        duration: 2.8,
        style: { fontFamily: 'Anton', fontSize: 150, letterSpacing: 6, animation: 'pop', animationDuration: 0.6, gradient: { from: '#f43f5e', to: '#fb923c', angle: 0 }, shadow: true, shadowColor: 'rgba(0,0,0,0.6)', shadowBlur: 30 },
      },
      {
        text: 'wait for it…',
        start: 3.2,
        duration: 2,
        style: { fontFamily: 'Montserrat', fontSize: 54, bold: true, color: '#ffffff', background: 'rgba(244,63,94,0.85)', backgroundPadding: 22, animation: 'slideUp', animationDuration: 0.5 },
      },
      {
        text: 'FOLLOW FOR PART 2 →',
        start: 11.6,
        duration: 3.2,
        style: { fontFamily: 'Anton', fontSize: 72, letterSpacing: 3, color: '#ffffff', shadow: true, shadowBlur: 24, animation: 'fadeIn' },
      },
    ],
    music: { name: 'Reels energy bed (drop a track here)', duration: 14 },
    steps: STANDARD_STEPS,
  },
  {
    id: 'task-yt-intro',
    name: 'YouTube intro',
    tagline: 'Cold open, gradient channel card, topic teaser and a subscribe nudge — a 12s opener.',
    category: 'YouTube',
    canvas: { width: 1920, height: 1080 },
    fps: 30,
    accent: '#f97316',
    slots: [
      { kind: 'video', name: 'Cold-open highlight', duration: 4, motion: 'zoomIn', motionIntensity: 0.35, fadeIn: 0.4, fadeOut: 0.2, filters: { contrast: 1.1 } },
      { kind: 'video', name: 'You / your setup', duration: 4, motion: 'panRight', motionIntensity: 0.3, fadeIn: 0, fadeOut: 0.2 },
      { kind: 'video', name: 'Topic teaser b-roll', duration: 4, motion: 'kenBurns', motionIntensity: 0.35, fadeIn: 0, fadeOut: 0.4 },
    ],
    overlays: [
      {
        text: 'CHANNEL NAME',
        start: 4,
        duration: 3,
        style: { fontFamily: 'Anton', fontSize: 120, letterSpacing: 8, gradient: { from: '#f97316', to: '#fbbf24', angle: 0 }, shadow: true, shadowBlur: 26, animation: 'pop', animationDuration: 0.7 },
      },
      {
        text: "Today's topic — in 60 seconds",
        start: 8,
        duration: 3.5,
        style: { fontFamily: 'Montserrat', fontSize: 56, bold: true, color: '#ffffff', shadow: true, shadowBlur: 20, animation: 'slideUp' },
      },
      {
        text: 'Subscribe so you miss nothing',
        start: 11.2,
        duration: 2.8,
        style: { fontFamily: 'Montserrat', fontSize: 44, bold: true, color: '#ffffff', background: 'rgba(249,115,22,0.85)', backgroundPadding: 20, animation: 'fadeIn' },
      },
    ],
    music: { name: 'Intro sting (drop a track here)', duration: 12 },
    steps: STANDARD_STEPS,
  },
  {
    id: 'task-product-promo',
    name: 'Product promo',
    tagline: 'Hero shot, three pre-titled feature beats and a price-card outro, all timed to land.',
    category: 'Promo',
    canvas: { width: 1920, height: 1080 },
    fps: 30,
    accent: '#10b981',
    slots: [
      { kind: 'video', name: 'Hero product shot', duration: 4, motion: 'zoomIn', motionIntensity: 0.3, fadeIn: 0.5, fadeOut: 0.2, filters: { saturation: 1.2, contrast: 1.05 } },
      { kind: 'video', name: 'Feature 1 close-up', duration: 3.5, motion: 'panRight', motionIntensity: 0.35, fadeIn: 0, fadeOut: 0.15 },
      { kind: 'video', name: 'Feature 2 in action', duration: 3.5, motion: 'zoomIn', motionIntensity: 0.4, fadeIn: 0, fadeOut: 0.15 },
      { kind: 'video', name: 'Feature 3 detail', duration: 3.5, motion: 'panLeft', motionIntensity: 0.35, fadeIn: 0, fadeOut: 0.15 },
      { kind: 'image', name: 'Logo / price card', duration: 3.5, motion: 'pulse', motionIntensity: 0.25, fadeIn: 0.2, fadeOut: 0.6 },
    ],
    overlays: [
      {
        text: 'Meet the future',
        start: 0,
        duration: 3,
        style: { fontFamily: 'Anton', fontSize: 116, letterSpacing: 2, gradient: { from: '#10b981', to: '#34d399', angle: 0 }, shadow: true, shadowBlur: 28, animation: 'pop', animationDuration: 0.7 },
      },
      {
        text: 'Feature one — faster than ever',
        start: 4.3,
        duration: 2.6,
        style: { fontFamily: 'Montserrat', fontSize: 52, bold: true, color: '#ffffff', shadow: true, shadowBlur: 18, animation: 'slideUp' },
      },
      {
        text: 'Feature two — built to last',
        start: 7.8,
        duration: 2.6,
        style: { fontFamily: 'Montserrat', fontSize: 52, bold: true, color: '#ffffff', shadow: true, shadowBlur: 18, animation: 'slideUp' },
      },
      {
        text: 'Available today',
        start: 14.3,
        duration: 3.5,
        style: { fontFamily: 'Anton', fontSize: 76, letterSpacing: 3, color: '#ffffff', background: 'rgba(16,185,129,0.88)', backgroundPadding: 26, animation: 'pop', animationDuration: 0.6 },
      },
    ],
    music: { name: 'Promo bed (drop a track here)', duration: 18 },
    steps: STANDARD_STEPS,
  },
  {
    id: 'task-end-screen',
    name: 'End screen',
    tagline: '8-second outro: gradient thanks card, subscribe pill and next-video cue — drop it on the tail.',
    category: 'Outro',
    canvas: { width: 1920, height: 1080 },
    fps: 30,
    accent: '#a855f7',
    slots: [
      { kind: 'video', name: '▶ Next-video suggestion A', duration: 4, motion: 'zoomIn', motionIntensity: 0.25, fadeIn: 0.3, fadeOut: 0.2 },
      { kind: 'video', name: '▶ Next-video suggestion B', duration: 4, motion: 'panRight', motionIntensity: 0.25, fadeIn: 0, fadeOut: 0.2 },
      { kind: 'image', name: 'Channel card / logo', duration: 3.5, motion: 'pulse', motionIntensity: 0.2, fadeIn: 0.2, fadeOut: 0.8 },
    ],
    overlays: [
      {
        text: 'Thanks for watching!',
        start: 0,
        duration: 4,
        style: { fontFamily: 'Anton', fontSize: 128, gradient: { from: '#a855f7', to: '#f0abfc', angle: 0 }, shadow: true, shadowBlur: 30, animation: 'pop', animationDuration: 0.7 },
      },
      {
        text: "Subscribe — it's free",
        start: 4.2,
        duration: 3.4,
        style: { fontFamily: 'Montserrat', fontSize: 48, bold: true, color: '#ffffff', background: 'rgba(168,85,247,0.88)', backgroundPadding: 22, animation: 'slideUp' },
      },
      {
        text: 'Next video ↓',
        start: 8.4,
        duration: 3.1,
        style: { fontFamily: 'Montserrat', fontSize: 44, bold: true, color: '#ffffff', shadow: true, shadowBlur: 18, animation: 'fadeIn' },
      },
    ],
    music: { name: 'Outro loop (drop a track here)', duration: 11.5 },
    steps: STANDARD_STEPS,
  },
]

export function getTaskTemplate(id: string): TaskTemplate | undefined {
  return TASK_TEMPLATES.find((t) => t.id === id)
}

export function taskTemplateDuration(t: TaskTemplate): number {
  const slots = t.slots.reduce((a, s) => a + s.duration, 0)
  const overlays = Math.max(0, ...t.overlays.map((o) => o.start + o.duration))
  return Math.max(slots, overlays)
}
