/**
 * NovaCut Studio — Mega Effects Library contract
 *
 * This file is THE contract for the whole effects system.
 * 10 categories × families × variants ≈ 1059 total effects:
 *
 *   color      220  → Filters (+ ColorGrade) patches on a clip
 *   transition 160  → paired patches on outgoing + incoming clips
 *   text       150  → extended TextAnimation + TextStyle patches
 *   sound      200  → procedural Web Audio SFX, rendered offline → WAV
 *   music       64  → procedural music loops, rendered offline → WAV
 *   overlay     90  → deterministic canvas-drawn overlays
 *   vision      60  → stylized canvas post-FX (pixelate/mirror/glow/chroma...)
 *   voice       50  → offline DSP voice transformations (pitch/robot/echo...)
 *   motion      40  → Ken Burns / pan / orbit / punch camera presets
 *   speed       25  → playback-rate presets with duration compensation
 *
 * Every effect is a plain serializable definition (except overlay/vision draw
 * kinds, which are closed union tags interpreted by the engine renderer).
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

export type EffectCategory =
  | 'color'
  | 'transition'
  | 'text'
  | 'sound'
  | 'music'
  | 'overlay'
  | 'vision'
  | 'voice'
  | 'motion'
  | 'speed'

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
    // v4 nature/human/foley/event families
    | 'heartbeat'
    | 'ambience'
    | 'thunder'
    | 'crowd'
    | 'chirp'
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
/* Vision effects (stylized canvas post-processing)                    */
/* ------------------------------------------------------------------ */

/** Closed-union draw recipe — the engine vision renderer interprets these. */
export type VisionDraw =
  | { kind: 'pixelate'; size: number }
  | { kind: 'mirror'; mode: 'left' | 'right' | 'top' | 'bottom' | 'quad' }
  | { kind: 'kaleido'; slices: 2 | 4 | 8 }
  | { kind: 'blur'; px: number }
  | { kind: 'glow'; amount: number; color: string; radius: number }
  | { kind: 'chroma'; shift: number }
  | { kind: 'duotone'; dark: string; light: string }
  | { kind: 'dreamy'; amount: number }
  | { kind: 'vhs'; shift: number; amount: number }
  | { kind: 'poster'; levels: number; strength: number }

export interface VisionEffect {
  id: string
  name: string
  family: string
  category: 'vision'
  tags: string[]
  emoji: string
  draw: VisionDraw
  /** default intensity 0..1 */
  intensity: number
  /** css background for the preview card */
  swatch: string
}

/* ------------------------------------------------------------------ */
/* Voice effects (offline DSP transforms of an audio clip)             */
/* ------------------------------------------------------------------ */

/** DSP recipe — interpreted by the offline voice renderer (voice.ts). */
export interface VoiceFxSpec {
  /** granular pitch shift in semitones (-12..12) */
  pitch?: number
  /** 0.5..2 spectral tilt: >1 brighter/thinner, <1 darker/warmer */
  tilt?: number
  /** explicit biquad chain (telephone/radio bands etc.) */
  eq?: Array<{ type: BiquadFilterType; freq: number; q?: number; gain?: number }>
  /** 0..1 waveshaper drive */
  drive?: number
  /** ring modulation (robot timbres) */
  ringMod?: { freq: number; mix: number }
  /** feedback delay */
  echo?: { time: number; feedback: number; mix: number }
  /** generated noise-impulse reverb */
  reverb?: { seconds: number; decay: number; mix: number }
  /** amplitude LFO */
  tremolo?: { rate: number; depth: number }
  /** 0..1 added breath/hiss noise */
  noise?: number
  /** 0..1 stereo widener (Haas-style) */
  width?: number
}

export interface VoiceFxEffect {
  id: string
  name: string
  family: string
  category: 'voice'
  tags: string[]
  emoji: string
  /** dry/wet mix 0..1 (wet share), applied on top of spec */
  mix: number
  spec: VoiceFxSpec
}

/* ------------------------------------------------------------------ */
/* Motion presets (camera move presets on a clip)                      */
/* ------------------------------------------------------------------ */

export interface MotionEffect {
  id: string
  name: string
  family: string
  category: 'motion'
  tags: string[]
  emoji: string
  /** base engine motion ('none' when pure keyframes) */
  motion: MotionType
  /** 0..1 Ken Burns intensity */
  motionIntensity: number
  /**
   * Optional extra transform keyframes.
   * `at` is a FRACTION of clip duration (0 | 0.5 | 1) — the applier
   * multiplies by clip.duration and generates keyframe ids.
   */
  keys?: Array<{ property: KeyframeProperty; at: 0 | 0.5 | 1; value: number; easing: EasingType }>
}

/* ------------------------------------------------------------------ */
/* Speed presets (playback-rate presets on a clip)                     */
/* ------------------------------------------------------------------ */

export interface SpeedEffect {
  id: string
  name: string
  family: string
  category: 'speed'
  tags: string[]
  emoji: string
  /** playback rate multiplier (0.1..10) */
  speed: number
  /** short hint shown on the card, e.g. "smooth slow motion" */
  hint?: string
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
  | VisionEffect
  | VoiceFxEffect
  | MotionEffect
  | SpeedEffect

/** State persisted on a Clip (see editor types Clip.overlay). */
export interface ClipOverlay {
  effectId: string
  intensity: number
}
