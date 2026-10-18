/**
 * NovaCut Studio — Mega Effects Library: procedural sound effects (category 'sound')
 *
 * 20 families × 10 variants = 200 SoundFxEffect definitions.
 * Each effect is a plain serializable SoundSynthSpec recipe interpreted by the
 * offline renderer in `audio-render.ts` — no audio data is stored here.
 *
 * Effect `duration` always equals the actual rendered length:
 * one-shot duration + repeats × interval tail (see totalSeconds below).
 */
import type { SoundFxEffect, SoundSynthSpec } from './types'

type SfxParams = SoundSynthSpec['params']
type SfxType = SoundSynthSpec['type']

/** Total rendered audio length for a param set (one shot + repeat tail). */
function totalSeconds(p: SfxParams): number {
  return Math.round((p.duration + (p.repeats ?? 0) * (p.interval ?? 0)) * 1000) / 1000
}

interface SfxVariant {
  /** name suffix after "Family · " */
  suffix: string
  params: SfxParams
}

function family(
  type: SfxType,
  name: string,
  slug: string,
  emoji: string,
  tags: string[],
  variants: SfxVariant[],
): SoundFxEffect[] {
  return variants.map((v, i): SoundFxEffect => ({
    id: `${slug}-${String(i + 1).padStart(2, '0')}`,
    name: `${name} · ${v.suffix}`,
    family: name,
    category: 'sound',
    tags,
    emoji,
    duration: totalSeconds(v.params),
    synth: { type, params: v.params },
  }))
}

/* ------------------------------ Whoosh ------------------------------ */
/* Filtered-noise sweeps — transitions, camera moves, speed emphasis. */

const WHOOSH_BASE: Partial<SfxParams> = { noise: 1, q: 1 }

const WHOOSH_VARIANTS: SfxVariant[] = [
  { suffix: 'Short', params: { ...WHOOSH_BASE, freqStart: 420, freqEnd: 2400, duration: 0.35, gain: 0.8 } },
  { suffix: 'Deep', params: { ...WHOOSH_BASE, freqStart: 160, freqEnd: 900, duration: 0.9, q: 0.9, gain: 0.9 } },
  { suffix: 'Long', params: { ...WHOOSH_BASE, freqStart: 300, freqEnd: 2600, duration: 1.6, q: 1.1, gain: 0.85 } },
  { suffix: 'Fast', params: { ...WHOOSH_BASE, freqStart: 600, freqEnd: 3200, duration: 0.2, q: 1.4, gain: 0.8 } },
  { suffix: 'Soft', params: { ...WHOOSH_BASE, freqStart: 350, freqEnd: 1500, duration: 0.65, q: 0.8, gain: 0.45 } },
  { suffix: 'Wide', params: { ...WHOOSH_BASE, freqStart: 220, freqEnd: 3800, duration: 1.0, q: 2.4, gain: 0.85, pan: 0.15 } },
  { suffix: 'Tight', params: { ...WHOOSH_BASE, freqStart: 520, freqEnd: 2800, duration: 0.28, q: 1.8, gain: 0.8 } },
  { suffix: 'Epic', params: { ...WHOOSH_BASE, freqStart: 150, freqEnd: 3200, duration: 2.6, q: 1.2, gain: 0.95, pan: -0.1 } },
  { suffix: 'Reverse Feel', params: { ...WHOOSH_BASE, freqStart: 2600, freqEnd: 300, duration: 1.2, q: 1.1, gain: 0.8 } },
  { suffix: 'Mini', params: { ...WHOOSH_BASE, freqStart: 800, freqEnd: 2400, duration: 0.15, q: 1.5, gain: 0.7 } },
]

/* ------------------------------ Riser ------------------------------- */
/* Rising saw + noise swells — build-ups into drops and reveals. */

const RISER_BASE: Partial<SfxParams> = { wave: 'sawtooth', noise: 0.35, filterStart: 300, filterEnd: 6000, q: 1.6 }

const RISER_VARIANTS: SfxVariant[] = [
  { suffix: 'Quick', params: { ...RISER_BASE, freqStart: 120, freqEnd: 1400, duration: 0.5, gain: 0.75 } },
  { suffix: 'Classic', params: { ...RISER_BASE, freqStart: 100, freqEnd: 2000, duration: 1.5, gain: 0.85 } },
  { suffix: 'Long Build', params: { ...RISER_BASE, freqStart: 80, freqEnd: 2200, duration: 3.0, filterEnd: 8000, gain: 0.9 } },
  { suffix: 'Bright', params: { ...RISER_BASE, freqStart: 180, freqEnd: 2600, duration: 1.2, filterEnd: 9000, q: 2.2, gain: 0.8 } },
  { suffix: 'Dark', params: { ...RISER_BASE, freqStart: 60, freqEnd: 900, duration: 2.0, filterStart: 150, filterEnd: 2500, gain: 0.85 } },
  { suffix: 'Subtle', params: { ...RISER_BASE, freqStart: 110, freqEnd: 1200, duration: 1.4, noise: 0.2, gain: 0.4 } },
  { suffix: 'Dramatic', params: { ...RISER_BASE, freqStart: 90, freqEnd: 2400, duration: 2.4, filterEnd: 9000, q: 2.5, gain: 0.95 } },
  { suffix: 'Airy', params: { ...RISER_BASE, freqStart: 300, freqEnd: 3200, duration: 1.8, wave: 'triangle', noise: 0.5, filterEnd: 10000, gain: 0.6 } },
  { suffix: 'Tight', params: { ...RISER_BASE, freqStart: 140, freqEnd: 1800, duration: 0.8, gain: 0.8 } },
  { suffix: 'Cinematic', params: { ...RISER_BASE, freqStart: 70, freqEnd: 1600, duration: 2.8, filterEnd: 7000, detune: 12, gain: 0.9 } },
]

/* ------------------------------ Impact ------------------------------ */
/* Sub boom + noise burst — hits, slams, trailer accents. */

const IMPACT_BASE: Partial<SfxParams> = { noise: 0.6, gain: 0.9 }

const IMPACT_VARIANTS: SfxVariant[] = [
  { suffix: 'Hit', params: { ...IMPACT_BASE, freqStart: 120, freqEnd: 40, duration: 0.6, filterStart: 1400, filterEnd: 180 } },
  { suffix: 'Boom', params: { ...IMPACT_BASE, freqStart: 100, freqEnd: 32, duration: 1.1, filterStart: 900, filterEnd: 120, gain: 0.95 } },
  { suffix: 'Sub Slam', params: { ...IMPACT_BASE, freqStart: 90, freqEnd: 28, duration: 1.5, filterStart: 600, filterEnd: 90, gain: 0.95 } },
  { suffix: 'Cinematic', params: { ...IMPACT_BASE, freqStart: 110, freqEnd: 35, duration: 1.8, filterStart: 1100, filterEnd: 100, pan: -0.08 } },
  { suffix: 'Punch', params: { ...IMPACT_BASE, freqStart: 150, freqEnd: 55, duration: 0.4, filterStart: 2400, filterEnd: 300, gain: 0.85 } },
  { suffix: 'Soft Hit', params: { ...IMPACT_BASE, freqStart: 110, freqEnd: 45, duration: 0.7, filterStart: 800, filterEnd: 160, gain: 0.5 } },
  { suffix: 'Double', params: { ...IMPACT_BASE, freqStart: 130, freqEnd: 42, duration: 0.5, repeats: 2, interval: 0.28, gain: 0.85 } },
  { suffix: 'Distant', params: { ...IMPACT_BASE, freqStart: 90, freqEnd: 38, duration: 1.3, filterStart: 400, filterEnd: 80, gain: 0.6 } },
  { suffix: 'Tight', params: { ...IMPACT_BASE, freqStart: 160, freqEnd: 60, duration: 0.3, filterStart: 3000, filterEnd: 500, gain: 0.8 } },
  { suffix: 'Epic Boom', params: { ...IMPACT_BASE, freqStart: 80, freqEnd: 26, duration: 2.4, filterStart: 700, filterEnd: 70, detune: 6, gain: 0.95 } },
]

/* -------------------------------- Pop ------------------------------- */
/* Short pitched blips with a noise tick — bubbles, corks, UI pops. */

const POP_BASE: Partial<SfxParams> = { wave: 'sine', noise: 0.3, gain: 0.8 }

const POP_VARIANTS: SfxVariant[] = [
  { suffix: 'Classic', params: { ...POP_BASE, freqStart: 620, freqEnd: 140, duration: 0.12, decay: 0.9 } },
  { suffix: 'Deep', params: { ...POP_BASE, freqStart: 380, freqEnd: 90, duration: 0.16, noise: 0.25, gain: 0.85 } },
  { suffix: 'Bright', params: { ...POP_BASE, freqStart: 900, freqEnd: 220, duration: 0.1, noise: 0.35, gain: 0.75 } },
  { suffix: 'Bubblegum', params: { ...POP_BASE, freqStart: 750, freqEnd: 260, duration: 0.11, wave: 'triangle', noise: 0.2, gain: 0.7 } },
  { suffix: 'Cork', params: { ...POP_BASE, freqStart: 500, freqEnd: 110, duration: 0.14, noise: 0.5, gain: 0.9 } },
  { suffix: 'Double', params: { ...POP_BASE, freqStart: 620, freqEnd: 140, duration: 0.12, repeats: 2, interval: 0.14 } },
  { suffix: 'Triple', params: { ...POP_BASE, freqStart: 680, freqEnd: 160, duration: 0.1, repeats: 3, interval: 0.12, gain: 0.75 } },
  { suffix: 'Soft', params: { ...POP_BASE, freqStart: 450, freqEnd: 150, duration: 0.15, noise: 0.2, gain: 0.45 } },
  { suffix: 'Snappy', params: { ...POP_BASE, freqStart: 1000, freqEnd: 180, duration: 0.08, noise: 0.4, gain: 0.85 } },
  { suffix: 'Big', params: { ...POP_BASE, freqStart: 320, freqEnd: 70, duration: 0.2, noise: 0.35, gain: 0.95 } },
]

/* ------------------------------- Click ------------------------------ */
/* Repeated micro blips — UI ticks, typewriters, metronomes. */

const CLICK_BASE: Partial<SfxParams> = { wave: 'square', decay: 0.95, gain: 0.6 }

const CLICK_VARIANTS: SfxVariant[] = [
  { suffix: 'Single', params: { ...CLICK_BASE, freqStart: 2200, freqEnd: 1400, duration: 0.03 } },
  { suffix: 'Double', params: { ...CLICK_BASE, freqStart: 2200, freqEnd: 1400, duration: 0.03, repeats: 2, interval: 0.09 } },
  { suffix: 'Triple', params: { ...CLICK_BASE, freqStart: 2000, freqEnd: 1300, duration: 0.03, repeats: 3, interval: 0.1 } },
  { suffix: 'Tick Tock', params: { ...CLICK_BASE, freqStart: 1600, freqEnd: 1200, duration: 0.04, repeats: 4, interval: 0.5 } },
  { suffix: 'Fast Ticks', params: { ...CLICK_BASE, freqStart: 2400, freqEnd: 1800, duration: 0.025, repeats: 6, interval: 0.07 } },
  { suffix: 'Mechanical', params: { ...CLICK_BASE, freqStart: 1200, freqEnd: 700, duration: 0.035, noise: 0.4, gain: 0.65, repeats: 2, interval: 0.07 } },
  { suffix: 'Soft Taps', params: { ...CLICK_BASE, freqStart: 1500, freqEnd: 1000, duration: 0.03, wave: 'sine', gain: 0.35, repeats: 3, interval: 0.18 } },
  { suffix: 'Shutter', params: { ...CLICK_BASE, freqStart: 2600, freqEnd: 900, duration: 0.04, noise: 0.5, repeats: 2, interval: 0.06 } },
  { suffix: 'Typewriter', params: { ...CLICK_BASE, freqStart: 1800, freqEnd: 900, duration: 0.03, noise: 0.3, repeats: 4, interval: 0.16 } },
  { suffix: 'Metronome', params: { ...CLICK_BASE, freqStart: 1400, freqEnd: 1000, duration: 0.04, wave: 'sine', gain: 0.55, repeats: 5, interval: 0.5 } },
]

/* -------------------------------- Zap ------------------------------- */
/* Resonant square/saw discharges — electricity, sparks, tech UI. */

const ZAP_BASE: Partial<SfxParams> = { wave: 'square', q: 9, noise: 0.3, gain: 0.8 }

const ZAP_VARIANTS: SfxVariant[] = [
  { suffix: 'Short', params: { ...ZAP_BASE, freqStart: 2200, freqEnd: 180, duration: 0.12 } },
  { suffix: 'Classic', params: { ...ZAP_BASE, freqStart: 1800, freqEnd: 120, duration: 0.25 } },
  { suffix: 'Electric', params: { ...ZAP_BASE, freqStart: 2600, freqEnd: 300, duration: 0.18, q: 12 } },
  { suffix: 'Heavy', params: { ...ZAP_BASE, freqStart: 900, freqEnd: 60, duration: 0.4, wave: 'sawtooth', q: 7, gain: 0.9 } },
  { suffix: 'Micro', params: { ...ZAP_BASE, freqStart: 3000, freqEnd: 400, duration: 0.07, gain: 0.7 } },
  { suffix: 'Spark', params: { ...ZAP_BASE, freqStart: 3400, freqEnd: 800, duration: 0.1, noise: 0.5, gain: 0.6 } },
  { suffix: 'Stun', params: { ...ZAP_BASE, freqStart: 1200, freqEnd: 90, duration: 0.5, wave: 'sawtooth', q: 11, gain: 0.9 } },
  { suffix: 'Long Arc', params: { ...ZAP_BASE, freqStart: 2000, freqEnd: 150, duration: 0.7, noise: 0.35, q: 10, gain: 0.85 } },
  { suffix: 'Sharp', params: { ...ZAP_BASE, freqStart: 2800, freqEnd: 150, duration: 0.09, q: 14 } },
  { suffix: 'Fry', params: { ...ZAP_BASE, freqStart: 1500, freqEnd: 200, duration: 0.6, noise: 0.6, q: 6, gain: 0.7, detune: 15 } },
]

/* ------------------------------- Laser ------------------------------ */
/* Fast frequency drops (or charges) — sci-fi guns and beams. */

const LASER_BASE: Partial<SfxParams> = { wave: 'sawtooth', q: 6, noise: 0.15, gain: 0.8 }

const LASER_VARIANTS: SfxVariant[] = [
  { suffix: 'Pistol', params: { ...LASER_BASE, freqStart: 2400, freqEnd: 200, duration: 0.15 } },
  { suffix: 'Blaster', params: { ...LASER_BASE, freqStart: 2000, freqEnd: 120, duration: 0.22 } },
  { suffix: 'Beam', params: { ...LASER_BASE, freqStart: 1600, freqEnd: 400, duration: 0.5, wave: 'square', gain: 0.7 } },
  { suffix: 'Sci-Fi', params: { ...LASER_BASE, freqStart: 2800, freqEnd: 300, duration: 0.3, detune: 10 } },
  { suffix: 'Rapid', params: { ...LASER_BASE, freqStart: 2200, freqEnd: 500, duration: 0.07, repeats: 4, interval: 0.09 } },
  { suffix: 'Long Shot', params: { ...LASER_BASE, freqStart: 1800, freqEnd: 90, duration: 0.7, gain: 0.9 } },
  { suffix: 'Soft', params: { ...LASER_BASE, freqStart: 1400, freqEnd: 300, duration: 0.2, wave: 'triangle', gain: 0.45 } },
  { suffix: 'Sniper', params: { ...LASER_BASE, freqStart: 3200, freqEnd: 100, duration: 0.12, q: 8, gain: 0.9 } },
  { suffix: 'Retro', params: { ...LASER_BASE, freqStart: 1200, freqEnd: 80, duration: 0.25, wave: 'square', gain: 0.75 } },
  { suffix: 'Charge', params: { ...LASER_BASE, freqStart: 100, freqEnd: 2200, duration: 0.9, detune: 14, gain: 0.85 } },
]

/* -------------------------------- Beep ------------------------------ */
/* Flat/ramping tone blips — alerts, notifications, countdowns. */

const BEEP_BASE: Partial<SfxParams> = { wave: 'sine', gain: 0.7 }

const BEEP_VARIANTS: SfxVariant[] = [
  { suffix: 'Ping', params: { ...BEEP_BASE, freqStart: 1180, freqEnd: 1180, duration: 0.12 } },
  { suffix: 'Double Ping', params: { ...BEEP_BASE, freqStart: 1180, freqEnd: 1180, duration: 0.12, repeats: 2, interval: 0.18 } },
  { suffix: 'Alert', params: { ...BEEP_BASE, freqStart: 990, freqEnd: 990, duration: 0.16, wave: 'square', gain: 0.6, repeats: 2, interval: 0.2 } },
  { suffix: 'Error', params: { ...BEEP_BASE, freqStart: 320, freqEnd: 320, duration: 0.28, wave: 'square', gain: 0.6, repeats: 2, interval: 0.34 } },
  { suffix: 'Success', params: { ...BEEP_BASE, freqStart: 880, freqEnd: 1320, duration: 0.14, repeats: 2, interval: 0.16 } },
  { suffix: 'Soft', params: { ...BEEP_BASE, freqStart: 740, freqEnd: 740, duration: 0.18, gain: 0.4 } },
  { suffix: 'Retro', params: { ...BEEP_BASE, freqStart: 660, freqEnd: 660, duration: 0.09, wave: 'square', gain: 0.55, repeats: 3, interval: 0.12 } },
  { suffix: 'Countdown', params: { ...BEEP_BASE, freqStart: 1050, freqEnd: 1050, duration: 0.14, repeats: 3, interval: 0.5 } },
  { suffix: 'Notification', params: { ...BEEP_BASE, freqStart: 1320, freqEnd: 1760, duration: 0.12, detune: 5, repeats: 2, interval: 0.14 } },
  { suffix: 'Long', params: { ...BEEP_BASE, freqStart: 880, freqEnd: 880, duration: 0.7, gain: 0.65 } },
]

/* ------------------------------- Glitch ----------------------------- */
/* Irregular deterministic noise/square bursts — data corruption. */

const GLITCH_BASE: Partial<SfxParams> = { noise: 0.7, gain: 0.75 }

const GLITCH_VARIANTS: SfxVariant[] = [
  { suffix: 'Stutter', params: { ...GLITCH_BASE, freqStart: 400, freqEnd: 200, duration: 0.4, repeats: 8 } },
  { suffix: 'Data Error', params: { ...GLITCH_BASE, freqStart: 600, freqEnd: 300, duration: 0.5, wave: 'square', repeats: 9 } },
  { suffix: 'Bitcrush', params: { ...GLITCH_BASE, freqStart: 300, freqEnd: 120, duration: 0.6, repeats: 7, gain: 0.8 } },
  { suffix: 'Tear', params: { ...GLITCH_BASE, freqStart: 800, freqEnd: 200, duration: 0.3, repeats: 10 } },
  { suffix: 'Static', params: { ...GLITCH_BASE, freqStart: 1000, freqEnd: 400, duration: 0.7, noise: 0.95, repeats: 9, gain: 0.6 } },
  { suffix: 'Short Circuit', params: { ...GLITCH_BASE, freqStart: 900, freqEnd: 150, duration: 0.35, wave: 'sawtooth', repeats: 8 } },
  { suffix: 'Corrupt', params: { ...GLITCH_BASE, freqStart: 500, freqEnd: 250, duration: 0.8, repeats: 10, gain: 0.7 } },
  { suffix: 'Micro', params: { ...GLITCH_BASE, freqStart: 700, freqEnd: 350, duration: 0.2, repeats: 6, gain: 0.6 } },
  { suffix: 'Heavy', params: { ...GLITCH_BASE, freqStart: 350, freqEnd: 100, duration: 0.9, repeats: 10, gain: 0.85 } },
  { suffix: 'Chaos', params: { ...GLITCH_BASE, freqStart: 1200, freqEnd: 200, duration: 1.0, noise: 0.85, repeats: 10 } },
]

/* ------------------------------- Sweep ------------------------------ */
/* Pure filter sweeps over noise — transitions and riser fills. */

const SWEEP_BASE: Partial<SfxParams> = { noise: 1, q: 5, gain: 0.8 }

const SWEEP_VARIANTS: SfxVariant[] = [
  { suffix: 'Up', params: { ...SWEEP_BASE, freqStart: 250, freqEnd: 4200, duration: 1.0 } },
  { suffix: 'Down', params: { ...SWEEP_BASE, freqStart: 4200, freqEnd: 250, duration: 1.0 } },
  { suffix: 'Short', params: { ...SWEEP_BASE, freqStart: 400, freqEnd: 3600, duration: 0.4, q: 4 } },
  { suffix: 'Long', params: { ...SWEEP_BASE, freqStart: 200, freqEnd: 5000, duration: 2.4, q: 6 } },
  { suffix: 'Narrow', params: { ...SWEEP_BASE, freqStart: 800, freqEnd: 1600, duration: 1.2, q: 10, gain: 0.7 } },
  { suffix: 'Wide', params: { ...SWEEP_BASE, freqStart: 180, freqEnd: 6000, duration: 1.6, q: 2.5 } },
  { suffix: 'Soft', params: { ...SWEEP_BASE, freqStart: 300, freqEnd: 2400, duration: 1.4, q: 3, gain: 0.45 } },
  { suffix: 'Bright', params: { ...SWEEP_BASE, freqStart: 600, freqEnd: 8000, duration: 0.9, q: 7, gain: 0.85 } },
  { suffix: 'Dark', params: { ...SWEEP_BASE, freqStart: 2000, freqEnd: 150, duration: 1.5, q: 4 } },
  { suffix: 'Slow', params: { ...SWEEP_BASE, freqStart: 150, freqEnd: 3000, duration: 2.8, gain: 0.75 } },
]

/* -------------------------------- Bell ------------------------------ */
/* Inharmonic partial stacks (f, 2.76f, 5.4f) with long decay. */

const BELL_BASE: Partial<SfxParams> = { wave: 'sine', gain: 0.7 }

const BELL_VARIANTS: SfxVariant[] = [
  { suffix: 'Small', params: { ...BELL_BASE, freqStart: 880, freqEnd: 880, duration: 0.9 } },
  { suffix: 'Classic', params: { ...BELL_BASE, freqStart: 660, freqEnd: 660, duration: 1.4, gain: 0.8 } },
  { suffix: 'Deep', params: { ...BELL_BASE, freqStart: 320, freqEnd: 320, duration: 2.0, gain: 0.85 } },
  { suffix: 'Bright', params: { ...BELL_BASE, freqStart: 1320, freqEnd: 1320, duration: 1.1, gain: 0.65 } },
  { suffix: 'Temple', params: { ...BELL_BASE, freqStart: 220, freqEnd: 220, duration: 2.6, detune: 8, gain: 0.9 } },
  { suffix: 'Soft', params: { ...BELL_BASE, freqStart: 740, freqEnd: 740, duration: 1.2, gain: 0.4 } },
  { suffix: 'Double', params: { ...BELL_BASE, freqStart: 660, freqEnd: 660, duration: 1.0, repeats: 2, interval: 0.35, gain: 0.75 } },
  { suffix: 'Long', params: { ...BELL_BASE, freqStart: 520, freqEnd: 520, duration: 2.9, gain: 0.8 } },
  { suffix: 'Dark', params: { ...BELL_BASE, freqStart: 180, freqEnd: 180, duration: 2.2, gain: 0.8 } },
  { suffix: 'Tiny', params: { ...BELL_BASE, freqStart: 1760, freqEnd: 1760, duration: 0.5, gain: 0.55 } },
]

/* -------------------------------- Drum ------------------------------ */
/* One-shots — kick/snare/hat selected by register, plus rolls. */

const DRUM_VARIANTS: SfxVariant[] = [
  { suffix: 'Kick', params: { freqStart: 150, freqEnd: 50, duration: 0.32, wave: 'sine', noise: 0.3, gain: 0.95 } },
  { suffix: 'Punchy Kick', params: { freqStart: 180, freqEnd: 55, duration: 0.25, wave: 'sine', noise: 0.4, gain: 0.95 } },
  { suffix: 'Deep Kick', params: { freqStart: 120, freqEnd: 38, duration: 0.45, wave: 'sine', noise: 0.2, gain: 0.95 } },
  { suffix: 'Snare', params: { freqStart: 1900, freqEnd: 1200, duration: 0.18, wave: 'sine', noise: 0.8, gain: 0.85 } },
  { suffix: 'Tight Snare', params: { freqStart: 2200, freqEnd: 1500, duration: 0.12, wave: 'sine', noise: 0.85, gain: 0.8 } },
  { suffix: 'Closed Hat', params: { freqStart: 8000, freqEnd: 7000, duration: 0.06, wave: 'sine', noise: 1, gain: 0.55 } },
  { suffix: 'Open Hat', params: { freqStart: 7800, freqEnd: 6800, duration: 0.3, wave: 'sine', noise: 1, gain: 0.5 } },
  { suffix: 'Rimshot', params: { freqStart: 1700, freqEnd: 900, duration: 0.08, wave: 'square', noise: 0.5, gain: 0.7 } },
  { suffix: 'Tom', params: { freqStart: 220, freqEnd: 90, duration: 0.28, wave: 'sine', noise: 0.15, gain: 0.9 } },
  { suffix: 'Hat Roll', params: { freqStart: 8200, freqEnd: 7400, duration: 0.05, wave: 'sine', noise: 1, gain: 0.45, repeats: 8, interval: 0.06 } },
]

/* ------------------------------- Bubble ----------------------------- */
/* Rising sine blips — water, fizz, playful UI accents. */

const BUBBLE_BASE: Partial<SfxParams> = { wave: 'sine', gain: 0.7 }

const BUBBLE_VARIANTS: SfxVariant[] = [
  { suffix: 'Bloop', params: { ...BUBBLE_BASE, freqStart: 300, freqEnd: 700, duration: 0.09, repeats: 3, interval: 0.1 } },
  { suffix: 'Drips', params: { ...BUBBLE_BASE, freqStart: 350, freqEnd: 800, duration: 0.08, repeats: 3, interval: 0.12 } },
  { suffix: 'Fizz', params: { ...BUBBLE_BASE, freqStart: 500, freqEnd: 1400, duration: 0.05, repeats: 6, interval: 0.07, gain: 0.5 } },
  { suffix: 'Water Drop', params: { ...BUBBLE_BASE, freqStart: 600, freqEnd: 1600, duration: 0.1, repeats: 3, interval: 0.14, gain: 0.8 } },
  { suffix: 'Cauldron', params: { ...BUBBLE_BASE, freqStart: 200, freqEnd: 900, duration: 0.12, repeats: 5, interval: 0.13, gain: 0.75 } },
  { suffix: 'Tiny', params: { ...BUBBLE_BASE, freqStart: 900, freqEnd: 2000, duration: 0.05, repeats: 4, interval: 0.08, gain: 0.45 } },
  { suffix: 'Big', params: { ...BUBBLE_BASE, freqStart: 150, freqEnd: 420, duration: 0.16, repeats: 3, interval: 0.16, gain: 0.9 } },
  { suffix: 'Rising', params: { ...BUBBLE_BASE, freqStart: 250, freqEnd: 1800, duration: 0.08, repeats: 5, interval: 0.09, gain: 0.65 } },
  { suffix: 'Gentle', params: { ...BUBBLE_BASE, freqStart: 400, freqEnd: 900, duration: 0.1, repeats: 3, interval: 0.15, gain: 0.35 } },
  { suffix: 'Soda', params: { ...BUBBLE_BASE, freqStart: 700, freqEnd: 2200, duration: 0.06, repeats: 6, interval: 0.09, gain: 0.55 } },
]

/* ------------------------------ Shimmer ----------------------------- */
/* Staggered high sine sparkles — magic, dust, sparkle accents. */

const SHIMMER_BASE: Partial<SfxParams> = { wave: 'sine' }

const SHIMMER_VARIANTS: SfxVariant[] = [
  { suffix: 'Sparkle', params: { ...SHIMMER_BASE, freqStart: 2500, freqEnd: 5000, duration: 1.0, gain: 0.6 } },
  { suffix: 'Dust', params: { ...SHIMMER_BASE, freqStart: 3000, freqEnd: 6000, duration: 1.4, gain: 0.4 } },
  { suffix: 'High', params: { ...SHIMMER_BASE, freqStart: 4000, freqEnd: 6500, duration: 0.8, gain: 0.55 } },
  { suffix: 'Soft', params: { ...SHIMMER_BASE, freqStart: 2200, freqEnd: 4200, duration: 1.6, gain: 0.3 } },
  { suffix: 'Long', params: { ...SHIMMER_BASE, freqStart: 2400, freqEnd: 5800, duration: 2.4, gain: 0.5 } },
  { suffix: 'Fast', params: { ...SHIMMER_BASE, freqStart: 3500, freqEnd: 6000, duration: 0.4, gain: 0.6 } },
  { suffix: 'Magic', params: { ...SHIMMER_BASE, freqStart: 2000, freqEnd: 6400, duration: 1.8, gain: 0.65 } },
  { suffix: 'Icicle', params: { ...SHIMMER_BASE, freqStart: 4200, freqEnd: 6800, duration: 0.7, gain: 0.5 } },
  { suffix: 'Wide', params: { ...SHIMMER_BASE, freqStart: 2600, freqEnd: 5600, duration: 1.3, gain: 0.55, pan: 0.2 } },
  { suffix: 'Subtle', params: { ...SHIMMER_BASE, freqStart: 3000, freqEnd: 5000, duration: 2.0, gain: 0.25 } },
]

/* -------------------------------- Drop ------------------------------ */
/* Big sub drops with a noise thump — trailers, beat drops. */

const DROP_BASE: Partial<SfxParams> = { wave: 'sine', noise: 0.3, gain: 0.95 }

const DROP_VARIANTS: SfxVariant[] = [
  { suffix: 'Sub', params: { ...DROP_BASE, freqStart: 80, freqEnd: 30, duration: 1.0 } },
  { suffix: 'Massive', params: { ...DROP_BASE, freqStart: 90, freqEnd: 25, duration: 1.8, gain: 1 } },
  { suffix: 'Quick', params: { ...DROP_BASE, freqStart: 100, freqEnd: 35, duration: 0.5 } },
  { suffix: 'Dark', params: { ...DROP_BASE, freqStart: 70, freqEnd: 22, duration: 1.4 } },
  { suffix: 'Cinematic', params: { ...DROP_BASE, freqStart: 85, freqEnd: 28, duration: 2.2, pan: -0.1 } },
  { suffix: 'Long', params: { ...DROP_BASE, freqStart: 95, freqEnd: 24, duration: 2.8, gain: 0.9 } },
  { suffix: 'Impact', params: { ...DROP_BASE, freqStart: 110, freqEnd: 30, duration: 0.8, noise: 0.5 } },
  { suffix: 'Deep', params: { ...DROP_BASE, freqStart: 60, freqEnd: 20, duration: 1.6 } },
  { suffix: 'Rising', params: { ...DROP_BASE, freqStart: 25, freqEnd: 85, duration: 1.2, gain: 0.85 } },
  { suffix: 'Doom', params: { ...DROP_BASE, freqStart: 75, freqEnd: 18, duration: 3.0, gain: 1 } },
]

/* ------------------------------- Chime ------------------------------ */
/* Small arpeggiated bell notes — notifications and UI accents. */

const CHIME_BASE: Partial<SfxParams> = { wave: 'sine', gain: 0.6 }

const CHIME_VARIANTS: SfxVariant[] = [
  { suffix: 'Ping', params: { ...CHIME_BASE, freqStart: 1046, freqEnd: 2093, duration: 0.3, repeats: 3, interval: 0.1 } },
  { suffix: 'Two Note', params: { ...CHIME_BASE, freqStart: 880, freqEnd: 1760, duration: 0.35, repeats: 2, interval: 0.14 } },
  { suffix: 'Triad', params: { ...CHIME_BASE, freqStart: 660, freqEnd: 1320, duration: 0.3, repeats: 3, interval: 0.12 } },
  { suffix: 'Sparkle', params: { ...CHIME_BASE, freqStart: 1318, freqEnd: 2637, duration: 0.25, repeats: 4, interval: 0.09, gain: 0.5 } },
  { suffix: 'Soft', params: { ...CHIME_BASE, freqStart: 784, freqEnd: 1568, duration: 0.4, repeats: 3, interval: 0.15, gain: 0.35 } },
  { suffix: 'Deep', params: { ...CHIME_BASE, freqStart: 523, freqEnd: 1046, duration: 0.45, repeats: 3, interval: 0.14, gain: 0.7 } },
  { suffix: 'Fast', params: { ...CHIME_BASE, freqStart: 988, freqEnd: 1976, duration: 0.2, repeats: 4, interval: 0.07, gain: 0.55 } },
  { suffix: 'Notification', params: { ...CHIME_BASE, freqStart: 1175, freqEnd: 1568, duration: 0.35, repeats: 2, interval: 0.18, gain: 0.65 } },
  { suffix: 'Magic', params: { ...CHIME_BASE, freqStart: 1046, freqEnd: 2093, duration: 0.28, detune: 4, repeats: 5, interval: 0.1, gain: 0.5 } },
  { suffix: 'Tiny', params: { ...CHIME_BASE, freqStart: 1568, freqEnd: 3136, duration: 0.22, repeats: 3, interval: 0.08, gain: 0.4 } },
]

/* --------------------- v4: named-family helper ---------------------- */
/* The four v4 families group several sound kinds each (e.g. rain + wind +
 * birds inside "Nature"), so their effect names are free-form
 * ("Rain · Gentle", "Crowd · Big Cheer") instead of "<Family> · <suffix>". */

interface NamedSfxVariant {
  name: string
  type: SfxType
  params: SfxParams
}

function namedFamily(
  family: string,
  slug: string,
  emoji: string,
  tags: string[],
  variants: NamedSfxVariant[],
): SoundFxEffect[] {
  return variants.map((v, i): SoundFxEffect => ({
    id: `${slug}-${String(i + 1).padStart(2, '0')}`,
    name: v.name,
    family,
    category: 'sound',
    tags,
    emoji,
    duration: totalSeconds(v.params),
    synth: { type: v.type, params: v.params },
  }))
}

/* ------------------------------- Nature ------------------------------ */
/* Rain/wind/waves/fire ambiences + birdsong chirps.                    */
/* Ambience mapping: filterStart=bed cutoff (bandpass when q≥3),        */
/* filterEnd=cutoff glide, freqStart=swell LFO Hz, freqEnd=texture      */
/* burst band (<500 → rumble swells), decay=burst density, noise=level. */
/* Chirp mapping: freqStart/freqEnd=base/peak Hz, q=notes per phrase,   */
/* detune=second voice cents, repeats×interval=phrase spacing.          */

const NATURE_VARIANTS: NamedSfxVariant[] = [
  { name: 'Rain · Gentle', type: 'ambience', params: { freqStart: 0.05, freqEnd: 5200, duration: 4, decay: 0.35, noise: 1, filterStart: 6000, q: 0.7, gain: 0.5 } },
  { name: 'Rain · Downpour', type: 'ambience', params: { freqStart: 0.07, freqEnd: 6000, duration: 4, decay: 0.7, noise: 1, filterStart: 8000, q: 0.6, gain: 0.75 } },
  { name: 'Wind · Soft Breeze', type: 'ambience', params: { freqStart: 0.12, freqEnd: 0, duration: 5, noise: 1, filterStart: 350, filterEnd: 700, q: 0.8, gain: 0.45 } },
  { name: 'Wind · Howling Storm', type: 'ambience', params: { freqStart: 0.18, freqEnd: 0, duration: 5, noise: 1, filterStart: 200, filterEnd: 800, q: 1.6, gain: 0.7 } },
  { name: 'Ocean Waves', type: 'ambience', params: { freqStart: 0.15, freqEnd: 2400, duration: 5, decay: 0.45, noise: 1, filterStart: 750, filterEnd: 1100, q: 3.5, gain: 0.7 } },
  { name: 'Campfire Crackles', type: 'ambience', params: { freqStart: 0.08, freqEnd: 2600, duration: 4, decay: 0.55, noise: 1, filterStart: 500, filterEnd: 380, q: 0.7, gain: 0.6 } },
  { name: 'Forest Dawn', type: 'chirp', params: { freqStart: 2400, freqEnd: 3600, duration: 0.55, decay: 0.6, wave: 'sine', q: 3, gain: 0.4, repeats: 4, interval: 0.35, detune: 18, pan: -0.15 } },
  { name: 'Morning Birds', type: 'chirp', params: { freqStart: 2800, freqEnd: 4100, duration: 0.5, decay: 0.7, wave: 'triangle', q: 4, gain: 0.45, repeats: 5, interval: 0.28, detune: 12 } },
  { name: 'Songbird Melody', type: 'chirp', params: { freqStart: 2100, freqEnd: 4600, duration: 0.7, decay: 0.75, wave: 'sine', q: 4, gain: 0.5, repeats: 3, interval: 0.5, detune: 22, pan: 0.1 } },
  { name: 'Cricket Chorus', type: 'chirp', params: { freqStart: 4300, freqEnd: 4600, duration: 0.14, decay: 0.5, wave: 'sine', q: 3, gain: 0.3, repeats: 12, interval: 0.18 } },
]

/* ---------------------------- Human & Life --------------------------- */
/* Heartbeats (lub-dub sine thumps), crowds (clap bursts over a murmur   */
/* bed) and whistles/birds via chirp. Crowd mapping: freqStart=clap      */
/* band, freqEnd=murmur cutoff, decay=clap density, noise=murmur level.  */

const LIFE_VARIANTS: NamedSfxVariant[] = [
  { name: 'Heartbeat · Calm', type: 'heartbeat', params: { freqStart: 62, freqEnd: 34, duration: 0.32, decay: 0.4, gain: 0.85, repeats: 4, interval: 0.95 } },
  { name: 'Heartbeat · Racing', type: 'heartbeat', params: { freqStart: 78, freqEnd: 40, duration: 0.26, decay: 0.55, gain: 0.9, repeats: 8, interval: 0.42 } },
  { name: 'Heartbeat · Bass Drop Feel', type: 'heartbeat', params: { freqStart: 52, freqEnd: 30, duration: 0.5, decay: 0.8, gain: 1, repeats: 3, interval: 1.3 } },
  { name: 'Playful Birds', type: 'chirp', params: { freqStart: 3200, freqEnd: 4900, duration: 0.45, decay: 0.4, wave: 'triangle', q: 2, gain: 0.4, repeats: 6, interval: 0.22, detune: 26 } },
  { name: 'Crowd · Light Applause', type: 'crowd', params: { freqStart: 1500, freqEnd: 700, duration: 3, decay: 0.25, q: 1.2, noise: 0.4, gain: 0.6 } },
  { name: 'Crowd · Big Cheer', type: 'crowd', params: { freqStart: 1900, freqEnd: 850, duration: 3.5, decay: 0.65, q: 1.5, noise: 0.55, gain: 0.85 } },
  { name: 'Crowd · Stadium Roar', type: 'crowd', params: { freqStart: 2100, freqEnd: 950, duration: 4.5, decay: 0.95, q: 1.8, noise: 0.7, gain: 0.95 } },
  { name: 'Crowd · Murmur Café', type: 'crowd', params: { freqStart: 1200, freqEnd: 550, duration: 4.5, decay: 0.05, q: 0.9, noise: 0.6, gain: 0.45 } },
  { name: 'Celebration Whistles', type: 'chirp', params: { freqStart: 1800, freqEnd: 2600, duration: 0.8, decay: 0.3, wave: 'sine', q: 2, gain: 0.5, repeats: 3, interval: 0.6, detune: 30 } },
  { name: 'Crowd · Wedding Hall', type: 'crowd', params: { freqStart: 1600, freqEnd: 650, duration: 4, decay: 0.35, q: 1.1, noise: 0.65, gain: 0.6 } },
]

/* --------------------------- Foley & Objects ------------------------- */
/* Creative reuse of the rhythmic synths, documented here:                */
/* - heartbeat `noise` ≥ 0.8 suppresses the second thump and adds a knock */
/*   transient → single knocks, footsteps, ticks, shutter clacks;         */
/* - crowd with small q = tiny sharp bursts → keyboard keys;              */
/* - ambience bandpass beds (q ≥ 3) with slow glides → metal/rope creaks. */

const FOLEY_VARIANTS: NamedSfxVariant[] = [
  { name: 'Door Knock Triple', type: 'heartbeat', params: { freqStart: 130, freqEnd: 70, duration: 0.14, decay: 0.35, noise: 0.9, gain: 0.85, repeats: 3, interval: 0.34 } },
  { name: 'Footsteps Hard Floor', type: 'heartbeat', params: { freqStart: 95, freqEnd: 55, duration: 0.12, decay: 0.5, noise: 0.85, gain: 0.55, repeats: 6, interval: 0.42, pan: 0.12 } },
  { name: 'Clock Tick Loop', type: 'heartbeat', params: { freqStart: 1600, freqEnd: 900, duration: 0.04, decay: 0.2, noise: 0.95, gain: 0.4, repeats: 4, interval: 1 } },
  { name: 'Machine Hum', type: 'ambience', params: { freqStart: 0.012, freqEnd: 0, duration: 4, noise: 1, filterStart: 280, q: 1.5, gain: 0.5 } },
  { name: 'Metal Creaks', type: 'ambience', params: { freqStart: 0.06, freqEnd: 0, duration: 3.5, noise: 1, filterStart: 950, filterEnd: 1250, q: 7, gain: 0.45 } },
  { name: 'Rope Creak', type: 'ambience', params: { freqStart: 0.09, freqEnd: 0, duration: 2.5, noise: 1, filterStart: 700, filterEnd: 520, q: 5, gain: 0.4 } },
  { name: 'Paper Rustle', type: 'ambience', params: { freqStart: 0.12, freqEnd: 5000, duration: 0.9, decay: 0.85, noise: 1, filterStart: 4500, q: 0.8, gain: 0.55 } },
  { name: 'Keyboard Typing', type: 'crowd', params: { freqStart: 2600, freqEnd: 900, duration: 2.5, decay: 0.6, q: 2.5, noise: 0.15, gain: 0.5 } },
  { name: 'Camera Shutter', type: 'heartbeat', params: { freqStart: 2400, freqEnd: 1100, duration: 0.06, decay: 0.15, noise: 1, gain: 0.7, repeats: 2, interval: 0.09 } },
  { name: 'Pendulum Swing', type: 'heartbeat', params: { freqStart: 750, freqEnd: 420, duration: 0.06, decay: 0.3, noise: 0.9, gain: 0.35, repeats: 5, interval: 0.85 } },
]

/* --------------------------- Events & Weather ------------------------ */
/* Thunder (crack → rumble tail + seeded sub-rumbles, q=crack accents),   */
/* storm/earthquake/cave ambiences (low-band texture bursts = rumble      */
/* swells when freqEnd < 500) and crowd/thunder event hybrids.            */

const EVENTS_VARIANTS: NamedSfxVariant[] = [
  { name: 'Thunder · Distant Rumble', type: 'thunder', params: { freqStart: 55, freqEnd: 0, duration: 3.2, decay: 0.7, noise: 0.35, filterStart: 140, filterEnd: 900, q: 1, gain: 0.8 } },
  { name: 'Thunder · Crack & Roll', type: 'thunder', params: { freqStart: 80, freqEnd: 0, duration: 2.6, decay: 0.5, noise: 0.8, filterStart: 220, filterEnd: 2600, q: 2, gain: 0.95 } },
  { name: 'Thunder · Massive Bolt', type: 'thunder', params: { freqStart: 70, freqEnd: 0, duration: 3.5, decay: 0.85, noise: 1, filterStart: 250, filterEnd: 3800, q: 2, gain: 1 } },
  { name: 'Storm · Rain & Thunder', type: 'ambience', params: { freqStart: 0.09, freqEnd: 220, duration: 5, decay: 0.45, noise: 1, filterStart: 6000, q: 0.7, gain: 0.75 } },
  { name: 'Avalanche Rumble', type: 'ambience', params: { freqStart: 0.11, freqEnd: 180, duration: 5, decay: 0.6, noise: 1, filterStart: 380, filterEnd: 300, q: 0.8, gain: 0.85 } },
  { name: 'Earthquake Rumble', type: 'ambience', params: { freqStart: 0.07, freqEnd: 90, duration: 5, decay: 0.35, noise: 1, filterStart: 110, filterEnd: 95, q: 1, gain: 0.9 } },
  { name: 'Rock Concert Crowd', type: 'crowd', params: { freqStart: 1800, freqEnd: 900, duration: 4, decay: 0.8, q: 1.5, noise: 0.6, gain: 0.9 } },
  { name: 'Applause · Studio Warm', type: 'crowd', params: { freqStart: 1400, freqEnd: 600, duration: 3, decay: 0.5, q: 1, noise: 0.35, gain: 0.65 } },
  { name: 'Fireworks Show', type: 'thunder', params: { freqStart: 160, freqEnd: 0, duration: 3.5, decay: 0.6, noise: 0.9, filterStart: 180, filterEnd: 3500, q: 4, gain: 0.9 } },
  { name: 'Cave Rumble', type: 'ambience', params: { freqStart: 0.05, freqEnd: 120, duration: 4.5, decay: 0.25, noise: 1, filterStart: 160, filterEnd: 130, q: 1.2, gain: 0.7 } },
]

/* ----------------------------- Assembly ----------------------------- */

/** All 200 procedural sound effects — consumed by the effects registry. */
export const SOUND_FX_EFFECTS: SoundFxEffect[] = [
  ...family('whoosh', 'Whoosh', 'sound-whoosh', '🌪️', ['transition', 'whoosh'], WHOOSH_VARIANTS),
  ...family('riser', 'Riser', 'sound-riser', '🚀', ['transition', 'riser', 'build'], RISER_VARIANTS),
  ...family('impact', 'Impact', 'sound-impact', '💥', ['cinematic', 'impact'], IMPACT_VARIANTS),
  ...family('pop', 'Pop', 'sound-pop', '🫧', ['ui', 'pop'], POP_VARIANTS),
  ...family('click', 'Click', 'sound-click', '🖱️', ['ui', 'click'], CLICK_VARIANTS),
  ...family('zap', 'Zap', 'sound-zap', '⚡', ['ui', 'zap', 'electric'], ZAP_VARIANTS),
  ...family('laser', 'Laser', 'sound-laser', '🔫', ['game', 'laser', 'scifi'], LASER_VARIANTS),
  ...family('beep', 'Beep', 'sound-beep', '📢', ['ui', 'beep', 'alert'], BEEP_VARIANTS),
  ...family('glitch', 'Glitch', 'sound-glitch', '📺', ['glitch', 'digital'], GLITCH_VARIANTS),
  ...family('sweep', 'Sweep', 'sound-sweep', '🎚️', ['transition', 'sweep', 'filter'], SWEEP_VARIANTS),
  ...family('bell', 'Bell', 'sound-bell', '🔔', ['cinematic', 'bell'], BELL_VARIANTS),
  ...family('drum', 'Drum', 'sound-drum', '🥁', ['beat', 'drum'], DRUM_VARIANTS),
  ...family('bubble', 'Bubble', 'sound-bubble', '🫧', ['ui', 'bubble', 'water'], BUBBLE_VARIANTS),
  ...family('shimmer', 'Shimmer', 'sound-shimmer', '✨', ['cinematic', 'shimmer', 'sparkle'], SHIMMER_VARIANTS),
  ...family('drop', 'Drop', 'sound-drop', '🕳️', ['cinematic', 'drop', 'sub'], DROP_VARIANTS),
  ...family('chime', 'Chime', 'sound-chime', '💫', ['ui', 'chime', 'notification'], CHIME_VARIANTS),
  // v4 nature/human/foley/event families
  ...namedFamily('Nature', 'sound-nature', '🌿', ['nature', 'ambience', 'weather'], NATURE_VARIANTS),
  ...namedFamily('Human & Life', 'sound-life', '🫀', ['human', 'heartbeat', 'crowd'], LIFE_VARIANTS),
  ...namedFamily('Foley & Objects', 'sound-foley', '🛠️', ['foley', 'objects', 'real'], FOLEY_VARIANTS),
  ...namedFamily('Events & Weather', 'sound-events', '⛈️', ['weather', 'event', 'cinematic'], EVENTS_VARIANTS),
]
