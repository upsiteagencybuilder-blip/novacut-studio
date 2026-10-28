/**
 * Live noise gate (Day 24 — restoration suite).
 *
 * An AudioWorklet implementing a smooth envelope-follower gate: a one-pole
 * absolute-value envelope with fast attack and a user release, compared
 * against a k-rate dB threshold. Open = unity, closed = the floor gain
 * (default −48 dB, effectively silence but click-free). Time-domain DSP —
 * cheap, sample-accurate, and identical in the live engine and the offline
 * mixdown through the shared loader pattern.
 *
 * The processor source ships as a string and is loaded via Blob URL — it has
 * to live outside the bundler because AudioWorklet modules are fetched.
 */

export const GATE_WORKLET_CODE = `
class NcGate extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'threshold', defaultValue: -45, minValue: -80, maxValue: 0, automationRate: 'k-rate' },
      { name: 'release', defaultValue: 220, minValue: 20, maxValue: 1500, automationRate: 'k-rate' },
      { name: 'floor', defaultValue: 0.004, minValue: 0, maxValue: 0.5, automationRate: 'k-rate' },
    ]
  }
  constructor() {
    super()
    this.env = 0
    this.gain = 1
    this.armed = true
  }
  process(inputs, outputs, params) {
    const out = outputs[0]
    if (!out || out.length === 0) return true
    const input = inputs[0]
    const chs = out.length
    const M = input && input.length ? input[0].length : 128

    const on = params.threshold[0] < -0.5 // threshold at 0 dB = fully bypassed
    const st = params.threshold[0]
    const rel = params.release[0] / 1000
    const floor = params.floor[0]
    // envelope smoothing: fast attack (~2 ms), user release
    const aAtt = Math.exp(-1 / (0.002 * sampleRate))
    const aRel = Math.exp(-1 / (Math.max(0.005, rel) * sampleRate))
    // gain smoothing: 2 ms attack, release-scaled decay
    const gAtt = Math.exp(-1 / (0.002 * sampleRate))
    const gRel = Math.exp(-1 / (Math.max(0.01, rel * 0.8) * sampleRate))
    const linThr = Math.pow(10, st / 20)

    if (!on || !input || input.length === 0) {
      // bypass: straight copy, reset state so the next open starts clean
      for (let c = 0; c < chs; c++) {
        const src = input && input.length ? input[Math.min(c, input.length - 1)] : null
        if (src) out[c].set(src)
        else out[c].fill(0)
      }
      this.gain = 1
      this.env = 0
      this.armed = true
      return true
    }

    if (this.armed) {
      this.env = 0
      this.gain = floor
      this.armed = false
    }

    for (let i = 0; i < M; i++) {
      // envelope over the max channel magnitude
      let m = 0
      for (let c = 0; c < input.length; c++) {
        const v = Math.abs(input[c][i])
        if (v > m) m = v
      }
      const a = m > this.env ? aAtt : aRel
      this.env = a * this.env + (1 - a) * m
      const want = this.env >= linThr ? 1 : floor
      const g = want > this.gain ? gAtt : gRel
      this.gain = g * this.gain + (1 - g) * want
      for (let c = 0; c < chs; c++) {
        out[c][i] = input[Math.min(c, input.length - 1)][i] * this.gain
      }
    }
    return true
  }
}
registerProcessor('nc-gate', NcGate)
`

if (typeof window !== 'undefined') {
  ;(window as unknown as { __ncGateWorkletCode?: string }).__ncGateWorkletCode = GATE_WORKLET_CODE
}

/** Contexts whose worklet module is already loaded. */
const gateReady = new WeakSet<BaseAudioContext>()
/** Contexts with a load in flight (promise shared). */
const gateLoading = new WeakMap<BaseAudioContext, Promise<boolean>>()
/** Last load failure per context — surfaced by the engine for diagnostics. */
const gateError = new WeakMap<BaseAudioContext, string>()

/** Last module-load failure for a context, if any. */
export function getGateError(ctx: BaseAudioContext): string | undefined {
  return gateError.get(ctx)
}

/**
 * Load the gate worklet module into a context (idempotent).
 * Resolves false when AudioWorklet is unavailable — callers fall back to bypass.
 */
export function ensureGateModule(ctx: BaseAudioContext): Promise<boolean> {
  if (gateReady.has(ctx)) return Promise.resolve(true)
  const inFlight = gateLoading.get(ctx)
  if (inFlight) return inFlight
  if (typeof AudioWorkletNode === 'undefined' || !ctx.audioWorklet) {
    return Promise.resolve(false)
  }
  const p = ctx.audioWorklet
    .addModule(URL.createObjectURL(new Blob([GATE_WORKLET_CODE], { type: 'application/javascript' })))
    .then(() => {
      gateReady.add(ctx)
      gateLoading.delete(ctx)
      gateError.delete(ctx)
      return true
    })
    .catch((err: unknown) => {
      gateLoading.delete(ctx)
      gateError.set(ctx, String(err))
      return false
    })
  gateLoading.set(ctx, p)
  return p
}

/** Whether the module finished loading for this context (node creation is sync only after this). */
export function gateModuleReady(ctx: BaseAudioContext): boolean {
  return gateReady.has(ctx)
}

/**
 * Create the gate node (call only after ensureGateModule resolved true).
 * Stereo in/out, k-rate threshold/release/floor params.
 */
export function createGateNode(ctx: BaseAudioContext): AudioWorkletNode | null {
  try {
    return new AudioWorkletNode(ctx, 'nc-gate', {
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
