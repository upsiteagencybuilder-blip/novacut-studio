'use client'

/**
 * NovaCut Studio — Day 67: built-in template catalog.
 *
 * A template is a ready-made EDIT STRUCTURE: sequential media slots on the
 * main track, title/text overlays, an optional music slot and a suggested
 * canvas format. Templates are pure data — applying one (Day 68) builds a
 * real timeline scaffold with honest placeholders the user drops media into.
 * Nothing here pretends to import footage: slots are labeled placeholders.
 */

export type TemplateSlotKind = 'video' | 'image' | 'audio' | 'music'

export interface TemplateSlot {
  kind: TemplateSlotKind
  /** what the user should drop here */
  name: string
  duration: number
  /** text payload for title/text slots */
  text?: string
}

export interface TemplateOverlay {
  text: string
  /** seconds from the template start */
  start: number
  duration: number
}

export interface EditTemplate {
  id: string
  name: string
  description: string
  category: 'Social' | 'Vlog' | 'Promo' | 'Cinematic' | 'Tutorial'
  canvas: { width: number; height: number }
  fps: number
  /** main-track slots, applied back-to-back in order */
  slots: TemplateSlot[]
  /** text overlays on the top overlay track */
  overlays?: TemplateOverlay[]
  accent: string
}

export const BUILTIN_TEMPLATES: EditTemplate[] = [
  {
    id: 'tiktok-hook',
    name: 'TikTok Hook',
    description: 'Three-second text hook, three fast cuts, outro CTA. Built to stop the scroll.',
    category: 'Social',
    canvas: { width: 1080, height: 1920 },
    fps: 30,
    accent: '#f43f5e',
    slots: [
      { kind: 'video', name: 'Hook footage (best shot first)', duration: 3 },
      { kind: 'video', name: 'Quick cut 1', duration: 2.5 },
      { kind: 'video', name: 'Quick cut 2', duration: 2.5 },
      { kind: 'video', name: 'Payoff shot', duration: 4 },
      { kind: 'video', name: 'Outro / CTA shot', duration: 3 },
    ],
    overlays: [
      { text: 'YOUR HOOK HERE', start: 0, duration: 3 },
      { text: 'Follow for part 2 →', start: 12, duration: 3 },
    ],
  },
  {
    id: 'yt-intro',
    name: 'YouTube Intro',
    description: 'Cold-open shot, channel title card, topic teaser — a 12s opener.',
    category: 'Social',
    canvas: { width: 1920, height: 1080 },
    fps: 30,
    accent: '#f97316',
    slots: [
      { kind: 'video', name: 'Cold open highlight', duration: 4 },
      { kind: 'video', name: 'You / your setup', duration: 4 },
      { kind: 'video', name: 'Topic teaser b-roll', duration: 4 },
    ],
    overlays: [
      { text: 'CHANNEL NAME', start: 4, duration: 3 },
      { text: "Today's topic…", start: 8, duration: 3.5 },
    ],
  },
  {
    id: 'product-promo',
    name: 'Product Promo',
    description: 'Hero shot, three feature beats with titles, price card outro.',
    category: 'Promo',
    canvas: { width: 1920, height: 1080 },
    fps: 30,
    accent: '#10b981',
    slots: [
      { kind: 'video', name: 'Hero product shot', duration: 4 },
      { kind: 'video', name: 'Feature 1 close-up', duration: 3.5 },
      { kind: 'video', name: 'Feature 2 in action', duration: 3.5 },
      { kind: 'video', name: 'Feature 3 detail', duration: 3.5 },
      { kind: 'image', name: 'Logo / price card', duration: 3.5 },
    ],
    overlays: [
      { text: 'Meet NOVACUT', start: 0, duration: 3 },
      { text: 'Feature one', start: 4.5, duration: 2.5 },
      { text: 'Feature two', start: 8, duration: 2.5 },
      { text: 'Available today', start: 14.5, duration: 3.5 },
    ],
  },
  {
    id: 'travel-vlog',
    name: 'Travel Vlog',
    description: 'Six establishing cuts with location titles and a music slot under everything.',
    category: 'Vlog',
    canvas: { width: 1920, height: 1080 },
    fps: 30,
    accent: '#06b6d4',
    slots: [
      { kind: 'video', name: 'Arrival establishing shot', duration: 5 },
      { kind: 'video', name: 'Street walk', duration: 5 },
      { kind: 'video', name: 'Food close-up', duration: 4 },
      { kind: 'video', name: 'Landmark', duration: 5 },
      { kind: 'video', name: 'People / culture', duration: 5 },
      { kind: 'video', name: 'Sunset outro', duration: 6 },
      { kind: 'music', name: 'Chill travel track', duration: 30 },
    ],
    overlays: [
      { text: 'LOCATION, COUNTRY', start: 0.5, duration: 3 },
      { text: 'Day 2 — off the map', start: 15, duration: 3 },
    ],
  },
  {
    id: 'podcast-clip',
    name: 'Podcast Clip',
    description: 'One vertical talking-head slot with big-caption overlays ready to restyle.',
    category: 'Social',
    canvas: { width: 1080, height: 1920 },
    fps: 30,
    accent: '#a855f7',
    slots: [
      { kind: 'video', name: 'Talking head (vertical)', duration: 12 },
      { kind: 'video', name: 'Reaction / b-roll cutaway', duration: 3 },
      { kind: 'video', name: 'Punchline take', duration: 10 },
    ],
    overlays: [
      { text: '"the quote goes here"', start: 0.5, duration: 4 },
      { text: 'full episode ↓', start: 21, duration: 4 },
    ],
  },
  {
    id: 'cinematic-trailer',
    name: 'Cinematic Trailer',
    description: 'Five slow wide cuts, title cards between them, fade to logo.',
    category: 'Cinematic',
    canvas: { width: 1920, height: 1080 },
    fps: 24,
    accent: '#eab308',
    slots: [
      { kind: 'video', name: 'Opening wide', duration: 5 },
      { kind: 'video', name: 'Character shot', duration: 4 },
      { kind: 'video', name: 'Conflict beat', duration: 4 },
      { kind: 'video', name: 'Climax montage', duration: 5 },
      { kind: 'image', name: 'Title card', duration: 4 },
    ],
    overlays: [
      { text: 'THIS SUMMER', start: 9.5, duration: 2.5 },
      { text: 'PROJECT NAME', start: 18, duration: 4 },
    ],
  },
  {
    id: 'tutorial-step',
    name: 'Tutorial Steps',
    description: 'Screen capture slot plus numbered step titles — teaching structure ready.',
    category: 'Tutorial',
    canvas: { width: 1920, height: 1080 },
    fps: 30,
    accent: '#3b82f6',
    slots: [
      { kind: 'video', name: 'Screen capture — intro', duration: 5 },
      { kind: 'video', name: 'Screen capture — step 1 demo', duration: 6 },
      { kind: 'video', name: 'Screen capture — step 2 demo', duration: 6 },
      { kind: 'video', name: 'Result reveal', duration: 4 },
    ],
    overlays: [
      { text: 'Step 1 — Import', start: 5.5, duration: 4 },
      { text: 'Step 2 — Edit', start: 11.5, duration: 4 },
      { text: 'Done ✓', start: 18, duration: 4 },
    ],
  },
  {
    id: 'photo-slideshow',
    name: 'Photo Slideshow',
    description: 'Six image slots at 4s each with gentle motion and one music bed.',
    category: 'Vlog',
    canvas: { width: 1920, height: 1080 },
    fps: 30,
    accent: '#ec4899',
    slots: [
      { kind: 'image', name: 'Photo 1 — opener', duration: 4 },
      { kind: 'image', name: 'Photo 2', duration: 4 },
      { kind: 'image', name: 'Photo 3', duration: 4 },
      { kind: 'image', name: 'Photo 4', duration: 4 },
      { kind: 'image', name: 'Photo 5', duration: 4 },
      { kind: 'image', name: 'Photo 6 — closer', duration: 4 },
      { kind: 'music', name: 'Ambient track', duration: 24 },
    ],
  },
]

export function templateDuration(t: EditTemplate): number {
  return Math.max(
    t.slots.filter((s) => s.kind !== 'music').reduce((a, s) => a + s.duration, 0),
    ...(t.overlays ?? []).map((o) => o.start + o.duration),
  )
}

export function getTemplate(id: string): EditTemplate | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.id === id)
}
