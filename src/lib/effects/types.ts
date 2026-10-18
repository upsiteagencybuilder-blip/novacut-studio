/**
 * NovaCut Studio — Mega Effects Library contract
 *
 * This file is THE contract for the whole effects system.
 * 6 categories × families × variants ≈ 794 total effects:
 *
 *   color      220  → Filters (+ ColorGrade) patches on a clip
 *   transition 110  → paired patches on outgoing + incoming clips
 *   text       150  → extended TextAnimation + TextStyle patches
 *   sound      160  → procedural Web Audio SFX, rendered offline → WAV
 *   music       64  → procedural music loops, rendered offline → WAV
 *   overlay     90  → deterministic canvas-drawn overlays
 *
 * Every effect is a plain serializable definition (except overlay draw kinds,
 * which are closed union tags interpreted by the engine renderer).
 * Do not break existing shapes — the engine, panels and registry all read this.
 */

import type {
  BlendMode,
  ColorGrade,
  EasingType,
  Filters,
  KeyframeProperty,
  MotionType,
  TextAnimation,
  TextStyle,
} from '@/lib/editor/types'

export type EffectCategory = 'color' | 'transition' | 'text' | 'sound' | 'music' | 'overlay'

/* ------------------------------------------------------------------ */
/* Color effects                                                       */
/* ------------------------------------------------------------------ */

export interface ColorEffect {
  id: string
  name: string
  /** family name, e.g. "Cinematic Teal & Orange" — groups the 10 variants */
  family: string
  category: 'color'
  tags: string[]
  /** patch applied over DEFAULT_FILTERS */
  filters: Partial<Filters>
  /** optional pro color-grade patch applied over neutral grade */
  grade?: Partial<ColorGrade>
  /** preview swatch: css background + css filter string */
  swatch: { bg: string; filter: string }
}

/* ------------------------------------------------------------------ */
/* Transition effects                                                  */
/* ------------------------------------------------------------------ */

/** Patch for one side (out/in) of a transition. All fields optional. */
export interface TransitionPatch {
  fadeIn?: number
  fadeOut?: number
  motion?: MotionType
  motionIntensity?: number
  /**
   * Transform keyframes anchored to the clip start/end.
   * The applier converts anchors to absolute keyframe times
   * (0 for 'start', clip.duration for 'end') and generates ids.
   */
  keys?: Array<{
    property: KeyframeProperty
    at: 'start' | 'end'
    value: number
    easing: EasingType
  }>
}

export interface TransitionEffect {
  id: string
  name: string
  family: string
  category: 'transition'
  tags: string[]
  /** default transition length in seconds (0.2..1.5) */
  duration: number
  /** what to set on the OUTGOING clip (may be null for intro-only transitions) */
  out: TransitionPatch | null
  /** what to set on the INCOMING clip (may be null for outro-only transitions) */
  in: TransitionPatch | null
}

/* ------------------------------------------------------------------ */
/* Text effects                                                        */
/* ------------------------------------------------------------------ */

export interface TextEffect {
  id: string
  name: string
  family: string
  category: 'text'
  tags: string[]
  /** extended animation id (see TextAnimation in editor types) */
  animation: TextAnimation
  /** seconds */
  animationDuration: number
  /** optional style patch (color/stroke/shadow/size...) */
  style?: Partial<TextStyle>
  /** css preview shorthand used by the preview card */
  previewCss: string
}

/* ------------------------------------------------------------------ */
/* Sound FX + Music (procedural audio)                                 */
/* ------------------------------------------------------------------ */

/** Parametric synthesis recipe — interpreted by the offline renderer. */
export interface SoundSynthSpec {
  type:
    | 'whoosh'
    | 'riser'
    | 'impact'
    | 'pop'
    | 'click'
    | 'zap'
    | 'laser'
    | 'beep'
    | 'glitch'
    | 'sweep'
    | 'bell'
    | 'drum'
    | 'bubble'
    | 'shimmer'
    | 'drop'
    | 'chime'
  params: {
    /** Hz — start frequency */
    freqStart: number
    /** Hz — end frequency */
    freqEnd: number
    /** seconds */
    duration: number
    /** 0..1 exponential decay amount */
    decay?: number
    /** 0..1 white-noise mix */
    noise?: number
    /** oscillator wave for tonal part */
    wave?: OscillatorType
    /** Hz — lowpass filter start */
    filterStart?: number
    /** Hz — lowpass filter end */
    filterEnd?: number
    /** filter resonance 0..20 */
    q?: number
    /** 0..1 output gain (default 0.8) */
    gain?: number
    /** number of repeats for rhythmic kinds (click/beep/bubble...) */
    repeats?: number
    /** seconds between repeats */
    interval?: number
    /** detune cents for layered oscillators */
    detune?: number
    /** -1..1 stereo pan */
    pan?: number
  }
}

export interface SoundFxEffect {
  id: string
  name: string
  family: string
  category: 'sound'
  tags: string[]
  emoji: string
  /** seconds (matches synth params.duration incl. repeats) */
  duration: number
  synth: SoundSynthSpec
}

/** Chord/sequencer recipe — interpreted by the music renderer. */
export interface MusicSpec {
  bpm: number
  bars: number
  /** root note name, e.g. 'Am' → A minor */
  key: string
  scale: 'minor' | 'major' | 'dorian'
  /** 16-step velocity patterns 0..1 (step = 16th note) */
  drums: { kick: number[]; snare: number[]; hat: number[] }
  bass: { wave: OscillatorType; /** scale-degree pattern (0=root) */ pattern: number[]; octave: number }
  lead: { wave: OscillatorType; arp: number[]; octave: number }
  /** sustained chord pads (semitone stacks from root) */
  pad?: { wave: OscillatorType; chords: number[][]; level: number }
  /** 0..0.5 shuffle amount */
  swing?: number
}

export interface MusicEffect {
  id: string
  name: string
  family: string
  category: 'music'
  tags: string[]
  emoji: string
  bpm: number
  bars: number
  duration: number
  spec: MusicSpec
}

/* ------------------------------------------------------------------ */
/* Overlay effects (deterministic canvas rendering)                    */
/* ------------------------------------------------------------------ */

/** Closed-union draw recipe — the engine renderer interprets these tags. */
export type OverlayDraw =
  | { kind: 'particles'; variant: 'snow' | 'rain' | 'sparks' | 'dust' | 'bokeh' | 'bubbles' | 'stars' | 'embers'; count: number; speed: number; size: number; color: string; drift: number; blend: BlendMode }
  | { kind: 'grain'; variant: 'fine' | 'film' | 'heavy'; amount: number }
  | { kind: 'vignette'; variant: 'soft' | 'strong' | 'cine'; amount: number; feather: number }
  | { kind: 'scanlines'; variant: 'crt' | 'vhs'; amount: number; spacing: number }
  | { kind: 'leak'; variant: 'corner' | 'sweep' | 'flicker' | 'beam'; hue: number; blend: BlendMode; amount: number }
  | { kind: 'flash'; variant: 'strobe' | 'pulse'; amount: number; speed: number }
  | { kind: 'shake'; variant: 'handheld' | 'earthquake'; amount: number; speed: number }
  | { kind: 'zoomPulse'; variant: 'beat' | 'breathe'; amount: number; speed: number }

export interface OverlayEffect {
  id: string
  name: string
  family: string
  category: 'overlay'
  tags: string[]
  emoji: string
  draw: OverlayDraw
  /** default intensity 0..1 */
  intensity: number
  /** css background for the preview card */
  swatch: string
}

/* ------------------------------------------------------------------ */
/* Union + registry API                                                */
/* ------------------------------------------------------------------ */

export type Effect =
  | ColorEffect
  | TransitionEffect
  | TextEffect
  | SoundFxEffect
  | MusicEffect
  | OverlayEffect

/** State persisted on a Clip (see editor types Clip.overlay). */
export interface ClipOverlay {
  effectId: string
  intensity: number
}
