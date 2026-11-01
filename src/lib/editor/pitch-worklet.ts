/**
 * Live granular pitch shifter (Day 06 — per-effect custom controls).
 *
 * An AudioWorklet implementing dual-grain overlap-add pitch shifting with
 * tempo preserved: two Hann-windowed read heads chase the write pointer at
 * ratio^±semitones and re-anchor on every window wrap (masked — the window is
 * zero there). Runs in the live engine's AudioContext AND the offline
 * mixdown's OfflineAudioContext, so preview and export hear the same shift.
 *
 * The processor source ships as a string and is loaded via Blob URL — it has
 * to live outside the bundler because AudioWorklet modules are fetched.
 */

export const PITCH_WORKLET_CODE = `
class NcPitchShifter extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'semitones', defaultValue: 0, minValue: -12, maxValue: 12, automationRate: 'k-rate' }]
  }
  constructor() {
    super()
    this.grain = 2048        // ~43ms grain at 48k
    this.size = 16384        // circular buffer
    this.anchor = 4608       // read heads start this far behind the write head
    this.buf = []
    this.chs = 0
    this.absW = 0
    this.phase = [0, 0]
    this.pos = [0, 0]
    this.armed = false
    this.win = new Float32Array(this.grain)
    for (let i = 0; i < this.grain; i++) {
      this.win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / this.grain)
    }
  }
  arm(chs) {
    this.chs = chs
    this.buf = []
    for (let c = 0; c < chs; c++) this.buf.push(new Float32Array(this.size))
    this.absW = 0
    this.phase = [0, this.grain / 2]
    this.pos = [-this.anchor, -this.anchor + this.grain / 2]
    this.armed = true
  }
  process(inputs, outputs, params) {
    const out = outputs[0]
    if (!out || out.length === 0) return true
    const input = inputs[0]
    const chs = out.length
    const st = params.semitones[0] || 0

    // bypass: straight copy, no DSP state advances
    if (Math.abs(st) < 0.005 || !input || input.length === 0) {
      for (let c = 0; c < chs; c++) {
        const src = input && input.length ? input[Math.min(c, input.length - 1)] : null
        if (src) out[c].set(src)
        else out[c].fill(0)
      }
      if (this.armed && Math.abs(st) < 0.005) this.armed = false
      return true
    }

    if (!this.armed || this.chs !== chs) this.arm(chs)

    const r = Math.pow(2, st / 12)
    const grain = this.grain
    const size = this.size
    const anchor = this.anchor
    const win = this.win
    const N = out[0].length

    for (let i = 0; i < N; i++) {
      const wIdx = this.absW % size
      for (let c = 0; c < chs; c++) {
        this.buf[c][wIdx] = input[Math.min(c, input.length - 1)][i]
      }
      let acc0 = 0
      let acc1 = 0
      for (let h = 0; h < 2; h++) {
        const p = this.pos[h]
        const i0 = Math.floor(p)
        const fr = p - i0
        const j0 = ((i0 % size) + size) % size
        const j1 = (j0 + 1) % size
        const wgt = win[this.phase[h] | 0]
        if (chs > 1) {
          const s0c0 = this.buf[0][j0], s1c0 = this.buf[0][j1]
          const s0c1 = this.buf[1][j0], s1c1 = this.buf[1][j1]
          acc0 += (s0c0 + (s1c0 - s0c0) * fr) * wgt
          acc1 += (s0c1 + (s1c1 - s0c1) * fr) * wgt
        } else {
          const s0 = this.buf[0][j0], s1 = this.buf[0][j1]
          acc0 += (s0 + (s1 - s0) * fr) * wgt
        }
        let ph = this.phase[h] + 1
        let np = p + r
        if (ph >= grain) {
          ph -= grain
          np = this.absW - anchor
        }
        this.phase[h] = ph
        this.pos[h] = np
      }
      out[0][i] = acc0
      if (chs > 1) out[1][i] = acc1
      this.absW++
    }
    return true
  }
}
registerProcessor('nc-pitch-shifter', NcPitchShifter)
`

/** Contexts whose worklet module is already loaded. */
const pitchReady = new WeakSet<BaseAudioContext>()
/** Contexts with a load in flight (promise shared). */
const pitchLoading = new WeakMap<BaseAudioContext, Promise<boolean>>()
/** Last load failure per context — surfaced by the engine for diagnostics. */
const pitchError = new WeakMap<BaseAudioContext, string>()

/** Last module-load failure for a context, if any. */
export function getPitchError(ctx: BaseAudioContext): string | undefined {
  return pitchError.get(ctx)
}

/**
 * Load the pitch-shifter worklet module into a context (idempotent).
 * Resolves false when AudioWorklet is unavailable — callers fall back to bypass.
 */
export function ensurePitchModule(ctx: BaseAudioContext): Promise<boolean> {
  if (pitchReady.has(ctx)) return Promise.resolve(true)
  const inFlight = pitchLoading.get(ctx)
  if (inFlight) return inFlight
  if (typeof AudioWorkletNode === 'undefined' || !ctx.audioWorklet) {
    return Promise.resolve(false)
  }
  const p = ctx.audioWorklet
    .addModule(URL.createObjectURL(new Blob([PITCH_WORKLET_CODE], { type: 'application/javascript' })))
    .then(() => {
      pitchReady.add(ctx)
      pitchLoading.delete(ctx)
      pitchError.delete(ctx)
      return true
    })
    .catch((err: unknown) => {
      pitchLoading.delete(ctx)
      pitchError.set(ctx, String(err))
      return false
    })
  pitchLoading.set(ctx, p)
  return p
}

/** Whether the module finished loading for this context (node creation is sync only after this). */
export function pitchModuleReady(ctx: BaseAudioContext): boolean {
  return pitchReady.has(ctx)
}

/**
 * Create the pitch node (call only after ensurePitchModule resolved true).
 * Stereo in/out, k-rate semitones param.
 */
export function createPitchNode(ctx: BaseAudioContext): AudioWorkletNode | null {
  try {
    return new AudioWorkletNode(ctx, 'nc-pitch-shifter', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: 'explicit',
    })
  } catch {
    return null
  }
}
