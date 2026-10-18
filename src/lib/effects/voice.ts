/**
 * NovaCut Studio — Voice effects data + offline DSP renderer (category 'voice')
 *
 * 5 families × 10 variants = 50 VoiceFxEffect definitions plus the offline
 * renderer that transforms a source audio Blob into a processed 16-bit PCM
 * WAV (granular pitch shift → tilt/EQ → drive → ring mod → tremolo → echo →
 * reverb → noise → Haas width → limiter).
 *
 * - Every effect is a plain serializable VoiceFxSpec recipe (see './types').
 * - Deterministic: reverb impulses and hiss layers come from a mulberry32
 *   PRNG seeded by a hash of the effect id — no Math.random anywhere.
 * - Fully client-side; renderer calls throw a friendly error outside browsers
 *   (constructing/browsing the definitions is always safe).
 * - Plain module (no 'use client'), mirroring audio-render.ts.
 */
import type { VoiceFxEffect, VoiceFxSpec } from './types'
// shared 16-bit PCM stereo WAV encoder (exported by audio-render.ts)
import { encodeWav16BitStereo } from './audio-render'

/* ------------------------------ utilities ------------------------------ */

/** FNV-1a string hash → uint32 (PRNG seed source). */
function hashString(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** mulberry32 — tiny deterministic PRNG returning 0..1. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/* ----------------------------- environment ----------------------------- */

type AudioContextCtor = typeof AudioContext

function audioContextCtor(): AudioContextCtor {
  if (typeof window === 'undefined') throw new Error('Audio is not supported in this environment')
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor }
  const ctor = w.AudioContext ?? w.webkitAudioContext
  if (!ctor) throw new Error('Audio is not supported in this environment')
  return ctor
}

function offlineContextCtor(): typeof OfflineAudioContext {
  if (typeof window === 'undefined') throw new Error('Audio is not supported in this environment')
  const w = window as unknown as {
    OfflineAudioContext?: typeof OfflineAudioContext
    webkitOfflineAudioContext?: typeof OfflineAudioContext
  }
  const ctor = w.OfflineAudioContext ?? w.webkitOfflineAudioContext
  if (!ctor) throw new Error('Audio is not supported in this environment')
  return ctor
}

/* -------------------------- effect definitions ------------------------- */

interface VoiceVariant {
  name: string
  /** dry/wet mix 0..1 (wet share) — 1 = fully transformed */
  mix: number
  spec: VoiceFxSpec
}

function family(
  name: string,
  slug: string,
  emoji: string,
  tags: string[],
  variants: VoiceVariant[],
): VoiceFxEffect[] {
  return variants.map((v, i): VoiceFxEffect => ({
    id: `voice-${slug}-${String(i + 1).padStart(2, '0')}`,
    name: v.name,
    family: name,
    category: 'voice',
    tags,
    emoji,
    mix: v.mix,
    spec: v.spec,
  }))
}

/* --------------------------- Pitch Shift ------------------------------ */
/* Granular transpose from +11 down to -10 semitones, shaped per voice. */

const PITCH_SHIFT: VoiceFxEffect[] = family('Pitch Shift', 'pitch-shift', '🎚️', ['voice', 'pitch', 'transpose'], [
  { name: 'Chipmunk', mix: 1, spec: { pitch: 9, tilt: 1.25 } },
  { name: 'Squeaky Toy', mix: 1, spec: { pitch: 7, tilt: 1.5 } },
  { name: 'Bright & Airy', mix: 0.9, spec: { pitch: 5, tilt: 1.3, width: 0.5 } },
  { name: 'Youthful', mix: 0.85, spec: { pitch: 3, tilt: 1.15 } },
  { name: 'Deep Voice', mix: 0.9, spec: { pitch: -4, tilt: 0.8 } },
  { name: 'Deep Narrator', mix: 0.9, spec: { pitch: -5, tilt: 0.75, drive: 0.08 } },
  { name: 'Monster', mix: 1, spec: { pitch: -8, tilt: 0.6, drive: 0.25 } },
  { name: 'Giant', mix: 1, spec: { pitch: -10, tilt: 0.55, reverb: { seconds: 1.2, decay: 2.5, mix: 0.25 } } },
  { name: 'Tiny Elf', mix: 1, spec: { pitch: 11, tilt: 1.4, width: 0.35 } },
  { name: 'Gender Swap', mix: 0.9, spec: { pitch: 6, tilt: 1.2 } },
])

/* --------------------------- Robot & Alien ---------------------------- */
/* Ring-modulation timbres with mechanical drives, drones and shimmer. */

const ROBOT_ALIEN: VoiceFxEffect[] = family('Robot & Alien', 'robot-alien', '🤖', ['voice', 'robot', 'scifi'], [
  { name: 'Classic Robot', mix: 1, spec: { ringMod: { freq: 50, mix: 0.85 } } },
  { name: 'Robot Double', mix: 1, spec: { ringMod: { freq: 50, mix: 0.8 }, pitch: -5 } },
  { name: 'Android', mix: 1, spec: { ringMod: { freq: 90, mix: 0.7 }, drive: 0.3 } },
  { name: 'Cyber Voice', mix: 0.95, spec: { ringMod: { freq: 60, mix: 0.65 }, echo: { time: 0.16, feedback: 0.35, mix: 0.3 } } },
  { name: 'Alien Ambassador', mix: 1, spec: { ringMod: { freq: 140, mix: 0.75 }, pitch: 4 } },
  { name: 'UFO Creature', mix: 1, spec: { ringMod: { freq: 180, mix: 0.8 }, pitch: -6, tremolo: { rate: 5.5, depth: 0.5 } } },
  { name: 'Machine Drone', mix: 0.95, spec: { ringMod: { freq: 35, mix: 0.8 }, tilt: 0.6 } },
  { name: 'Ghost Bot', mix: 1, spec: { ringMod: { freq: 55, mix: 0.7 }, reverb: { seconds: 2.4, decay: 2.2, mix: 0.4 }, pitch: -2 } },
  { name: 'Droid Unit', mix: 1, spec: { ringMod: { freq: 75, mix: 0.65 }, drive: 0.2, eq: [{ type: 'bandpass', freq: 900, q: 1.2 }] } },
  { name: 'Vintage Synth Voice', mix: 1, spec: { ringMod: { freq: 120, mix: 0.7 }, tilt: 1.4 } },
])

/* ---------------------------- Phone & Radio --------------------------- */
/* Narrow-band communication channels: telephone, radio, megaphone, mic. */

const PHONE_RADIO: VoiceFxEffect[] = family('Phone & Radio', 'phone-radio', '📞', ['voice', 'phone', 'radio'], [
  { name: 'Telephone', mix: 0.95, spec: { eq: [{ type: 'highpass', freq: 300 }, { type: 'lowpass', freq: 3400 }], drive: 0.15 } },
  { name: 'Old Radio', mix: 0.95, spec: { eq: [{ type: 'highpass', freq: 500 }, { type: 'lowpass', freq: 2800 }], noise: 0.12, drive: 0.25 } },
  { name: 'Walkie-Talkie', mix: 0.95, spec: { eq: [{ type: 'highpass', freq: 400 }, { type: 'lowpass', freq: 2500 }], drive: 0.35, noise: 0.08 } },
  { name: 'Megaphone', mix: 0.95, spec: { eq: [{ type: 'highpass', freq: 600 }, { type: 'lowpass', freq: 3000 }], drive: 0.55, echo: { time: 0.09, feedback: 0.15, mix: 0.25 } } },
  { name: 'Intercom', mix: 0.9, spec: { eq: [{ type: 'lowpass', freq: 3000 }], drive: 0.2 } },
  { name: 'AM Broadcast', mix: 0.9, spec: { eq: [{ type: 'highpass', freq: 350 }, { type: 'lowpass', freq: 2500 }], tremolo: { rate: 0.5, depth: 0.25 }, drive: 0.1 } },
  { name: 'Shortwave', mix: 0.95, spec: { eq: [{ type: 'highpass', freq: 400 }, { type: 'lowpass', freq: 2600 }], noise: 0.2, tremolo: { rate: 6, depth: 0.5 } } },
  { name: 'Speakerphone', mix: 0.95, spec: { eq: [{ type: 'highpass', freq: 300 }, { type: 'lowpass', freq: 3400 }], reverb: { seconds: 0.5, decay: 2, mix: 0.25 }, drive: 0.3 } },
  { name: 'Pocket Call', mix: 0.95, spec: { eq: [{ type: 'highpass', freq: 500 }, { type: 'lowpass', freq: 1800 }], tilt: 0.7 } },
  { name: 'Vintage Mic', mix: 0.85, spec: { tilt: 0.75, drive: 0.12, noise: 0.06 } },
])

/* ---------------------------- Space & Echo ---------------------------- */
/* Slapbacks, canyons, cathedrals and wide ambient rooms. */

const SPACE_ECHO: VoiceFxEffect[] = family('Space & Echo', 'space-echo', '🏛️', ['voice', 'echo', 'reverb'], [
  { name: 'Slapback Echo', mix: 0.9, spec: { echo: { time: 0.12, feedback: 0.25, mix: 0.35 } } },
  { name: 'Classic Echo', mix: 0.9, spec: { echo: { time: 0.28, feedback: 0.35, mix: 0.4 } } },
  { name: 'Deep Canyon', mix: 0.95, spec: { echo: { time: 0.5, feedback: 0.45, mix: 0.5 } } },
  { name: 'Cathedral', mix: 0.9, spec: { reverb: { seconds: 3.2, decay: 2.2, mix: 0.55 } } },
  { name: 'Stadium', mix: 0.9, spec: { reverb: { seconds: 2.6, decay: 1.8, mix: 0.5 } } },
  { name: 'Cave Echo', mix: 0.95, spec: { echo: { time: 0.35, feedback: 0.4, mix: 0.35 }, reverb: { seconds: 1.8, decay: 2.5, mix: 0.4 } } },
  { name: 'Grand Hall', mix: 0.9, spec: { reverb: { seconds: 2.2, decay: 1.6, mix: 0.45 } } },
  { name: 'Tunnel Voice', mix: 0.95, spec: { echo: { time: 0.18, feedback: 0.5, mix: 0.45 }, eq: [{ type: 'lowpass', freq: 1400 }] } },
  { name: 'Space Station', mix: 0.95, spec: { reverb: { seconds: 4, decay: 2.5, mix: 0.5 }, tilt: 0.85, width: 0.8 } },
  { name: 'Haunted Chamber', mix: 0.95, spec: { reverb: { seconds: 3.5, decay: 2.2, mix: 0.5 }, tremolo: { rate: 0.8, depth: 0.35 }, pitch: -1 } },
])

/* ---------------------------- Character FX ---------------------------- */
/* Storybook characters: whispers, ghosts, demons, fairies, narrators. */

const CHARACTER_FX: VoiceFxEffect[] = family('Character FX', 'character-fx', '🎭', ['voice', 'character', 'creative'], [
  { name: 'Whisper', mix: 0.9, spec: { tilt: 1.5, noise: 0.18, eq: [{ type: 'highpass', freq: 300 }] } },
  { name: 'Ghost', mix: 1, spec: { pitch: -3, reverb: { seconds: 2.8, decay: 2.5, mix: 0.5 }, tremolo: { rate: 1.2, depth: 0.3 } } },
  { name: 'Demon', mix: 1, spec: { pitch: -6, drive: 0.4, tilt: 0.5, reverb: { seconds: 1.6, decay: 2, mix: 0.35 } } },
  { name: 'Underwater', mix: 0.95, spec: { eq: [{ type: 'lowpass', freq: 900 }], tremolo: { rate: 1.2, depth: 0.35 }, reverb: { seconds: 0.8, decay: 2, mix: 0.25 } } },
  { name: 'Voice of Doom', mix: 1, spec: { pitch: -9, tilt: 0.5, drive: 0.3 } },
  { name: 'Angelic', mix: 1, spec: { pitch: 4, reverb: { seconds: 2.8, decay: 2.2, mix: 0.5 }, width: 0.7 } },
  { name: 'Stadium Announcer', mix: 0.9, spec: { drive: 0.2, reverb: { seconds: 1.5, decay: 1.8, mix: 0.35 }, tilt: 0.9 } },
  { name: 'Narrator Pro', mix: 0.7, spec: { eq: [{ type: 'highshelf', freq: 3000, gain: 3 }], tilt: 1.1, drive: 0.08 } },
  { name: 'Cartoon Voice', mix: 1, spec: { pitch: 5, drive: 0.1, tilt: 1.3 } },
  { name: 'Vintage Fairy', mix: 1, spec: { pitch: 8, tilt: 1.35, reverb: { seconds: 1.2, decay: 2, mix: 0.3 } } },
])

/** All 50 voice effects — 5 families × 10 variants. */
export const VOICE_FX_EFFECTS: VoiceFxEffect[] = [
  ...PITCH_SHIFT,
  ...ROBOT_ALIEN,
  ...PHONE_RADIO,
  ...SPACE_ECHO,
  ...CHARACTER_FX,
]

/* ------------------------------ DSP blocks ------------------------------ */

const SAMPLE_RATE = 44100
/** granular grain size (seconds) */
const GRAIN = 0.09
/** granular hop (seconds) — half-overlap ⇒ two interleaved grain layers */
const HOP = 0.045

/** Input gain → soft-limiter compressor → destination (mirrors audio-render). */
function createLimiter(ctx: OfflineAudioContext): AudioNode {
  const input = ctx.createGain()
  input.gain.value = 0.9
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -12
  limiter.knee.value = 12
  limiter.ratio.value = 5
  limiter.attack.value = 0.004
  limiter.release.value = 0.18
  input.connect(limiter)
  limiter.connect(ctx.destination)
  return input
}

/** Generated stereo noise impulse (power decay), deterministic via prng. */
function makeReverbImpulse(
  ctx: BaseAudioContext,
  seconds: number,
  decay: number,
  prng: () => number,
): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * clamp(seconds, 0.05, 4.5)))
  const buffer = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < len; i++) {
      data[i] = (prng() * 2 - 1) * Math.pow(1 - i / len, clamp(decay, 0.1, 6))
    }
  }
  return buffer
}

/** Shared hiss layer: 2s deterministic white noise, looped for long renders. */
function makeHissBuffer(ctx: BaseAudioContext, prng: () => number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 2)
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = prng() * 2 - 1
  return buffer
}

/**
 * Builds the wet DSP chain: tilt shelves → eq biquads → tanh drive (parallel
 * clean blend) → ring modulator → tremolo → echo (feedback delay) → reverb
 * (convolver) → hiss layer → Haas width. Returns the chain's input/output.
 */
function connectWetChain(
  ctx: OfflineAudioContext,
  spec: VoiceFxSpec,
  prng: () => number,
): { input: GainNode; output: GainNode } {
  const input = ctx.createGain()
  // force stereo early so mono sources up-mix before the Haas splitter
  input.channelCount = 2
  input.channelCountMode = 'explicit'
  input.channelInterpretation = 'speakers'
  const output = ctx.createGain()
  const end = ctx.length / ctx.sampleRate
  let node: AudioNode = input

  const link = (next: AudioNode): void => {
    node.connect(next)
    node = next
  }

  /* 1 · spectral tilt — both shelves always present (gain 0 when neutral) */
  const tilt = spec.tilt ?? 1
  const lowShelf = ctx.createBiquadFilter()
  lowShelf.type = 'lowshelf'
  lowShelf.frequency.value = 320
  lowShelf.gain.value = tilt < 1 ? -8 * (1 - tilt) : 0
  link(lowShelf)

  const highShelf = ctx.createBiquadFilter()
  highShelf.type = 'highshelf'
  highShelf.frequency.value = 2800
  highShelf.gain.value = tilt > 1 ? 8 * (tilt - 1) : 0
  link(highShelf)

  /* 2 · explicit biquad chain */
  for (const f of spec.eq ?? []) {
    const biquad = ctx.createBiquadFilter()
    biquad.type = f.type
    biquad.frequency.value = clamp(f.freq, 10, ctx.sampleRate / 2 - 100)
    if (f.q !== undefined) biquad.Q.value = f.q
    if (f.gain !== undefined) biquad.gain.value = clamp(f.gain, -24, 24)
    link(biquad)
  }

  /* 3 · waveshaper drive — tanh curve in parallel with a clean blend */
  const drive = clamp(spec.drive ?? 0, 0, 1)
  if (drive > 0.001) {
    const k = 1 + drive * 24
    const n = 1024
    const curve = new Float32Array(n)
    const norm = Math.tanh(k)
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1
      curve[i] = Math.tanh(k * x) / norm
    }
    const shaper = ctx.createWaveShaper()
    shaper.curve = curve
    shaper.oversample = '2x'
    const shaped = ctx.createGain()
    shaped.gain.value = drive
    const clean = ctx.createGain()
    clean.gain.value = 1 - drive
    const sum = ctx.createGain()
    node.connect(shaper)
    shaper.connect(shaped)
    shaped.connect(sum)
    node.connect(clean)
    clean.connect(sum)
    node = sum
  }

  /* 4 · ring modulator — carrier gain (1 − mix/2) modulated ±mix/2 */
  const rm = spec.ringMod
  if (rm && rm.mix > 0.001) {
    const depth = clamp(rm.mix, 0, 1) / 2
    const carrier = ctx.createGain()
    carrier.gain.value = 1 - depth
    const modDepth = ctx.createGain()
    modDepth.gain.value = depth
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = clamp(rm.freq, 1, ctx.sampleRate / 2 - 100)
    osc.connect(modDepth)
    modDepth.connect(carrier.gain)
    osc.start(0)
    osc.stop(end)
    link(carrier)
  }

  /* 5 · tremolo — LFO on a VCA gain (1 − depth/2 ± depth/2) */
  const trem = spec.tremolo
  if (trem && trem.depth > 0.001) {
    const depth = clamp(trem.depth, 0, 1) / 2
    const vca = ctx.createGain()
    vca.gain.value = 1 - depth
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = Math.max(0.01, trem.rate)
    const lfoDepth = ctx.createGain()
    lfoDepth.gain.value = depth
    lfo.connect(lfoDepth)
    lfoDepth.connect(vca.gain)
    lfo.start(0)
    lfo.stop(end)
    link(vca)
  }

  /* 6 · echo — feedback delay, wet copy joins the path (dry passes through) */
  const echo = spec.echo
  if (echo && echo.mix > 0.001) {
    const stage = ctx.createGain()
    node.connect(stage)
    const delay = ctx.createDelay(2.5)
    delay.delayTime.value = clamp(echo.time, 0.005, 2.5)
    const feedback = ctx.createGain()
    feedback.gain.value = clamp(echo.feedback, 0, 0.85)
    const wet = ctx.createGain()
    wet.gain.value = clamp(echo.mix, 0, 1)
    node.connect(delay)
    delay.connect(feedback)
    feedback.connect(delay)
    delay.connect(wet)
    wet.connect(stage)
    node = stage
  }

  /* 7 · reverb — parallel convolver with a generated noise impulse */
  const reverb = spec.reverb
  if (reverb && reverb.mix > 0.001) {
    const stage = ctx.createGain()
    node.connect(stage)
    const convolver = ctx.createConvolver()
    convolver.buffer = makeReverbImpulse(ctx, reverb.seconds, reverb.decay, prng)
    const wet = ctx.createGain()
    wet.gain.value = clamp(reverb.mix, 0, 1)
    node.connect(convolver)
    convolver.connect(wet)
    wet.connect(stage)
    node = stage
  }

  /* 8 · hiss layer — extra noise mixed at spec.noise × 0.15 */
  const noise = clamp(spec.noise ?? 0, 0, 1)
  if (noise > 0.001) {
    const src = ctx.createBufferSource()
    src.buffer = makeHissBuffer(ctx, prng)
    src.loop = true
    const level = ctx.createGain()
    level.gain.value = noise * 0.15
    src.connect(level)
    level.connect(node)
    src.start(0)
  }

  /* 9 · Haas widener — right channel delayed 8..18ms scaled by width */
  const width = clamp(spec.width ?? 0, 0, 1)
  if (width > 0.001) {
    const splitter = ctx.createChannelSplitter(2)
    const merger = ctx.createChannelMerger(2)
    const rightDelay = ctx.createDelay(0.05)
    rightDelay.delayTime.value = 0.008 + 0.01 * width
    node.connect(splitter)
    splitter.connect(merger, 0, 0)
    splitter.connect(rightDelay, 1)
    rightDelay.connect(merger, 0, 1)
    link(merger)
  }

  node.connect(output)
  return { input, output }
}

/**
 * Schedules one granular pitch grain: a Hann-windowed slice of the source
 * played at `ratio` speed, so the grain lasts GRAIN seconds of output time.
 * Two interleaved layers step by HOP/2 for gapless 50% overlap.
 *
 * Duration-preserving pitch shift: grain input offsets advance LINEARLY
 * (offset = outTime), so the output covers the full source duration while
 * each grain is resampled by `ratio` — pitch changes, timing does not.
 * (Reading at offset = outTime·ratio would be tape-speed emulation, which
 * shortens pitch-up renders and lengthens pitch-down ones.)
 */
function schedulePitchGrains(
  ctx: OfflineAudioContext,
  source: AudioBuffer,
  ratio: number,
  out: AudioNode,
): void {
  const srcDur = source.duration
  const readDur = GRAIN / ratio
  for (let outTime = 0; outTime < srcDur; outTime += HOP / 2) {
    const offset = outTime
    if (offset >= srcDur) break
    const grain = ctx.createBufferSource()
    grain.buffer = source
    grain.playbackRate.value = ratio
    const win = ctx.createGain()
    const q = GRAIN / 4
    // Hann window approximated with 4 linear segments (peak at the middle)
    win.gain.setValueAtTime(0, outTime)
    win.gain.linearRampToValueAtTime(0.5, outTime + q)
    win.gain.linearRampToValueAtTime(1, outTime + 2 * q)
    win.gain.linearRampToValueAtTime(0.5, outTime + 3 * q)
    win.gain.linearRampToValueAtTime(0, outTime + GRAIN)
    grain.connect(win)
    win.connect(out)
    // clamp the read to the buffer — the final grain simply ends early
    grain.start(outTime, offset, Math.min(readDur, srcDur - offset))
  }
}

/** Offline render core shared by WAV export and preview playback. */
async function renderVoiceBuffer(
  source: AudioBuffer,
  effect: VoiceFxEffect,
  mixOverride?: number,
): Promise<AudioBuffer> {
  const OfflineCtor = offlineContextCtor()
  const mix = clamp(mixOverride ?? effect.mix, 0, 1)
  const spec = effect.spec
  const pitch = clamp(spec.pitch ?? 0, -12, 12)
  const ratio = Math.pow(2, pitch / 12)
  const srcDur = source.duration
  // duration-preserving: grains cover srcDur of output time (+ one grain of slack)
  const shiftedDur = pitch !== 0 ? srcDur + GRAIN : srcDur
  const tail = (spec.reverb?.seconds ?? 0) + (spec.echo ? spec.echo.time * 4 : 0) + 0.1
  const length = Math.max(1, Math.ceil((shiftedDur + tail) * SAMPLE_RATE))
  const ctx = new OfflineCtor(2, length, SAMPLE_RATE)

  const src = ctx.createBufferSource()
  src.buffer = source

  const wetIn = ctx.createGain()
  const wet = connectWetChain(ctx, spec, mulberry32(hashString(effect.id)))

  if (pitch !== 0) {
    schedulePitchGrains(ctx, source, ratio, wetIn)
  } else {
    src.connect(wetIn)
  }
  wetIn.connect(wet.input)

  const wetMix = ctx.createGain()
  wetMix.gain.value = mix
  wet.output.connect(wetMix)

  const dryGain = ctx.createGain()
  dryGain.gain.value = 1 - mix
  src.connect(dryGain)

  const sum = ctx.createGain()
  wetMix.connect(sum)
  dryGain.connect(sum)
  sum.connect(createLimiter(ctx))

  src.start(0)
  return ctx.startRendering()
}

/* ---------------------------- render pipeline ---------------------------- */

/**
 * Decodes an audio Blob into an AudioBuffer using a temporary AudioContext.
 * Throws the friendly environment error outside browsers.
 */
export async function decodeSource(source: Blob): Promise<AudioBuffer> {
  const Ctor = audioContextCtor()
  const ctx = new Ctor()
  try {
    const bytes = await source.arrayBuffer()
    // dual callback/promise form for older Safari compatibility
    return await new Promise<AudioBuffer>((resolve, reject) => {
      const pending = ctx.decodeAudioData(bytes, resolve, reject) as unknown as
        | Promise<AudioBuffer>
        | undefined
      if (pending && typeof pending.then === 'function') pending.then(resolve, reject)
    })
  } finally {
    if (ctx.state !== 'closed') void ctx.close().catch(() => undefined)
  }
}

/**
 * Extract a sub-range of a decoded buffer (pure data copy).
 * Uses the AudioBuffer constructor (all modern browsers); falls back to an
 * OfflineAudioContext-created buffer when the constructor is unavailable.
 */
function sliceBuffer(buf: AudioBuffer, offset: number, duration: number): AudioBuffer {
  const sr = buf.sampleRate
  const start = Math.max(0, Math.min(offset, buf.duration)) * sr
  const end = Math.min(buf.length, Math.max(start + duration * sr, start + 1))
  const length = Math.floor(end - start)
  let out: AudioBuffer
  try {
    out = new AudioBuffer({ numberOfChannels: buf.numberOfChannels, length, sampleRate: sr })
  } catch {
    const OfflineCtor =
      window.OfflineAudioContext ??
      (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext
    out = new OfflineCtor!(buf.numberOfChannels, length, sr).createBuffer(
      buf.numberOfChannels,
      length,
      sr,
    )
  }
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    out.copyToChannel(buf.getChannelData(ch).subarray(start, start + length), ch)
  }
  return out
}

/**
 * Renders a voice effect offline to a stereo WAV blob.
 * The rendered buffer is peak-normalized to ~0.9 while encoding (matching
 * audio-render.ts usage of encodeWav16BitStereo).
 */
export async function renderVoiceToWav(
  source: Blob,
  effect: VoiceFxEffect,
  opts?: { mix?: number; /** source in-point seconds (respects timeline trims) */ offset?: number; /** source window seconds — omit for the full source */ duration?: number },
): Promise<{ blob: Blob; duration: number }> {
  const decoded = await decodeSource(source)
  const windowed =
    opts?.offset !== undefined || opts?.duration !== undefined
      ? sliceBuffer(decoded, opts?.offset ?? 0, opts?.duration ?? decoded.duration)
      : decoded
  const buffer = await renderVoiceBuffer(windowed, effect, opts?.mix)
  let peak = 0
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i])
      if (abs > peak) peak = abs
    }
  }
  const gain = peak > 0.0001 ? Math.min(0.9 / peak, 8) : 1
  return { blob: encodeWav16BitStereo(buffer, gain), duration: buffer.duration }
}

/* ------------------------------ preview API ------------------------------ */

/** Deterministic "voice-like" demo phrase: 5 gated syllables, 2.2s. */
const DEMO_SYLLABLES: Array<{ at: number; dur: number; f0: number; f1: number; peak: number }> = [
  { at: 0.05, dur: 0.34, f0: 165, f1: 150, peak: 0.7 },
  { at: 0.45, dur: 0.3, f0: 175, f1: 160, peak: 0.85 },
  { at: 0.82, dur: 0.36, f0: 155, f1: 140, peak: 0.6 },
  { at: 1.26, dur: 0.32, f0: 180, f1: 158, peak: 0.9 },
  { at: 1.66, dur: 0.42, f0: 150, f1: 128, peak: 0.75 },
]

const DEMO_DURATION = 2.2
let demoVoiceBuffer: AudioBuffer | null = null

/** Renders the cached demo buffer once: 160Hz + 240Hz saws, 5Hz vibrato. */
async function renderDemoVoice(): Promise<AudioBuffer> {
  const OfflineCtor = offlineContextCtor()
  const ctx = new OfflineCtor(2, Math.ceil(DEMO_DURATION * SAMPLE_RATE), SAMPLE_RATE)

  const out = ctx.createGain()
  out.gain.value = 0.8
  out.connect(ctx.destination)

  // vibrato LFO — deterministic scheduled modulation on both oscillators
  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = 5
  const lfoDepth = ctx.createGain()
  lfoDepth.gain.value = 6
  lfo.connect(lfoDepth)
  lfo.start(0)
  lfo.stop(DEMO_DURATION)

  // layered sawtooths a fifth apart (~160Hz + 240Hz) with slight detune
  const mixer = ctx.createGain()
  mixer.gain.value = 0.3
  for (const [scale, cents] of [
    [1, -7],
    [1.5, 9],
  ] as const) {
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.detune.value = cents
    for (const syl of DEMO_SYLLABLES) {
      osc.frequency.setValueAtTime(syl.f0 * scale, syl.at)
      osc.frequency.linearRampToValueAtTime(syl.f1 * scale, syl.at + syl.dur)
    }
    lfoDepth.connect(osc.frequency)
    osc.connect(mixer)
    osc.start(0)
    osc.stop(DEMO_DURATION)
  }

  // syllable-ish amplitude gating: fast attack, hold, release per syllable
  const env = ctx.createGain()
  env.gain.setValueAtTime(0, 0)
  for (const syl of DEMO_SYLLABLES) {
    env.gain.setValueAtTime(0.0001, syl.at)
    env.gain.linearRampToValueAtTime(syl.peak, syl.at + 0.06)
    env.gain.setValueAtTime(syl.peak, syl.at + syl.dur * 0.7)
    env.gain.linearRampToValueAtTime(0.0001, syl.at + syl.dur)
  }
  mixer.connect(env)
  env.connect(out)

  return ctx.startRendering()
}

let voicePreviewCtx: AudioContext | null = null
let voicePreviewSource: AudioBufferSourceNode | null = null
let voicePreviewToken = 0

function ensureVoicePreviewContext(): AudioContext {
  const Ctor = audioContextCtor()
  if (!voicePreviewCtx || voicePreviewCtx.state === 'closed') voicePreviewCtx = new Ctor()
  if (voicePreviewCtx.state === 'suspended') void voicePreviewCtx.resume().catch(() => undefined)
  return voicePreviewCtx
}

/** True while a voice preview render/playback is active. */
export function isVoicePreviewing(): boolean {
  return voicePreviewSource !== null
}

/** Stops the current voice preview playback (safe to call any time). */
export function stopVoicePreview(): void {
  voicePreviewToken++
  const src = voicePreviewSource
  voicePreviewSource = null
  if (src) {
    try {
      src.onended = null
      src.stop()
      src.disconnect()
    } catch {
      // already stopped — nothing to do
    }
  }
}

/**
 * Renders the effect on the cached demo voice buffer offline and plays it
 * through a shared AudioContext. Calling this again (or stopVoicePreview)
 * stops the previous sound; superseded renders are discarded via token.
 */
export async function previewVoiceEffect(effect: VoiceFxEffect): Promise<void> {
  if (typeof window === 'undefined') throw new Error('Audio is not supported in this environment')
  audioContextCtor() // early friendly failure before doing work
  stopVoicePreview()
  const token = voicePreviewToken
  if (!demoVoiceBuffer) demoVoiceBuffer = await renderDemoVoice()
  if (token !== voicePreviewToken) return // superseded while rendering demo
  const rendered = await renderVoiceBuffer(demoVoiceBuffer, effect)
  if (token !== voicePreviewToken) return // superseded while rendering
  const ctx = ensureVoicePreviewContext()
  stopVoicePreview() // another preview may have raced in during the await
  const src = ctx.createBufferSource()
  src.buffer = rendered
  src.connect(ctx.destination)
  src.onended = () => {
    if (voicePreviewSource === src) voicePreviewSource = null
  }
  src.start()
  voicePreviewSource = src
}
