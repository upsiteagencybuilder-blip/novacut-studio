/**
 * Live formant shifter (Day 21 — voice FX chain).
 *
 * An AudioWorklet implementing STFT spectral-envelope formant shifting with
 * pitch AND tempo preserved: each frame's magnitude spectrum is split into a
 * smooth spectral envelope (real cepstrum, low-quefrency lifter) plus fine
 * structure; the envelope is resampled in log-frequency while the fine
 * structure and phases stay put, then resynthesized with weighted
 * overlap-add. Moving the envelope moves the vocal-tract resonances — the
 * voice changes "size" (deep ↔ chipmunk timbre) without changing its pitch.
 *
 * Runs in the live engine's AudioContext AND the offline mixdown's
 * OfflineAudioContext through the same loader used by the pitch worklet, so
 * preview and export hear the same shift.
 *
 * The processor source ships as a string and is loaded via Blob URL — it has
 * to live outside the bundler because AudioWorklet modules are fetched.
 */

export const FORMANT_WORKLET_CODE = `
class NcFormantShifter extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'shift', defaultValue: 0, minValue: -12, maxValue: 12, automationRate: 'k-rate' }]
  }
  constructor() {
    super()
    this.N = 1024                 // STFT frame
    this.hop = 256                // 75% overlap
    this.L = Math.max(8, Math.round(sampleRate * 0.002)) // lifter cutoff ~2ms (keeps f0 in fine structure)
    this.ringN = 4096             // I/O rings (4 frames)

    // Hann window
    this.win = new Float32Array(this.N)
    for (let i = 0; i < this.N; i++) this.win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / this.N)

    // FFT tables (radix-2, size N)
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

    // scratch
    this.re = new Float32Array(this.N)
    this.im = new Float32Array(this.N)
    this.logMag = new Float32Array(this.N / 2 + 1)
    this.env = new Float32Array(this.N / 2 + 1)
    this.envNew = new Float32Array(this.N / 2 + 1)
    this.mag2 = new Float32Array(this.N / 2 + 1)
    this.ph = new Float32Array(this.N / 2 + 1)

    // per-channel streaming state (built on arm)
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
    this.inAbs = 0        // absolute input samples written
    this.readAbs = 0      // absolute output samples emitted
    this.nextFrame = 0    // absolute input position of the next frame start
    this.armed = true
  }

  fft(inverse) {
    const N = this.N
    const re = this.re
    const im = this.im
    // bit-reversal permutation
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

  /** STFT frame: cepstral envelope split + log-frequency warp + OLA into outRing[c] at pos. */
  processFrame(c, pos) {
    const N = this.N
    const hop = this.hop
    const ring = this.inRing[c]
    const out = this.outRing[c]
    const re = this.re
    const im = this.im
    const half = N / 2

    // windowed analysis frame from the input ring
    for (let i = 0; i < N; i++) {
      re[i] = ring[(pos + i) % this.ringN] * this.win[i]
      im[i] = 0
    }
    this.fft(false)

    // magnitude + phase, log magnitude
    const logMag = this.logMag
    const mag2 = this.mag2
    const ph = this.ph
    let silence = true
    for (let k = 0; k <= half; k++) {
      const r = re[k]
      const m = im[k]
      const mag = Math.sqrt(r * r + m * m)
      if (mag > 1e-6) silence = false
      mag2[k] = mag
      ph[k] = Math.atan2(m, r)
      logMag[k] = Math.log(mag + 1e-10)
    }
    if (silence) return // OLA cells stay zero — nothing to add

    // real cepstrum: IFFT of the Hermitian log spectrum (im = 0)
    for (let k = 0; k <= half; k++) re[k] = logMag[k]
    for (let k = half + 1; k < N; k++) re[k] = logMag[N - k]
    for (let i = 0; i < N; i++) im[i] = 0
    this.fft(true)
    // lifter: keep quefrency 0..L-1 (+ mirrored tail), zero the rest
    const L = this.L
    for (let i = L; i < N - L; i++) re[i] = 0
    // envelope: FFT of the liftered cepstrum
    for (let i = 0; i < N; i++) im[i] = 0
    this.fft(false)
    const env = this.env
    for (let k = 0; k <= half; k++) env[k] = re[k]

    // warp the envelope by f = 2^(shift/12)
    const st = this.curShift
    const f = Math.pow(2, st / 12)
    const envNew = this.envNew
    if (Math.abs(f - 1) < 1e-6) {
      for (let k = 0; k <= half; k++) envNew[k] = env[k]
    } else {
      for (let k = 0; k <= half; k++) {
        let x = k / f
        if (x > half) x = half
        const i0 = Math.floor(x)
        const fr = x - i0
        const a = env[Math.min(i0, half)]
        const b = env[Math.min(i0 + 1, half)]
        envNew[k] = a + (b - a) * fr
      }
    }

    // recombine: shifted envelope + original fine structure, original phases
    for (let k = 0; k <= half; k++) {
      const y = Math.exp(envNew[k] + (logMag[k] - env[k]))
      const cr = y * Math.cos(ph[k])
      const ci = y * Math.sin(ph[k])
      re[k] = cr
      im[k] = ci
      if (k > 0 && k < half) {
        re[N - k] = cr
        im[N - k] = -ci
      }
    }
    im[0] = 0
    im[half] = 0
    this.fft(true)

    // synthesis window + overlap-add at (frame start + latency N)
    // Hann² at hop N/4 sums to 1.5 — the 2/3 factor normalizes
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
    const st = params.shift[0] || 0
    this.curShift = st

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

    const N = this.N
    const ringN = this.ringN
    const M = input[0].length

    // append input to the rings
    for (let i = 0; i < M; i++) {
      for (let c = 0; c < chs; c++) {
        this.inRing[c][(this.inAbs + i) % ringN] = input[Math.min(c, input.length - 1)][i]
      }
    }
    this.inAbs += M

    // process every eligible frame (frame needs N samples from its start)
    while (this.inAbs - this.nextFrame >= N) {
      for (let c = 0; c < chs; c++) this.processFrame(c, this.nextFrame % ringN)
      this.nextFrame += this.hop
    }

    // emit: sample s is complete once written (positions < N are the latency pre-roll)
    for (let i = 0; i < M; i++) {
      const s = this.readAbs + i
      if (s < N) {
        for (let c = 0; c < chs; c++) out[c][i] = 0
        continue
      }
      const idx = s % ringN
      for (let c = 0; c < chs; c++) {
        out[c][i] = this.outRing[c][idx]
        this.outRing[c][idx] = 0 // consume the overlap-add cell
      }
    }
    this.readAbs += M
    return true
  }
}
registerProcessor('nc-formant-shifter', NcFormantShifter)
`

if (typeof window !== 'undefined') {
  // E2E diagnostic handle — lets QA render the real DSP offline (see Day 21 receipts)
  ;(window as unknown as { __ncFormantWorkletCode?: string }).__ncFormantWorkletCode = FORMANT_WORKLET_CODE
}

/** Contexts whose worklet module is already loaded. */
const formantReady = new WeakSet<BaseAudioContext>()
/** Contexts with a load in flight (promise shared). */
const formantLoading = new WeakMap<BaseAudioContext, Promise<boolean>>()
/** Last load failure per context — surfaced by the engine for diagnostics. */
const formantError = new WeakMap<BaseAudioContext, string>()

/** Last module-load failure for a context, if any. */
export function getFormantError(ctx: BaseAudioContext): string | undefined {
  return formantError.get(ctx)
}

/**
 * Load the formant-shifter worklet module into a context (idempotent).
 * Resolves false when AudioWorklet is unavailable — callers fall back to bypass.
 */
export function ensureFormantModule(ctx: BaseAudioContext): Promise<boolean> {
  if (formantReady.has(ctx)) return Promise.resolve(true)
  const inFlight = formantLoading.get(ctx)
  if (inFlight) return inFlight
  if (typeof AudioWorkletNode === 'undefined' || !ctx.audioWorklet) {
    return Promise.resolve(false)
  }
  const p = ctx.audioWorklet
    .addModule(URL.createObjectURL(new Blob([FORMANT_WORKLET_CODE], { type: 'application/javascript' })))
    .then(() => {
      formantReady.add(ctx)
      formantLoading.delete(ctx)
      formantError.delete(ctx)
      return true
    })
    .catch((err: unknown) => {
      formantLoading.delete(ctx)
      formantError.set(ctx, String(err))
      return false
    })
  formantLoading.set(ctx, p)
  return p
}

/** Whether the module finished loading for this context (node creation is sync only after this). */
export function formantModuleReady(ctx: BaseAudioContext): boolean {
  return formantReady.has(ctx)
}

/**
 * Create the formant node (call only after ensureFormantModule resolved true).
 * Stereo in/out, k-rate shift param.
 */
export function createFormantNode(ctx: BaseAudioContext): AudioWorkletNode | null {
  try {
    return new AudioWorkletNode(ctx, 'nc-formant-shifter', {
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
