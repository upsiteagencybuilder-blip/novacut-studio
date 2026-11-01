'use client'

/**
 * Day 22 — Voice FX presets: five one-tap voice looks built from the REAL
 * per-clip audio FX chain (the same chain the preview engine and the offline
 * mixdown run), so a preset heard in preview is exactly what gets exported.
 *
 *   • Robot     — true ring modulation (30–90 Hz carrier via the 'ringmod'
 *                 modulation flavor) + presence lift + light comp
 *   • Deep      — granular pitch −5 st AND formant −6 st (voice gets bigger,
 *                 not just slower-sounding)
 *   • Chipmunk  — pitch +7 st AND formant +7 st
 *   • Radio DJ  — band-limited broadcast chain (450–3200 Hz) + compression +
 *                 a whisper of slap delay
 *   • Telephone — classic 300–3400 Hz handset band + mid push + tight comp
 *
 * A preset REPLACES the clip's whole audioFx (voice looks are exclusive, one
 * undoable step). Tapping the active preset again clears the voice chain.
 */

import type { ClipAudioFx } from './types'
import { buildFxChain, applyClipFx } from './audio-mix'
import { ensurePitchModule } from './pitch-worklet'
import { ensureFormantModule } from './formant-worklet'

export interface VoiceFxPreset {
  id: 'robot' | 'deep' | 'chipmunk' | 'radio' | 'telephone'
  name: string
  emoji: string
  /** one-line character description shown on the chip */
  desc: string
  /** the full audioFx payload — replaces the clip's voice chain */
  fx: Partial<ClipAudioFx>
}

export const VOICE_FX_PRESETS: VoiceFxPreset[] = [
  {
    id: 'robot',
    name: 'Robot',
    emoji: '🤖',
    desc: 'ring-modulated metal voice',
    fx: { modKind: 'ringmod', modAmount: 0.85, eqMid: 3, highPass: 120, compressor: true, compAmount: 0.4 },
  },
  {
    id: 'deep',
    name: 'Deep',
    emoji: '🐻',
    desc: 'big pitch −5 + formant −6',
    fx: { pitch: -5, pitchMix: 1, formant: -6, eqLow: 3, highPass: 60 },
  },
  {
    id: 'chipmunk',
    name: 'Chipmunk',
    emoji: '🐿️',
    desc: 'tiny pitch +7 + formant +7',
    fx: { pitch: 7, pitchMix: 1, formant: 7, eqHigh: 3, highPass: 90 },
  },
  {
    id: 'radio',
    name: 'Radio DJ',
    emoji: '📻',
    desc: 'band-limited broadcast comp',
    fx: {
      highPass: 450,
      lowPass: 3200,
      eqMid: 5,
      eqHigh: 2,
      compressor: true,
      compAmount: 0.7,
      delayMix: 0.12,
      delayTime: 0.09,
      delayFeedback: 0.12,
    },
  },
  {
    id: 'telephone',
    name: 'Telephone',
    emoji: '☎️',
    desc: 'classic 300–3400 Hz handset',
    fx: { highPass: 300, lowPass: 3400, eqMid: 4, eqHigh: -4, compressor: true, compAmount: 0.55 },
  },
]

/**
 * Which voice preset (if any) is currently active on these FX? A preset
 * matches when every key of its payload equals the clip's audioFx value
 * (undefined/0/false treated as equal so an un-touched chain still matches).
 * Extra keys the user layered on top don't break the match.
 */
export function matchVoicePreset(fx: Partial<ClipAudioFx> | null | undefined): VoiceFxPreset['id'] | null {
  if (!fx) return null
  for (const p of VOICE_FX_PRESETS) {
    let ok = true
    for (const [k, v] of Object.entries(p.fx) as [keyof ClipAudioFx, unknown][]) {
      const cur = fx[k]
      const norm = typeof v === 'boolean' ? !!cur : (cur ?? 0)
      if (norm !== v) {
        ok = false
        break
      }
    }
    if (ok) return p.id
  }
  return null
}

/* ---------------- E2E / QA harness (real DSP receipts) ---------------- */

if (typeof window !== 'undefined') {
  ;(window as unknown as { __ncVoiceFxHarness?: unknown }).__ncVoiceFxHarness = runVoiceFxHarness
}

/** Deterministic Goertzel magnitude at one frequency over a mono slice. */
function goertzel(data: Float32Array, sr: number, freq: number): number {
  const k = (2 * Math.PI * freq) / sr
  const coeff = 2 * Math.cos(k)
  let s1 = 0
  let s2 = 0
  for (let i = 0; i < data.length; i++) {
    const s0 = data[i] + coeff * s1 - s2
    s2 = s1
    s1 = s0
  }
  return Math.sqrt(s1 * s1 + s2 * s2 - coeff * s1 * s2) / (data.length / 2)
}

/**
 * Offline harness used by QA: renders a probe signal through the REAL shared
 * chain builder (buildFxChain + applyClipFx — the exact code path preview and
 * export ride) and returns numeric metrics.
 *
 *   robot     → 220 Hz tone, Goertzel at 220 / 220−fc / 220+fc (sidebands)
 *   deep      → 220 Hz tone through the pitch worklet, peak-freq scan
 *   chipmunk  → 220 Hz tone through the pitch worklet, peak-freq scan
 *   radio     → white noise, Goertzel band energies 100 Hz / 1 kHz / 5 kHz
 *   telephone → white noise, Goertzel band energies 100 Hz / 1 kHz / 5 kHz
 *   none      → bypass reference (tone → main only, noise → flat bands)
 */
async function runVoiceFxHarness(spec: VoiceFxPreset['id'] | 'none') {
  const preset = VOICE_FX_PRESETS.find((p) => p.id === spec)
  const fx = preset ? preset.fx : undefined
  const sr = 44100
  const OfflineCtor =
    typeof OfflineAudioContext !== 'undefined'
      ? OfflineAudioContext
      : (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext
  if (!OfflineCtor) throw new Error('OfflineAudioContext unavailable')
  const ctx = new OfflineCtor(1, Math.ceil(sr * 1.2), sr)

  if (spec === 'deep' || spec === 'chipmunk') {
    const ready = await ensurePitchModule(ctx)
    if (ready) await ensureFormantModule(ctx)
  }

  // probe source
  let src: AudioScheduledSourceNode
  if (spec === 'radio' || spec === 'telephone') {
    // deterministic white noise (LCG) — flat spectrum for band-limit receipts
    const buf = ctx.createBuffer(1, Math.ceil(sr * 1.2), sr)
    const d = buf.getChannelData(0)
    let seed = 0x5f3759df
    for (let i = 0; i < d.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      d[i] = (seed / 0xffffffff) * 2 - 1
    }
    const s = ctx.createBufferSource()
    s.buffer = buf
    src = s
  } else {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = 220
    src = osc
  }

  const chain = buildFxChain(ctx)
  applyClipFx(ctx, chain, fx as ClipAudioFx | undefined)
  src.connect(chain.pan)
  chain.sum.connect(ctx.destination)
  src.start(0)
  src.stop(1.2)
  const rendered = await ctx.startRendering()
  const data = rendered.getChannelData(0)
  // skip 0.15 s of chain settle (setTargetAtTime ramps + worklet latency)
  const seg = data.slice(Math.floor(sr * 0.15), Math.floor(sr * 1.1))

  if (spec === 'robot') {
    const fc = 30 + 60 * 0.85 // 81 Hz carrier at modAmount 0.85
    const main = goertzel(seg, sr, 220)
    const low = goertzel(seg, sr, 220 - fc)
    const high = goertzel(seg, sr, 220 + fc)
    return { spec, carrierHz: fc, main: +main.toFixed(4), sideLow: +low.toFixed(4), sideHigh: +high.toFixed(4), sideRatio: +((low + high) / main).toFixed(4) }
  }
  if (spec === 'deep' || spec === 'chipmunk') {
    // Probe with a harmonic complex (220 Hz + 5 upper partials, 1/√n amps) and
    // measure the POWER CENTROID — the granular pitch worklet spreads pure
    // tones into grain-rate sidebands, but a harmonic complex's centroid
    // tracks the true transposition (same metric family as the Day 21
    // formant receipt). Two renders: bypass reference + preset chain.
    const renderCentroid = async (audioFx: ClipAudioFx | undefined) => {
      const c = new OfflineCtor(1, Math.ceil(sr * 1.2), sr)
      if (spec === 'deep' || spec === 'chipmunk') {
        const ready = await ensurePitchModule(c)
        if (ready) await ensureFormantModule(c)
      }
      const chain = buildFxChain(c)
      applyClipFx(c, chain, audioFx)
      const oscs: OscillatorNode[] = []
      for (let n = 1; n <= 6; n++) {
        const o = c.createOscillator()
        o.type = 'sine'
        o.frequency.value = 220 * n
        const g = c.createGain()
        g.gain.value = 1 / Math.sqrt(n)
        o.connect(g)
        g.connect(chain.pan)
        oscs.push(o)
      }
      chain.sum.connect(c.destination)
      for (const o of oscs) {
        o.start(0)
        o.stop(1.2)
      }
      const buf = await c.startRendering()
      const d = buf.getChannelData(0)
      const s = d.slice(Math.floor(sr * 0.15), Math.floor(sr * 1.1))
      let num = 0
      let den = 0
      for (let f = 100; f <= 1300; f += 4) {
        const m = goertzel(s, sr, f)
        num += f * m * m
        den += m * m
      }
      return num / den
    }
    const centroidIn = await renderCentroid(undefined)
    const centroidOut = await renderCentroid(fx as ClipAudioFx | undefined)
    const st = spec === 'deep' ? -5 : 7
    const expected = Math.pow(2, st / 12)
    return {
      spec,
      centroidIn: +centroidIn.toFixed(1),
      centroidOut: +centroidOut.toFixed(1),
      ratio: +(centroidOut / centroidIn).toFixed(4),
      expectedRatio: +expected.toFixed(4),
      accuracy: +((centroidOut / centroidIn / expected) * 100).toFixed(1) + '%',
    }
  }
  // radio / telephone — integrated band energies (bypass vs preset), white
  // noise probe: low 60–250 Hz, mid 500–2500 Hz, high 4000–8000 Hz
  const renderBands = async (audioFx: ClipAudioFx | undefined) => {
    const c = new OfflineCtor(1, Math.ceil(sr * 1.2), sr)
    const chain = buildFxChain(c)
    applyClipFx(c, chain, audioFx)
    const buf0 = c.createBuffer(1, Math.ceil(sr * 1.2), sr)
    const nd = buf0.getChannelData(0)
    let seed = 0x5f3759df
    for (let i = 0; i < nd.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      nd[i] = (seed / 0xffffffff) * 2 - 1
    }
    const s = c.createBufferSource()
    s.buffer = buf0
    s.connect(chain.pan)
    chain.sum.connect(c.destination)
    s.start(0)
    s.stop(1.2)
    const rendered = await c.startRendering()
    const d = rendered.getChannelData(0)
    const segN = d.slice(Math.floor(sr * 0.15), Math.floor(sr * 1.1))
    const band = (lo: number, hi: number, step: number) => {
      let e = 0
      for (let f = lo; f <= hi; f += step) {
        const m = goertzel(segN, sr, f)
        e += m * m
      }
      return e
    }
    return { low: band(60, 250, 10), mid: band(500, 2500, 25), high: band(4000, 8000, 40) }
  }
  const bandsIn = await renderBands(undefined)
  const bandsOut = await renderBands(fx as ClipAudioFx | undefined)
  return {
    spec,
    inLowMid: +(bandsIn.low / bandsIn.mid).toFixed(4),
    inHighMid: +(bandsIn.high / bandsIn.mid).toFixed(4),
    outLowMid: +(bandsOut.low / bandsOut.mid).toFixed(4),
    outHighMid: +(bandsOut.high / bandsOut.mid).toFixed(4),
    lowCut: +(bandsOut.low / bandsOut.mid / (bandsIn.low / bandsIn.mid)).toFixed(4),
    highCut: +(bandsOut.high / bandsOut.mid / (bandsIn.high / bandsIn.mid)).toFixed(4),
  }
}
