/**
 * Live spectral de-noise (Day 24 — restoration suite).
 *
 * An AudioWorklet implementing STFT spectral gating with automatic noise-floor
 * estimation: per bin, a running minimum with slow release tracks the noise
 * floor (minimum-statistics "the quiet moments are the noise"); the magnitude
 * is oversubtracted by β(amount) and the per-bin gain is smoothed + floored,
 * then resynthesized with weighted overlap-add (Hann², 75% overlap, same OLA
 * scaffolding as the Day 21 formant shifter). Phase untouched — artifacts stay
 * low. amount 0 bypasses; higher amounts subtract more and allow a lower
 * residual floor. Runs in the live engine AND the offline mixdown through the
 * shared loader pattern.
 *
 * The processor source ships as a string and is loaded via Blob URL — it has
 * to live outside the bundler because AudioWorklet modules are fetched.
 */

export const DENOISE_WORKLET_CODE = `
class NcDenoise extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'amount', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' }]
  }
  constructor() {
    super()
    this.N = 1024
    this.hop = 256
    this.ringN = 4096

    this.win = new Float32Array(this.N)
    for (let i = 0; i < this.N; i++) this.win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / this.N)

    this.rev = new Uint32Array(this.N)
    const bits = Math.log2(this.N)
    for (let i = 0; i < this.N; i++) {
      let r = 0
      for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b)
      this.rev[i] = r
    }
    this.cosT = new Float32Array(this.N / 2)
    this.sinT = new Float32Array(this.N / 2)
    for (let i = 0; i < this.N / 2; i++) {
      this.cosT[i] = Math.cos((2 * Math.PI * i) / this.N)
      this.sinT[i] = Math.sin((2 * Math.PI * i) / this.N)
    }

    const half = this.N / 2 + 1
    this.noise = new Float32Array(half)      // running noise-floor magnitude
    this.gainSm = new Float32Array(half)     // smoothed per-bin gain (starts 1)
    this.gainSm.fill(1)
    this.noiseInit = new Float32Array(half)  // warm-up max capture (first frames)
    this.warmup = 8                          // frames used for the initial floor
    this.frames = 0

    this.re = new Float32Array(this.N)
    this.im = new Float32Array(this.N)

    this.armed = false
    this.chs = 0
  }

  arm(chs) {
    this.chs = chs
    this.inRing = []
    this.outRing = []
    for (let c = 0; c < chs; c++) {
      this.inRing.push(new Float32Array(this.ringN))
      this.outRing.push(new Float32Array(this.ringN))
    }
    this.inAbs = 0
    this.readAbs = 0
    this.nextFrame = 0
    this.armed = true
  }

  fft(inverse) {
    const N = this.N
    const re = this.re
    const im = this.im
    for (let i = 0; i < N; i++) {
      const j = this.rev[i]
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t
        t = im[i]; im[i] = im[j]; im[j] = t
      }
    }
    const dir = inverse ? -1 : 1
    for (let size = 2; size <= N; size <<= 1) {
      const half = size >> 1
      const step = N / size
      for (let i = 0; i < N; i += size) {
        for (let j = 0; j < half; j++) {
          const tw = j * step
          const wr = this.cosT[tw]
          const wi = dir * this.sinT[tw]
          const a = i + j
          const b = a + half
          const xr = re[b] * wr - im[b] * wi
          const xi = re[b] * wi + im[b] * wr
          re[b] = re[a] - xr
          im[b] = im[a] - xi
          re[a] += xr
          im[a] += xi
        }
      }
    }
    if (inverse) {
      const inv = 1 / N
      for (let i = 0; i < N; i++) { re[i] *= inv; im[i] *= inv }
    }
  }

  /** STFT frame: noise-floor tracking + spectral gating + OLA into outRing[c]. */
  processFrame(c, pos, beta, floorDb) {
    const N = this.N
    const ring = this.inRing[c]
    const out = this.outRing[c]
    const re = this.re
    const im = this.im
    const half = N / 2

    for (let i = 0; i < N; i++) {
      re[i] = ring[(pos + i) % this.ringN] * this.win[i]
      im[i] = 0
    }
    this.fft(false)

    // per-bin: magnitude, noise-floor update, gate gain
    // first channel's frame also advances the shared floor estimate
    const shared = c === 0
    const noise = this.noise
    const gainSm = this.gainSm
    const floorLin = Math.pow(10, floorDb / 20)
    const relNoise = Math.exp(-this.hop / (sampleRate * 0.6))  // floor decays over ~0.6 s
    const gUp = Math.exp(-this.hop / (sampleRate * 0.02))      // gain opens fast (~20 ms)
    const gDn = Math.exp(-this.hop / (sampleRate * 0.12))      // gain closes slower
    for (let k = 0; k <= half; k++) {
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k])
      if (shared) {
        if (this.frames < this.warmup) {
          // warm-up: capture the MAXIMUM seen — the start is likely noise-only
          if (mag > this.noiseInit[k]) this.noiseInit[k] = mag
          noise[k] = this.noiseInit[k]
        } else if (mag < noise[k]) {
          noise[k] = mag                    // instant down — quiet moments ARE the floor
        } else {
          noise[k] = relNoise * noise[k] + (1 - relNoise) * mag * 0.25
        }
      }
      const target = mag > beta * noise[k] ? Math.max(floorLin, (mag - beta * noise[k]) / (mag + 1e-10)) : floorLin
      const g = target > gainSm[k] ? gUp : gDn
      gainSm[k] = g * gainSm[k] + (1 - g) * target
      re[k] *= gainSm[k]
      im[k] *= gainSm[k]
      if (k > 0 && k < half) {
        re[N - k] = re[k]
        im[N - k] = -im[k]
      }
    }
    im[0] = 0
    im[half] = 0
    if (shared) this.frames++
    this.fft(true)

    const wpos = pos + this.N
    for (let i = 0; i < N; i++) {
      out[(wpos + i) % this.ringN] += re[i] * this.win[i] * (2 / 3)
    }
  }

  process(inputs, outputs, params) {
    const out = outputs[0]
    if (!out || out.length === 0) return true
    const input = inputs[0]
    const chs = out.length
    const amt = params.amount[0] || 0
    this.curAmount = amt

    if (amt < 0.005 || !input || input.length === 0) {
      for (let c = 0; c < chs; c++) {
        const src = input && input.length ? input[Math.min(c, input.length - 1)] : null
        if (src) out[c].set(src)
        else out[c].fill(0)
      }
      if (this.armed && amt < 0.005) this.armed = false
      return true
    }

    if (!this.armed || this.chs !== chs) this.arm(chs)

    const N = this.N
    const ringN = this.ringN
    const M = input[0].length
    // oversubtraction 1 → 2.5, residual floor 0 → −30 dB, driven by amount
    const beta = 1 + 1.5 * amt
    const floorDb = -8 - 22 * amt

    for (let i = 0; i < M; i++) {
      for (let c = 0; c < chs; c++) {
        this.inRing[c][(this.inAbs + i) % ringN] = input[Math.min(c, input.length - 1)][i]
      }
    }
    this.inAbs += M

    while (this.inAbs - this.nextFrame >= N) {
      for (let c = 0; c < chs; c++) this.processFrame(c, this.nextFrame % ringN, beta, floorDb)
      this.nextFrame += this.hop
    }

    for (let i = 0; i < M; i++) {
      const s = this.readAbs + i
      if (s < N) {
        for (let c = 0; c < chs; c++) out[c][i] = 0
        continue
      }
      const idx = s % ringN
      for (let c = 0; c < chs; c++) {
        out[c][i] = this.outRing[c][idx]
        this.outRing[c][idx] = 0
      }
    }
    this.readAbs += M
    return true
  }
}
registerProcessor('nc-denoise', NcDenoise)
`

if (typeof window !== 'undefined') {
  ;(window as unknown as { __ncDenoiseWorkletCode?: string }).__ncDenoiseWorkletCode = DENOISE_WORKLET_CODE
}

/** Contexts whose worklet module is already loaded. */
const denoiseReady = new WeakSet<BaseAudioContext>()
/** Contexts with a load in flight (promise shared). */
const denoiseLoading = new WeakMap<BaseAudioContext, Promise<boolean>>()
/** Last load failure per context — surfaced by the engine for diagnostics. */
const denoiseError = new WeakMap<BaseAudioContext, string>()

/** Last module-load failure for a context, if any. */
export function getDenoiseError(ctx: BaseAudioContext): string | undefined {
  return denoiseError.get(ctx)
}

/**
 * Load the de-noise worklet module into a context (idempotent).
 * Resolves false when AudioWorklet is unavailable — callers fall back to bypass.
 */
export function ensureDenoiseModule(ctx: BaseAudioContext): Promise<boolean> {
  if (denoiseReady.has(ctx)) return Promise.resolve(true)
  const inFlight = denoiseLoading.get(ctx)
  if (inFlight) return inFlight
  if (typeof AudioWorkletNode === 'undefined' || !ctx.audioWorklet) {
    return Promise.resolve(false)
  }
  const p = ctx.audioWorklet
    .addModule(URL.createObjectURL(new Blob([DENOISE_WORKLET_CODE], { type: 'application/javascript' })))
    .then(() => {
      denoiseReady.add(ctx)
      denoiseLoading.delete(ctx)
      denoiseError.delete(ctx)
      return true
    })
    .catch((err: unknown) => {
      denoiseLoading.delete(ctx)
      denoiseError.set(ctx, String(err))
      return false
    })
  denoiseLoading.set(ctx, p)
  return p
}

/** Whether the module finished loading for this context (node creation is sync only after this). */
export function denoiseModuleReady(ctx: BaseAudioContext): boolean {
  return denoiseReady.has(ctx)
}

/**
 * Create the de-noise node (call only after ensureDenoiseModule resolved true).
 * Stereo in/out, k-rate amount param.
 */
export function createDenoiseNode(ctx: BaseAudioContext): AudioWorkletNode | null {
  try {
    return new AudioWorkletNode(ctx, 'nc-denoise', {
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
