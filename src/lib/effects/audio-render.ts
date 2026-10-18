/**
 * NovaCut Studio — procedural audio engine
 *
 * Renders SoundFxEffect / MusicEffect definitions offline (OfflineAudioContext,
 * stereo) to 16-bit PCM WAV blobs, plus click-to-preview playback helpers.
 *
 * - Deterministic: every random source (white noise, glitch burst placement,
 *   shimmer sparkles, ambience/crowd/thunder events) comes from a mulberry32
 *   PRNG seeded by a hash of the effect id — no Math.random anywhere.
 * - v4 synth types: heartbeat / ambience / thunder / crowd / chirp (nature,
 *   human & life, foley and event families).
 * - Master chain: input gain → soft-limiter compressor → destination, then a
 *   peak pass normalizes the rendered buffer to ~0.9 while encoding the WAV.
 * - Fully client-side; throws a friendly error outside browser environments.
 */
import type { MusicSpec, SoundFxEffect, SoundSynthSpec } from './types'
import type { MusicEffect } from './types'
import { ROOT_MIDI, SCALES } from './music'

export interface RenderedAudio {
  blob: Blob
  /** seconds of rendered audio */
  duration: number
  /** human-readable effect name */
  name: string
}

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

function safeWave(wave: OscillatorType | undefined, fallback: OscillatorType): OscillatorType {
  return !wave || wave === 'custom' ? fallback : wave
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
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

/* ----------------------------- master chain ---------------------------- */

/**
 * Input gain → soft-limiter compressor → destination.
 * Returns the node voices should connect into.
 */
function createMasterChain(ctx: OfflineAudioContext): GainNode {
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

/* ------------------------------ SFX voices ----------------------------- */

/** Seeded white-noise buffer (mono), shared by every voice of one render. */
function makeNoiseBuffer(ctx: BaseAudioContext, seconds: number, prng: () => number): AudioBuffer {
  const length = Math.max(1, Math.ceil(ctx.sampleRate * Math.max(0.05, seconds)))
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = prng() * 2 - 1
  return buffer
}

/** Noise source playing a deterministic random slice of the shared buffer. */
function noiseSource(
  ctx: OfflineAudioContext,
  buffer: AudioBuffer,
  t0: number,
  dur: number,
  prng: () => number,
): AudioBufferSourceNode {
  const src = ctx.createBufferSource()
  src.buffer = buffer
  const maxOffset = Math.max(0, buffer.duration - dur - 0.05)
  src.start(t0, maxOffset > 0 ? prng() * maxOffset : 0)
  src.stop(t0 + dur + 0.05)
  return src
}

/**
 * Layered oscillator mixer: 1 osc, or 3 detuned oscs (±detune cents) when a
 * detune amount is present. Frequency ramps f0 → f1 over rampDur.
 */
function toneOscs(
  ctx: OfflineAudioContext,
  wave: OscillatorType,
  f0: number,
  f1: number,
  detune: number | undefined,
  t0: number,
  rampDur: number,
  stopAt: number,
): GainNode {
  const mixer = ctx.createGain()
  const detuneAmt = detune !== undefined && detune > 0 ? detune : 0
  const count = detuneAmt > 0 ? 3 : 1
  mixer.gain.value = count === 3 ? 0.38 : 1
  const cents = count === 3 ? [-detuneAmt, 0, detuneAmt] : [0]
  const rampEnd = t0 + Math.max(0.01, rampDur)
  for (let i = 0; i < count; i++) {
    const osc = ctx.createOscillator()
    osc.type = wave
    osc.frequency.setValueAtTime(Math.max(1, f0), t0)
    if (Math.abs(f1 - f0) > 0.01) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), rampEnd)
    osc.detune.value = cents[i]
    osc.connect(mixer)
    osc.start(t0)
    osc.stop(stopAt + 0.05)
  }
  return mixer
}

/**
 * Schedules one SFX voice (synth recipe) at time `t0`. Rhythmic kinds reuse
 * this per repeat with `step` = repeat index (drives rising bubble/chime
 * pitches, heartbeat/chirp phrases). Glitch, ambience, thunder and crowd are
 * self-scheduled: they ignore repeats and lay out their own seeded internal
 * events across params.duration.
 */
function scheduleSfxVoice(
  ctx: OfflineAudioContext,
  synth: SoundSynthSpec,
  out: AudioNode,
  t0: number,
  step: number,
  prng: () => number,
  noiseBuf: AudioBuffer,
): void {
  const p = synth.params
  const dur = Math.max(0.02, p.duration)
  const end = t0 + dur
  const peak = clamp(p.gain ?? 0.8, 0.05, 1)

  let dest: AudioNode = out
  if (p.pan !== undefined && p.pan !== 0) {
    const panner = ctx.createStereoPanner()
    panner.pan.value = clamp(p.pan, -1, 1)
    panner.connect(out)
    dest = panner
  }

  /** fast attack + exponential decay envelope, fully silent by `decayEnd` */
  const decayingGain = (at: number, attack: number, level: number, decayEnd: number): GainNode => {
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.linearRampToValueAtTime(Math.max(0.0002, level), at + Math.max(0.0005, attack))
    g.gain.exponentialRampToValueAtTime(0.0001, Math.max(at + attack + 0.005, decayEnd))
    return g
  }

  switch (synth.type) {
    case 'whoosh': {
      const f0 = Math.max(40, p.freqStart)
      const f1 = Math.max(40, p.freqEnd)
      const src = noiseSource(ctx, noiseBuf, t0, dur, prng)
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.Q.value = p.q ?? 1
      bp.frequency.setValueAtTime(f0, t0)
      if (f1 >= f0) {
        // classic arc: rise through a brighter midpoint, land on f1
        bp.frequency.exponentialRampToValueAtTime(Math.max(f0, f1) * 1.8, t0 + dur * 0.55)
        bp.frequency.exponentialRampToValueAtTime(f1, end)
      } else {
        // descending = "reverse feel"
        bp.frequency.exponentialRampToValueAtTime(f1, end)
      }
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(peak, t0 + dur * (f1 >= f0 ? 0.45 : 0.7))
      g.gain.exponentialRampToValueAtTime(0.0001, end)
      src.connect(bp).connect(g).connect(dest)
      break
    }

    case 'riser': {
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(peak, Math.max(t0 + 0.05, end - 0.03))
      g.gain.linearRampToValueAtTime(0.0001, end)
      const tonal = toneOscs(
        ctx,
        safeWave(p.wave, 'sawtooth'),
        Math.max(30, p.freqStart),
        Math.max(30, p.freqEnd),
        p.detune,
        t0,
        dur,
        end,
      )
      const tonalGain = ctx.createGain()
      tonalGain.gain.value = 0.55
      tonal.connect(tonalGain).connect(g)
      const src = noiseSource(ctx, noiseBuf, t0, dur, prng)
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.Q.value = p.q ?? 1.5
      bp.frequency.setValueAtTime(Math.max(80, p.filterStart ?? 400), t0)
      bp.frequency.exponentialRampToValueAtTime(Math.max(200, p.filterEnd ?? 6000), end)
      const noiseGain = ctx.createGain()
      noiseGain.gain.value = clamp(0.4 + (p.noise ?? 0.35), 0.1, 0.9)
      src.connect(bp).connect(noiseGain).connect(g)
      g.connect(dest)
      break
    }

    case 'impact': {
      // sub boom: pitch-dropping sine stack
      const dropDur = Math.min(dur * 0.6, 0.4)
      const tonal = toneOscs(ctx, 'sine', Math.max(20, p.freqStart), Math.max(20, p.freqEnd), p.detune, t0, dropDur, end)
      tonal.connect(decayingGain(t0, 0.005, peak, end)).connect(dest)
      // noise burst through a closing lowpass
      const burstDur = Math.min(dur, 0.5)
      const src = noiseSource(ctx, noiseBuf, t0, burstDur, prng)
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.setValueAtTime(Math.max(100, p.filterStart ?? 1200), t0)
      lp.frequency.exponentialRampToValueAtTime(Math.max(60, p.filterEnd ?? 200), t0 + burstDur)
      src.connect(lp).connect(decayingGain(t0, 0.004, peak * clamp(p.noise ?? 0.6, 0, 1), t0 + burstDur)).connect(dest)
      break
    }

    case 'pop': {
      const decayEnd = t0 + Math.max(0.02, dur * (1.2 - (p.decay ?? 0.8)))
      const osc = ctx.createOscillator()
      osc.type = safeWave(p.wave, 'sine')
      osc.frequency.setValueAtTime(Math.max(30, p.freqStart), t0)
      osc.frequency.exponentialRampToValueAtTime(Math.max(25, p.freqEnd), t0 + Math.min(dur, 0.08))
      osc.connect(decayingGain(t0, 0.002, peak, decayEnd)).connect(dest)
      osc.start(t0)
      osc.stop(decayEnd + 0.05)
      // transient tick
      const src = noiseSource(ctx, noiseBuf, t0, Math.min(0.03, dur), prng)
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 1400
      src.connect(hp).connect(decayingGain(t0, 0.001, peak * clamp(p.noise ?? 0.3, 0, 1), t0 + Math.min(0.04, dur))).connect(dest)
      break
    }

    case 'click': {
      const decayEnd = t0 + Math.max(0.015, dur * (1.3 - (p.decay ?? 0.95)))
      const osc = ctx.createOscillator()
      osc.type = safeWave(p.wave, 'square')
      osc.frequency.setValueAtTime(Math.max(200, p.freqStart), t0)
      osc.frequency.exponentialRampToValueAtTime(Math.max(80, p.freqEnd), end)
      osc.connect(decayingGain(t0, 0.001, peak * 0.6, decayEnd)).connect(dest)
      osc.start(t0)
      osc.stop(decayEnd + 0.03)
      // mechanical transient
      const src = noiseSource(ctx, noiseBuf, t0, Math.min(0.012, dur), prng)
      src.connect(decayingGain(t0, 0.0005, peak * 0.4, t0 + Math.min(0.02, dur))).connect(dest)
      break
    }

    case 'beep': {
      const tonal = toneOscs(
        ctx,
        safeWave(p.wave, 'sine'),
        Math.max(50, p.freqStart),
        Math.max(50, p.freqEnd),
        p.detune,
        t0,
        dur,
        end,
      )
      const g = ctx.createGain()
      const hold = Math.max(t0 + 0.012, end - 0.015)
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.linearRampToValueAtTime(peak, t0 + 0.008)
      g.gain.setValueAtTime(peak, hold)
      g.gain.linearRampToValueAtTime(0.0001, end)
      tonal.connect(g).connect(dest)
      break
    }

    case 'zap': {
      const osc = ctx.createOscillator()
      osc.type = safeWave(p.wave, 'square')
      osc.frequency.setValueAtTime(Math.max(40, p.freqStart), t0)
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, p.freqEnd), t0 + dur * 0.8)
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.Q.value = p.q ?? 10
      lp.frequency.setValueAtTime(clamp(p.freqStart * 1.5, 200, 12000), t0)
      lp.frequency.exponentialRampToValueAtTime(clamp(p.freqEnd * 1.5, 120, 12000), t0 + dur * 0.8)
      osc.connect(decayingGain(t0, 0.002, peak, end)).connect(lp).connect(dest)
      osc.start(t0)
      osc.stop(end + 0.05)
      // static crackle
      const src = noiseSource(ctx, noiseBuf, t0, Math.min(0.05, dur), prng)
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 3000
      src.connect(hp).connect(decayingGain(t0, 0.001, peak * clamp(p.noise ?? 0.3, 0, 1), t0 + Math.min(0.06, dur))).connect(dest)
      break
    }

    case 'laser': {
      const tonal = toneOscs(
        ctx,
        safeWave(p.wave, 'sawtooth'),
        Math.max(60, p.freqStart),
        Math.max(40, p.freqEnd),
        p.detune,
        t0,
        dur * 0.9,
        end,
      )
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.Q.value = p.q ?? 6
      lp.frequency.setValueAtTime(clamp(p.freqStart * 1.4, 300, 14000), t0)
      lp.frequency.exponentialRampToValueAtTime(clamp(p.freqEnd * 1.4, 150, 14000), end)
      const g = decayingGain(t0, 0.003, peak, end)
      tonal.connect(lp).connect(g).connect(dest)
      // faint discharge noise
      const src = noiseSource(ctx, noiseBuf, t0, Math.min(0.06, dur), prng)
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 3500
      src.connect(hp).connect(decayingGain(t0, 0.001, peak * clamp(p.noise ?? 0.15, 0, 1), t0 + Math.min(0.07, dur))).connect(dest)
      break
    }

    case 'glitch': {
      // 6-10 short bursts at seeded offsets inside the duration
      const bursts = clamp(Math.round(p.repeats ?? 8), 6, 10)
      for (let i = 0; i < bursts; i++) {
        const at = t0 + prng() * dur * 0.85
        const blipDur = clamp((dur / bursts) * 0.7, 0.012, 0.07)
        if (prng() < 0.55) {
          const src = noiseSource(ctx, noiseBuf, at, blipDur, prng)
          const bp = ctx.createBiquadFilter()
          bp.type = 'bandpass'
          bp.Q.value = 3 + prng() * 4
          bp.frequency.value = Math.max(120, p.freqStart * (1 + prng() * 2))
          src.connect(bp).connect(decayingGain(at, 0.001, peak * (0.5 + prng() * 0.5), at + blipDur)).connect(dest)
        } else {
          const osc = ctx.createOscillator()
          osc.type = safeWave(p.wave, 'square')
          osc.frequency.value = Math.max(80, p.freqStart * (1 + prng() * 3))
          osc.connect(decayingGain(at, 0.001, peak * (0.4 + prng() * 0.5), at + blipDur)).connect(dest)
          osc.start(at)
          osc.stop(at + blipDur + 0.02)
        }
      }
      break
    }

    case 'sweep': {
      const src = noiseSource(ctx, noiseBuf, t0, dur, prng)
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.Q.value = p.q ?? 6
      bp.frequency.setValueAtTime(Math.max(60, p.freqStart), t0)
      bp.frequency.exponentialRampToValueAtTime(Math.max(60, p.freqEnd), end)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(peak, t0 + dur * 0.4)
      g.gain.exponentialRampToValueAtTime(0.0001, end)
      src.connect(bp).connect(g).connect(dest)
      break
    }

    case 'bell': {
      // inharmonic partial stack: f, 2.76f, 5.4f with progressively faster decay
      const f = Math.max(30, p.freqStart)
      const partials: Array<[ratio: number, level: number, decayScale: number]> = [
        [1, 1, 1],
        [2.76, 0.45, 0.55],
        [5.4, 0.22, 0.3],
      ]
      for (const [ratio, level, decayScale] of partials) {
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.value = f * ratio
        osc.connect(decayingGain(t0, 0.003, peak * level, t0 + dur * decayScale)).connect(dest)
        osc.start(t0)
        osc.stop(t0 + dur * decayScale + 0.05)
      }
      break
    }

    case 'drum': {
      const f = p.freqStart
      if (f >= 5000) {
        // hat — highpassed noise
        const src = noiseSource(ctx, noiseBuf, t0, dur, prng)
        const hp = ctx.createBiquadFilter()
        hp.type = 'highpass'
        hp.frequency.value = 8000
        src.connect(hp).connect(decayingGain(t0, 0.001, peak, t0 + Math.min(dur, 0.35))).connect(dest)
      } else if (f >= 600) {
        // snare — bandpassed noise + short body tone
        const src = noiseSource(ctx, noiseBuf, t0, Math.min(dur, 0.2), prng)
        const bp = ctx.createBiquadFilter()
        bp.type = 'bandpass'
        bp.frequency.value = 1800
        bp.Q.value = 0.8
        src.connect(bp).connect(decayingGain(t0, 0.001, peak * 0.8, t0 + Math.min(dur, 0.2))).connect(dest)
        const tone = ctx.createOscillator()
        tone.type = 'sine'
        tone.frequency.value = clamp(f / 10, 120, 280)
        tone.connect(decayingGain(t0, 0.001, peak * 0.4, t0 + Math.min(dur * 0.6, 0.1))).connect(dest)
        tone.start(t0)
        tone.stop(t0 + Math.min(dur * 0.6, 0.1) + 0.05)
      } else {
        // kick — pitch-dropping sine + click
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(Math.max(30, f), t0)
        osc.frequency.exponentialRampToValueAtTime(Math.max(25, p.freqEnd), t0 + Math.min(0.12, dur * 0.5))
        osc.connect(decayingGain(t0, 0.003, peak, t0 + Math.min(dur, 0.35))).connect(dest)
        osc.start(t0)
        osc.stop(t0 + Math.min(dur, 0.35) + 0.05)
        const src = noiseSource(ctx, noiseBuf, t0, 0.01, prng)
        const hp = ctx.createBiquadFilter()
        hp.type = 'highpass'
        hp.frequency.value = 2500
        src.connect(hp).connect(decayingGain(t0, 0.0005, peak * 0.25, t0 + 0.02)).connect(dest)
      }
      break
    }

    case 'bubble': {
      // repeat index drives a rising pitch between freqStart and freqEnd
      const n = clamp(Math.round(p.repeats ?? 4), 3, 6)
      const frac = n > 1 ? clamp(step / (n - 1), 0, 1) : 0
      const f = Math.max(80, p.freqStart) * Math.pow(Math.max(1.05, p.freqEnd / p.freqStart), frac)
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(f, t0)
      osc.frequency.exponentialRampToValueAtTime(f * 1.35, t0 + dur * 0.8)
      osc.connect(decayingGain(t0, 0.004, peak, end)).connect(dest)
      osc.start(t0)
      osc.stop(end + 0.05)
      break
    }

    case 'shimmer': {
      // staggered high sparkles with fast decays
      const count = 6
      for (let i = 0; i < count; i++) {
        const at = t0 + (i / count) * dur * 0.7 + prng() * dur * 0.06
        const f = Math.max(500, p.freqStart + prng() * Math.max(1, p.freqEnd - p.freqStart))
        const sparkleDur = clamp((end - at) * (0.25 + prng() * 0.3), 0.08, 0.4)
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.value = f
        osc.connect(decayingGain(at, 0.004, peak * (0.25 + prng() * 0.25), at + sparkleDur)).connect(dest)
        osc.start(at)
        osc.stop(at + sparkleDur + 0.05)
      }
      break
    }

    case 'drop': {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(Math.max(15, p.freqStart), t0)
      osc.frequency.exponentialRampToValueAtTime(Math.max(15, p.freqEnd), t0 + dur * 0.85)
      osc.connect(decayingGain(t0, 0.005, peak, end)).connect(dest)
      osc.start(t0)
      osc.stop(end + 0.05)
      // low thump
      const src = noiseSource(ctx, noiseBuf, t0, Math.min(0.18, dur), prng)
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 180
      src.connect(lp).connect(decayingGain(t0, 0.003, peak * clamp(p.noise ?? 0.3, 0, 1), t0 + Math.min(0.2, dur))).connect(dest)
      break
    }

    case 'chime': {
      // small arpeggio: one bell-ish note per repeat walking a major arc
      const arc = [0, 4, 7, 12]
      const semi = arc[step % arc.length]
      const f = Math.min(Math.max(30, p.freqEnd), Math.max(30, p.freqStart) * Math.pow(2, semi / 12))
      const tonal = toneOscs(ctx, 'sine', f, f, p.detune, t0, dur, end)
      tonal.connect(decayingGain(t0, 0.002, peak, end)).connect(dest)
      const harm = ctx.createOscillator()
      harm.type = 'sine'
      harm.frequency.value = f * 2.76
      harm.connect(decayingGain(t0, 0.002, peak * 0.25, t0 + dur * 0.5)).connect(dest)
      harm.start(t0)
      harm.stop(end + 0.05)
      break
    }

    case 'heartbeat': {
      // Paired low thumps (lub-dub): sine freqStart→freqEnd with a fast decay;
      // the second thump lands ~0.24–0.30s after the first at ~0.62× gain.
      // repeats × interval schedule multiple beats (handled by renderSfx).
      // Documented creative reuse (see soundfx.ts): `noise` progressively
      // suppresses the second thump and adds a knock/click transient, which
      // turns the beat into knocks / footsteps / ticks / shutter clacks.
      const f0 = Math.max(20, p.freqStart)
      const f1 = Math.max(15, p.freqEnd)
      const decayAmt = clamp(p.decay ?? 0.5, 0, 1)
      const clickLevel = clamp(p.noise ?? 0, 0, 1)
      const dub = Math.max(0, 1 - clickLevel * 1.15)
      const thump = (at: number, freq: number, level: number, decayEnd: number): void => {
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, at)
        osc.frequency.exponentialRampToValueAtTime(f1, at + 0.08)
        osc.connect(decayingGain(at, 0.004, level, decayEnd)).connect(dest)
        osc.start(at)
        osc.stop(decayEnd + 0.05)
        if (clickLevel > 0.05) {
          const click = noiseSource(ctx, noiseBuf, at, 0.014, prng)
          const hp = ctx.createBiquadFilter()
          hp.type = 'highpass'
          hp.frequency.value = 1300
          click
            .connect(hp)
            .connect(decayingGain(at, 0.001, level * clickLevel * 0.55, at + 0.03))
            .connect(dest)
        }
      }
      thump(t0, f0, peak, t0 + 0.12 + decayAmt * 0.2)
      if (dub > 0.02) {
        const at2 = t0 + 0.24 + prng() * 0.06
        thump(at2, f0 * 0.94, peak * 0.62 * dub, at2 + 0.1 + decayAmt * 0.16)
      }
      break
    }

    case 'ambience': {
      // Continuous filtered-noise bed with slow deterministic LFO swells.
      // Param contract used by the v4 ambience definitions:
      //   filterStart → bed cutoff (lowpass, or bandpass center when q ≥ 3)
      //   filterEnd   → cutoff glide end (defaults to filterStart)
      //   freqStart   → swell LFO rate Hz (≤ 0.02 = steady bed)
      //   freqEnd     → texture-burst band center Hz (omit = no bursts;
      //                 < 500 → long rumble swells instead of patter)
      //   decay       → burst density 0..1, noise → bed level 0..1
      const cutoff0 = clamp(p.filterStart ?? 800, 40, 12000)
      const cutoff1 = clamp(p.filterEnd ?? cutoff0, 40, 12000)
      const bandBed = (p.q ?? 0) >= 3
      const bus = ctx.createGain()
      const fade = ctx.createGain() // gentle edge fades so loops never click
      fade.gain.setValueAtTime(0.0001, t0)
      fade.gain.linearRampToValueAtTime(1, t0 + Math.min(0.12, dur * 0.2))
      fade.gain.setValueAtTime(1, Math.max(t0 + 0.12, end - 0.15))
      fade.gain.linearRampToValueAtTime(0.0001, end)
      bus.connect(fade).connect(dest)

      const bed = noiseSource(ctx, noiseBuf, t0, dur, prng)
      const filt = ctx.createBiquadFilter()
      filt.type = bandBed ? 'bandpass' : 'lowpass'
      filt.Q.value = bandBed ? clamp(p.q ?? 3, 0.5, 14) : clamp(p.q ?? 0.7, 0.3, 6)
      filt.frequency.setValueAtTime(cutoff0, t0)
      if (Math.abs(cutoff1 - cutoff0) > 1) {
        filt.frequency.exponentialRampToValueAtTime(cutoff1, Math.max(t0 + 0.2, end))
      }
      const level = clamp(p.noise ?? 1, 0, 1) * peak
      const bedGain = ctx.createGain()
      bedGain.gain.value = level * 0.8
      const swellRate = p.freqStart ?? 0.1
      if (swellRate > 0.02) {
        const lfo = ctx.createOscillator()
        lfo.type = 'sine'
        lfo.frequency.value = clamp(swellRate, 0.03, 2)
        const depth = ctx.createGain()
        depth.gain.value = level * 0.35
        lfo.connect(depth).connect(bedGain.gain)
        lfo.start(t0)
        lfo.stop(end + 0.05)
      }
      bed.connect(filt).connect(bedGain).connect(bus)

      if (p.freqEnd !== undefined && p.freqEnd > 0) {
        const bandCenter = clamp(p.freqEnd, 40, 10000)
        const lowBand = bandCenter < 500
        const density = clamp(p.decay ?? 0.3, 0, 1)
        const perSecond = lowBand ? 0.3 + density * 1.7 : 1.5 + density * 18.5
        const count = Math.max(1, Math.round(perSecond * dur))
        for (let i = 0; i < count; i++) {
          const at = t0 + prng() * dur * 0.92
          const burstDur = lowBand
            ? 0.5 + prng() * 0.9
            : clamp(0.05 - (p.q ?? 1) * 0.004, 0.012, 0.06)
          const src = noiseSource(ctx, noiseBuf, at, Math.min(burstDur, dur), prng)
          const bp = ctx.createBiquadFilter()
          bp.type = 'bandpass'
          bp.frequency.value = clamp(bandCenter * (0.8 + prng() * 0.5), 30, 11000)
          bp.Q.value = lowBand ? 1.2 : clamp(p.q ?? 1, 0.7, 9)
          const lvl = peak * (lowBand ? 0.45 + prng() * 0.5 : 0.3 + prng() * 0.5)
          const env = ctx.createGain()
          env.gain.setValueAtTime(0.0001, at)
          env.gain.linearRampToValueAtTime(lvl, at + (lowBand ? 0.08 + prng() * 0.1 : 0.001))
          env.gain.exponentialRampToValueAtTime(0.0001, at + burstDur * (lowBand ? 1 : 2.4))
          const pan = ctx.createStereoPanner()
          pan.pan.value = clamp(prng() * 1.6 - 0.8, -1, 1)
          src.connect(bp).connect(env).connect(pan).connect(bus)
        }
      }
      break
    }

    case 'thunder': {
      // Initial crack (short bright noise burst) → low rumble (lowpassed
      // brown-ish noise) with a long exponential tail, plus seeded sub-rumble
      // swells. Param contract: filterStart → rumble lowpass cutoff,
      // filterEnd → crack brightness cutoff, freqStart → sub-rumble band
      // center, noise → crack loudness, decay → tail length 0..1,
      // q → number of crack accents (1-5, e.g. fireworks bursts).
      const total = dur
      const crackCut = clamp(p.filterEnd ?? 2400, 500, 8000)
      const rumbleCut = clamp(p.filterStart ?? 180, 60, 500)
      const subBand = clamp(p.freqStart ?? 70, 25, 200)
      const crackLevel = clamp(p.noise ?? 0.6, 0, 1)
      const cracks = clamp(Math.round(p.q ?? 1), 1, 5)
      for (let c = 0; c < cracks; c++) {
        const at = t0 + (c === 0 ? 0 : prng() * total * 0.35)
        const cd = 0.04 + prng() * 0.05
        const src = noiseSource(ctx, noiseBuf, at, cd * 2, prng)
        const hp = ctx.createBiquadFilter()
        hp.type = 'highpass'
        hp.frequency.value = crackCut * (0.85 + prng() * 0.3)
        const lvl = peak * crackLevel * (c === 0 ? 1 : 0.4 + prng() * 0.5)
        src.connect(hp).connect(decayingGain(at, 0.001, lvl, at + cd * 3)).connect(dest)
      }
      const rumble = noiseSource(ctx, noiseBuf, t0, total, prng)
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = rumbleCut
      lp.Q.value = 0.8
      const tail = total * (0.55 + clamp(p.decay ?? 0.6, 0, 1) * 0.42)
      rumble.connect(lp).connect(decayingGain(t0, 0.02, peak * 0.85, t0 + tail)).connect(dest)
      const subs = 2 + Math.round(prng() * 2)
      for (let s = 0; s < subs; s++) {
        const at = t0 + total * (0.08 + prng() * 0.7)
        const sd = Math.min(0.4 + prng() * 0.9, Math.max(0.1, end - at - 0.02))
        const src = noiseSource(ctx, noiseBuf, at, sd, prng)
        const bp = ctx.createBiquadFilter()
        bp.type = 'bandpass'
        bp.frequency.value = clamp(subBand * (0.9 + prng() * 0.3), 20, 250)
        bp.Q.value = 1.4
        const lvl = peak * (0.3 + prng() * 0.4)
        const env = ctx.createGain()
        env.gain.setValueAtTime(0.0001, at)
        env.gain.linearRampToValueAtTime(lvl, at + 0.06)
        env.gain.exponentialRampToValueAtTime(0.0001, at + sd)
        src.connect(bp).connect(env).connect(dest)
      }
      break
    }

    case 'crowd': {
      // Murmur bed (lowpassed noise with slow seeded undulation) + bandpass
      // clap bursts at seeded times/pans. Param contract: freqStart → clap
      // band center, freqEnd → murmur cutoff, noise → murmur level,
      // decay → clap density (≈1.5-20 bursts/s), q → clap resonance (also
      // sharpens burst length — small q = typing/keys, large = soft claps).
      const bus = ctx.createGain()
      const fade = ctx.createGain()
      fade.gain.setValueAtTime(0.0001, t0)
      fade.gain.linearRampToValueAtTime(1, t0 + Math.min(0.1, dur * 0.2))
      fade.gain.setValueAtTime(1, Math.max(t0 + 0.1, end - 0.12))
      fade.gain.linearRampToValueAtTime(0.0001, end)
      bus.connect(fade).connect(dest)

      const murmurLevel = clamp(p.noise ?? 0.5, 0, 1)
      const bed = noiseSource(ctx, noiseBuf, t0, dur, prng)
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = clamp(p.freqEnd ?? 700, 150, 3000)
      lp.Q.value = 0.6
      const bedGain = ctx.createGain()
      bedGain.gain.value = murmurLevel * peak * 0.5
      const lfo = ctx.createOscillator()
      lfo.type = 'sine'
      lfo.frequency.value = 0.2 + prng() * 0.3
      const depth = ctx.createGain()
      depth.gain.value = murmurLevel * peak * 0.18
      lfo.connect(depth).connect(bedGain.gain)
      lfo.start(t0)
      lfo.stop(end + 0.05)
      bed.connect(lp).connect(bedGain).connect(bus)

      const clapBand = clamp(p.freqStart ?? 1600, 400, 4000)
      const clapQ = clamp(p.q ?? 1.2, 0.5, 8)
      const clapDur = clamp(0.05 - clapQ * 0.006, 0.016, 0.05)
      const perSecond = 1.5 + clamp(p.decay ?? 0.5, 0, 1) * 18.5
      const claps = Math.max(1, Math.round(perSecond * dur))
      for (let i = 0; i < claps; i++) {
        const at = t0 + prng() * dur * 0.95
        const src = noiseSource(ctx, noiseBuf, at, clapDur * 2, prng)
        const bp = ctx.createBiquadFilter()
        bp.type = 'bandpass'
        bp.frequency.value = clapBand * (0.85 + prng() * 0.35)
        bp.Q.value = clapQ
        const lvl = peak * (0.3 + prng() * 0.65)
        const pan = ctx.createStereoPanner()
        pan.pan.value = clamp(prng() * 1.6 - 0.8, -1, 1)
        src
          .connect(bp)
          .connect(decayingGain(at, 0.001, lvl, at + clapDur * 2.4))
          .connect(pan)
          .connect(bus)
      }
      break
    }

    case 'chirp': {
      // Birdsong: a phrase of 2-4 tonal note arcs — each sweeps freqStart →
      // freqEnd → back toward freqStart (≈35-450ms, birdsong 60-140ms).
      // Param contract: q → notes per phrase (2-4), decay → note tail,
      // detune > 0 → adds a second voice ±detune cents, wave → timbre,
      // repeats × interval → phrase spacing (handled by renderSfx).
      const notes = clamp(Math.round(p.q ?? 3), 2, 4)
      const noteLen = clamp((dur * 0.8) / notes, 0.035, 0.45)
      const cents = p.detune !== undefined && p.detune > 0 ? [-p.detune, p.detune] : [0]
      for (let n = 0; n < notes; n++) {
        const at = t0 + (n * dur * 0.8) / notes + prng() * 0.018
        const fBase = Math.max(300, p.freqStart) * (0.94 + prng() * 0.12)
        const fPeak = Math.max(fBase * 1.08, Math.max(300, p.freqEnd)) * (0.9 + prng() * 0.22)
        const lvl = (peak * (0.7 + prng() * 0.3)) / cents.length
        const decayEnd = at + noteLen * (1.05 + clamp(p.decay ?? 0.5, 0, 1) * 0.5)
        for (const c of cents) {
          const osc = ctx.createOscillator()
          osc.type = safeWave(p.wave, 'sine')
          osc.detune.value = c
          osc.frequency.setValueAtTime(fBase, at)
          osc.frequency.exponentialRampToValueAtTime(fPeak, at + noteLen * 0.45)
          osc.frequency.exponentialRampToValueAtTime(fBase * 1.05, at + noteLen)
          osc.connect(decayingGain(at, 0.006, lvl, decayEnd)).connect(dest)
          osc.start(at)
          osc.stop(decayEnd + 0.05)
        }
      }
      break
    }

    default: {
      // Exhaustiveness guard: adding a SoundSynthSpec type without a case
      // above fails compilation here (synth.type is `never` in this branch).
      const exhaustive: never = synth.type
      void exhaustive
      break
    }
  }
}

/** Renders the full SFX synth spec (handles repeat scheduling). */
function renderSfx(
  ctx: OfflineAudioContext,
  synth: SoundSynthSpec,
  out: AudioNode,
  prng: () => number,
  noisePrng: () => number,
): void {
  const p = synth.params
  // glitch / ambience / thunder / crowd lay out their own seeded internal
  // events across params.duration — always render them as a single voice.
  const selfScheduled =
    synth.type === 'glitch' ||
    synth.type === 'ambience' ||
    synth.type === 'thunder' ||
    synth.type === 'crowd'
  const repeats = selfScheduled ? 1 : Math.max(1, Math.round(p.repeats ?? 1))
  const interval = Math.max(0.01, p.interval ?? 0.12)
  const bufferSeconds = p.duration + (repeats - 1) * interval + 0.35
  const noiseBuf = makeNoiseBuffer(ctx, bufferSeconds, noisePrng)
  for (let i = 0; i < repeats; i++) {
    scheduleSfxVoice(ctx, synth, out, i * interval, i, prng, noiseBuf)
  }
}

/* ---------------------------- music renderer ---------------------------- */

/**
 * Renders a MusicSpec: 16th-note step clock with swing, drum one-shots driven
 * by velocity grids, scale-degree bass on 8ths, plucked lead arps on 16ths and
 * a sustained chord pad cycling one chord per section.
 */
function renderMusic(
  ctx: OfflineAudioContext,
  spec: MusicSpec,
  out: AudioNode,
  noisePrng: () => number,
): void {
  const scale = SCALES[spec.scale] ?? SCALES.minor
  const root = ROOT_MIDI[spec.key] ?? 57
  const step = 60 / spec.bpm / 4
  const barLen = step * 16
  const swing = clamp(spec.swing ?? 0, 0, 0.5)
  const noiseBuf = makeNoiseBuffer(ctx, 1.2, noisePrng)

  const degreeMidi = (deg: number, octave: number): number =>
    root + scale[((deg % 7) + 7) % 7] + Math.floor(deg / 7) * 12 + octave * 12

  /* --- drum one-shots --- */
  const kickAt = (t: number, v: number): void => {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(150, t)
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.9 * v, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25)
    osc.connect(g).connect(out)
    osc.start(t)
    osc.stop(t + 0.3)
    // attack click
    const click = noiseSource(ctx, noiseBuf, t, 0.015, noisePrng)
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 3000
    const cg = ctx.createGain()
    cg.gain.setValueAtTime(0.12 * v, t)
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.02)
    click.connect(hp).connect(cg).connect(out)
  }

  const snareAt = (t: number, v: number): void => {
    const noise = noiseSource(ctx, noiseBuf, t, 0.14, noisePrng)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1800
    bp.Q.value = 0.8
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(0.7 * v, t)
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
    noise.connect(bp).connect(ng).connect(out)
    const tone = ctx.createOscillator()
    tone.type = 'sine'
    tone.frequency.value = 190
    const tg = ctx.createGain()
    tg.gain.setValueAtTime(0.35 * v, t)
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.08)
    tone.connect(tg).connect(out)
    tone.start(t)
    tone.stop(t + 0.1)
  }

  const hatAt = (t: number, v: number): void => {
    const noise = noiseSource(ctx, noiseBuf, t, 0.05, noisePrng)
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 8000
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.4 * v, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045)
    noise.connect(hp).connect(g).connect(out)
  }

  /* --- tonal parts --- */
  const bassNote = (t: number, deg: number): void => {
    const noteDur = Math.max(0.2, step * 2 * 1.05)
    const osc = ctx.createOscillator()
    osc.type = safeWave(spec.bass.wave, 'sine')
    osc.frequency.value = midiToFreq(degreeMidi(deg, spec.bass.octave))
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 800
    lp.Q.value = 0.7
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.5, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + noteDur)
    osc.connect(lp).connect(g).connect(out)
    osc.start(t)
    osc.stop(t + noteDur + 0.05)
  }

  const leadNote = (t: number, deg: number): void => {
    const osc = ctx.createOscillator()
    osc.type = safeWave(spec.lead.wave, 'sine')
    osc.frequency.value = midiToFreq(degreeMidi(deg, spec.lead.octave))
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.12, t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13)
    osc.connect(g).connect(out)
    osc.start(t)
    osc.stop(t + 0.18)
  }

  const padAt = (barStart: number, chord: number[]): void => {
    if (!spec.pad || chord.length === 0) return
    const voiceGain = spec.pad.level / Math.max(1, chord.length * 2)
    for (const semi of chord) {
      const freq = midiToFreq(root + semi)
      for (const cents of [-6, 6]) {
        const osc = ctx.createOscillator()
        osc.type = safeWave(spec.pad.wave, 'sine')
        osc.frequency.value = freq
        osc.detune.value = cents
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.0001, barStart)
        g.gain.linearRampToValueAtTime(voiceGain, barStart + 0.3)
        g.gain.setValueAtTime(voiceGain, barStart + barLen)
        g.gain.linearRampToValueAtTime(0.0001, barStart + barLen + 0.3)
        osc.connect(g).connect(out)
        osc.start(barStart)
        osc.stop(barStart + barLen + 0.35)
      }
    }
  }

  /* --- sequencer --- */
  for (let bar = 0; bar < spec.bars; bar++) {
    const barStart = bar * barLen
    if (spec.pad && spec.pad.chords.length > 0) {
      const chordIndex = Math.min(
        spec.pad.chords.length - 1,
        Math.floor((bar * spec.pad.chords.length) / Math.max(1, spec.bars)),
      )
      padAt(barStart, spec.pad.chords[chordIndex])
    }
    for (let s = 0; s < 16; s++) {
      const t = barStart + s * step + (s % 2 === 1 ? swing * step : 0)
      const kickV = spec.drums.kick[s] ?? 0
      if (kickV > 0) kickAt(t, kickV)
      const snareV = spec.drums.snare[s] ?? 0
      if (snareV > 0) snareAt(t, snareV)
      const hatV = spec.drums.hat[s] ?? 0
      if (hatV > 0) hatAt(t, hatV)
      const leadDeg = spec.lead.arp[s] ?? -1
      if (leadDeg >= 0) leadNote(t, leadDeg)
      if (s % 2 === 0) {
        const bassDeg = spec.bass.pattern[s / 2] ?? -1
        if (bassDeg >= 0) bassNote(t, bassDeg)
      }
    }
  }
}

/* ---------------------------- render pipeline ---------------------------- */

async function renderToBuffer(effect: SoundFxEffect | MusicEffect, sampleRate: 44100 | 48000): Promise<AudioBuffer> {
  const OfflineCtor = offlineContextCtor()
  const duration = Math.max(0.05, effect.duration)
  const length = Math.max(1, Math.ceil(duration * sampleRate))
  const ctx = new OfflineCtor(2, length, sampleRate)
  const master = createMasterChain(ctx)
  const seed = hashString(effect.id)
  if (effect.category === 'music') {
    renderMusic(ctx, effect.spec, master, mulberry32((seed ^ 0x9e3779b9) >>> 0))
  } else {
    renderSfx(ctx, effect.synth, master, mulberry32(seed), mulberry32((seed ^ 0x7f4a7c15) >>> 0))
  }
  return ctx.startRendering()
}

/**
 * 16-bit PCM stereo WAV encoder with peak normalization applied during encode.
 * Exported for reuse (e.g. voice/other offline renderers) — signature is stable.
 */
export function encodeWav16BitStereo(buffer: AudioBuffer, gain: number): Blob {
  const frames = buffer.length
  const channels = Math.min(2, buffer.numberOfChannels)
  const dataBytes = frames * channels * 2
  const out = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(out)
  const writeString = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, channels, true)
  view.setUint32(24, buffer.sampleRate, true)
  view.setUint32(28, buffer.sampleRate * channels * 2, true) // byte rate
  view.setUint16(32, channels * 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeString(36, 'data')
  view.setUint32(40, dataBytes, true)
  const ch0 = buffer.getChannelData(0)
  const ch1 = channels > 1 ? buffer.getChannelData(1) : ch0
  let offset = 44
  for (let i = 0; i < frames; i++) {
    const l = clamp(ch0[i] * gain, -1, 1)
    const r = clamp(ch1[i] * gain, -1, 1)
    view.setInt16(offset, l < 0 ? l * 0x8000 : l * 0x7fff, true)
    offset += 2
    view.setInt16(offset, r < 0 ? r * 0x8000 : r * 0x7fff, true)
    offset += 2
  }
  return new Blob([out], { type: 'audio/wav' })
}

/**
 * Renders an effect offline to a stereo WAV blob.
 * The rendered buffer is peak-normalized to ~0.9 while encoding.
 */
export async function renderEffectToWav(
  effect: SoundFxEffect | MusicEffect,
  opts?: { sampleRate?: 44100 | 48000 },
): Promise<RenderedAudio> {
  const sampleRate = opts?.sampleRate ?? 44100
  const buffer = await renderToBuffer(effect, sampleRate)
  let peak = 0
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i])
      if (abs > peak) peak = abs
    }
  }
  const gain = peak > 0.0001 ? Math.min(0.9 / peak, 8) : 1
  return { blob: encodeWav16BitStereo(buffer, gain), duration: buffer.duration, name: effect.name }
}

/* ------------------------------ preview API ------------------------------ */

let previewCtx: AudioContext | null = null
let previewSource: AudioBufferSourceNode | null = null
let previewToken = 0

function ensurePreviewContext(): AudioContext {
  const Ctor = audioContextCtor()
  if (!previewCtx || previewCtx.state === 'closed') previewCtx = new Ctor()
  if (previewCtx.state === 'suspended') void previewCtx.resume().catch(() => undefined)
  return previewCtx
}

/** True while a preview render/playback is active. */
export function isPreviewing(): boolean {
  return previewSource !== null
}

/** Stops the current preview playback (safe to call any time). */
export function stopPreview(): void {
  previewToken++
  const src = previewSource
  previewSource = null
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
 * Renders the effect offline and plays it immediately through a shared
 * AudioContext. Calling this again (or stopPreview) stops the previous sound.
 */
export async function previewEffect(effect: SoundFxEffect | MusicEffect): Promise<void> {
  if (typeof window === 'undefined') throw new Error('Audio is not supported in this environment')
  audioContextCtor() // early friendly failure before doing work
  stopPreview()
  const token = previewToken
  const buffer = await renderToBuffer(effect, 44100)
  if (token !== previewToken) return // superseded while rendering
  const ctx = ensurePreviewContext()
  stopPreview() // another preview may have raced in during the await
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.connect(ctx.destination)
  src.onended = () => {
    if (previewSource === src) previewSource = null
  }
  src.start()
  previewSource = src
}
