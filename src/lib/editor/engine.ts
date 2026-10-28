'use client'

/**
 * NovaCut Studio — canvas preview engine.
 * Renders the project timeline onto a <canvas> and drives synced media playback.
 * Pure module: no direct store import — state arrives via a snapshot fn (see bridge hook).
 */
import type { Clip, ColorGrade, LutData, MediaAssetRuntime, Project, WipeShape } from './types'
import type { OverlayDraw, VisionDraw } from '@/lib/effects/types'
import { getEffect, getOverlayDraw } from '@/lib/effects/registry'
import { drawOverlayFrame, hash01, hashInt, hashString, overlayShake, overlayZoomPulse, valueNoise } from '@/lib/effects/overlay-render'
import { drawVisionFrame, getVisionSeed } from '@/lib/effects/vision-render'
import { applyPixelEffects, buildFilterString, clamp, composeFilters, composeGrades, easeInOut, easeOutBack, effectiveSpeedAt, evaluateKeyframeProperty, formatTimecode, projectDuration, rampSourceFraction } from './utils'
import { bridgeWindowFor, outgoingNeighborOf } from './transitionBridge'
import { applyClipFx, applyTrackEq, buildFxChain, buildTrackEq, makeImpulse, rebuildModulation } from './audio-mix'
import { ensureFormantModule, getFormantError } from './formant-worklet'
import { ensureGateModule, getGateError } from './gate-worklet'
import { ensureDenoiseModule, getDenoiseError } from './denoise-worklet'
import { ensurePitchModule, getPitchError } from './pitch-worklet'
import type { AudioFxChain, TrackEqChain } from './audio-mix'
import { drawStickerArt } from './sticker-render'
import { getBuiltinLutData } from './builtin-luts'
import { CANVAS_FONT_LOAD_LIST, DEFAULT_COLOR_GRADE, DEFAULT_FILTERS, MIN_CLIP_DURATION } from './constants'

export interface EngineSnapshot {
  project: Project
  mediaMap: Map<string, MediaAssetRuntime>
  masterVolume: number
  masterMuted: boolean
}

export interface EngineCallbacks {
  onTimeUpdate: (t: number) => void
  onEnded: () => void
  onAfterRender?: () => void
}

interface PoolEntry {
  el: HTMLVideoElement | HTMLAudioElement
  mediaId: string
  gain?: GainNode
  /** WebAudio tap on the element (created once per element) */
  srcNode?: MediaElementAudioSourceNode
  /** per-clip audio FX chain (pan/EQ/filters/comp/mod + delay/reverb aux) */
  chain?: AudioFxChain
  /** serialized ClipAudioFx signature the chain was last synced to */
  fxSig?: string
  /** owning track id (for per-track meters) */
  trackId?: string
  /** passive level tap for per-track meters */
  analyser?: AnalyserNode
  analyserData?: Uint8Array
}

// AudioFxChain / ModNodes types + chain builders live in ./audio-mix — the SAME
// topology powers preview, video export and the offline audio mixdown.
/** Screen-space bounds of a drawn clip (canvas coords) for selection overlay */
export interface ClipBounds {
  x: number
  y: number
  w: number
  h: number
  rotation: number
}

/** Resolved clip.vision state for the current frame (mega-effects vision post-FX) */
interface ActiveVision {
  draw: VisionDraw
  /** clamped 0..1 */
  intensity: number
  /** deterministic seed derived from the effect id */
  seed: number
  /** the clip's own filters, baked into the vision source (never re-applied) */
  filter: string
}

const driftTolerancePlay = 0.16
const driftTolerancePause = 0.03

/** Adaptive preview quality tier */
export type RenderQuality = 'low' | 'medium' | 'high'

/* ---------------- local easing helpers (v3 text animations) ---------------- */

function easeOutCubic(p: number): number {
  return 1 - Math.pow(1 - p, 3)
}

/** Spring overshoot easing in [0, 1+] (exactly 0 at p=0, exactly 1 at p=1) */
function elasticOut(p: number): number {
  if (p <= 0) return 0
  if (p >= 1) return 1
  const c4 = (2 * Math.PI) / 3
  return Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * c4) + 1
}

/* ---------------- deterministic text loop curves ---------------- */

interface GlitchSlice {
  /** vertical position as fraction of the text block height */
  y: number
  /** slice height as fraction of the font size */
  h: number
  /** horizontal rgb-split offset in px */
  dx: number
}

interface GlitchState {
  active: boolean
  slices: GlitchSlice[]
}

/** Deterministic neon flicker: smooth noise + rare deep dips (no Math.random) */
function neonFlickerCurve(t: number, seed: number): number {
  let f = 0.72 + 0.28 * valueNoise(t * 9, seed)
  if (hash01(hashInt(seed, Math.floor(t * 7) + 555)) < 0.1) f *= 0.45
  return clamp(f, 0.05, 1)
}

/** Deterministic glitch windows (~2-4 per second) with 2-3 slice offsets */
function glitchWindows(t: number, seed: number): GlitchState {
  const slot = Math.floor(t * 6)
  if (hash01(hashInt(seed, slot)) > 0.42) return { active: false, slices: [] }
  const frac = t * 6 - slot
  const win = 0.3 + hash01(hashInt(seed, slot * 7 + 13)) * 0.45
  if (frac > win) return { active: false, slices: [] }
  const n = 2 + Math.floor(hash01(hashInt(seed, slot * 3 + 5)) * 1.99)
  const slices: GlitchSlice[] = []
  for (let i = 0; i < n; i++) {
    slices.push({
      y: hash01(hashInt(seed, slot * 31 + i * 7 + 101)),
      h: 0.06 + hash01(hashInt(seed, slot * 17 + i * 11 + 233)) * 0.16,
      dx: (hash01(hashInt(seed, slot * 13 + i * 5 + 401)) - 0.5) * 9,
    })
  }
  return { active: true, slices }
}

class PreviewEngine {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private snapshotFn: (() => EngineSnapshot) | null = null
  private cb: EngineCallbacks | null = null

  private videos = new Map<string, PoolEntry>()
  private audios = new Map<string, PoolEntry>()
  private images = new Map<string, HTMLImageElement>()
  private bounds = new Map<string, ClipBounds>()

  private raf = 0
  private lastFrame = 0
  private playing = false
  private time = 0
  /** JKL shuttle multiplier — ±1/±2/±4 (negative = reverse playback) */
  private rate = 1
  private masterVolume = 1
  private masterMuted = false
  private fontsLoaded = false

  private audioCtx: AudioContext | null = null
  private pitchPreloaded = false
  private formantPreloaded = false
  private gatePreloaded = false
  private denoisePreloaded = false
  /** diagnostics: pitch worklet load status ('ready' | 'failed: …' | undefined) */
  pitchStatus: string | undefined = undefined
  /** diagnostics: formant worklet load status ('ready' | 'failed: …' | undefined) */
  formantStatus: string | undefined = undefined
  /** diagnostics: gate worklet load status ('ready' | 'failed: …' | undefined) */
  gateStatus: string | undefined = undefined
  /** diagnostics: de-noise worklet load status ('ready' | 'failed: …' | undefined) */
  denoiseStatus: string | undefined = undefined
  private exportDest: MediaStreamAudioDestinationNode | null = null
  private masterAnalyser: AnalyserNode | null = null
  /** Day 23 — per-track 3-band EQ stages (mixer), keyed by track id */
  private trackEqChains = new Map<string, { chain: TrackEqChain; sig: string }>()
  private analyserData: Uint8Array | null = null
  private renderPending = false
  /** cached reverb impulse responses, keyed by seconds bucket */
  private irCache = new Map<string, AudioBuffer>()

  /** offscreen canvas used for chroma-key / grade / LUT pixel passes */
  private fxCanvas: HTMLCanvasElement | null = null
  private fxCtx: CanvasRenderingContext2D | null = null
  /** offscreen canvas used to build the vision post-FX source (clip pixels + filters) */
  private visionCanvas: HTMLCanvasElement | null = null
  private visionCtx: CanvasRenderingContext2D | null = null
  private lutCache = new Map<string, LutData | null>()

  /** Drop cached LUT lookups (call when LUT assets are deleted or re-imported). */
  invalidateLutCache(id?: string) {
    if (id) this.lutCache.delete(id)
    else this.lutCache.clear()
    this.invalidate()
  }

  /* adaptive render quality */
  private renderScale = 1
  private renderQuality: RenderQuality = 'high'
  /** forced scale while exporting (always full project resolution) */
  private exportScaleOverride: number | null = null
  /** timecode burn-in overlay, armed only between beginExport/endExport */
  private exportBurnIn: 'timecode' | null = null

  /** Day 13 — compare split: 0..1 fraction; LEFT of the cut shows the ORIGINAL, right shows the graded frame. null = off */
  private compareSplit: number | null = null
  /** while true, drawClip renders with ALL color FX stripped (original look) */
  private noColorFx = false
  /** offscreen for the graded pass of the compare split */
  private compareCanvas: HTMLCanvasElement | null = null

  /** Toggle/retune the compare split (preview only — exports always render the graded frame) */
  setCompareSplit(v: number | null) {
    this.compareSplit = v == null ? null : clamp(v, 0.02, 0.98)
    this.renderFrame()
  }

  getCompareSplit(): number | null {
    return this.exportScaleOverride !== null ? null : this.compareSplit
  }

  /** Detect device tier once and pick the adaptive preview render scale */
  initAdaptiveQuality() {
    const tier = detectDeviceTier()
    this.renderQuality = tier.quality
    this.renderScale = tier.scale
  }

  /** Scale currently applied to the canvas backing store */
  private activeScale(): number {
    return this.exportScaleOverride ?? this.renderScale
  }

  /** Override the preview render scale (0.5..2); export resolution is unaffected */
  setRenderScale(scale: number) {
    this.renderScale = clamp(scale, 0.5, 2)
    this.renderQuality = this.renderScale <= 1.001 ? 'low' : this.renderScale <= 1.501 ? 'medium' : 'high'
    if (this.exportScaleOverride === null) this.invalidate()
  }

  getRenderQuality(): RenderQuality {
    return this.renderQuality
  }

  /* -------------------------------------------------- lifecycle */

  attach(canvas: HTMLCanvasElement, snapshotFn: () => EngineSnapshot, cb: EngineCallbacks) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: false })
    this.snapshotFn = snapshotFn
    this.cb = cb
    this.time = 0
    this.loadFonts()
    this.renderFrame()
  }

  detach() {
    this.pause()
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    for (const { el } of this.videos.values()) {
      el.pause()
      el.src = ''
    }
    for (const { el } of this.audios.values()) {
      el.pause()
      el.src = ''
    }
    this.videos.clear()
    this.audios.clear()
    this.images.clear()
    this.bounds.clear()
    this.canvas = null
    this.ctx = null
    this.snapshotFn = null
    this.cb = null
  }

  private loadFonts() {
    if (this.fontsLoaded || typeof document === 'undefined' || !document.fonts) return
    const promises = CANVAS_FONT_LOAD_LIST.map((f) => document.fonts.load(f).catch(() => undefined))
    Promise.all(promises)
      .then(() => {
        this.fontsLoaded = true
        this.invalidate()
      })
      .catch(() => undefined)
  }

  /* -------------------------------------------------- transport */

  get currentTime() {
    return this.time
  }

  get isPlaying() {
    return this.playing
  }

  get duration() {
    return this.snapshotFn ? projectDuration(this.snapshotFn().project) : 0
  }

  play(rate = 1) {
    if (!this.snapshotFn) return
    // pressing L/J while already shuttling just changes the speed/direction
    this.rate = Number.isFinite(rate) && rate !== 0 ? rate : 1
    if (this.playing) return
    const dur = this.duration
    if (this.time >= dur - 0.02) this.time = 0
    // build the WebAudio graph on the first user-gesture play — this powers the
    // audio FX chains, the mixer master/track meters and export capture
    this.ensureAudioGraph()
    this.playing = true
    this.lastFrame = performance.now()
    const tick = (now: number) => {
      if (!this.playing) return
      const dt = Math.min(0.25, (now - this.lastFrame) / 1000)
      this.lastFrame = now
      this.time += dt * this.rate
      const d = this.duration
      if (this.rate < 0 && this.time <= 0) {
        // reverse shuttle reached the start — settle at 0 and stop
        this.time = 0
        this.renderFrame()
        this.playing = false
        this.cb?.onTimeUpdate(0)
        this.cb?.onEnded()
        return
      }
      if (this.time >= d) {
        this.time = d
        this.renderFrame()
        this.playing = false
        this.cb?.onEnded()
        return
      }
      this.cb?.onTimeUpdate(this.time)
      this.renderFrame()
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  /** change the shuttle speed/direction mid-playback (JKL) */
  setRate(rate: number) {
    if (!Number.isFinite(rate)) return
    this.rate = rate === 0 ? 1 : rate
  }

  get shuttleRate() {
    return this.rate
  }

  pause() {
    this.playing = false
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    for (const { el } of this.videos.values()) el.pause()
    for (const { el } of this.audios.values()) el.pause()
    // reversed clips settle through async seeks — schedule a final render so
    // the paused canvas always shows the settled reversed frame
    this.invalidate()
  }

  seekTo(t: number) {
    if (Math.abs(t - this.time) < 0.0008) return
    this.time = clamp(t, 0, Math.max(this.duration, 0.0001))
    this.renderFrame()
  }

  /** Called when project/media state changed while paused — schedule a render + pool cleanup */
  invalidate() {
    if (this.renderPending) return
    this.renderPending = true
    requestAnimationFrame(() => {
      this.renderPending = false
      if (!this.ctx) return
      this.cleanupPools()
      this.renderFrame()
    })
  }

  setMaster(volume: number, muted: boolean) {
    this.masterVolume = volume
    this.masterMuted = muted
  }

  getClipBounds(clipId: string): ClipBounds | undefined {
    return this.bounds.get(clipId)
  }

  /* -------------------------------------------------- audio graph (export) */

  /** Route all element audio through WebAudio and return a capture stream for export */
  beginExport(fps: number, opts?: { burnIn?: 'timecode' }): MediaStream | null {
    if (!this.canvas) return null
    // Export always records at full project resolution — never the adaptive preview scale.
    this.exportScaleOverride = 1
    this.exportBurnIn = opts?.burnIn ?? null
    const proj = this.snapshotFn?.().project
    if (proj) {
      this.canvas.width = proj.canvasWidth
      this.canvas.height = proj.canvasHeight
    }
    try {
      if (!this.audioCtx) this.audioCtx = new AudioContext()
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume().catch(() => undefined)
      this.preloadPitchModule()
      this.preloadFormantModule()
      this.preloadGateModule()
      this.preloadDenoiseModule()
      if (!this.exportDest) this.exportDest = this.audioCtx.createMediaStreamDestination()
      // route existing + future elements through their FX chains
      this.ensureAnalyser()
      const project = this.snapshotFn?.().project
      const clipOf = (clipId: string) => project?.clips.find((c) => c.id === clipId)
      for (const [id, entry] of this.videos) {
        const clip = clipOf(id)
        if (clip) this.routeEntry(clip, entry)
      }
      for (const [id, entry] of this.audios) {
        const clip = clipOf(id)
        if (clip) this.routeEntry(clip, entry)
      }
      const videoStream = this.canvas.captureStream(fps)
      const audioTracks = this.exportDest.stream.getAudioTracks()
      for (const track of audioTracks) videoStream.addTrack(track)
      return videoStream
    } catch (e) {
      console.error('beginExport failed', e)
      return null
    }
  }

  endExport() {
    // keep audioCtx alive (elements are permanently routed); nothing to tear down
    this.exportBurnIn = null
    if (this.exportScaleOverride !== null) {
      this.exportScaleOverride = null
      this.invalidate()
    }
  }

  /** RMS master level 0..1 for UI meters (0 when audio graph not yet built) */
  getMasterLevel(): number {
    if (!this.masterAnalyser || !this.analyserData) return 0
    this.masterAnalyser.getByteTimeDomainData(this.analyserData as Uint8Array<ArrayBuffer>)
    let sum = 0
    for (let i = 0; i < this.analyserData.length; i++) {
      const v = (this.analyserData[i] - 128) / 128
      sum += v * v
    }
    return Math.min(1, Math.sqrt(sum / this.analyserData.length) * 2.2)
  }

  /** Sample the current preview frame at a small resolution (for scopes) */
  sampleFrame(maxSize = 96): Uint8ClampedArray | null {
    if (!this.canvas) return null
    const sw = this.canvas.width
    const sh = this.canvas.height
    const scale = Math.min(1, maxSize / Math.max(sw, sh))
    const w = Math.max(1, Math.round(sw * scale))
    const h = Math.max(1, Math.round(sh * scale))
    if (!this.fxCanvas) {
      this.fxCanvas = document.createElement('canvas')
      this.fxCtx = this.fxCanvas.getContext('2d', { willReadFrequently: true })
    }
    const c = this.fxCanvas!
    if (c.width !== w || c.height !== h) {
      c.width = w
      c.height = h
    }
    const ctx = this.fxCtx!
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(this.canvas, 0, 0, w, h)
    return ctx.getImageData(0, 0, w, h).data
  }

  private ensureAnalyser() {
    if (!this.audioCtx || this.masterAnalyser) return
    try {
      const analyser = this.audioCtx.createAnalyser()
      analyser.fftSize = 512
      analyser.connect(this.audioCtx.destination)
      this.masterAnalyser = analyser
      this.analyserData = new Uint8Array(analyser.fftSize)
    } catch {
      /* ignore */
    }
  }

  /* -------------------------------------------------- audio FX chain */

  /**
   * Create the AudioContext on the first user-gesture play and route every
   * pooled media element through WebAudio. This is what makes the mixer
   * meters live and the per-clip FX chains work during normal playback
   * (previously the graph only existed while exporting).
   */
  private ensureAudioGraph() {
    try {
      if (!this.audioCtx) this.audioCtx = new AudioContext()
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume().catch(() => undefined)
      this.preloadPitchModule()
      this.preloadFormantModule()
      this.preloadGateModule()
      this.preloadDenoiseModule()
      this.ensureAnalyser()
      const project = this.snapshotFn?.().project
      if (!project) return
      const clipOf = (clipId: string) => project.clips.find((c) => c.id === clipId)
      for (const [id, entry] of this.videos) {
        const clip = clipOf(id)
        if (clip) this.routeEntry(clip, entry)
      }
      for (const [id, entry] of this.audios) {
        const clip = clipOf(id)
        if (clip) this.routeEntry(clip, entry)
      }
    } catch {
      /* audio graph is optional — element-volume path still works */
    }
  }

  /**
   * Tap a media element into WebAudio once: element source → FX chain → gain →
   * master analyser (or destination) + export capture. Keeps a per-entry
   * analyser tap for the mixer's per-track meters.
   */
  private routeEntry(clip: Clip, entry: PoolEntry) {
    if (!this.audioCtx || entry.srcNode) return
    try {
      entry.trackId = clip.trackId
      const src = this.audioCtx.createMediaElementSource(entry.el)
      const chain = this.buildCoreChain()
      const gain = this.audioCtx.createGain()
      src.connect(chain.pan)
      chain.sum.connect(gain)
      // Day 23 — every routed clip flows through its track's 3-band EQ stage
      const teq = this.ensureTrackEqChain(clip.trackId)
      const out: AudioNode = teq ? teq.chain.output : gain
      if (teq) gain.connect(teq.chain.input)
      if (this.masterAnalyser) out.connect(this.masterAnalyser)
      else out.connect(this.audioCtx.destination)
      if (this.exportDest) out.connect(this.exportDest)
      // passive tap for per-track meters
      try {
        const an = this.audioCtx.createAnalyser()
        an.fftSize = 256
        chain.sum.connect(an)
        entry.analyser = an
        entry.analyserData = new Uint8Array(an.fftSize)
      } catch {
        /* meter tap optional */
      }
      entry.srcNode = src
      entry.chain = chain
      entry.gain = gain
      entry.el.volume = 1 // gains take over attenuation
      entry.fxSig = undefined // force a param sync on the next frame
    } catch {
      /* element already routed or createMediaElementSource unsupported */
    }
  }

  /** Build the always-present core chain (shared topology — see audio-mix.ts). */
  private buildCoreChain(): AudioFxChain {
    return buildFxChain(this.audioCtx!)
  }

  /**
   * Day 23 — get (or lazily create) a track's 3-band EQ stage. The output is
   * wired to master/destination/export at creation; clips routed later join
   * via their gain node.
   */
  private ensureTrackEqChain(trackId: string): { chain: TrackEqChain; sig: string } | null {
    if (!this.audioCtx) return null
    const existing = this.trackEqChains.get(trackId)
    if (existing) return existing
    try {
      const chain = buildTrackEq(this.audioCtx)
      const rec = { chain, sig: '' }
      this.trackEqChains.set(trackId, rec)
      return rec
    } catch {
      return null
    }
  }

  /** Push a track's mixer EQ values into its stage when they changed. */
  private syncTrackEq(track: { id: string; eqLow?: number; eqMid?: number; eqHigh?: number }) {
    if (!this.audioCtx) return
    const sig = `${track.eqLow ?? 0}|${track.eqMid ?? 0}|${track.eqHigh ?? 0}`
    if (sig === '0|0|0' && !this.trackEqChains.has(track.id)) return
    const rec = this.ensureTrackEqChain(track.id)
    if (!rec || rec.sig === sig) return
    rec.sig = sig
    applyTrackEq(this.audioCtx, rec.chain, track)
  }

  /** Push a clip's ClipAudioFx values into its chain nodes (called on signature change). */
  private updateAudioChain(clip: Clip, chain: AudioFxChain) {
    if (!this.audioCtx) return
    applyClipFx(this.audioCtx, chain, clip.audioFx ?? undefined)
  }

  /**
   * Load the granular pitch worklet once the graph exists; when it lands,
   * invalidate every chain's fx signature so the next frame wires the
   * pitch nodes in (they can only be created after the module is ready).
   */
  private preloadPitchModule() {
    if (!this.audioCtx || this.pitchPreloaded) return
    this.pitchPreloaded = true
    void ensurePitchModule(this.audioCtx).then((ok) => {
      if (!ok) {
        this.pitchStatus = `failed: ${getPitchError(this.audioCtx!) ?? 'unavailable'}`
        console.warn('[novacut] pitch worklet unavailable — pitch FX stay bypassed:', this.pitchStatus)
        return
      }
      this.pitchStatus = 'ready'
      for (const entry of this.videos.values()) entry.fxSig = undefined
      for (const entry of this.audios.values()) entry.fxSig = undefined
    })
  }

  /**
   * Load the formant worklet once the graph exists (Day 21); when it lands,
   * invalidate every chain's fx signature so the next frame wires the
   * formant nodes in.
   */
  private preloadFormantModule() {
    if (!this.audioCtx || this.formantPreloaded) return
    this.formantPreloaded = true
    void ensureFormantModule(this.audioCtx).then((ok) => {
      if (!ok) {
        this.formantStatus = `failed: ${getFormantError(this.audioCtx!) ?? 'unavailable'}`
        console.warn('[novacut] formant worklet unavailable — formant FX stay bypassed:', this.formantStatus)
        return
      }
      this.formantStatus = 'ready'
      for (const entry of this.videos.values()) entry.fxSig = undefined
      for (const entry of this.audios.values()) entry.fxSig = undefined
    })
  }

  /** Load the gate worklet once the graph exists; on load, re-sync all chains. */
  private preloadGateModule() {
    if (!this.audioCtx || this.gatePreloaded) return
    this.gatePreloaded = true
    void ensureGateModule(this.audioCtx).then((ok) => {
      if (!ok) {
        this.gateStatus = `failed: ${getGateError(this.audioCtx!) ?? 'unavailable'}`
        console.warn('[novacut] gate worklet unavailable — gates stay bypassed:', this.gateStatus)
        return
      }
      this.gateStatus = 'ready'
      for (const entry of this.videos.values()) entry.fxSig = undefined
      for (const entry of this.audios.values()) entry.fxSig = undefined
    })
  }

  /** Load the de-noise worklet once the graph exists; on load, re-sync all chains. */
  private preloadDenoiseModule() {
    if (!this.audioCtx || this.denoisePreloaded) return
    this.denoisePreloaded = true
    void ensureDenoiseModule(this.audioCtx).then((ok) => {
      if (!ok) {
        this.denoiseStatus = `failed: ${getDenoiseError(this.audioCtx!) ?? 'unavailable'}`
        console.warn('[novacut] de-noise worklet unavailable — de-noise stays bypassed:', this.denoiseStatus)
        return
      }
      this.denoiseStatus = 'ready'
      for (const entry of this.videos.values()) entry.fxSig = undefined
      for (const entry of this.audios.values()) entry.fxSig = undefined
    })
  }

  /** Deterministic noise-decay impulse response, cached per 0.1s bucket. */
  private getImpulse(seconds: number): AudioBuffer {
    const sec = Math.round(seconds * 10) / 10
    const cached = this.irCache.get(String(sec))
    if (cached) return cached
    const buf = makeImpulse(this.audioCtx!, sec)
    this.irCache.set(String(sec), buf)
    return buf
  }

  /**
   * Keep a clip's FX chain in sync before its element is synced each frame:
   * routes the element if the graph just came up, then re-applies params when
   * the serialized audioFx signature changed.
   */
  private ensureAudioChain(clip: Clip, entry: PoolEntry) {
    if (!this.audioCtx) return
    if (!entry.srcNode) this.routeEntry(clip, entry)
    if (!entry.chain) return
    entry.trackId = clip.trackId
    const sig = JSON.stringify(clip.audioFx ?? null)
    if (entry.fxSig !== sig) {
      entry.fxSig = sig
      this.updateAudioChain(clip, entry.chain)
    }
  }

  /** Loudest active clip level on a track (0..1) for the mixer's track meters. */
  getTrackLevel(trackId: string): number {
    if (!this.analyserData) return 0
    let level = 0
    const pools = [this.videos, this.audios]
    for (const pool of pools) {
      for (const entry of pool.values()) {
        if (entry.trackId !== trackId || !entry.analyser || !entry.analyserData) continue
        entry.analyser.getByteTimeDomainData(entry.analyserData as Uint8Array<ArrayBuffer>)
        let sum = 0
        for (let i = 0; i < entry.analyserData.length; i++) {
          const v = (entry.analyserData[i] - 128) / 128
          sum += v * v
        }
        level = Math.max(level, Math.min(1, Math.sqrt(sum / entry.analyserData.length) * 2.2))
      }
    }
    return level
  }

  /* -------------------------------------------------- pools */

  private getOrCreateVideo(clip: Clip, mediaId: string, url: string): HTMLVideoElement | null {
    const existing = this.videos.get(clip.id)
    if (existing && existing.mediaId === mediaId) return existing.el as HTMLVideoElement
    if (existing) {
      existing.el.pause()
      existing.el.src = ''
      this.videos.delete(clip.id)
    }
    const el = document.createElement('video')
    el.src = url
    el.preload = 'auto'
    el.playsInline = true
    el.crossOrigin = 'anonymous'
    el.muted = false
    el.addEventListener('seeked', () => {
      if (!this.playing) this.renderFrame()
    })
    this.videos.set(clip.id, { el, mediaId })
    if (this.audioCtx) {
      this.ensureAnalyser()
      const entry = this.videos.get(clip.id)!
      this.routeEntry(clip, entry)
    }
    return el
  }

  private getOrCreateAudio(clip: Clip, mediaId: string, url: string): HTMLAudioElement | null {
    const existing = this.audios.get(clip.id)
    if (existing && existing.mediaId === mediaId) return existing.el as HTMLAudioElement
    if (existing) {
      existing.el.pause()
      existing.el.src = ''
      this.audios.delete(clip.id)
    }
    const el = document.createElement('audio')
    el.src = url
    el.preload = 'auto'
    el.addEventListener('seeked', () => {
      if (!this.playing) this.renderFrame()
    })
    this.audios.set(clip.id, { el, mediaId })
    if (this.audioCtx) {
      this.ensureAnalyser()
      const entry = this.audios.get(clip.id)!
      this.routeEntry(clip, entry)
    }
    return el
  }

  private getImage(mediaId: string, url: string): HTMLImageElement | null {
    const existing = this.images.get(mediaId)
    if (existing) return existing
    const img = new Image()
    img.src = url
    img.onload = () => {
      if (!this.playing) this.invalidate()
    }
    this.images.set(mediaId, img)
    return img.complete ? img : null
  }

  private cleanupPools() {
    if (!this.snapshotFn) return
    const { project } = this.snapshotFn()
    const liveClipIds = new Set(project.clips.map((c) => c.id))
    const liveMediaIds = new Set(project.clips.map((c) => c.mediaId).filter(Boolean) as string[])
    for (const [id, entry] of this.videos) {
      if (!liveClipIds.has(id)) {
        entry.el.pause()
        entry.el.src = ''
        this.videos.delete(id)
      }
    }
    for (const [id, entry] of this.audios) {
      if (!liveClipIds.has(id)) {
        entry.el.pause()
        entry.el.src = ''
        this.audios.delete(id)
      }
    }
    for (const id of this.images.keys()) {
      if (!liveMediaIds.has(id)) this.images.delete(id)
    }
    for (const id of this.bounds.keys()) {
      if (!liveClipIds.has(id)) this.bounds.delete(id)
    }
  }

  /* -------------------------------------------------- sync helpers */

  private fadeFactor(
    clip: Clip,
    tLocal: number,
    opts?: { skipFadeOut?: boolean; skipFadeIn?: boolean }
  ): number {
    let alpha = 1
    if (clip.fadeIn > 0.01 && !opts?.skipFadeIn) alpha *= clamp(tLocal / clip.fadeIn, 0, 1)
    if (clip.fadeOut > 0.01 && !opts?.skipFadeOut) alpha *= clamp((clip.duration - tLocal) / clip.fadeOut, 0, 1)
    return alpha
  }

  private expectedSourcePos(clip: Clip, tLocal: number): number {
    // speed ramp: walk the mean-normalized integral of the multiplier curve.
    // Total consumed span stays duration × speed, so endpoints match uniform.
    if (clip.speedRamp && clip.speedRamp.length >= 2) {
      const u = clamp(tLocal / Math.max(0.001, clip.duration), 0, 1)
      const frac = rampSourceFraction(clip.speedRamp, u)
      const span = clip.duration * clip.speed
      if (clip.reverse) {
        const end = clip.trimStart + span
        return end - frac * span
      }
      return clip.trimStart + frac * span
    }
    if (clip.reverse) {
      // play backwards: source position runs from the clip's out-point down to its in-point
      const end = clip.trimStart + clip.duration * clip.speed
      return end - tLocal * clip.speed
    }
    return clip.trimStart + tLocal * clip.speed
  }

  /** Auto-ducking: music/voiceover tracks duck under active video-with-audio clips */
  private duckFactor(project: Project, clip: Clip, t: number): number {
    if (!clip.autoDuck || clip.kind !== 'audio') return 1
    for (const other of project.clips) {
      if (other.kind !== 'video' || other.muted || other.volume <= 0.02) continue
      if (t >= other.start && t < other.start + other.duration) {
        const otherTrack = project.tracks.find((tr) => tr.id === other.trackId)
        if (otherTrack && !otherTrack.muted) {
          // duck depth = how far the audio drops (0..0.95); default 0.68 → gain 0.32
          return 1 - clamp(clip.duckDepth ?? 0.68, 0, 0.95)
        }
      }
    }
    return 1
  }

  private syncVideo(
    clip: Clip,
    tLocal: number,
    entry: PoolEntry,
    audible: boolean,
    volumeScale = 1,
    fadeOpts?: { skipFadeOut?: boolean; skipFadeIn?: boolean }
  ) {
    const el = entry.el as HTMLVideoElement
    const expected = clamp(this.expectedSourcePos(clip, tLocal), 0, Math.max(0, (clip.sourceDuration || el.duration || 1) - 0.02))
    el.playbackRate = clamp(Math.abs(this.rate) * effectiveSpeedAt(clip, tLocal), 0.0625, 16)

    const vol = audible ? this.effectiveVolume(clip, tLocal, fadeOpts) * volumeScale : 0
    if (entry.gain) {
      el.volume = 1
      entry.gain.gain.value = vol
    } else {
      el.volume = vol
    }

    // reversed playback is seek-driven (browsers can't play media backwards):
    // pause the element and step currentTime; audio stays muted.
    // Never stack seeks — issuing a new seek while one is in flight starves
    // the decoder (readyState never recovers → black frames).
    // Reverse SHUTTLE (J) rides the same seek-driven path — clip.reverse or a
    // negative transport rate both make the source run backwards.
    if (clip.reverse || this.rate < 0) {
      if (!el.paused) el.pause()
      el.muted = true
      if (entry.gain) entry.gain.gain.value = 0
      if (!el.seeking && Math.abs(el.currentTime - expected) > 0.05) {
        try {
          el.currentTime = expected
          // a seek settles asynchronously — when it lands, draw the frame even
          // while paused (the rAF loop is stopped, so nothing else repaints)
          el.addEventListener(
            'seeked',
            () => {
              if (!this.playing) {
                try {
                  this.renderFrame()
                } catch {
                  /* ignore */
                }
              }
            },
            { once: true }
          )
        } catch {
          /* ignore */
        }
      }
      return
    }

    el.muted = vol <= 0.001 && !entry.gain

    if (this.playing) {
      if (el.paused) el.play().catch(() => undefined)
      if (Math.abs(el.currentTime - expected) > driftTolerancePlay) el.currentTime = expected
    } else {
      if (!el.paused) el.pause()
      if (Math.abs(el.currentTime - expected) > driftTolerancePause) {
        try {
          el.currentTime = expected
        } catch {
          /* ignore */
        }
      }
    }
  }

  private syncAudio(
    clip: Clip,
    tLocal: number,
    entry: PoolEntry,
    audible: boolean,
    volumeScale = 1,
    fadeOpts?: { skipFadeOut?: boolean; skipFadeIn?: boolean }
  ) {
    const el = entry.el as HTMLAudioElement
    const expected = clamp(this.expectedSourcePos(clip, tLocal), 0, Math.max(0, (clip.sourceDuration || el.duration || 1) - 0.02))
    el.playbackRate = clamp(Math.abs(this.rate) * effectiveSpeedAt(clip, tLocal), 0.0625, 16)

    const vol = audible ? this.effectiveVolume(clip, tLocal, fadeOpts) * volumeScale : 0
    if (entry.gain) {
      el.volume = 1
      entry.gain.gain.value = vol
    } else {
      el.volume = vol
    }
    el.muted = vol <= 0.001 && !entry.gain

    // reverse SHUTTLE (J): audio elements can't play backwards — park them
    // muted at the expected source position while the playhead walks left
    if (this.rate < 0) {
      if (!el.paused) el.pause()
      el.muted = true
      if (entry.gain) entry.gain.gain.value = 0
      if (!el.seeking && Math.abs(el.currentTime - expected) > 0.05) {
        try {
          el.currentTime = expected
        } catch {
          /* ignore */
        }
      }
      return
    }

    if (this.playing) {
      if (el.paused) el.play().catch(() => undefined)
      if (Math.abs(el.currentTime - expected) > driftTolerancePlay) el.currentTime = expected
    } else {
      if (!el.paused) el.pause()
      if (Math.abs(el.currentTime - expected) > driftTolerancePause) {
        try {
          el.currentTime = expected
        } catch {
          /* ignore */
        }
      }
    }
  }

  private effectiveVolume(
    clip: Clip,
    tLocal: number,
    fadeOpts?: { skipFadeOut?: boolean; skipFadeIn?: boolean }
  ): number {
    const master = this.masterMuted ? 0 : this.masterVolume
    const base = evaluateKeyframeProperty(clip, 'volume', tLocal) ?? clip.volume
    return clamp(base * master * this.fadeFactor(clip, tLocal, fadeOpts), 0, 1)
  }

  /* -------------------------------------------------- pixel fx (chroma / grade / LUT) */

  private hasGrade(clip: Clip): boolean {
    const g = clip.colorGrade
    if (!g) return false
    if (g.temperature !== 0 || g.tint !== 0 || g.shadows !== 0 || g.highlights !== 0 || g.vibrance !== 1) return true
    const c = g.curves
    if (!!c && [c.rgb, c.r, c.g, c.b].some((ch) => (ch?.length ?? 0) >= 2)) return true
    const wheelOn = (w?: { r: number; g: number; b: number }) => !!w && (w.r !== 0 || w.g !== 0 || w.b !== 0)
    return wheelOn(g.lift) || wheelOn(g.gamma) || wheelOn(g.gain)
  }

  private needsPixelFx(clip: Clip): boolean {
    // crop routes through the fx canvas too so vision fx receive cropped pixels
    return !!clip.chromaKey?.enabled || this.hasGrade(clip) || !!clip.lutId || !!clip.crop
  }

  private getLut(clip: Clip, mediaMap: Map<string, MediaAssetRuntime>): LutData | null {
    if (!clip.lutId) return null
    if (this.lutCache.has(clip.lutId)) return this.lutCache.get(clip.lutId) ?? null
    // Day 14 — built-in procedural LUTs resolve without media assets
    let lut: LutData | null = null
    if (clip.lutId.startsWith('builtin:')) {
      lut = getBuiltinLutData(clip.lutId)
    } else {
      const asset = mediaMap.get(clip.lutId)
      lut = asset?.lutData ?? null
    }
    this.lutCache.set(clip.lutId, lut)
    return lut
  }

  /**
   * Draw a media source with chroma-key / color-grade / LUT through the offscreen canvas.
   * Returns null when no FX are needed (caller draws the source directly).
   */
  private drawThroughFx(
    source: HTMLVideoElement | HTMLImageElement,
    srcW: number,
    srcH: number,
    dw: number,
    dh: number,
    clip: Clip,
    mediaMap: Map<string, MediaAssetRuntime>,
    src?: { sx: number; sy: number; sw: number; sh: number },
    force = false,
    adjLut?: LutData | null,
    adjLutIntensity = 1
  ): HTMLCanvasElement | null {
    if ((!this.needsPixelFx(clip) && !force) || srcW <= 0 || srcH <= 0) return null
    // cap fx resolution for performance; exports render at full quality so the
    // grade / LUT / chroma pass is never sub-resolution in the recorded file
    const maxDim = this.exportScaleOverride !== null ? 3840 : 1600
    const fxScale = Math.min(1, maxDim / Math.max(dw, dh))
    const fw = Math.max(2, Math.round(dw * fxScale))
    const fh = Math.max(2, Math.round(dh * fxScale))
    if (!this.fxCanvas) {
      this.fxCanvas = document.createElement('canvas')
      this.fxCtx = this.fxCanvas.getContext('2d', { willReadFrequently: true })
    }
    const c = this.fxCanvas!
    if (c.width !== fw || c.height !== fh) {
      c.width = fw
      c.height = fh
    }
    const fx = this.fxCtx!
    fx.clearRect(0, 0, fw, fh)
    if (src) fx.drawImage(source, src.sx, src.sy, src.sw, src.sh, 0, 0, fw, fh)
    else fx.drawImage(source, 0, 0, fw, fh)
    const img = fx.getImageData(0, 0, fw, fh)
    const changed = applyPixelEffects(img, {
      chroma: clip.chromaKey?.enabled ? clip.chromaKey : undefined,
      grade: this.hasGrade(clip) ? clip.colorGrade : undefined,
      lut: this.getLut(clip, mediaMap),
      lutIntensity: clip.lutIntensity ?? 1,
      lut2: adjLut ?? null,
      lut2Intensity: adjLutIntensity,
    })
    if (changed) fx.putImageData(img, 0, 0)
    return c
  }

  /* -------------------------------------------------- vision post-FX */

  /**
   * Vision post-FX (mega-effects): draw the clip content — already chroma/
   * grade/LUT processed when applicable — into the shared vision scratch with
   * the clip's own filters baked in, run the deterministic vision renderer
   * over it, then composite the processed scratch exactly where the plain
   * drawImage would have landed. The surrounding transform pipeline
   * (translate/rotate/scale/alpha/blend) is untouched — only the SOURCE of
   * the draw changes; the scratch composes the chroma result → vision input
   * without holding a second content canvas. Returns false when vision could
   * not run (the caller falls back to the plain draw).
   */
  private drawVisionProcessed(
    ctx: CanvasRenderingContext2D,
    source: CanvasImageSource,
    dw: number,
    dh: number,
    vis: ActiveVision,
    tLocal: number
  ): boolean {
    try {
      if (!(dw > 1) || !(dh > 1)) return false
      // scratch resolution: content footprint × adaptive scale, capped like the
      // fx path; export records at scale 1 ⇒ full project resolution
      const q = clamp(Math.min(this.activeScale(), 1920 / Math.max(dw, dh)), 0.5, 2)
      const sw = Math.max(2, Math.round(dw * q))
      const sh = Math.max(2, Math.round(dh * q))
      if (!this.visionCanvas) {
        this.visionCanvas = document.createElement('canvas')
        this.visionCtx = this.visionCanvas.getContext('2d')
      }
      const vc = this.visionCanvas!
      if (vc.width !== sw || vc.height !== sh) {
        vc.width = sw
        vc.height = sh
      }
      const vx = this.visionCtx
      if (!vx) return false
      vx.setTransform(q, 0, 0, q, 0, 0)
      vx.globalAlpha = 1
      vx.globalCompositeOperation = 'source-over'
      vx.filter = vis.filter // clip filters baked INTO the vision source (no double apply)
      vx.clearRect(0, 0, dw, dh)
      vx.drawImage(source, 0, 0, dw, dh)
      vx.filter = 'none'
      drawVisionFrame(vx, vc, dw, dh, vis.draw, vis.intensity, tLocal, vis.seed)
      let saved = false
      try {
        ctx.save()
        saved = true
        ctx.filter = 'none' // filters are already baked into the vision source
        ctx.drawImage(vc, -dw / 2, -dh / 2, dw, dh)
        ctx.restore()
        return true
      } catch {
        if (saved) ctx.restore()
        return false
      }
    } catch {
      return false
    }
  }

  /* -------------------------------------------------- render */

  /**
   * Visual pass: background + every visible track bottom-first, including the
   * adjustment-layer composition and transition bridges. Runs on the main
   * canvas normally, twice when the compare split is active (graded pass into
   * the offscreen, original pass with noColorFx on the main canvas).
   */
  private renderVisual(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, project: Project, mediaMap: Map<string, MediaAssetRuntime>, scale: number) {
    // background (drawing happens in logical canvas space; the base transform
    // maps it onto the scaled backing store)
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.globalAlpha = 1
    ctx.filter = 'none'
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = project.backgroundColor || '#000000'
    ctx.fillRect(0, 0, W, H)

    // draw bottom track first (tracks[0] is visually topmost)
    const tracks = project.tracks
    // ---- adjustment layers (Day 11): invisible FX carriers applied to every
    // visible clip on a track BELOW theirs while their time range is active
    const trackIndex = new Map<string, number>()
    tracks.forEach((tr, i) => trackIndex.set(tr.id, i))
    const activeAdjustments = this.noColorFx
      ? []
      : project.clips.filter((c) => c.kind === 'adjustment' && t >= c.start - 0.0001 && t < c.start + c.duration)
    for (let i = tracks.length - 1; i >= 0; i--) {
      const track = tracks[i]
      if (track.kind === 'audio' || track.hidden) continue
      const active = project.clips
        .filter((c) => c.trackId === track.id && t >= c.start - 0.0001 && t < c.start + c.duration)
        .sort((a, b) => a.start - b.start)
      for (const clip of active) {
        const adj = activeAdjustments.filter((a) => (trackIndex.get(a.trackId) ?? 99) < i)
        // ---- transition bridge (two phases, one continuous curve):
        // TAIL  — while the outgoing clip is still active with an armed
        //         successor, its own fadeOut is SKIPPED so it holds full
        //         brightness up to its very end (no dip-to-black before the cut);
        // EXT   — after its end it keeps rendering UNDER the incoming clip with
        //         alpha (1 − progress) while the incoming's fadeIn ramps up —
        //         a true crossfade. Wipe masks reveal over the same live bridge.
        const bridgedSuccessor = project.clips.find(
          (c) => c.trackId === track.id && c.start >= clip.start + clip.duration - 0.0001 && bridgeWindowFor(clip, c) != null,
        )
        const bridgeOut = project.clips.find(
          (c) => c.trackId === track.id && bridgeWindowFor(c, clip) != null && t >= c.start + c.duration - 0.0001,
        )
        if (bridgeOut) {
          const window = bridgeWindowFor(bridgeOut, clip)!
          const progress = clamp((t - clip.start) / window, 0, 1)
          // wipe bridges hold the outgoing at FULL alpha (the mask does the
          // reveal over untouched pixels); fade bridges ramp (1 − progress)
          if (progress < 1) this.drawClip(ctx, bridgeOut, t, W, H, mediaMap, project, { progress, hold: !!clip.wipe }, adj)
        }
        this.drawClip(ctx, clip, t, W, H, mediaMap, project, bridgedSuccessor ? { progress: 0 } : undefined, adj)
      }
    }
  }

  renderFrame() {
    const ctx = this.ctx
    const canvas = this.canvas
    const snap = this.snapshotFn?.()
    if (!ctx || !canvas || !snap) return
    const { project, mediaMap } = snap
    this.masterVolume = snap.masterVolume
    this.masterMuted = snap.masterMuted

    // canvas backing store: project size × adaptive render scale (1 while exporting)
    const scale = this.activeScale()
    const bw = Math.max(1, Math.round(project.canvasWidth * scale))
    const bh = Math.max(1, Math.round(project.canvasHeight * scale))
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw
      canvas.height = bh
    }
    const W = project.canvasWidth
    const H = project.canvasHeight
    const t = this.time

    const compare = this.compareSplit != null && this.exportScaleOverride === null
    if (compare) {
      // ---- Day 13 compare split: two passes. The GRADED frame renders into an
      // offscreen; the ORIGINAL (every color FX stripped) renders onto the main
      // canvas; the graded right side is composited over, cut at the split.
      if (!this.compareCanvas) this.compareCanvas = document.createElement('canvas')
      const cmp = this.compareCanvas
      if (cmp.width !== bw || cmp.height !== bh) {
        cmp.width = bw
        cmp.height = bh
      }
      const cctx = cmp.getContext('2d')!
      cctx.setTransform(scale, 0, 0, scale, 0, 0)
      this.renderVisual(cctx, W, H, t, project, mediaMap, scale)
      this.noColorFx = true
      this.renderVisual(ctx, W, H, t, project, mediaMap, scale)
      this.noColorFx = false
      const cut = Math.round(bw * clamp(this.compareSplit!, 0, 1))
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.filter = 'none'
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      if (cut < bw) ctx.drawImage(cmp, cut, 0, bw - cut, bh, cut, 0, bw - cut, bh)
      // divider line
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.fillRect(cut - 1, 0, 2, bh)
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.beginPath()
      ctx.arc(cut, bh / 2, 9, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.font = '600 10px ui-sans-serif, system-ui'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('⇔', cut, bh / 2)
      ctx.restore()
    } else {
      this.renderVisual(ctx, W, H, t, project, mediaMap, scale)
    }

    // audio-only clips: keep their elements in sync even though nothing is drawn
    const tracks = project.tracks
    const anySolo = project.tracks.some((tr) => tr.solo)
    for (const track of tracks) {
      if (track.kind !== 'audio') continue
      const trackVolume = track.volume ?? 1
      this.syncTrackEq(track)
      const clips = project.clips.filter((c) => c.trackId === track.id && t >= c.start - 0.0001 && t < c.start + c.duration)
      for (const clip of clips) {
        if (!clip.mediaId) continue
        const asset = mediaMap.get(clip.mediaId)
        if (!asset) continue
        const entry = this.audios.get(clip.id)
        const el = entry && entry.mediaId === clip.mediaId ? entry.el : this.getOrCreateAudio(clip, clip.mediaId, asset.objectUrl)
        if (el) {
          const routed = this.audios.get(clip.id)!
          this.ensureAudioChain(clip, routed)
          // solo — when any track is soloed, unsoloed tracks go silent
          const audible = !track.muted && (!anySolo || !!track.solo)
          const duck = this.duckFactor(project, clip, t)
          // ---- transition bridge (audio crossfade): the outgoing audio clip
          // holds full level through its own tail (own fadeOut skipped), then
          // keeps playing with a (1 − progress) ramp under the incoming
          const bridgedSuccessor = project.clips.find(
            (c) => c.kind === 'audio' && c.trackId === track.id && c.start >= clip.start + clip.duration - 0.0001 && bridgeWindowFor(clip, c) != null,
          )
          const bridgeOut = project.clips.find(
            (c) => c.kind === 'audio' && c.trackId === track.id && bridgeWindowFor(c, clip) != null && t >= c.start + c.duration - 0.0001,
          )
          if (bridgeOut) {
            const window = bridgeWindowFor(bridgeOut, clip)!
            const progress = clamp((t - clip.start) / window, 0, 1)
            const outMediaId = bridgeOut.mediaId
            const outAsset = outMediaId ? mediaMap.get(outMediaId) : null
            if (progress < 1 && outMediaId && outAsset) {
              const outEntry = this.audios.get(bridgeOut.id)
              const outEl = outEntry && outEntry.mediaId === outMediaId ? outEntry.el : this.getOrCreateAudio(bridgeOut, outMediaId, outAsset.objectUrl)
              if (outEl) {
                const outRouted = this.audios.get(bridgeOut.id)!
                this.ensureAudioChain(bridgeOut, outRouted)
                // skip the outgoing's own fadeOut — the bridge ramp replaces it
                this.syncAudio(bridgeOut, t - bridgeOut.start, { el: outEl, mediaId: outMediaId, gain: outRouted.gain }, audible, trackVolume * duck * (1 - progress), { skipFadeOut: true })
              }
            }
          }
          const bridged = !!bridgeOut && clamp((t - clip.start) / bridgeWindowFor(bridgeOut, clip)!, 0, 1) < 1
          // bridged incoming keeps its own fadeIn — it provides the up-ramp that
          // balances the outgoing's (1 − progress) down-ramp into a true crossfade
          this.syncAudio(clip, t - clip.start, { el, mediaId: clip.mediaId, gain: routed.gain }, audible, trackVolume * duck, bridged ? { skipFadeIn: false } : bridgedSuccessor ? { skipFadeOut: true } : undefined)
        }
      }
    }

    // timecode burn-in (export only — never drawn in the live preview)
    if (this.exportBurnIn === 'timecode') {
      const fs = Math.max(14, Math.round(H * 0.045))
      const label = formatTimecode(t, project.fps)
      ctx.save()
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
      ctx.font = `600 ${fs}px ui-monospace, SFMono-Regular, Menlo, monospace`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'bottom'
      const padX = fs * 0.5
      const padY = fs * 0.3
      const metrics = ctx.measureText(label)
      const bx = W - fs * 0.6
      const by = H - fs * 0.6
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.beginPath()
      const rw = metrics.width + padX * 2
      const rh = fs + padY * 2
      const rx = bx - rw
      const ry = by - rh
      const rr = Math.min(8, rh / 2)
      ctx.moveTo(rx + rr, ry)
      ctx.arcTo(bx, ry, bx, ry + rh, rr)
      ctx.arcTo(bx, by, rx, by, rr)
      ctx.arcTo(rx, by, rx, ry, rr)
      ctx.arcTo(rx, ry, bx, ry, rr)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.fillText(label, bx - padX, by - padY)
      ctx.restore()
    }

    this.cb?.onAfterRender?.()
  }

  /**
   * Source-rect + destination-size geometry for a media clip, honoring its
   * normalized crop rect and fit mode (cover / contain / stretch).
   */
  private mediaDrawGeometry(
    clip: Clip,
    vw: number,
    vh: number,
    W: number,
    H: number
  ): { sx: number; sy: number; sw: number; sh: number; dw: number; dh: number } {
    const c = clip.crop
    const sx = clamp(c?.x ?? 0, 0, 0.95) * vw
    const sy = clamp(c?.y ?? 0, 0, 0.95) * vh
    const sw = Math.max(2, clamp(c?.width ?? 1, 0.05, 1) * vw)
    const sh = Math.max(2, clamp(c?.height ?? 1, 0.05, 1) * vh)
    let dw: number
    let dh: number
    const fit = clip.fit ?? 'cover'
    if (fit === 'stretch') {
      dw = W
      dh = H
    } else {
      const base = fit === 'contain' ? Math.min(W / sw, H / sh) : Math.max(W / sw, H / sh)
      dw = sw * base
      dh = sh * base
    }
    return { sx, sy, sw, sh, dw, dh }
  }

  /** Snapshot of the composited canvas right now (freeze-frame source) */
  captureFrame(): { blob: Promise<Blob | null>; dataUrl: string } | null {
    if (!this.canvas) return null
    const dataUrl = this.canvas.toDataURL('image/jpeg', 0.72)
    const canvas = this.canvas
    const blob = new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    return { blob, dataUrl }
  }

  /**
   * Draw one clip at timeline time t.
   * `bridge` marks the OUTGOING side of a transition bridge: the clip has
   * already passed its end, so its own fadeOut is skipped (it would clamp to 0)
   * and alpha/gain ramp down with the bridge progress — producing a true
   * crossfade under the incoming clip. `hold` keeps full alpha instead (wipe
   * bridges: the animated mask reveals over untouched outgoing pixels).
   */
  private drawClip(ctx: CanvasRenderingContext2D, clip: Clip, t: number, W: number, H: number, mediaMap: Map<string, MediaAssetRuntime>, project: Project, bridge?: { progress: number; hold?: boolean }, adj: Clip[] = []) {
    // adjustment layers draw nothing — they only carry FX for the clips below
    if (clip.kind === 'adjustment') return
    const tLocal = t - clip.start

    // ---- adjustment-layer composition (Day 11): the effective filters / grade
    // are the clip's own PLUS every active adjustment above its track; LUTs
    // chain (clip's own first, then the topmost adjustment that carries one)
    // Day 13: noColorFx (compare-split original pass) strips ALL color FX —
    // no filters, no grade, no LUT, no chroma, no adjustments
    const noFx = this.noColorFx
    let effFilters = noFx ? DEFAULT_FILTERS : clip.filters
    let effGrade: ColorGrade | undefined = noFx ? undefined : clip.colorGrade
    let adjLut: LutData | null = null
    let adjLutIntensity = 1
    if (noFx) {
      adj = []
    } else if (adj.length) {
      let f = clip.filters
      let g: ColorGrade | undefined = clip.colorGrade
      for (const a of adj) {
        f = composeFilters(f, a.filters)
        g = g ? composeGrades(g, a.colorGrade ?? DEFAULT_COLOR_GRADE) : a.colorGrade
        if (!adjLut && a.lutId) {
          const asset = mediaMap.get(a.lutId)
          if (asset?.lutData) {
            adjLut = asset.lutData
            adjLutIntensity = a.lutIntensity ?? 1
          }
        }
      }
      effFilters = f
      effGrade = g
    }
    const effClip: Clip = adj.length ? { ...clip, filters: effFilters, colorGrade: effGrade } : clip
    const needsFx = !noFx && (adj.length > 0 || this.needsPixelFx(clip))

    // ---- keyframe-driven transform (falls back to static transform) ----
    const kfX = evaluateKeyframeProperty(clip, 'x', tLocal)
    const kfY = evaluateKeyframeProperty(clip, 'y', tLocal)
    const kfScale = evaluateKeyframeProperty(clip, 'scale', tLocal)
    const kfRot = evaluateKeyframeProperty(clip, 'rotation', tLocal)
    const kfOpacity = evaluateKeyframeProperty(clip, 'opacity', tLocal)
    const tx = kfX ?? clip.transform.x
    const ty = kfY ?? clip.transform.y
    const tscale = kfScale ?? clip.transform.scale
    const trot = kfRot ?? clip.transform.rotation
    // bridged outgoing: hold its fadeOut (end of clip → factor 0 otherwise)
    const fadeOpts = bridge ? { skipFadeOut: true } : undefined
    const bridgeAlpha = bridge ? (bridge.hold ? 1 : 1 - bridge.progress) : 1
    const alpha = (kfOpacity ?? clip.transform.opacity) * this.fadeFactor(clip, tLocal, fadeOpts) * bridgeAlpha
    if (alpha <= 0.002) return

    // ---- mega-effects overlay pre-pass (shake / zoomPulse alter the transform) ----
    let ovDraw: OverlayDraw | null = null
    let overlayIntensity = 0
    if (clip.overlay && clip.kind !== 'audio') {
      overlayIntensity = clamp(clip.overlay.intensity, 0, 1)
      if (overlayIntensity > 0.001) {
        try {
          ovDraw = getOverlayDraw(clip.overlay.effectId) ?? null
        } catch {
          ovDraw = null
        }
      }
    }
    let shakeX = 0
    let shakeY = 0
    let shakeRot = 0
    let overlayZoom = 1
    if (ovDraw && clip.overlay) {
      const ovSeed = clip.id + clip.overlay.effectId
      try {
        if (ovDraw.kind === 'shake') {
          const s = overlayShake(tLocal, ovDraw.amount * overlayIntensity, ovDraw.speed, ovDraw.variant, ovSeed)
          shakeX = s.dx
          shakeY = s.dy
          shakeRot = s.rot
        } else if (ovDraw.kind === 'zoomPulse') {
          overlayZoom = overlayZoomPulse(tLocal, ovDraw.amount * overlayIntensity, ovDraw.speed, ovDraw.variant)
        }
      } catch {
        ovDraw = null
      }
    }

    // ---- mega-effects vision pre-pass (per-clip pixel post-FX) ----
    // Vision applies to MEDIA clips' pixels only; text/sticker draw straight to
    // the main canvas and intentionally skip vision (documented limitation).
    let vis: ActiveVision | null = null
    if (clip.vision && (clip.kind === 'video' || clip.kind === 'image') && !adj.length && !this.noColorFx) {
      const vi = clamp(clip.vision.intensity, 0, 1)
      if (vi > 0.001) {
        try {
          const eff = getEffect(clip.vision.effectId)
          if (eff && eff.category === 'vision') {
            vis = { draw: eff.draw, intensity: vi, seed: getVisionSeed(clip.vision.effectId), filter: buildFilterString(clip.filters) }
          }
        } catch {
          vis = null
        }
      }
    }

    // audio sync for video clips happens here; visual draw below
    const snap = this.snapshotFn!
    if (clip.kind === 'video' && clip.mediaId) {
      const asset = mediaMap.get(clip.mediaId)
      if (asset) {
        const track = project.tracks.find((tr) => tr.id === clip.trackId)
        const entry = this.videos.get(clip.id)
        const el = entry && entry.mediaId === clip.mediaId ? (entry.el as HTMLVideoElement) : this.getOrCreateVideo(clip, clip.mediaId, asset.objectUrl)
        if (el) {
          const routed = this.videos.get(clip.id)!
          this.ensureAudioChain(clip, routed)
          if (track) this.syncTrackEq(track)
          // solo — when any track is soloed, unsoloed tracks go silent
          const anySolo = project.tracks.some((tr) => tr.solo)
          const audible = !!track && !track.muted && (!anySolo || !!track.solo)
          this.syncVideo(clip, tLocal, { el, mediaId: clip.mediaId, gain: routed.gain }, audible, (track?.volume ?? 1) * (bridge ? 1 - bridge.progress : 1), fadeOpts)
        }
      }
    }

    ctx.save()
    ctx.globalAlpha = clamp(alpha, 0, 1)
    ctx.filter = buildFilterString(effFilters)
    if (clip.blendMode && clip.blendMode !== 'source-over') {
      ctx.globalCompositeOperation = clip.blendMode
    }

    // ---- shape-wipe mask (wipe transitions): clip the drawing to an animated
    // mask in CANVAS space (before the clip's own transform). Progress comes
    // from 'iris' keyframes: 0 = hidden, 1 = fully revealed.
    const iris = clip.wipe ? evaluateKeyframeProperty(clip, 'iris', tLocal) : null
    if (clip.wipe && iris != null && iris < 0.999) {
      if (iris <= 0.001) {
        ctx.restore()
        ctx.filter = 'none'
        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = 'source-over'
        return
      }
      this.applyWipeMask(ctx, clip.wipe, clamp(iris, 0, 1), W, H)
    }

    // ---- Day 16 shape mask: rect/ellipse hole in CANVAS space (before the
    // clip's own transform). Position keyframes (maskX/maskY) animate the
    // offset from center; maskScale multiplies the base w/h size.
    const mask = clip.mask
    if (mask && (clip.kind === 'video' || clip.kind === 'image' || clip.kind === 'text' || clip.kind === 'sticker')) {
      const mx = evaluateKeyframeProperty(clip, 'maskX', tLocal) ?? mask.x
      const my = evaluateKeyframeProperty(clip, 'maskY', tLocal) ?? mask.y
      const ms = evaluateKeyframeProperty(clip, 'maskScale', tLocal) ?? 1
      const mcx = W / 2 + mx * W
      const mcy = H / 2 + my * H
      const mrw = Math.max(0.5, (mask.w * W * ms) / 2)
      const mrh = Math.max(0.5, (mask.h * H * ms) / 2)
      ctx.beginPath()
      if (mask.invert) ctx.rect(-W, -H, W * 3, H * 3)
      if (mask.shape === 'ellipse') {
        ctx.ellipse(mcx, mcy, mrw, mrh, 0, 0, Math.PI * 2)
      } else {
        ctx.rect(mcx - mrw, mcy - mrh, mrw * 2, mrh * 2)
      }
      ctx.clip(mask.invert ? 'evenodd' : 'nonzero')
    }

    // motion (Ken Burns family) — all presets are deterministic functions of
    // tLocal so preview and export render identical frames
    const q = clip.duration > 0 ? clamp(tLocal / clip.duration, 0, 1) : 0
    const mi = clip.motionIntensity
    let motionScale = 1
    let motionX = 0
    let motionY = 0
    let motionRot = 0
    if (clip.motion !== 'none') {
      const e = easeInOut(q)
      switch (clip.motion) {
        case 'zoomIn':
          motionScale = 1 + mi * e
          break
        case 'zoomOut':
          motionScale = 1 + mi * (1 - e)
          break
        case 'panLeft':
          motionScale = 1 + mi * 0.2
          motionX = mi * W * 0.1 * (0.5 - e) * 2
          break
        case 'panRight':
          motionScale = 1 + mi * 0.2
          motionX = -mi * W * 0.1 * (0.5 - e) * 2
          break
        case 'panUp':
          motionScale = 1 + mi * 0.2
          motionY = mi * H * 0.1 * (0.5 - e) * 2
          break
        case 'panDown':
          motionScale = 1 + mi * 0.2
          motionY = -mi * H * 0.1 * (0.5 - e) * 2
          break
        case 'rotate':
          // slow continuous spin across the clip — up to 180° at full intensity
          motionRot = mi * 180 * q
          break
        case 'pulse':
          // breathing scale — gentle sine, ~±8% at full intensity
          motionScale = 1 + Math.sin(tLocal * 3) * 0.08 * mi
          break
        case 'zoomRotate':
          // zoomIn paired with a eased 30° roll
          motionScale = 1 + mi * e
          motionRot = mi * 30 * e
          break
        case 'kenBurns':
          // classic documentary drift: eased zoom-in plus a diagonal glide
          motionScale = 1 + mi * 0.6 * e
          motionX = mi * W * 0.06 * (0.5 - e) * 2
          motionY = mi * H * 0.04 * (0.5 - e) * 2
          break
      }
    }

    ctx.translate(W / 2 + tx * W + motionX + shakeX * W, H / 2 + ty * H + motionY + shakeY * H)
    ctx.rotate(((trot + shakeRot + motionRot) * Math.PI) / 180)

    // media mirroring (flip) — applied to video/image only; text mirrored would be unreadable
    if (clip.kind === 'video' || clip.kind === 'image') {
      const fx = clip.transform.flipX ? -1 : 1
      const fy = clip.transform.flipY ? -1 : 1
      if (fx !== 1 || fy !== 1) ctx.scale(fx, fy)
    }

    // zoomPulse scales text/sticker around their center; media kinds fold it
    // into their draw scale below (avoid double application)
    if (overlayZoom !== 1 && (clip.kind === 'text' || clip.kind === 'sticker')) {
      ctx.scale(overlayZoom, overlayZoom)
    }

    if (clip.kind === 'text' && clip.textStyle) {
      this.drawText(ctx, clip, tLocal, q, W, H, tx, ty)
    } else if (clip.kind === 'sticker' && clip.sticker) {
      this.drawSticker(ctx, clip, tLocal, q, W, H, tx, ty)
    } else if (clip.kind === 'image' && clip.mediaId) {
      const asset = mediaMap.get(clip.mediaId)
      const img = asset ? this.getImage(asset.id, asset.objectUrl) : null
      if (img && img.naturalWidth > 0) {
        const s = tscale * motionScale * overlayZoom
        ctx.scale(s, s)
        const g = this.mediaDrawGeometry(clip, img.naturalWidth, img.naturalHeight, W, H)
        const fxc = this.drawThroughFx(img, img.naturalWidth, img.naturalHeight, g.dw, g.dh, effClip, mediaMap, g, needsFx, adjLut, adjLutIntensity)
        if (vis && this.drawVisionProcessed(ctx, fxc ?? img, g.dw, g.dh, vis, tLocal)) {
          // vision post-FX replaced the plain draw (clip filters are baked into
          // the vision source; ctx.filter was reset for the composite)
        } else if (fxc) ctx.drawImage(fxc, 0, 0, fxc.width, fxc.height, -g.dw / 2, -g.dh / 2, g.dw, g.dh)
        else ctx.drawImage(img, g.sx, g.sy, g.sw, g.sh, -g.dw / 2, -g.dh / 2, g.dw, g.dh)
        this.bounds.set(clip.id, this.boundsFromTransform(clip, W, H, g.dw * s, g.dh * s, tx, ty, trot))
      } else {
        this.bounds.delete(clip.id)
      }
    } else if (clip.kind === 'video' && clip.mediaId) {
      const el = this.videos.get(clip.id)?.el as HTMLVideoElement | undefined
      if (el && el.readyState >= 2 && el.videoWidth > 0) {
        const s = tscale * motionScale * overlayZoom
        ctx.scale(s, s)
        const g = this.mediaDrawGeometry(clip, el.videoWidth, el.videoHeight, W, H)
        const fxc = this.drawThroughFx(el, el.videoWidth, el.videoHeight, g.dw, g.dh, effClip, mediaMap, g, needsFx, adjLut, adjLutIntensity)
        if (vis && this.drawVisionProcessed(ctx, fxc ?? el, g.dw, g.dh, vis, tLocal)) {
          // vision post-FX replaced the plain draw (clip filters are baked into
          // the vision source; ctx.filter was reset for the composite)
        } else if (fxc) ctx.drawImage(fxc, 0, 0, fxc.width, fxc.height, -g.dw / 2, -g.dh / 2, g.dw, g.dh)
        else ctx.drawImage(el, g.sx, g.sy, g.sw, g.sh, -g.dw / 2, -g.dh / 2, g.dw, g.dh)
        this.bounds.set(clip.id, this.boundsFromTransform(clip, W, H, g.dw * s, g.dh * s, tx, ty, trot))
      } else {
        this.bounds.delete(clip.id)
      }
    }

    ctx.restore()
    ctx.filter = 'none'
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'

    // ---- full-frame overlay pass (particles/grain/vignette/scanlines/leak/flash) ----
    // Drawn in canvas space after the clip content so overlays like grain and
    // vignette cover the whole frame; transform kinds were applied pre-draw.
    if (ovDraw && clip.overlay && ovDraw.kind !== 'shake' && ovDraw.kind !== 'zoomPulse') {
      try {
        drawOverlayFrame(ctx, W, H, tLocal, overlayIntensity, ovDraw, clip.id + clip.overlay.effectId)
      } catch {
        /* overlays must never break playback */
      }
    }
  }

  private boundsFromTransform(clip: Clip, W: number, H: number, w: number, h: number, tx?: number, ty?: number, trot?: number): ClipBounds {
    const x = tx ?? clip.transform.x
    const y = ty ?? clip.transform.y
    const rot = trot ?? clip.transform.rotation
    return {
      x: W / 2 + x * W,
      y: H / 2 + y * H,
      w,
      h,
      rotation: rot,
    }
  }

  /**
   * Shape-wipe mask for wipe transitions — clips subsequent drawing to an
   * animated reveal shape. `p` is the keyframed progress (0 hidden → 1 full
   * frame). Applied in canvas space so it masks the whole clip draw
   * (media, text and stickers alike) regardless of its own transform.
   */
  private applyWipeMask(ctx: CanvasRenderingContext2D, shape: WipeShape, p: number, W: number, H: number) {
    const cx = W / 2
    const cy = H / 2
    const R = Math.hypot(cx, cy) // half-diagonal — guarantees full cover at p = 1
    ctx.beginPath()
    switch (shape) {
      case 'circle': {
        ctx.arc(cx, cy, p * R, 0, Math.PI * 2)
        break
      }
      case 'box': {
        const w = p * W
        const h = p * H
        ctx.rect(cx - w / 2, cy - h / 2, w, h)
        break
      }
      case 'diamond': {
        const r = p * R
        ctx.moveTo(cx, cy - r)
        ctx.lineTo(cx + r, cy)
        ctx.lineTo(cx, cy + r)
        ctx.lineTo(cx - r, cy)
        ctx.closePath()
        break
      }
      case 'cross': {
        // plus-shaped iris: two full-length bars (full height / full width)
        // whose thickness grows — a clean plus early, full cover at p = 1
        ctx.rect(cx - (p * W) / 2, 0, p * W, H) // vertical bar
        ctx.rect(0, cy - (p * H) / 2, W, p * H) // horizontal bar
        break
      }
      case 'clock': {
        // pie sweep from 12 o'clock, clockwise
        ctx.moveTo(cx, cy)
        ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p)
        ctx.closePath()
        break
      }
      case 'barnDoors': {
        // two vertical panels growing inward from the left and right edges
        const w = (p * W) / 2
        ctx.rect(0, 0, w, H)
        ctx.rect(W - w, 0, w, H)
        break
      }
      case 'splitH': {
        // parting reveal: a horizontal gap opens at center and grows outward
        // (like the outgoing frame splitting top/bottom) — edges reveal last
        const h = p * H
        ctx.rect(0, cy - h / 2, W, h)
        break
      }
      case 'splitV': {
        // parting reveal: a vertical gap opens at center and grows outward
        const w = p * W
        ctx.rect(cx - w / 2, 0, w, H)
        break
      }
    }
    ctx.clip()
  }

  /* -------------------------------------------------- text drawing */

  private wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const lines: string[] = []
    for (const raw of text.split('\n')) {
      if (raw === '') {
        lines.push('')
        continue
      }
      const words = raw.split(' ')
      let line = ''
      for (const word of words) {
        const test = line ? `${line} ${word}` : word
        if (ctx.measureText(test).width > maxWidth && line) {
          lines.push(line)
          line = word
        } else {
          line = test
        }
      }
      lines.push(line)
    }
    return lines
  }

  private drawText(ctx: CanvasRenderingContext2D, clip: Clip, tLocal: number, q: number, W: number, H: number, tx?: number, ty?: number) {
    const style = clip.textStyle!
    const maxWidth = W * 0.9

    ctx.font = `${style.italic ? 'italic ' : ''}${style.bold ? 700 : 400} ${style.fontSize}px "${style.fontFamily}", sans-serif`
    const ctxAny = ctx as unknown as { letterSpacing: string }
    const supportsLetterSpacing = 'letterSpacing' in ctx
    if (supportsLetterSpacing) ctxAny.letterSpacing = `${style.letterSpacing}px`

    let content = style.content || ' '
    // uppercase display without touching the source content
    if (style.textTransform === 'uppercase') content = content.toUpperCase()
    // text entry animations — the legacy six keep their exact original math
    let animAlpha = 1
    let animX = 0
    let animY = 0
    let animScale = 1
    let animScaleX = 1
    let animRot = 0
    let animBlur = 0
    let animTracking: number | null = null
    let neonGlow: number | null = null
    let glitch: GlitchState | null = null
    const ad = Math.max(0.01, style.animationDuration)
    const seedNum = hashString(clip.id)
    if (style.animation !== 'none') {
      const p = clamp(tLocal / ad, 0, 1)
      switch (style.animation) {
        // ---- legacy (do not alter math) ----
        case 'fadeIn':
          animAlpha = p
          break
        case 'slideUp':
          animAlpha = p
          animY = (1 - easeInOut(p)) * 70
          break
        case 'pop':
          animAlpha = Math.min(1, p * 2)
          animScale = p >= 1 ? 1 : Math.max(0.001, easeOutBack(p))
          break
        case 'typewriter': {
          const chars = Math.ceil(easeInOut(p) * content.length)
          content = content.slice(0, chars)
          break
        }
        case 'wipe':
          // handled below via clipping
          break
        // ---- v3 entrance families (rest state after d seconds) ----
        case 'slideLeft':
          // enters from the right edge, sliding left into place
          animAlpha = p
          animX = (1 - easeOutCubic(p)) * W * 0.6
          break
        case 'slideRight':
          animAlpha = p
          animX = -(1 - easeOutCubic(p)) * W * 0.6
          break
        case 'slideDown':
          animAlpha = p
          animY = -(1 - easeOutCubic(p)) * H * 0.35
          break
        case 'bounceIn':
          animAlpha = Math.min(1, p * 2.5)
          animScale = p >= 1 ? 1 : Math.max(0.001, 0.6 + 0.4 * easeOutBack(p))
          break
        case 'elastic':
          animAlpha = Math.min(1, p * 2.5)
          animScale = p >= 1 ? 1 : Math.max(0.001, 0.5 + 0.5 * elasticOut(p))
          animRot = -8 * (1 - easeOutCubic(p))
          break
        case 'zoomBlur':
          animScale = 1.8 - 0.8 * easeOutCubic(p)
          animAlpha = Math.min(1, p * 1.6)
          if (p < 1) animBlur = 8 * (1 - p)
          break
        case 'flipX': {
          animAlpha = Math.min(1, p * 1.5)
          const sx = -0.2 + 1.2 * easeOutCubic(p)
          animScaleX = Math.abs(sx) < 0.02 ? (sx < 0 ? -0.02 : 0.02) : sx
          break
        }
        case 'rotateIn': {
          const e = easeOutCubic(p)
          animRot = -12 * (1 - e)
          animScale = 0.85 + 0.15 * e
          animAlpha = p
          break
        }
        case 'trackingIn':
          animTracking = style.fontSize * 0.5 + (style.letterSpacing - style.fontSize * 0.5) * easeOutCubic(p)
          animAlpha = p
          break
        case 'blurIn':
          animAlpha = p
          if (p < 1) animBlur = 6 * (1 - p)
          break
        case 'swing':
          animRot = Math.sin(p * Math.PI * 2.5) * (1 - easeOutCubic(p)) * 10
          animAlpha = Math.min(1, p * 2)
          break
        // ---- v3 loop families (run while the clip plays) ----
        case 'waveLoop':
          animY = Math.sin(tLocal * 3) * style.fontSize * 0.06
          animRot = Math.sin(tLocal * 3 + 1.1) * 1.3
          break
        case 'shakeLoop': {
          const f = Math.floor(tLocal * 30)
          animX = (hash01(hashInt(seedNum, f)) - 0.5) * 2 * style.fontSize * 0.03
          animY = (hash01(hashInt(seedNum, f + 7919)) - 0.5) * 2 * style.fontSize * 0.03
          break
        }
        case 'neonFlicker': {
          const flick = neonFlickerCurve(tLocal, seedNum)
          animAlpha *= flick
          neonGlow = style.fontSize * (0.2 + 0.5 * flick)
          break
        }
        case 'glitchLoop':
          glitch = glitchWindows(tLocal, seedNum)
          break
      }
    }
    // animated tracking must be applied before measuring so wrap/bounds agree
    if (animTracking !== null && supportsLetterSpacing) ctxAny.letterSpacing = `${animTracking}px`

    const lines = this.wrapLines(ctx, content, maxWidth)
    const lineH = style.fontSize * style.lineHeight
    const totalH = lines.length * lineH

    // measure widest line
    let maxW = 0
    for (const line of lines) maxW = Math.max(maxW, ctx.measureText(line).width)
    maxW = Math.max(maxW, style.fontSize * 0.5)

    // roll / crawl — full-clip title scrolls sized off the wrapped text block
    if (style.animation === 'roll' || style.animation === 'crawl') {
      const span = style.animation === 'roll' ? totalH + H : maxW + W
      const pr = clamp(tLocal / Math.max(0.2, clip.duration), 0, 1)
      if (style.animation === 'roll') animY = (span / 2) * (1 - 2 * pr)
      else animX = (span / 2) * (1 - 2 * pr)
    }

    ctx.globalAlpha *= animAlpha
    if (animRot) ctx.rotate((animRot * Math.PI) / 180)
    if (animX || animY) ctx.translate(animX, animY)
    if (animScale !== 1 || animScaleX !== 1) ctx.scale(animScale * animScaleX, animScale)
    // fake motion blur for zoomBlur/blurIn (skipped on low tier — filter is costly)
    if (animBlur > 0.15 && this.renderQuality !== 'low') {
      try {
        const base = ctx.filter
        ctx.filter = base === 'none' ? `blur(${animBlur.toFixed(2)}px)` : `${base} blur(${animBlur.toFixed(2)}px)`
      } catch {
        /* filter unsupported — skip the fake blur */
      }
    }

    // wipe clip
    if (style.animation === 'wipe' && tLocal < ad) {
      const p = easeInOut(clamp(tLocal / ad, 0, 1))
      ctx.beginPath()
      ctx.rect(-maxW / 2 - 4, -totalH / 2 - 4, (maxW + 8) * p, totalH + 8)
      ctx.clip()
    }

    // background
    if (style.background) {
      const pad = style.backgroundPadding
      ctx.fillStyle = style.background
      const bx = style.align === 'left' ? -pad : style.align === 'right' ? -maxW - pad : -maxW / 2 - pad
      const bw = maxW + pad * 2
      const by = -totalH / 2 - pad
      const bh = totalH + pad * 2
      const r = Math.min(16, bh / 2)
      ctx.beginPath()
      ctx.roundRect(bx, by, bw, bh, r)
      ctx.fill()
    }

    if (style.shadow) {
      ctx.shadowColor = style.shadowColor
      ctx.shadowBlur = style.shadowBlur
      // distance/angle shadow placement (legacy default: 2px straight down)
      const dist = style.shadowDistance ?? 2
      const ang = ((style.shadowAngle ?? 90) * Math.PI) / 180
      ctx.shadowOffsetX = Math.round(Math.cos(ang) * dist * 100) / 100
      ctx.shadowOffsetY = Math.round(Math.sin(ang) * dist * 100) / 100
    }
    if (neonGlow !== null) {
      // neon glow: color-matched shadow pulsing with the deterministic flicker
      ctx.shadowColor = style.color
      ctx.shadowBlur = neonGlow
      ctx.shadowOffsetY = 0
    }

    ctx.textBaseline = 'middle'
    ctx.textAlign = style.align
    const anchorX = style.align === 'left' ? 0 : style.align === 'right' ? -maxW : 0
    // when textAlign=left we anchor at -maxW/2 so the block stays centered
    const drawX = style.align === 'left' ? -maxW / 2 : style.align === 'right' ? maxW / 2 : 0

    const paintLines = (offsetX: number, fillOverride?: string) => {
      for (let i = 0; i < lines.length; i++) {
        const y = -totalH / 2 + lineH * (i + 0.5)
        const line = lines[i]
        if (!line) continue
        const x = (supportsLetterSpacing ? drawX + anchorX : drawX) + offsetX
        if (!fillOverride && style.strokeWidth > 0) {
          ctx.lineJoin = 'round'
          ctx.lineWidth = style.strokeWidth
          ctx.strokeStyle = style.strokeColor
          ctx.strokeText(line, x, y)
        }
        ctx.fillStyle = fillOverride ?? style.color
        ctx.fillText(line, x, y)
      }
    }
    paintLines(0)

    // underline / strikethrough — drawn per line, mirroring paintLines anchors
    if (style.underline || style.strike) {
      const lw = Math.max(1, style.fontSize * 0.055)
      ctx.save()
      ctx.shadowBlur = 0
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 0
      ctx.fillStyle = style.color
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (!line) continue
        const y = -totalH / 2 + lineH * (i + 0.5)
        const w = ctx.measureText(line).width
        const x0 = supportsLetterSpacing
          ? style.align === 'center'
            ? -w / 2
            : -maxW / 2
          : style.align === 'left'
            ? -maxW / 2
            : style.align === 'right'
              ? maxW / 2 - w
              : -w / 2
        if (style.underline) ctx.fillRect(x0, y + style.fontSize * 0.42, w, lw)
        if (style.strike) ctx.fillRect(x0, y - lw / 2, w, lw)
      }
      ctx.restore()
    }

    // glitchLoop: during a deterministic window, redraw thin horizontal slices
    // with an rgb split (two colored passes offset ±dx)
    if (glitch && glitch.active) {
      for (const s of glitch.slices) {
        const sliceY = -totalH / 2 + s.y * totalH * 0.92
        const sliceH = Math.max(3, style.fontSize * s.h)
        ctx.save()
        ctx.beginPath()
        ctx.rect(-maxW / 2 - style.fontSize * 0.5, sliceY, maxW + style.fontSize, sliceH)
        ctx.clip()
        ctx.shadowBlur = 0
        paintLines(s.dx, 'rgba(255,72,72,0.55)')
        paintLines(-s.dx, 'rgba(72,255,255,0.55)')
        ctx.restore()
      }
    }
    if (supportsLetterSpacing) ctxAny.letterSpacing = '0px'

    this.bounds.set(
      clip.id,
      this.boundsFromTransform(clip, W, H, maxW * animScale * Math.abs(animScaleX), totalH * animScale, tx, ty)
    )
  }

  /* -------------------------------------------------- sticker drawing */

  private drawSticker(ctx: CanvasRenderingContext2D, clip: Clip, tLocal: number, _q: number, W: number, H: number, tx?: number, ty?: number) {
    const style = clip.sticker!

    let animScale = 1
    let animY = 0
    let animRot = 0
    const ad = 0.45
    switch (style.animation) {
      case 'pop': {
        const p = clamp(tLocal / ad, 0, 1)
        animScale = p >= 1 ? 1 : Math.max(0.001, easeOutBack(p))
        break
      }
      case 'float':
        animY = Math.sin(tLocal * 2.2) * 12
        break
      case 'spin':
        animRot = tLocal * 1.2
        break
      case 'pulse':
        animScale = 1 + Math.sin(tLocal * 4) * 0.08
        break
      case 'none':
      default:
        break
    }

    ctx.scale(animScale, animScale)
    if (animRot) ctx.rotate(animRot)
    if (animY) ctx.translate(0, animY)
    drawStickerArt(ctx, style, tLocal)

    const approx = style.size * 1.1
    const bx = tx ?? clip.transform.x
    const by = ty ?? clip.transform.y
    this.bounds.set(clip.id, {
      x: W / 2 + bx * W,
      y: H / 2 + by * H + animY,
      w: approx * animScale,
      h: approx * animScale,
      rotation: clip.transform.rotation,
    })
  }
}

/* -------------------------------------------------- singleton */

let engineInstance: PreviewEngine | null = null

export function getEngine(): PreviewEngine {
  // window-scoped singleton — survives Fast Refresh module re-evals so the
  // bridge, panels and debug handles always share the SAME engine instance
  if (typeof window !== 'undefined') {
    const w = window as unknown as { __ncEngineInstance?: PreviewEngine }
    if (!w.__ncEngineInstance) {
      const inst = new PreviewEngine()
      inst.initAdaptiveQuality()
      w.__ncEngineInstance = inst
    }
    engineInstance = w.__ncEngineInstance
    return engineInstance
  }
  if (!engineInstance) {
    engineInstance = new PreviewEngine()
    engineInstance.initAdaptiveQuality()
  }
  return engineInstance
}

/* -------------------------------------------------- adaptive render quality */

function detectDeviceTier(): { quality: RenderQuality; scale: number } {
  if (typeof navigator === 'undefined') return { quality: 'medium', scale: 1 }
  const nav = navigator as Navigator & { deviceMemory?: number }
  const cores = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : 4
  const mem = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : 8
  const dpr = typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1
  // worst signal wins: cores (<4 low, 4-7 medium, 8+ high) + memory (<4 low, <8 medium)
  let quality: RenderQuality = 'high'
  if (cores < 4 || mem < 4) quality = 'low'
  else if (cores <= 7 || mem < 8) quality = 'medium'
  const cap = quality === 'low' ? 1 : quality === 'medium' ? 1.5 : 2
  return { quality, scale: Math.min(dpr, cap) }
}

/**
 * Override the adaptive preview render scale (clamped 0.5..2) and re-size the
 * canvas on the next frame. Export always records at full project resolution
 * regardless of this setting.
 */
export function setRenderScale(scale: number): void {
  getEngine().setRenderScale(scale)
}

/** Current detected/selected preview quality tier */
export function getRenderQuality(): RenderQuality {
  return getEngine().getRenderQuality()
}

/** UI helper: estimated on-canvas rect for a clip (fallback when engine has no bounds yet) */
export function estimateClipRect(clip: Clip, project: Project, mediaMap: Map<string, MediaAssetRuntime>): ClipBounds {
  const W = project.canvasWidth
  const H = project.canvasHeight
  if (clip.kind === 'text' && clip.textStyle) {
    const lines = clip.textStyle.content.split('\n')
    const w = Math.min(W * 0.9, Math.max(...lines.map((l) => l.length)) * clip.textStyle.fontSize * 0.55)
    const h = lines.length * clip.textStyle.fontSize * clip.textStyle.lineHeight
    return { x: W / 2 + clip.transform.x * W, y: H / 2 + clip.transform.y * H, w, h, rotation: clip.transform.rotation }
  }
  if (clip.kind === 'sticker' && clip.sticker) {
    const s = clip.sticker.size * 1.1
    return { x: W / 2 + clip.transform.x * W, y: H / 2 + clip.transform.y * H, w: s, h: s, rotation: clip.transform.rotation }
  }
  const asset = clip.mediaId ? mediaMap.get(clip.mediaId) : undefined
  const sw = asset?.width || W
  const sh = asset?.height || H
  const base = Math.max(W / sw, H / sh)
  const w = sw * base * clip.transform.scale
  const h = sh * base * clip.transform.scale
  return { x: W / 2 + clip.transform.x * W, y: H / 2 + clip.transform.y * H, w, h, rotation: clip.transform.rotation }
}

export { MIN_CLIP_DURATION }
