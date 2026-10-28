'use client'

/**
 * Shared audio FX chain + offline project mixdown.
 *
 * The chain topology (pan → EQ → HP/LP → comp → mod → dry/delay/reverb → sum)
 * is built ONCE here and used by BOTH:
 *   • the live engine (preview + video export) — BaseAudioContext = AudioContext
 *   • the offline mixdown (WAV / MP3 audio export) — BaseAudioContext = OfflineAudioContext
 *
 * The offline renderer mirrors the engine's per-clip audio semantics:
 * playbackRate = speed, source offset = trimStart, clip volume × track volume,
 * fade in/out ramps, mute/solo, auto-duck. Reversed clips are silent in the
 * engine (seek-driven) so the mixdown skips them too.
 */
import type { Clip, ClipAudioFx, MediaAssetRuntime, Project, Track } from './types'
import { resolveNestedProject } from './nested'
import { clamp, fadeCurveFactor, goertzelMag, normalizeGainFor, projectDuration } from './utils'
import { decodeSource } from '@/lib/effects/voice'
import { createPitchNode, ensurePitchModule, pitchModuleReady } from './pitch-worklet'
import { createFormantNode, ensureFormantModule, formantModuleReady } from './formant-worklet'
import { createGateNode, ensureGateModule, gateModuleReady } from './gate-worklet'
import { createDenoiseNode, ensureDenoiseModule, denoiseModuleReady } from './denoise-worklet'

/* ---------------- chain types + builder (shared with the engine) ---------------- */

/** ISO octave center frequencies of the 10-band graphic EQ. */
export const EQ10_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

/** Modulation sub-graph nodes (chorus / flanger / phaser / ringmod) */
export interface ModNodes {
  dry: GainNode
  wet?: GainNode
  dly?: DelayNode
  lfo?: OscillatorNode
  lfoGain?: GainNode
  fb?: GainNode
  aps?: BiquadFilterNode[]
  /** ringmod — carrier oscillator driving the AM gain's AudioParam */
  carrier?: OscillatorNode
  /** ringmod — the amplitude-modulation gain the signal passes through */
  am?: GainNode
}

/**
 * Per-clip audio FX chain — stable topology with param-driven bypass.
 * src → pan → eqLow → eqMid → eqHigh → eq10 → hp → lp → comp → gateIn → [gate] →
 * gateSum → denoiseIn → [denoise] → denoiseSum → formantIn → [formant] →
 * formantSum → pitchIn → [pitch] → pitchSum → modIn → [mod] → modOut
 * modOut → dry → sum;  modOut → delay → delayWet → sum (feedback loop);
 * modOut → convolver → reverbWet → sum;  sum → gain (playback envelope).
 */
export interface AudioFxChain {
  pan: AudioNode
  eqLow: BiquadFilterNode
  eqMid: BiquadFilterNode
  eqHigh: BiquadFilterNode
  /** 10-band graphic EQ stage (Day 23) — all gains 0 = transparent */
  eq10: BiquadFilterNode[]
  hp: BiquadFilterNode
  lp: BiquadFilterNode
  comp: DynamicsCompressorNode
  gateIn: GainNode
  gateDry: GainNode
  gateSum: GainNode
  denoiseIn: GainNode
  denoiseDry: GainNode
  denoiseSum: GainNode
  formantIn: GainNode
  formantDry: GainNode
  formantSum: GainNode
  pitchIn: GainNode
  pitchDry: GainNode
  pitchSum: GainNode
  modIn: GainNode
  modOut: GainNode
  dry: GainNode
  sum: GainNode
  formant?: AudioWorkletNode
  formantWet?: GainNode
  gate?: AudioWorkletNode
  gateWet?: GainNode
  denoise?: AudioWorkletNode
  denoiseWet?: GainNode
  pitch?: AudioWorkletNode
  pitchWet?: GainNode
  mod?: ModNodes
  modKind?: string
  delay?: DelayNode
  delayWet?: GainNode
  delayFb?: GainNode
  /** Day 28 ping-pong: the two cross-fed delays (L and R taps) */
  delayPingL?: DelayNode
  delayPingR?: DelayNode
  /** Day 28 ping-pong: the R→L feedback leg (L→R leg rides delayFb) */
  delayPingFb?: GainNode
  convolver?: ConvolverNode
  reverbWet?: GainNode
  /** Day 28 reverb pre-delay + damping in the wet path */
  reverbPredelay?: DelayNode
  reverbDamp?: BiquadFilterNode
}

/** Build the always-present core chain with fully neutral (transparent) params. */
export function buildFxChain(ctx: BaseAudioContext): AudioFxChain {
  const pan: AudioNode = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : ctx.createGain()
  const eqLow = ctx.createBiquadFilter()
  eqLow.type = 'lowshelf'
  eqLow.frequency.value = 200
  eqLow.gain.value = 0
  const eqMid = ctx.createBiquadFilter()
  eqMid.type = 'peaking'
  eqMid.frequency.value = 1200
  eqMid.Q.value = 0.9
  eqMid.gain.value = 0
  const eqHigh = ctx.createBiquadFilter()
  eqHigh.type = 'highshelf'
  eqHigh.frequency.value = 4200
  eqHigh.gain.value = 0
  // 10-band graphic EQ (Day 23) — ISO octave centers, lowshelf/peaking/highshelf
  const eq10: BiquadFilterNode[] = EQ10_FREQS.map((f, i) => {
    const b = ctx.createBiquadFilter()
    b.type = i === 0 ? 'lowshelf' : i === EQ10_FREQS.length - 1 ? 'highshelf' : 'peaking'
    b.frequency.value = f
    b.Q.value = 1
    b.gain.value = 0
    return b
  })
  for (let i = 0; i < eq10.length - 1; i++) eq10[i].connect(eq10[i + 1])
  const hp = ctx.createBiquadFilter()
  hp.type = 'allpass' // transparent until the user asks for a high-pass
  hp.frequency.value = 500
  hp.Q.value = 0.7
  const lp = ctx.createBiquadFilter()
  lp.type = 'allpass'
  lp.frequency.value = 8000
  lp.Q.value = 0.7
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = 0
  comp.knee.value = 24
  comp.ratio.value = 1
  comp.attack.value = 0.01
  comp.release.value = 0.25
  // gate + de-noise stages (Day 24) — bypassed (dry-only) until worklets load
  const gateIn = ctx.createGain()
  const gateDry = ctx.createGain()
  gateDry.gain.value = 1
  const gateSum = ctx.createGain()
  gateIn.connect(gateDry)
  gateDry.connect(gateSum)
  const denoiseIn = ctx.createGain()
  const denoiseDry = ctx.createGain()
  denoiseDry.gain.value = 1
  const denoiseSum = ctx.createGain()
  denoiseIn.connect(denoiseDry)
  denoiseDry.connect(denoiseSum)
  // formant stage (Day 21) — bypassed (dry-only) until the worklet module is ready
  const formantIn = ctx.createGain()
  const formantDry = ctx.createGain()
  formantDry.gain.value = 1
  const formantSum = ctx.createGain()
  formantIn.connect(formantDry)
  formantDry.connect(formantSum)
  // pitch stage — bypassed (dry-only) until the worklet module is ready
  const pitchIn = ctx.createGain()
  const pitchDry = ctx.createGain()
  pitchDry.gain.value = 1
  const pitchSum = ctx.createGain()
  pitchIn.connect(pitchDry)
  pitchDry.connect(pitchSum)
  const modIn = ctx.createGain()
  const modOut = ctx.createGain()
  const dry = ctx.createGain()
  dry.gain.value = 1
  const sum = ctx.createGain()
  modIn.connect(modOut) // 'none' modulation — direct wire
  modOut.connect(dry)
  dry.connect(sum)
  pan.connect(eqLow)
  eqLow.connect(eqMid)
  eqMid.connect(eqHigh)
  eqHigh.connect(eq10[0])
  eq10[eq10.length - 1].connect(hp)
  hp.connect(lp)
  lp.connect(comp)
  comp.connect(gateIn)
  gateSum.connect(denoiseIn)
  denoiseSum.connect(formantIn)
  formantSum.connect(pitchIn)
  pitchSum.connect(modIn)
  return { pan, eqLow, eqMid, eqHigh, eq10, hp, lp, comp, gateIn, gateDry, gateSum, denoiseIn, denoiseDry, denoiseSum, formantIn, formantDry, formantSum, pitchIn, pitchDry, pitchSum, modIn, modOut, dry, sum, modKind: 'none' }
}

/**
 * Wire (or unwire) the noise-gate stage (Day 24) — same lazy pattern as the
 * pitch/formant stages: dry-only until the worklet module is ready.
 */
function syncGateStage(ctx: BaseAudioContext, chain: AudioFxChain, fx: ClipAudioFx) {
  const want = !!fx.gate
  const t = ctx.currentTime
  const setNow = (param: AudioParam, v: number) => {
    try {
      param.setTargetAtTime(v, t, 0.02)
    } catch {
      param.value = v
    }
  }
  if (!want) {
    setNow(chain.gateDry.gain, 1)
    if (chain.gateWet) setNow(chain.gateWet.gain, 0)
    if (chain.gate) {
      try {
        chain.gateIn.disconnect(chain.gate)
        chain.gate.disconnect()
      } catch {
        /* already unwired */
      }
      chain.gate = undefined
      chain.gateWet = undefined
    }
    return
  }
  if (!chain.gate) {
    if (!gateModuleReady(ctx)) {
      void ensureGateModule(ctx)
      return
    }
    const node = createGateNode(ctx)
    if (!node) return
    const wet = ctx.createGain()
    wet.gain.value = 0
    chain.gateIn.connect(node)
    node.connect(wet)
    wet.connect(chain.gateSum)
    chain.gate = node
    chain.gateWet = wet
  }
  const p = chain.gate!.parameters
  const thr = p.get('threshold')
  if (thr) setNow(thr, clamp(fx.gateThreshold ?? -45, -80, -1))
  const rel = p.get('release')
  if (rel) setNow(rel, clamp(fx.gateRelease ?? 220, 20, 1500))
  setNow(chain.gateDry.gain, 0)
  setNow(chain.gateWet!.gain, 1)
}

/**
 * Wire (or unwire) the spectral de-noise stage (Day 24) — lazy like the others.
 */
function syncDenoiseStage(ctx: BaseAudioContext, chain: AudioFxChain, amount: number) {
  const want = amount > 0.005
  const t = ctx.currentTime
  const setNow = (param: AudioParam, v: number) => {
    try {
      param.setTargetAtTime(v, t, 0.02)
    } catch {
      param.value = v
    }
  }
  if (!want) {
    setNow(chain.denoiseDry.gain, 1)
    if (chain.denoiseWet) setNow(chain.denoiseWet.gain, 0)
    if (chain.denoise) {
      try {
        chain.denoiseIn.disconnect(chain.denoise)
        chain.denoise.disconnect()
      } catch {
        /* already unwired */
      }
      chain.denoise = undefined
      chain.denoiseWet = undefined
    }
    return
  }
  if (!chain.denoise) {
    if (!denoiseModuleReady(ctx)) {
      void ensureDenoiseModule(ctx)
      return
    }
    const node = createDenoiseNode(ctx)
    if (!node) return
    const wet = ctx.createGain()
    wet.gain.value = 0
    chain.denoiseIn.connect(node)
    node.connect(wet)
    wet.connect(chain.denoiseSum)
    chain.denoise = node
    chain.denoiseWet = wet
  }
  const p = chain.denoise!.parameters.get('amount')
  if (p) setNow(p, clamp(amount, 0, 1))
  setNow(chain.denoiseDry.gain, 0)
  setNow(chain.denoiseWet!.gain, 1)
}

/**
 * Wire (or unwire) the formant stage inside a chain — same lazy pattern as the
 * pitch stage: the worklet module loads async, the chain stays dry-only until
 * a later applyClipFx call finds it ready.
 */
function syncFormantStage(ctx: BaseAudioContext, chain: AudioFxChain, semis: number): void {
  const want = Math.abs(semis) > 0.01
  const t = ctx.currentTime
  const setNow = (param: AudioParam, v: number) => {
    try {
      param.setTargetAtTime(v, t, 0.02)
    } catch {
      param.value = v
    }
  }
  if (!want) {
    setNow(chain.formantDry.gain, 1)
    if (chain.formantWet) setNow(chain.formantWet.gain, 0)
    if (chain.formant) {
      try {
        chain.formantIn.disconnect(chain.formant)
        chain.formant.disconnect()
      } catch {
        /* already unwired */
      }
      chain.formant = undefined
      chain.formantWet = undefined
    }
    return
  }
  if (!chain.formant) {
    if (!formantModuleReady(ctx)) {
      // kick a load; bypassed until a later applyClipFx call finds it ready
      void ensureFormantModule(ctx)
      return
    }
    const node = createFormantNode(ctx)
    if (!node) return
    const wet = ctx.createGain()
    wet.gain.value = 0
    chain.formantIn.connect(node)
    node.connect(wet)
    wet.connect(chain.formantSum)
    chain.formant = node
    chain.formantWet = wet
  }
  const p = chain.formant!.parameters.get('shift')
  if (p) setNow(p, clamp(semis, -12, 12))
  setNow(chain.formantDry.gain, 0)
  setNow(chain.formantWet!.gain, 1)
}

/**
 * Wire (or unwire) the granular pitch stage inside a chain. The worklet node
 * is created lazily — only once the module has loaded for this context.
 * Called from applyClipFx; preview re-applies on fx-signature change and the
 * offline mixdown preloads the module before building chains.
 */
function syncPitchStage(ctx: BaseAudioContext, chain: AudioFxChain, semis: number, mix: number): void {
  const want = Math.abs(semis) > 0.01
  const t = ctx.currentTime
  const setNow = (param: AudioParam, v: number) => {
    try {
      param.setTargetAtTime(v, t, 0.02)
    } catch {
      param.value = v
    }
  }
  if (!want) {
    // bypass: dry straight through, worklet edge dropped if it exists
    setNow(chain.pitchDry.gain, 1)
    if (chain.pitchWet) setNow(chain.pitchWet.gain, 0)
    if (chain.pitch) {
      try {
        chain.pitchIn.disconnect(chain.pitch)
        chain.pitch.disconnect()
      } catch {
        /* already unwired */
      }
      chain.pitch = undefined
      chain.pitchWet = undefined
    }
    return
  }
  if (!chain.pitch) {
    if (!pitchModuleReady(ctx)) {
      // kick a load; bypassed until a later applyClipFx call finds it ready
      void ensurePitchModule(ctx)
      return
    }
    const node = createPitchNode(ctx)
    if (!node) return
    const wet = ctx.createGain()
    wet.gain.value = 0
    chain.pitchIn.connect(node)
    node.connect(wet)
    wet.connect(chain.pitchSum)
    chain.pitch = node
    chain.pitchWet = wet
  }
  const p = chain.pitch!.parameters.get('semitones')
  if (p) setNow(p, clamp(semis, -12, 12))
  setNow(chain.pitchDry.gain, clamp(1 - mix, 0, 1))
  setNow(chain.pitchWet!.gain, clamp(mix, 0, 1))
}

/** (Re)wire the modulation sub-graph for the requested flavor. */
export function rebuildModulation(
  ctx: BaseAudioContext,
  chain: AudioFxChain,
  kind: 'none' | 'chorus' | 'flanger' | 'phaser' | 'ringmod',
  amount: number
) {
  // tear down the previous sub-graph
  try {
    chain.modIn.disconnect()
    if (chain.mod) {
      chain.mod.dry.disconnect()
      chain.mod.wet?.disconnect()
      chain.mod.lfo?.stop()
      chain.mod.lfo?.disconnect()
      chain.mod.lfoGain?.disconnect()
      chain.mod.fb?.disconnect()
      chain.mod.dly?.disconnect()
      chain.mod.aps?.forEach((ap) => ap.disconnect())
      chain.mod.carrier?.stop()
      chain.mod.carrier?.disconnect()
      chain.mod.am?.disconnect()
    }
  } catch {
    /* best-effort teardown */
  }
  const dry = ctx.createGain()
  dry.gain.value = 1
  dry.connect(chain.modOut)
  chain.modIn.connect(dry)
  const mod: ModNodes = { dry }
  const a = clamp(amount, 0, 1)
  if (kind === 'chorus') {
    const dly = ctx.createDelay(0.1)
    dly.delayTime.value = 0.025
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 0.8
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 0.008
    lfo.connect(lfoGain)
    lfoGain.connect(dly.delayTime)
    lfo.start()
    const wet = ctx.createGain()
    wet.gain.value = 0.6 * a
    dry.gain.value = 1 - 0.5 * a
    chain.modIn.connect(dly)
    dly.connect(wet)
    wet.connect(chain.modOut)
    Object.assign(mod, { wet, dly, lfo, lfoGain })
  } else if (kind === 'flanger') {
    const dly = ctx.createDelay(0.05)
    dly.delayTime.value = 0.003
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 0.35
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 0.0022
    lfo.connect(lfoGain)
    lfoGain.connect(dly.delayTime)
    lfo.start()
    const fb = ctx.createGain()
    fb.gain.value = 0.55 * a
    dly.connect(fb)
    fb.connect(dly)
    const wet = ctx.createGain()
    wet.gain.value = 0.7 * a
    dry.gain.value = 1 - 0.45 * a
    chain.modIn.connect(dly)
    dly.connect(wet)
    wet.connect(chain.modOut)
    Object.assign(mod, { wet, dly, lfo, lfoGain, fb })
  } else if (kind === 'phaser') {
    const aps: BiquadFilterNode[] = []
    const bases = [300, 800, 1600, 2400]
    let prev: AudioNode = chain.modIn
    for (const base of bases) {
      const ap = ctx.createBiquadFilter()
      ap.type = 'allpass'
      ap.frequency.value = base
      ap.Q.value = 1
      prev.connect(ap)
      prev = ap
      aps.push(ap)
    }
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 0.25
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 800
    lfo.connect(lfoGain)
    for (const ap of aps) lfoGain.connect(ap.frequency)
    lfo.start()
    const wet = ctx.createGain()
    wet.gain.value = 0.55 * a
    dry.gain.value = 1 - 0.5 * a
    prev.connect(wet)
    wet.connect(chain.modOut)
    Object.assign(mod, { wet, lfo, lfoGain, aps })
  } else if (kind === 'ringmod') {
    // Day 22 robot voice — true ring (amplitude) modulation: the signal gain
    // is driven by a low sine carrier (30–90 Hz), so every input partial
    // sprouts sidebands at f ± fc and the tone turns metallic/robotic.
    const am = ctx.createGain()
    am.gain.value = 0 // carrier supplies the whole modulation swing
    const carrier = ctx.createOscillator()
    carrier.type = 'sine'
    carrier.frequency.value = 30 + 60 * a
    const depth = ctx.createGain()
    depth.gain.value = 1.15 * a
    carrier.connect(depth)
    depth.connect(am.gain)
    carrier.start()
    const wet = ctx.createGain()
    wet.gain.value = 0.9 * a
    dry.gain.value = 1 - 0.55 * a
    chain.modIn.connect(am)
    am.connect(wet)
    wet.connect(chain.modOut)
    Object.assign(mod, { wet, carrier, am, lfoGain: depth })
  }
  chain.mod = mod
  chain.modKind = kind
}

/** Push a clip's serialized ClipAudioFx values into its chain nodes. */
export function applyClipFx(ctx: BaseAudioContext, chain: AudioFxChain, fx: ClipAudioFx | undefined) {
  const f = fx ?? {}
  const t = ctx.currentTime
  const set = (param: AudioParam, v: number) => {
    try {
      param.setTargetAtTime(v, t, 0.015)
    } catch {
      param.value = v
    }
  }
  set((chain.pan as StereoPannerNode).pan ?? (chain.pan as GainNode).gain, clamp(f.pan ?? 0, -1, 1))
  set(chain.eqLow.gain, clamp(f.eqLow ?? 0, -24, 24))
  set(chain.eqMid.gain, clamp(f.eqMid ?? 0, -24, 24))
  set(chain.eqHigh.gain, clamp(f.eqHigh ?? 0, -24, 24))
  // 10-band graphic EQ (Day 23) — undefined/zeros stay transparent
  const eq10 = f.eq10
  for (let i = 0; i < chain.eq10.length; i++) {
    set(chain.eq10[i].gain, clamp(eq10?.[i] ?? 0, -12, 12))
  }
  // filters — swap to allpass when off (transparent, keeps the topology stable)
  const hpOn = (f.highPass ?? 0) > 20
  chain.hp.type = hpOn ? 'highpass' : 'allpass'
  if (hpOn) set(chain.hp.frequency, clamp(f.highPass!, 20, 800))
  const lpOn = (f.lowPass ?? 0) > 0
  chain.lp.type = lpOn ? 'lowpass' : 'allpass'
  if (lpOn) set(chain.lp.frequency, clamp(f.lowPass!, 200, 18000))
  // compressor
  const compOn = !!f.compressor
  const ca = clamp(f.compAmount ?? 0.5, 0, 1)
  set(chain.comp.threshold, compOn ? -(6 + 26 * ca) : 0)
  set(chain.comp.ratio, compOn ? 2 + 8 * ca : 1)
  // noise gate (Day 24)
  syncGateStage(ctx, chain, f)
  // spectral de-noise (Day 24)
  syncDenoiseStage(ctx, chain, clamp(f.denoise ?? 0, 0, 1))
  // granular pitch (tempo-preserving) + wet/dry blend
  syncPitchStage(ctx, chain, clamp(f.pitch ?? 0, -12, 12), clamp(f.pitchMix ?? 1, 0, 1))
  // formant (Day 21) — vocal-tract resonance shift, pitch + tempo preserved
  syncFormantStage(ctx, chain, clamp(f.formant ?? 0, -12, 12))
  // modulation
  const kind = f.modKind ?? 'none'
  const amount = clamp(f.modAmount ?? 0.5, 0, 1)
  if (kind !== chain.modKind || kind !== 'none') rebuildModulation(ctx, chain, kind, amount)
  else if (chain.mod) set(chain.mod.dry.gain, 1)
  // delay aux — mono tap-and-feedback, or Day 28 ping-pong (repeats alternate L/R)
  const dMix = clamp(f.delayMix ?? 0, 0, 1)
  const wantPing = !!f.delayPingPong
  if (dMix > 0.001) {
    // rebuild when the flavor changed (mono ↔ ping-pong)
    if (wantPing && !chain.delayPingL) {
      if (chain.delayWet) {
        try {
          chain.modOut.disconnect(chain.delay!)
          chain.delay?.disconnect()
        } catch {
          /* best effort */
        }
        chain.delay = undefined
        chain.delayFb = undefined
      }
      const dL = ctx.createDelay(1.2)
      const dR = ctx.createDelay(1.2)
      const fbLR = ctx.createGain()
      const fbRL = ctx.createGain()
      const wet = ctx.createGain()
      const merger = ctx.createChannelMerger(2)
      chain.modOut.connect(dL)
      dL.connect(fbLR)
      fbLR.connect(dR) // L repeat feeds the R tap
      dR.connect(fbRL)
      fbRL.connect(dL) // R repeat feeds the L tap back
      dL.connect(merger, 0, 0)
      dR.connect(merger, 0, 1)
      merger.connect(wet)
      wet.connect(chain.sum)
      chain.delayPingL = dL
      chain.delayPingR = dR
      chain.delayFb = fbLR // master feedback (mirrored to fbRL below)
      chain.delayWet = wet
      chain.delayPingFb = fbRL
    }
    if (!wantPing && !chain.delay) {
      if (chain.delayPingL) {
        try {
          chain.modOut.disconnect(chain.delayPingL)
          chain.delayPingL.disconnect()
          chain.delayPingR?.disconnect()
        } catch {
          /* best effort */
        }
        chain.delayPingL = undefined
        chain.delayPingR = undefined
        chain.delayPingFb = undefined
      }
      const dly = ctx.createDelay(1.2)
      const wet = ctx.createGain()
      const fb = ctx.createGain()
      chain.modOut.connect(dly)
      dly.connect(wet)
      wet.connect(chain.sum)
      dly.connect(fb)
      fb.connect(dly)
      chain.delay = dly
      chain.delayWet = wet
      chain.delayFb = fb
    }
    set(chain.delayFb!.gain, clamp(f.delayFeedback ?? 0.3, 0, 0.85))
    if (chain.delayPingFb) set(chain.delayPingFb.gain, clamp(f.delayFeedback ?? 0.3, 0, 0.85))
    const dt = clamp(f.delayTime ?? 0.25, 0.05, 0.9)
    if (chain.delay) set(chain.delay.delayTime, dt)
    if (chain.delayPingL) set(chain.delayPingL.delayTime, dt)
    if (chain.delayPingR) set(chain.delayPingR.delayTime, dt)
    set(chain.delayWet!.gain, dMix * 0.9)
  } else if (chain.delayWet) {
    set(chain.delayWet.gain, 0)
  }
  // reverb aux (convolver created lazily, IR generated) — Day 28: pre-delay
  // (dry/tail separation) + damping (HF absorption) in the wet path
  const rMix = clamp(f.reverbMix ?? 0, 0, 1)
  if (rMix > 0.001) {
    if (!chain.convolver) {
      const size = clamp(f.reverbSize ?? 0.6, 0.2, 1)
      const conv = ctx.createConvolver()
      conv.buffer = makeImpulse(ctx, 0.4 + 2.8 * size)
      const predelay = ctx.createDelay(0.25)
      const damp = ctx.createBiquadFilter()
      damp.type = 'lowpass'
      damp.frequency.value = 12000
      const wet = ctx.createGain()
      chain.modOut.connect(predelay)
      predelay.connect(conv)
      conv.connect(damp)
      damp.connect(wet)
      wet.connect(chain.sum)
      chain.convolver = conv
      chain.reverbWet = wet
      chain.reverbPredelay = predelay
      chain.reverbDamp = damp
    }
    set(chain.reverbPredelay!.delayTime, clamp(f.reverbPredelay ?? 0, 0, 0.25))
    set(chain.reverbDamp!.frequency, 1200 + (1 - clamp(f.reverbDamp ?? 0, 0, 1)) * 10800)
    set(chain.reverbWet!.gain, rMix * 0.8)
  } else if (chain.reverbWet) {
    set(chain.reverbWet.gain, 0)
  }
}

/** Deterministic noise-decay impulse response (shared reverb IR). */
export function makeImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const sec = Math.round(clamp(seconds, 0.2, 3.2) * 10) / 10
  const rate = ctx.sampleRate
  const len = Math.max(1, Math.floor(rate * sec))
  const buf = ctx.createBuffer(2, len, rate)
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c)
    // simple LCG noise — deterministic, plenty for a reverb tail
    let seed = 0x2f6e2b1 + c * 7919
    for (let i = 0; i < len; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      const t = i / len
      data[i] = ((seed / 0xffffffff) * 2 - 1) * Math.pow(1 - t, 2.4) * (1 - t * 0.2)
    }
  }
  return buf
}

/* ---------------- per-track 3-band EQ (Day 23 — mixer) ---------------- */

/** Per-track strip stage (Day 23/27) — input → low shelf 200 → mid peak 1.2k → high shelf 4.2k → pan → output. */
export interface TrackEqChain {
  input: GainNode
  output: GainNode
  low: BiquadFilterNode
  mid: BiquadFilterNode
  high: BiquadFilterNode
  /** stereo position of the whole track (Day 27) */
  pan: AudioNode
}

/** Build a transparent (0 dB, centered) per-track strip stage. */
export function buildTrackEq(ctx: BaseAudioContext): TrackEqChain {
  const input = ctx.createGain()
  const output = ctx.createGain()
  const low = ctx.createBiquadFilter()
  low.type = 'lowshelf'
  low.frequency.value = 200
  const mid = ctx.createBiquadFilter()
  mid.type = 'peaking'
  mid.frequency.value = 1200
  mid.Q.value = 0.9
  const high = ctx.createBiquadFilter()
  high.type = 'highshelf'
  high.frequency.value = 4200
  const pan: AudioNode =
    typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : ctx.createGain()
  input.connect(low)
  low.connect(mid)
  mid.connect(high)
  high.connect(pan)
  pan.connect(output)
  return { input, output, low, mid, high, pan }
}

/** Push a Track's EQ + pan values into its strip (setTargetAtTime for click-free moves). */
export function applyTrackEq(
  ctx: BaseAudioContext,
  teq: TrackEqChain,
  track: Pick<Track, 'eqLow' | 'eqMid' | 'eqHigh' | 'pan'>
) {
  const t = ctx.currentTime
  const set = (param: AudioParam, v: number) => {
    try {
      param.setTargetAtTime(v, t, 0.02)
    } catch {
      param.value = v
    }
  }
  set(teq.low.gain, clamp(track.eqLow ?? 0, -24, 24))
  set(teq.mid.gain, clamp(track.eqMid ?? 0, -24, 24))
  set(teq.high.gain, clamp(track.eqHigh ?? 0, -24, 24))
  const panParam = (teq.pan as StereoPannerNode).pan
  if (panParam) set(panParam, clamp(track.pan ?? 0, -1, 1))
}

/* ---------------- offline project mixdown ---------------- */

export interface MixdownOptions {
  sampleRate: 44100 | 48000
  channels: 1 | 2
  onProgress?: (p: number) => void
}

/** Engine-mirrored fade envelope (fadeIn/fadeOut with Day 28 curve shapes). */
function fadeFactorLocal(clip: Clip, tLocal: number): number {
  let alpha = 1
  if (clip.fadeIn > 0.01) alpha *= fadeCurveFactor(clip.fadeInCurve, tLocal / clip.fadeIn)
  if (clip.fadeOut > 0.01) alpha *= fadeCurveFactor(clip.fadeOutCurve, (clip.duration - tLocal) / clip.fadeOut)
  return alpha
}

/* ---------------- auto-duck v2 (Day 25 — threshold-based) ---------------- */

export const DUCK_HOP_MS = 10

/**
 * Shared auto-duck envelope (Day 25): given a per-hop speech-level series and
 * the clip's threshold/depth, returns the duck GAIN per hop — 1 when the
 * speech is under the threshold, 1 − depth while it is over, smoothed with a
 * 60 ms attack and a 450 ms release (one-pole per hop). Used verbatim by the
 * offline mixdown; the live engine runs the same state machine per frame.
 */
export function computeDuckEnvelope(
  levels: Float32Array,
  opts: { threshold: number; depth: number; attackMs?: number; releaseMs?: number; hopMs?: number }
): Float32Array {
  const hopMs = opts.hopMs ?? DUCK_HOP_MS
  const attack = Math.exp(-hopMs / Math.max(5, opts.attackMs ?? 60))
  const release = Math.exp(-hopMs / Math.max(20, opts.releaseMs ?? 450))
  const ducked = 1 - clamp(opts.depth, 0, 0.95)
  const out = new Float32Array(levels.length)
  let env = 1
  for (let i = 0; i < levels.length; i++) {
    const over = levels[i] > opts.threshold
    const target = over ? ducked : 1
    const a = target < env ? attack : release
    env = a * env + (1 - a) * target
    out[i] = env
  }
  return out
}

/**
 * Measure the speech (video-audio) level series for the offline mixdown: max
 * RMS across audible video clips per hop, sampled from the decoded buffers
 * with each clip's speed/trim taken into account.
 */
function buildSpeechLevels(
  project: Project,
  bufferCache: Map<string, AudioBuffer>,
  sr: number,
  totalSec: number,
  mediaMap?: Map<string, MediaAssetRuntime>
): Float32Array | null {
  const speechClips = project.clips.filter((c) => {
    if (c.kind !== 'video' || c.muted || c.reverse || !c.mediaId) return false
    if ((c.volume ?? 0) <= 0.02) return false
    const track = project.tracks.find((tr) => tr.id === c.trackId)
    return !!track && !track.muted
  })
  if (!speechClips.length) return null
  const hops = Math.max(1, Math.ceil((totalSec * 1000) / DUCK_HOP_MS))
  const levels = new Float32Array(hops)
  const win = Math.max(1, Math.floor(sr * 0.03)) // 30 ms analysis window
  for (const clip of speechClips) {
    const decoded = bufferCache.get(clip.mediaId!)
    if (!decoded) continue
    const speed = clamp(clip.speed, 0.0625, 16)
    const data0 = decoded.getChannelData(0)
    const data1 = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : data0
    for (let h = 0; h < hops; h++) {
      const t = (h * DUCK_HOP_MS) / 1000
      if (t < clip.start || t >= clip.start + clip.duration) continue
      const srcT = clip.trimStart + (t - clip.start) * speed
      const center = Math.floor(srcT * sr)
      if (center < 0 || center >= decoded.length) continue
      // Day 29 — a normalized video clip speaks louder; the duck threshold
      // hears the normalized level, same as the live engine.
      const speechGain = (clip.volume ?? 1) * normalizeGainFor(clip.normalize, mediaMap?.get(clip.mediaId!))
      let sum = 0
      let n = 0
      for (let i = -win / 2; i < win / 2; i++) {
        const idx = center + i
        if (idx < 0 || idx >= decoded.length) continue
        const v = (data0[idx] + data1[idx]) * 0.5 * speechGain
        sum += v * v
        n++
      }
      const rms = n ? Math.sqrt(sum / n) : 0
      if (rms > levels[h]) levels[h] = rms
    }
  }
  return levels
}

/** Auto-duck v2: envelope lookup at t (hop index), v1 overlap fallback without one. */
function duckFactorLocal(
  project: Project,
  clip: Clip,
  t: number,
  duckEnv?: Float32Array
): number {
  if (!clip.autoDuck || clip.kind !== 'audio') return 1
  const depth = clamp(clip.duckDepth ?? 0.68, 0, 0.95)
  if (duckEnv) {
    const idx = clamp(Math.floor((t * 1000) / DUCK_HOP_MS), 0, duckEnv.length - 1)
    return duckEnv[idx]
  }
  // fallback: plain overlap ducking (no decoded speech available)
  for (const other of project.clips) {
    if (other.kind !== 'video' || other.muted || other.volume <= 0.02) continue
    if (t >= other.start && t < other.start + other.duration) {
      const otherTrack = project.tracks.find((tr) => tr.id === other.trackId)
      if (otherTrack && !otherTrack.muted) {
        return 1 - depth
      }
    }
  }
  return 1
}

/**
 * Render the project's complete audio mix offline (faster than real time):
 * every unmuted video/audio clip through its FX chain, with clip volume,
 * track volume, mute/solo, fades and auto-duck — then return the AudioBuffer.
 * Reversed clips are skipped (silent in the engine as well).
 */
export async function renderProjectAudio(
  rawProject: Project,
  mediaMap: Map<string, MediaAssetRuntime>,
  opts: MixdownOptions
): Promise<AudioBuffer> {
  // compound containers are flattened so their children mix exactly where
  // the preview engine places them
  const project = resolveNestedProject(rawProject)
  const sr = opts.sampleRate
  const anySolo = project.tracks.some((tr) => tr.solo)

  const audibleClips = project.clips.filter((c) => {
    if (c.kind !== 'video' && c.kind !== 'audio') return false
    if (c.muted || c.reverse || !c.mediaId) return false
    if ((c.volume ?? 0) <= 0.001) return false
    const track = project.tracks.find((tr) => tr.id === c.trackId)
    if (!track) return false
    if (track.kind !== 'audio' && track.kind !== 'video') return false
    return !track.muted && (!anySolo || !!track.solo)
  })

  const duration = Math.max(projectDuration(project), 0.1)
  const needsTail = audibleClips.some(
    (c) => (c.audioFx?.reverbMix ?? 0) > 0.001 || (c.audioFx?.delayMix ?? 0) > 0.001
  )
  const total = duration + (needsTail ? 2 : 0.25)
  const OfflineCtor =
    typeof OfflineAudioContext !== 'undefined'
      ? OfflineAudioContext
      : (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext
  if (!OfflineCtor) throw new Error('OfflineAudioContext is not supported in this browser')
  const ctx = new OfflineCtor(opts.channels, Math.ceil(total * sr), sr)

  // pitch-shifting clips need the granular worklet inside the offline context
  if (audibleClips.some((c) => Math.abs(c.audioFx?.pitch ?? 0) > 0.01)) {
    await ensurePitchModule(ctx)
  }
  // formant-shifting clips (Day 21) need the STFT worklet inside the offline context
  if (audibleClips.some((c) => Math.abs(c.audioFx?.formant ?? 0) > 0.01)) {
    await ensureFormantModule(ctx)
  }
  // gate + de-noise clips (Day 24) need their worklets inside the offline context
  if (audibleClips.some((c) => c.audioFx?.gate)) {
    await ensureGateModule(ctx)
  }
  if (audibleClips.some((c) => (c.audioFx?.denoise ?? 0) > 0.005)) {
    await ensureDenoiseModule(ctx)
  }

  // decode every needed asset once (faster-than-real-time offline decode)
  const bufferCache = new Map<string, AudioBuffer>()
  let decodeDone = 0
  const uniqueMedia = [...new Set(audibleClips.map((c) => c.mediaId!))]
  for (const mediaId of uniqueMedia) {
    const asset = mediaMap.get(mediaId)
    if (!asset?.rawBlob) throw new Error('Media asset is missing — re-import the file and retry')
    const buf = await decodeSource(asset.rawBlob)
    bufferCache.set(mediaId, buf)
    decodeDone++
    opts.onProgress?.(0.15 + 0.5 * (decodeDone / Math.max(1, uniqueMedia.length)))
  }

  const master = ctx.createGain()
  master.gain.value = 1
  master.connect(ctx.destination)

  // Day 25 — threshold-based auto-duck: one envelope per ducking clip (own
  // threshold + depth), all driven by the same decoded speech-level series
  const duckClips = audibleClips.filter((c) => c.autoDuck && c.kind === 'audio')
  let duckEnvs: Map<string, Float32Array> | undefined
  if (duckClips.length) {
    const speechLevels = buildSpeechLevels(project, bufferCache, sr, total, mediaMap)
    if (speechLevels) {
      duckEnvs = new Map()
      for (const c of duckClips) {
        duckEnvs.set(
          c.id,
          computeDuckEnvelope(speechLevels, {
            threshold: clamp(c.duckThreshold ?? 0.07, 0.005, 0.9),
            depth: clamp(c.duckDepth ?? 0.68, 0, 0.95),
          })
        )
      }
    }
  }
  const trackEqChains = new Map<string, TrackEqChain>()
  for (const tr of project.tracks) {
    const any = (tr.eqLow ?? 0) !== 0 || (tr.eqMid ?? 0) !== 0 || (tr.eqHigh ?? 0) !== 0
    if (!any) continue
    const teq = buildTrackEq(ctx)
    applyTrackEq(ctx, teq, tr)
    teq.output.connect(master)
    trackEqChains.set(tr.id, teq)
  }

  for (const clip of audibleClips) {
    const decoded = bufferCache.get(clip.mediaId!)
    if (!decoded) continue
    const track = project.tracks.find((tr) => tr.id === clip.trackId)
    if (!track) continue
    const speed = clamp(clip.speed, 0.0625, 16)
    const src = ctx.createBufferSource()
    src.buffer = decoded
    src.playbackRate.value = speed

    const chain = buildFxChain(ctx)
    applyClipFx(ctx, chain, clip.audioFx ?? undefined)
    src.connect(chain.pan)

    const gain = ctx.createGain()
    chain.sum.connect(gain)
    // Day 23 — route through the track's 3-band EQ stage when the mixer has one
    const teq = trackEqChains.get(clip.trackId)
    if (teq) gain.connect(teq.input)
    else gain.connect(master)

    // volume envelope: clip volume × normalize × track volume × fade × duck
    const env = duckEnvs?.get(clip.id)
    const norm = normalizeGainFor(clip.normalize, mediaMap.get(clip.mediaId!))
    const t0 = clip.start
    const t1 = clip.start + clip.duration
    const fadeIn = Math.min(clip.fadeIn > 0.01 ? clip.fadeIn : 0, clip.duration)
    const fadeOut = Math.min(clip.fadeOut > 0.01 ? clip.fadeOut : 0, clip.duration)
    const g = gain.gain
    if (env) {
      // Day 25 — ducking changes over time: automate fade × duck every 50 ms
      const base = clamp((clip.volume ?? 1) * (track.volume ?? 1) * norm, 0, 4)
      const step = 0.05
      g.setValueAtTime(0, Math.max(0, t0 - 0.002))
      for (let t = t0; t < t1; t += step) {
        const tl = t - t0
        const fade = fadeFactorLocal(clip, tl)
        const duck = duckFactorLocal(project, clip, t, env)
        g.linearRampToValueAtTime(clamp(base * fade * duck, 0, 4), t)
      }
      g.linearRampToValueAtTime(0, t1 + 0.005)
    } else {
      const duck = duckFactorLocal(project, clip, clip.start)
      const peak = clamp((clip.volume ?? 1) * (track.volume ?? 1) * duck * norm, 0, 4)
      g.setValueAtTime(0, Math.max(0, t0 - 0.002))
      if (fadeIn > 0.01) {
        g.linearRampToValueAtTime(peak, t0 + fadeIn)
      } else {
        g.setValueAtTime(peak, t0)
      }
      if (fadeOut > 0.01) {
        g.setValueAtTime(peak, Math.max(t0 + fadeIn + 0.001, t1 - fadeOut))
        g.linearRampToValueAtTime(0, t1)
      } else {
        g.setValueAtTime(peak, t1)
      }
      g.linearRampToValueAtTime(0, t1 + 0.005)
    }

    const offset = clamp(clip.trimStart, 0, Math.max(0, decoded.duration - 0.01))
    try {
      src.start(Math.max(0, t0), offset, clip.duration * speed)
    } catch {
      // zero-length or out-of-range source — skip silently
    }
  }

  opts.onProgress?.(0.7)
  const rendered = await ctx.startRendering()
  opts.onProgress?.(0.95)
  return rendered
}

/* ---------------- encoders ---------------- */

/** Encode an AudioBuffer as a 16-bit PCM WAV with the buffer's real channel count. */
export function encodeWav(buffer: AudioBuffer): Blob {
  const channels = Math.min(2, buffer.numberOfChannels)
  const frames = buffer.length
  const dataBytes = frames * channels * 2
  const out = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(out)
  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, channels, true)
  view.setUint32(24, buffer.sampleRate, true)
  view.setUint32(28, buffer.sampleRate * channels * 2, true)
  view.setUint16(32, channels * 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, dataBytes, true)
  const chans: Float32Array[] = []
  for (let c = 0; c < channels; c++) chans.push(buffer.getChannelData(c))
  let offset = 44
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const v = clamp(chans[c][i], -1, 1)
      view.setInt16(offset, v < 0 ? v * 0x8000 : v * 0x7fff, true)
      offset += 2
    }
  }
  return new Blob([out], { type: 'audio/wav' })
}

/** Encode an AudioBuffer as MP3 (lame) at the requested bitrate. */
export async function encodeMp3(buffer: AudioBuffer, kbps: 128 | 192 | 320): Promise<Blob> {
  const { Mp3Encoder } = await import('@breezystack/lamejs')
  const channels = Math.min(2, buffer.numberOfChannels)
  const enc = new Mp3Encoder(channels, buffer.sampleRate, kbps)
  const left = buffer.getChannelData(0)
  const right = channels > 1 ? buffer.getChannelData(1) : left
  const toInt16 = (f: Float32Array): Int16Array => {
    const out = new Int16Array(f.length)
    for (let i = 0; i < f.length; i++) {
      const v = clamp(f[i], -1, 1)
      out[i] = v < 0 ? v * 0x8000 : v * 0x7fff
    }
    return out
  }
  const l = toInt16(left)
  const r = toInt16(right)
  const blockSize = 1152
  const chunks: Uint8Array[] = []
  for (let i = 0; i < l.length; i += blockSize) {
    const lc = l.subarray(i, i + blockSize)
    const rc = channels > 1 ? r.subarray(i, i + blockSize) : undefined
    const encoded = channels > 1 ? enc.encodeBuffer(lc, rc!) : enc.encodeBuffer(lc)
    if (encoded.length > 0) chunks.push(new Uint8Array(encoded))
  }
  const end = enc.flush()
  if (end.length > 0) chunks.push(new Uint8Array(end))
  return new Blob(chunks as BlobPart[], { type: 'audio/mpeg' })
}

/* ---------------- EQ QA harness (Day 23 — real-DSP receipts) ---------------- */

if (typeof window !== 'undefined') {
  ;(window as unknown as { __ncEqHarness?: unknown }).__ncEqHarness = runEqHarness
}

/**
 * Offline EQ receipt: renders deterministic white noise through the REAL
 * shared chain (buildFxChain + applyClipFx) and optionally a real per-track
 * EQ stage (buildTrackEq + applyTrackEq), then returns integrated band
 * energies (Goertzel grid) for bypass vs EQ so QA can verify the shaping.
 *
 *   'eq10'     → clip 10-band: +12 dB at 1 k, flat elsewhere
 *   'track-eq' → per-track: low +12 dB, high −12 dB (mixer EQ stage)
 *   'gate'     → Day 24: quiet noise (below threshold) gated down, loud tone passes
 *   'denoise'  → Day 24: steady noise floor subtracted spectrally
 *   'track-pan' → Day 27: per-track pan hard L/R vs center (per-channel RMS)
 *   'fade-curves' → Day 28: linear/ease/hold fade envelopes (shared curve math)
 *   'pingpong'   → Day 28: ping-pong delay alternates repeats L then R
 */
async function runEqHarness(spec: 'eq10' | 'track-eq' | 'gate' | 'denoise' | 'track-pan' | 'fade-curves' | 'pingpong') {
  const sr = 44100
  const OfflineCtor =
    typeof OfflineAudioContext !== 'undefined'
      ? OfflineAudioContext
      : (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext
  if (!OfflineCtor) throw new Error('OfflineAudioContext unavailable')

  const render = async (fx: ClipAudioFx | undefined, track: Pick<Track, 'eqLow' | 'eqMid' | 'eqHigh'> | undefined) => {
    const ctx = new OfflineCtor(1, Math.ceil(sr * 1.2), sr)
    const chain = buildFxChain(ctx)
    applyClipFx(ctx, chain, fx)
    let out: AudioNode = chain.sum
    if (track) {
      const teq = buildTrackEq(ctx)
      applyTrackEq(ctx, teq, track)
      chain.sum.connect(teq.input)
      out = teq.output
    }
    const buf = ctx.createBuffer(1, Math.ceil(sr * 1.2), sr)
    const d = buf.getChannelData(0)
    let seed = 0x5f3759df
    for (let i = 0; i < d.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      d[i] = (seed / 0xffffffff) * 2 - 1
    }
    const s = ctx.createBufferSource()
    s.buffer = buf
    s.connect(chain.pan)
    out.connect(ctx.destination)
    s.start(0)
    s.stop(1.2)
    const rendered = await ctx.startRendering()
    const seg = rendered.getChannelData(0).slice(Math.floor(sr * 0.15), Math.floor(sr * 1.1))
    const band = (lo: number, hi: number, step: number) => {
      let e = 0
      for (let f = lo; f <= hi; f += step) {
        const m = goertzelMag(seg, sr, f)
        e += m * m
      }
      return e
    }
    return {
      b250: band(180, 320, 10),
      b1k: band(700, 1400, 20),
      b4k: band(3200, 5200, 40),
      low: band(60, 250, 10),
      mid: band(500, 2500, 25),
      high: band(4000, 8000, 40),
    }
  }

  if (spec === 'fade-curves') {
    // Day 28 — render a tone whose gain follows the REAL shared
    // fadeCurveFactor over a 1 s fade-in; sample RMS at 25% / 60% of the
    // window for each shape (linear / ease / hold).
    const renderFade = async (curve: 'linear' | 'ease' | 'hold') => {
      const ctx = new OfflineCtor(1, Math.ceil(sr * 1.2), sr)
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = 440
      const g = ctx.createGain()
      // envelope automation stepping the shared curve every 10 ms
      const step = 0.01
      g.gain.setValueAtTime(fadeCurveFactor(curve, 0), 0)
      for (let t = step; t <= 1.0 + 1e-9; t += step) {
        g.gain.linearRampToValueAtTime(fadeCurveFactor(curve, Math.min(1, t)), t)
      }
      osc.connect(g)
      g.connect(ctx.destination)
      osc.start(0)
      osc.stop(1.2)
      const r = await ctx.startRendering()
      const d = r.getChannelData(0)
      const rmsAt = (from: number, to: number) => {
        let a = 0
        const i0 = Math.floor(sr * from)
        const i1 = Math.floor(sr * to)
        for (let i = i0; i < i1; i++) a += d[i] * d[i]
        return Math.sqrt(a / (i1 - i0))
      }
      return { at25: rmsAt(0.2, 0.3), at60: rmsAt(0.55, 0.65), full: rmsAt(1.05, 1.15) }
    }
    const [lin, ea, hd] = await Promise.all([renderFade('linear'), renderFade('ease'), renderFade('hold')])
    return {
      spec,
      linearAt25: +lin.at25.toFixed(4),
      easeAt25: +ea.at25.toFixed(4),
      holdAt25: +hd.at25.toFixed(4),
      linearAt60: +lin.at60.toFixed(4),
      easeAt60: +ea.at60.toFixed(4),
      holdAt60: +hd.at60.toFixed(4),
      allFull: +((lin.full + ea.full + hd.full) / 3).toFixed(4),
    }
  }
  if (spec === 'pingpong') {
    // Day 28 — impulse into the real chain with ping-pong delay: repeats must
    // alternate L (first) then R, with delayTime spacing.
    const ctx = new OfflineCtor(2, Math.ceil(sr * 1.5), sr)
    const chain = buildFxChain(ctx)
    applyClipFx(ctx, chain, {
      delayMix: 1,
      delayTime: 0.2,
      delayFeedback: 0.5,
      delayPingPong: true,
      highPass: 0,
      lowPass: 0,
    } as ClipAudioFx)
    const buf = ctx.createBuffer(1, Math.ceil(sr * 0.005), sr)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = (1 - i / d.length) * 0.9
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(chain.pan)
    chain.sum.connect(ctx.destination)
    src.start(0)
    const r = await ctx.startRendering()
    const l = r.getChannelData(0)
    const r0 = r.getChannelData(1)
    const rmsWin = (x: Float32Array, from: number, to: number) => {
      let a = 0
      const i0 = Math.floor(sr * from)
      const i1 = Math.floor(sr * to)
      for (let i = i0; i < i1; i++) a += x[i] * x[i]
      return Math.sqrt(a / (i1 - i0))
    }
    // window 1: 0.21–0.28 s (first repeat, LEFT); window 2: 0.41–0.48 s (second, RIGHT)
    return {
      spec,
      firstRepeatL: +rmsWin(l, 0.21, 0.28).toFixed(4),
      firstRepeatR: +rmsWin(r0, 0.21, 0.28).toFixed(4),
      secondRepeatL: +rmsWin(l, 0.41, 0.48).toFixed(4),
      secondRepeatR: +rmsWin(r0, 0.41, 0.48).toFixed(4),
      alternation: +((rmsWin(r0, 0.41, 0.48) / (rmsWin(l, 0.41, 0.48) + 1e-9)) / (rmsWin(r0, 0.21, 0.28) / (rmsWin(l, 0.21, 0.28) + 1e-9))).toFixed(4),
    }
  }
  if (spec === 'track-pan') {
    // Day 27 — pan the whole track hard left/right: mono noise through the
    // real strip; compare per-channel band energies.
    const renderPan = async (pan: number) => {
      const ctx = new OfflineCtor(2, Math.ceil(sr * 1.2), sr)
      const chain = buildFxChain(ctx)
      applyClipFx(ctx, chain, undefined)
      const teq = buildTrackEq(ctx)
      applyTrackEq(ctx, teq, { eqLow: 0, eqMid: 0, eqHigh: 0, pan })
      chain.sum.connect(teq.input)
      teq.output.connect(ctx.destination)
      const buf = ctx.createBuffer(1, Math.ceil(sr * 1.2), sr)
      const d = buf.getChannelData(0)
      let seed = 0x5f3759df
      for (let i = 0; i < d.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        d[i] = (seed / 0xffffffff) * 2 - 1
      }
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(chain.pan)
      src.start(0)
      src.stop(1.2)
      const r = await ctx.startRendering()
      const l = r.getChannelData(0)
      const r0 = r.getChannelData(1)
      const rms = (x: Float32Array) => {
        let a = 0
        for (let i = Math.floor(sr * 0.15); i < Math.floor(sr * 1.1); i++) a += x[i] * x[i]
        return Math.sqrt(a / (sr * 0.95))
      }
      return { l: rms(l), r: rms(r0) }
    }
    const [c, lft, rgt] = await Promise.all([renderPan(0), renderPan(-1), renderPan(1)])
    return {
      spec,
      centerLR: +(c.l / (c.r + 1e-9)).toFixed(4),
      leftLR: +(lft.l / (lft.r + 1e-9)).toFixed(4),
      rightLR: +(rgt.r / (rgt.l + 1e-9)).toFixed(4),
    }
  }
  if (spec === 'eq10') {
    const eq10 = [0, 0, 0, 0, 0, 12, 0, 0, 0, 0]
    const [inB, outB] = await Promise.all([render(undefined, undefined), render({ eq10 } as ClipAudioFx, undefined)])
    const midRef = (b: { b250: number; b1k: number; b4k: number; low: number; mid: number; high: number }) =>
      Math.max(b.b250, b.b4k, 1e-9)
    return {
      spec,
      inB1kVsNeighbors: +(inB.b1k / midRef(inB)).toFixed(4),
      outB1kVsNeighbors: +(outB.b1k / midRef(outB)).toFixed(4),
      boost: +((outB.b1k / midRef(outB)) / (inB.b1k / midRef(inB))).toFixed(4),
    }
  }
  if (spec === 'gate') {
    // probe: 0.55 s of −54 dB-peak noise (hiss below threshold) then a 0.5 s
    // −6 dB tone burst above it — gate must mute the hiss and pass the tone.
    const renderGate = async (fx: ClipAudioFx | undefined) => {
      const ctx = new OfflineCtor(2, Math.ceil(sr * 1.4), sr)
      await ensureGateModule(ctx)
      const chain = buildFxChain(ctx)
      applyClipFx(ctx, chain, fx)
      const buf = ctx.createBuffer(1, Math.ceil(sr * 1.4), sr)
      const d = buf.getChannelData(0)
      let seed = 0x1234abcd
      for (let i = 0; i < d.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        d[i] = ((seed / 0xffffffff) * 2 - 1) * 0.002 // ~−54 dB peak hiss
      }
      for (let i = Math.floor(sr * 0.55); i < Math.min(d.length, Math.floor(sr * 1.05)); i++) {
        d[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sr)
      }
      const s = ctx.createBufferSource()
      s.buffer = buf
      s.connect(chain.pan)
      chain.sum.connect(ctx.destination)
      s.start(0)
      s.stop(1.4)
      const r = await ctx.startRendering()
      const quiet = r.getChannelData(0).slice(Math.floor(sr * 0.2), Math.floor(sr * 0.5))
      const tone = r.getChannelData(0).slice(Math.floor(sr * 0.75), Math.floor(sr * 1.0))
      const rms = (x: Float32Array) => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length)
      return { quietRms: rms(quiet), toneMag: goertzelMag(tone, sr, 440) }
    }
    const [b, g] = await Promise.all([
      renderGate(undefined),
      renderGate({ gate: true, gateThreshold: -45, gateRelease: 120 } as ClipAudioFx),
    ])
    return {
      spec,
      quietRmsBypass: +b.quietRms.toFixed(5),
      quietRmsGate: +g.quietRms.toFixed(5),
      gateSuppression: +(g.quietRms / (b.quietRms + 1e-9)).toFixed(4),
      toneMagBypass: +b.toneMag.toFixed(4),
      toneMagGate: +g.toneMag.toFixed(4),
      toneKeep: +(g.toneMag / (b.toneMag + 1e-9)).toFixed(4),
    }
  }
  if (spec === 'denoise') {
    // probe: steady white noise at a modest level — the auto-learned floor is
    // the noise itself, so spectral gating should cut broadband RMS hard.
    const renderDn = async (fx: ClipAudioFx | undefined) => {
      const ctx = new OfflineCtor(2, Math.ceil(sr * 1.4), sr)
      await ensureDenoiseModule(ctx)
      const chain = buildFxChain(ctx)
      applyClipFx(ctx, chain, fx)
      const buf = ctx.createBuffer(1, Math.ceil(sr * 1.4), sr)
      const d = buf.getChannelData(0)
      let seed = 0x5f3759df
      for (let i = 0; i < d.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        d[i] = ((seed / 0xffffffff) * 2 - 1) * 0.12
      }
      const s = ctx.createBufferSource()
      s.buffer = buf
      s.connect(chain.pan)
      chain.sum.connect(ctx.destination)
      s.start(0)
      s.stop(1.4)
      const r = await ctx.startRendering()
      const seg = r.getChannelData(0).slice(Math.floor(sr * 0.3), Math.floor(sr * 1.3))
      const rms = Math.sqrt(seg.reduce((a, v) => a + v * v, 0) / seg.length)
      return rms
    }
    const [b, g] = await Promise.all([
      renderDn(undefined),
      renderDn({ denoise: 0.8 } as ClipAudioFx),
    ])
    return {
      spec,
      rmsBypass: +b.toFixed(5),
      rmsDenoise: +g.toFixed(5),
      noiseReduction: +(g / (b + 1e-9)).toFixed(4),
    }
  }
  // track-eq: low +12 dB, high −12 dB on the mixer's track stage
  const [inT, outT] = await Promise.all([
    render(undefined, undefined),
    render(undefined, { eqLow: 12, eqMid: 0, eqHigh: -12 }),
  ])
  return {
    spec,
    inLowMid: +(inT.low / inT.mid).toFixed(4),
    outLowMid: +(outT.low / outT.mid).toFixed(4),
    inHighMid: +(inT.high / inT.mid).toFixed(4),
    outHighMid: +(outT.high / outT.mid).toFixed(4),
    lowLift: +((outT.low / outT.mid) / (inT.low / inT.mid)).toFixed(4),
    highDrop: +((outT.high / outT.mid) / (inT.high / inT.mid)).toFixed(4),
  }
}

/* ---------------- auto-duck QA harness (Day 25 — real shared function) ---------------- */

if (typeof window !== 'undefined') {
  ;(window as unknown as { __ncDuckHarness?: unknown }).__ncDuckHarness = runDuckHarness
}

/**
 * Offline receipt for the Day 25 duck envelope: drives the REAL shared
 * computeDuckEnvelope with a synthetic speech-level series (loud 0.30 → quiet
 * 0.01 → loud again, 1 s each at 10 ms hops) and returns the shape stats.
 */
function runDuckHarness(threshold = 0.07, depth = 0.68) {
  const hopsPerSec = 1000 / DUCK_HOP_MS
  const levels = new Float32Array(Math.ceil(3 * hopsPerSec))
  for (let i = 0; i < levels.length; i++) {
    const t = i / hopsPerSec
    levels[i] = t < 1 ? 0.3 : t < 2 ? 0.01 : 0.3
  }
  const env = computeDuckEnvelope(levels, { threshold, depth })
  const at = (sec: number) => +env[Math.floor(sec * hopsPerSec)].toFixed(4)
  const duckStart = env.findIndex((v) => v < 0.5) / hopsPerSec
  const recoverIdx: number[] = []
  for (let i = Math.floor(1 * hopsPerSec); i < env.length; i++) {
    if (env[i] >= 0.95) {
      recoverIdx.push(i)
      break
    }
  }
  const recover = recoverIdx.length ? recoverIdx[0] / hopsPerSec : -1
  return {
    spec: 'duck',
    envAtLoud1: at(0.9),
    envAtQuiet: at(1.5),
    envAtRecoveryEnd: at(1.9),
    envAtLoud2: at(2.5),
    duckEngagedAfterSec: +duckStart.toFixed(3),
    recoveredAfterSec: +recover.toFixed(3),
    min: +env.reduce((a, v) => Math.min(a, v), 1).toFixed(4),
    max: +env.reduce((a, v) => Math.max(a, v), 0).toFixed(4),
  }
}

/* ---------------- normalize QA harness (Day 29 — real shared math + real mixdown) ---------------- */

/** Measure the true peak (max abs sample) across every channel of a buffer. */
function truePeakOf(buf: AudioBuffer): number {
  let tp = 0
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < d.length; i++) {
      const v = Math.abs(d[i])
      if (v > tp) tp = v
    }
  }
  return tp
}

if (typeof window !== 'undefined') {
  ;(window as unknown as { __ncNormalizeHarness?: unknown }).__ncNormalizeHarness = async (
    arg?: { project?: Project; mediaMap?: Map<string, MediaAssetRuntime>; normalize?: boolean }
  ) => {
    // part 1 — the shared math against a real offline render:
    // −12 dBFS sine (peak 0.25) gains +11.04 dB to a −1 dBFS output;
    // a −30 dBFS source hits the +12 dB ceiling (output −18 dBFS).
    const sr = 44100
    const makeSine = (peak: number) => {
      const ctx = new OfflineAudioContext(1, sr, sr)
      const src = ctx.createBufferSource()
      const buf = ctx.createBuffer(1, sr, sr)
      const d = buf.getChannelData(0)
      for (let i = 0; i < sr; i++) d[i] = Math.sin((2 * Math.PI * 440 * i) / sr) * peak
      src.buffer = buf
      const g = ctx.createGain()
      g.gain.value = normalizeGainFor(true, { peakLevel: peak })
      src.connect(g).connect(ctx.destination)
      src.start(0)
      return ctx.startRendering()
    }
    const outExact = await makeSine(0.25)
    const outCapped = await makeSine(0.0312)

    // part 2 — optional REAL mixdown through renderProjectAudio (E2E passes
    // the live store project + runtime mediaMap with the imported file)
    let mixdown: { truePeak: number; gain: number } | null = null
    if (arg?.project && arg?.mediaMap && arg.mediaMap.size > 0) {
      const off = await renderProjectAudio(arg.project, arg.mediaMap, { sampleRate: sr, channels: 2 })
      const tp = truePeakOf(off)
      const first = [...arg.mediaMap.values()].find((m) => m.peakLevel && m.peakLevel > 0)
      mixdown = { truePeak: +tp.toFixed(4), gain: +(tp / (first?.peakLevel ?? 1)).toFixed(4) }
    }

    return {
      spec: 'normalize',
      exactGainDb: +(20 * Math.log10(normalizeGainFor(true, { peakLevel: 0.25 }))).toFixed(2),
      exactOutTruePeak: +truePeakOf(outExact).toFixed(4),
      capGain: +normalizeGainFor(true, { peakLevel: 0.0312 }).toFixed(4),
      capOutTruePeak: +truePeakOf(outCapped).toFixed(4),
      disabledGain: normalizeGainFor(false, { peakLevel: 0.25 }),
      missingAnalysisGain: normalizeGainFor(true, {}),
      mixdown,
    }
  }
}
