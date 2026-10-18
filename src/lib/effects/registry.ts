/**
 * NovaCut Studio — Effects registry
 *
 * Aggregates every mega-effects category into one searchable registry.
 * Sound FX + music definitions are provided by parallel modules
 * (soundfx.ts / music.ts) that export SOUND_FX_EFFECTS / MUSIC_EFFECTS.
 */

import type { Effect, EffectCategory, OverlayDraw } from './types'
import { COLOR_EFFECTS } from './color'
import { TRANSITION_EFFECTS } from './transitions'
import { TEXT_EFFECTS } from './textfx'
import { OVERLAY_EFFECTS } from './overlays'
import { SOUND_FX_EFFECTS } from './soundfx'
import { MUSIC_EFFECTS } from './music'
import { VISION_EFFECTS } from './vision'
import { VOICE_FX_EFFECTS } from './voice'
import { MOTION_EFFECTS } from './motion'
import { SPEED_EFFECTS } from './speed'

export const ALL_EFFECTS: Effect[] = [
  ...COLOR_EFFECTS,
  ...TRANSITION_EFFECTS,
  ...TEXT_EFFECTS,
  ...SOUND_FX_EFFECTS,
  ...MUSIC_EFFECTS,
  ...OVERLAY_EFFECTS,
  ...VISION_EFFECTS,
  ...VOICE_FX_EFFECTS,
  ...MOTION_EFFECTS,
  ...SPEED_EFFECTS,
]

export const EFFECT_COUNTS: Record<EffectCategory, number> = {
  color: 0,
  transition: 0,
  text: 0,
  sound: 0,
  music: 0,
  overlay: 0,
  vision: 0,
  voice: 0,
  motion: 0,
  speed: 0,
}

for (const effect of ALL_EFFECTS) {
  EFFECT_COUNTS[effect.category]++
}

export const TOTAL_EFFECTS: number = ALL_EFFECTS.length

const BY_ID = new Map<string, Effect>(ALL_EFFECTS.map((effect) => [effect.id, effect]))

export function getEffect(id: string): Effect | undefined {
  return BY_ID.get(id)
}

/** Draw recipe for an overlay effect; undefined when the id is not an overlay. */
export function getOverlayDraw(effectId: string): OverlayDraw | undefined {
  const effect = BY_ID.get(effectId)
  return effect && effect.category === 'overlay' ? effect.draw : undefined
}

/**
 * Filter the registry.
 * - category: restrict to one category
 * - family: exact (case-insensitive) family match
 * - search: case-insensitive substring match on name, family and tags;
 *   empty/missing search returns everything matching the other filters
 */
export function searchEffects(q: { category?: EffectCategory; search?: string; family?: string }): Effect[] {
  let list = ALL_EFFECTS
  if (q.category) list = list.filter((effect) => effect.category === q.category)
  if (q.family) {
    const family = q.family.toLowerCase()
    list = list.filter((effect) => effect.family.toLowerCase() === family)
  }
  const search = q.search?.trim().toLowerCase()
  if (search) {
    list = list.filter(
      (effect) =>
        effect.name.toLowerCase().includes(search) ||
        effect.family.toLowerCase().includes(search) ||
        effect.tags.some((tag) => tag.toLowerCase().includes(search)),
    )
  }
  return list
}

/** Ordered, deduped family names for a category (in registry order). */
export function effectFamilies(category: EffectCategory): string[] {
  const seen = new Set<string>()
  const families: string[] = []
  for (const effect of ALL_EFFECTS) {
    if (effect.category !== category || seen.has(effect.family)) continue
    seen.add(effect.family)
    families.push(effect.family)
  }
  return families
}
