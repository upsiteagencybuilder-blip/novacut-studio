/**
 * NovaCut Studio — Overlay Pack Gallery (Day 19)
 *
 * Six curated packs that bundle the existing 90 canvas overlays into
 * one-tap look families. Packs are SELECTIONS over the real registry —
 * resolved by draw kind / particle variant — never fake new effects.
 * The engine, favorites, recents and intensity slider all keep working
 * because members are the very same OverlayEffect objects.
 */

import { OVERLAY_EFFECTS } from './overlays'
import type { OverlayEffect } from './types'

export interface OverlayPack {
  id: string
  name: string
  emoji: string
  /** one-line honest description of the look family */
  desc: string
  /** css background preview shown on the pack card */
  swatch: string
  /** the overlay effects bundled in this pack (live registry objects) */
  members: OverlayEffect[]
}

/** every overlay whose draw kind matches (robust against id renumbering) */
function byKind(...kinds: OverlayEffect['draw']['kind'][]): OverlayEffect[] {
  return OVERLAY_EFFECTS.filter((e) => kinds.includes(e.draw.kind))
}

/** particle overlays limited to the given variants */
function byParticleVariants(...variants: Array<Extract<OverlayEffect['draw'], { kind: 'particles' }>['variant']>): OverlayEffect[] {
  return OVERLAY_EFFECTS.filter(
    (e) => e.draw.kind === 'particles' && variants.includes(e.draw.variant),
  )
}

export const OVERLAY_PACKS: OverlayPack[] = [
  {
    id: 'pack-light-leaks',
    name: 'Light Leaks',
    emoji: '🌅',
    desc: 'Corner blooms, sweeps and flicker in four film hues',
    swatch:
      'radial-gradient(circle at 78% 22%, rgba(249,115,22,0.75), transparent 60%), radial-gradient(circle at 15% 85%, rgba(244,63,94,0.55), transparent 60%), linear-gradient(135deg,#1c0a0e,#0c0a09)',
    members: byKind('leak'),
  },
  {
    id: 'pack-film-grain',
    name: 'Film Grain',
    emoji: '🎞️',
    desc: 'Fine, film and heavy grain from subtle to strong',
    swatch:
      'repeating-radial-gradient(circle at 13% 31%, rgba(255,255,255,0.16) 0 1px, transparent 1px 3px), repeating-radial-gradient(circle at 71% 63%, rgba(0,0,0,0.35) 0 1px, transparent 1px 4px), linear-gradient(135deg,#292524,#1c1917)',
    members: byKind('grain'),
  },
  {
    id: 'pack-vignette',
    name: 'Vignette',
    emoji: '🌑',
    desc: 'Soft, strong and cine edge falloff — light to max',
    swatch:
      'radial-gradient(ellipse at center, transparent 38%, rgba(0,0,0,0.82) 100%), linear-gradient(135deg,#57534e,#292524)',
    members: byKind('vignette'),
  },
  {
    id: 'pack-retro-broadcast',
    name: 'Retro Broadcast',
    emoji: '📺',
    desc: 'CRT and VHS scanlines with broadcast-era texture',
    swatch:
      'repeating-linear-gradient(0deg, rgba(0,0,0,0.4) 0 1px, transparent 1px 4px), linear-gradient(180deg,#022c22,#0c0a09)',
    members: byKind('scanlines'),
  },
  {
    id: 'pack-atmosphere',
    name: 'Atmosphere',
    emoji: '🌫️',
    desc: 'Dust, bokeh, stars and bubbles for dreamy depth',
    swatch: [
      'radial-gradient(circle at 28% 40%, rgba(251,207,232,0.5) 0 8px, transparent 9px)',
      'radial-gradient(circle at 66% 64%, rgba(253,230,138,0.45) 0 5px, transparent 6px)',
      'radial-gradient(circle at 80% 22%, rgba(240,171,252,0.4) 0 4px, transparent 5px)',
      'linear-gradient(180deg,#292524,#0c0a09)',
    ].join(', '),
    members: byParticleVariants('dust', 'bokeh', 'stars', 'bubbles'),
  },
  {
    id: 'pack-camera-fx',
    name: 'Camera FX',
    emoji: '🫨',
    desc: 'Handheld shake, zoom pulse and flash accents',
    swatch:
      'conic-gradient(from 40deg at 50% 50%, #44403c, #78716c, #1c1917, #57534e, #44403c)',
    members: byKind('shake', 'zoomPulse', 'flash'),
  },
]

export function getOverlayPack(id: string): OverlayPack | undefined {
  return OVERLAY_PACKS.find((p) => p.id === id)
}
