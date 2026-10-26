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
import type { Clip, ClipAudioFx, MediaAssetRuntime, Project } from './types'
import { resolveNestedProject } from './nested'
import { clamp, projectDuration } from './utils'
import { decodeSource } from '@/lib/effects/voice'
import { createPitchNode, ensurePitchModule, pitchModuleReady } from './pitch-worklet'

/* ---------------- chain types + builder (shared with the engine) ---------------- */

/** Modulation sub-graph nodes (chorus / flanger / phaser) */
export interface ModNodes {
  dry: GainNode
  wet?: GainNode
  dly?: DelayNode
  lfo?: OscillatorNode
  lfoGain?: GainNode
  fb?: GainNode
  aps?: BiquadFilterNode[]
}

/**
 * Per-clip audio FX chain — stable topology with param-driven bypass.
 * src → pan → eqLow → eqMid → eqHigh → hp → lp → comp → modIn → [mod] → modOut
 * modOut → dry → sum;  modOut → delay → delayWet → sum (feedback loop);
 * modOut → convolver → reverbWet → sum;  sum → gain (playback envelope).
 */
export interface AudioFxChain {
  pan: AudioNode
  eqLow: BiquadFilterNode
  eqMid: BiquadFilterNode
  eqHigh: BiquadFilterNode
  hp: BiquadFilterNode
  lp: BiquadFilterNode
  comp: DynamicsCompressorNode
  pitchIn: GainNode
  pitchDry: GainNode
  pitchSum: GainNode
  modIn: GainNode
  modOut: GainNode
  dry: GainNode
  sum: GainNode
  pitch?: AudioWorkletNode
  pitchWet?: GainNode
  mod?: ModNodes
  modKind?: string
  delay?: DelayNode
  delayWet?: GainNode
  delayFb?: GainNode
  convolver?: ConvolverNode
  reverbWet?: GainNode
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
  eqHigh.connect(hp)
  hp.connect(lp)
  lp.connect(comp)
  comp.connect(pitchIn)
  pitchSum.connect(modIn)
  return { pan, eqLow, eqMid, eqHigh, hp, lp, comp, pitchIn, pitchDry, pitchSum, modIn, modOut, dry, sum, modKind: 'none' }
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
  kind: 'none' | 'chorus' | 'flanger' | 'phaser',
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
  // granular pitch (tempo-preserving) + wet/dry blend
  syncPitchStage(ctx, chain, clamp(f.pitch ?? 0, -12, 12), clamp(f.pitchMix ?? 1, 0, 1))
  // modulation
  const kind = f.modKind ?? 'none'
  const amount = clamp(f.modAmount ?? 0.5, 0, 1)
  if (kind !== chain.modKind || kind !== 'none') rebuildModulation(ctx, chain, kind, amount)
  else if (chain.mod) set(chain.mod.dry.gain, 1)
  // delay aux
  const dMix = clamp(f.delayMix ?? 0, 0, 1)
  if (dMix > 0.001) {
    if (!chain.delay) {
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
    set(chain.delay.delayTime, clamp(f.delayTime ?? 0.25, 0.05, 0.9))
    set(chain.delayFb!.gain, clamp(f.delayFeedback ?? 0.3, 0, 0.85))
    set(chain.delayWet!.gain, dMix * 0.9)
  } else if (chain.delayWet) {
    set(chain.delayWet.gain, 0)
  }
  // reverb aux (convolver created lazily, IR generated)
  const rMix = clamp(f.reverbMix ?? 0, 0, 1)
  if (rMix > 0.001) {
    if (!chain.convolver) {
      const size = clamp(f.reverbSize ?? 0.6, 0.2, 1)
      const conv = ctx.createConvolver()
      conv.buffer = makeImpulse(ctx, 0.4 + 2.8 * size)
      const wet = ctx.createGain()
      chain.modOut.connect(conv)
      conv.connect(wet)
      wet.connect(chain.sum)
      chain.convolver = conv
      chain.reverbWet = wet
    }
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

/* ---------------- offline project mixdown ---------------- */

export interface MixdownOptions {
  sampleRate: 44100 | 48000
  channels: 1 | 2
  onProgress?: (p: number) => void
}

/** Engine-mirrored fade envelope (fadeIn/fadeOut linear ramps). */
function fadeFactorLocal(clip: Clip, tLocal: number): number {
  let alpha = 1
  if (clip.fadeIn > 0.01) alpha *= clamp(tLocal / clip.fadeIn, 0, 1)
  if (clip.fadeOut > 0.01) alpha *= clamp((clip.duration - tLocal) / clip.fadeOut, 0, 1)
  return alpha
}

/** Engine-mirrored auto-duck: audio tracks duck under audible video clips. */
function duckFactorLocal(project: Project, clip: Clip, t: number): number {
  if (!clip.autoDuck || clip.kind !== 'audio') return 1
  for (const other of project.clips) {
    if (other.kind !== 'video' || other.muted || other.volume <= 0.02) continue
    if (t >= other.start && t < other.start + other.duration) {
      const otherTrack = project.tracks.find((tr) => tr.id === other.trackId)
      if (otherTrack && !otherTrack.muted) {
        return 1 - clamp(clip.duckDepth ?? 0.68, 0, 0.95)
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
    gain.connect(master)

    // volume envelope: clip volume × track volume × duck, with fade ramps
    const duck = duckFactorLocal(project, clip, clip.start)
    const peak = clamp((clip.volume ?? 1) * (track.volume ?? 1) * duck, 0, 1)
    const t0 = clip.start
    const t1 = clip.start + clip.duration
    const fadeIn = Math.min(clip.fadeIn > 0.01 ? clip.fadeIn : 0, clip.duration)
    const fadeOut = Math.min(clip.fadeOut > 0.01 ? clip.fadeOut : 0, clip.duration)
    const g = gain.gain
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
