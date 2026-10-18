'use client'

/**
 * NovaCut Studio — canvas preview engine.
 * Renders the project timeline onto a <canvas> and drives synced media playback.
 * Pure module: no direct store import — state arrives via a snapshot fn (see bridge hook).
 */
import type { Clip, LutData, MediaAssetRuntime, Project } from './types'
import { applyPixelEffects, buildFilterString, clamp, easeInOut, easeOutBack, evaluateKeyframeProperty, projectDuration } from './utils'
import { CANVAS_FONT_LOAD_LIST, MIN_CLIP_DURATION } from './constants'

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
}

/** Screen-space bounds of a drawn clip (canvas coords) for selection overlay */
export interface ClipBounds {
  x: number
  y: number
  w: number
  h: number
  rotation: number
}

const driftTolerancePlay = 0.16
const driftTolerancePause = 0.03

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
  private masterVolume = 1
  private masterMuted = false
  private fontsLoaded = false

  private audioCtx: AudioContext | null = null
  private exportDest: MediaStreamAudioDestinationNode | null = null
  private masterAnalyser: AnalyserNode | null = null
  private analyserData: Uint8Array | null = null
  private renderPending = false

  /** offscreen canvas used for chroma-key / grade / LUT pixel passes */
  private fxCanvas: HTMLCanvasElement | null = null
  private fxCtx: CanvasRenderingContext2D | null = null
  private lutCache = new Map<string, LutData | null>()

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

  play() {
    if (this.playing || !this.snapshotFn) return
    const dur = this.duration
    if (this.time >= dur - 0.02) this.time = 0
    this.playing = true
    this.lastFrame = performance.now()
    const tick = (now: number) => {
      if (!this.playing) return
      const dt = Math.min(0.25, (now - this.lastFrame) / 1000)
      this.lastFrame = now
      this.time += dt
      const d = this.duration
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

  pause() {
    this.playing = false
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    for (const { el } of this.videos.values()) el.pause()
    for (const { el } of this.audios.values()) el.pause()
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
  beginExport(fps: number): MediaStream | null {
    if (!this.canvas) return null
    try {
      if (!this.audioCtx) this.audioCtx = new AudioContext()
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume().catch(() => undefined)
      if (!this.exportDest) this.exportDest = this.audioCtx.createMediaStreamDestination()
      // route existing + future elements
      const route = (entry: PoolEntry) => {
        if (entry.gain || !this.audioCtx) return
        try {
          const src = this.audioCtx.createMediaElementSource(entry.el)
          const gain = this.audioCtx.createGain()
          src.connect(gain)
          if (this.masterAnalyser) gain.connect(this.masterAnalyser)
          else gain.connect(this.audioCtx.destination)
          if (this.exportDest) gain.connect(this.exportDest)
          entry.gain = gain
          entry.el.volume = 1 // avoid double attenuation; gains take over
        } catch {
          /* element already routed */
        }
      }
      for (const entry of this.videos.values()) route(entry)
      for (const entry of this.audios.values()) route(entry)
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
      try {
        const src = this.audioCtx.createMediaElementSource(el)
        const gain = this.audioCtx.createGain()
        src.connect(gain)
        if (this.masterAnalyser) gain.connect(this.masterAnalyser)
        else gain.connect(this.audioCtx.destination)
        if (this.exportDest) gain.connect(this.exportDest)
        entry.gain = gain
        el.volume = 1
      } catch {
        /* ignore */
      }
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
      try {
        const src = this.audioCtx.createMediaElementSource(el)
        const gain = this.audioCtx.createGain()
        src.connect(gain)
        if (this.masterAnalyser) gain.connect(this.masterAnalyser)
        else gain.connect(this.audioCtx.destination)
        if (this.exportDest) gain.connect(this.exportDest)
        entry.gain = gain
        el.volume = 1
      } catch {
        /* ignore */
      }
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

  private fadeFactor(clip: Clip, tLocal: number): number {
    let alpha = 1
    if (clip.fadeIn > 0.01) alpha *= clamp(tLocal / clip.fadeIn, 0, 1)
    if (clip.fadeOut > 0.01) alpha *= clamp((clip.duration - tLocal) / clip.fadeOut, 0, 1)
    return alpha
  }

  private expectedSourcePos(clip: Clip, tLocal: number): number {
    return clip.trimStart + tLocal * clip.speed
  }

  /** Auto-ducking: music/voiceover tracks duck under active video-with-audio clips */
  private duckFactor(project: Project, clip: Clip, t: number): number {
    if (!clip.autoDuck || clip.kind !== 'audio') return 1
    for (const other of project.clips) {
      if (other.kind !== 'video' || other.muted || other.volume <= 0.02) continue
      if (t >= other.start && t < other.start + other.duration) {
        const otherTrack = project.tracks.find((tr) => tr.id === other.trackId)
        if (otherTrack && !otherTrack.muted) return 0.32
      }
    }
    return 1
  }

  private syncVideo(clip: Clip, tLocal: number, entry: PoolEntry, audible: boolean, volumeScale = 1) {
    const el = entry.el as HTMLVideoElement
    const expected = clamp(this.expectedSourcePos(clip, tLocal), 0, Math.max(0, (clip.sourceDuration || el.duration || 1) - 0.02))
    el.playbackRate = clamp(clip.speed, 0.0625, 16)

    const vol = audible ? this.effectiveVolume(clip, tLocal) * volumeScale : 0
    if (entry.gain) {
      el.volume = 1
      entry.gain.gain.value = vol
    } else {
      el.volume = vol
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

  private syncAudio(clip: Clip, tLocal: number, entry: PoolEntry, audible: boolean, volumeScale = 1) {
    const el = entry.el as HTMLAudioElement
    const expected = clamp(this.expectedSourcePos(clip, tLocal), 0, Math.max(0, (clip.sourceDuration || el.duration || 1) - 0.02))
    el.playbackRate = clamp(clip.speed, 0.0625, 16)

    const vol = audible ? this.effectiveVolume(clip, tLocal) * volumeScale : 0
    if (entry.gain) {
      el.volume = 1
      entry.gain.gain.value = vol
    } else {
      el.volume = vol
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

  private effectiveVolume(clip: Clip, tLocal: number): number {
    const master = this.masterMuted ? 0 : this.masterVolume
    const base = evaluateKeyframeProperty(clip, 'volume', tLocal) ?? clip.volume
    return clamp(base * master * this.fadeFactor(clip, tLocal), 0, 1)
  }

  /* -------------------------------------------------- pixel fx (chroma / grade / LUT) */

  private hasGrade(clip: Clip): boolean {
    const g = clip.colorGrade
    return !!g && (g.temperature !== 0 || g.tint !== 0 || g.shadows !== 0 || g.highlights !== 0 || g.vibrance !== 1)
  }

  private needsPixelFx(clip: Clip): boolean {
    return !!clip.chromaKey?.enabled || this.hasGrade(clip) || !!clip.lutId
  }

  private getLut(clip: Clip, mediaMap: Map<string, MediaAssetRuntime>): LutData | null {
    if (!clip.lutId) return null
    if (this.lutCache.has(clip.lutId)) return this.lutCache.get(clip.lutId) ?? null
    const asset = mediaMap.get(clip.lutId)
    const lut = asset?.lutData ?? null
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
    mediaMap: Map<string, MediaAssetRuntime>
  ): HTMLCanvasElement | null {
    if (!this.needsPixelFx(clip) || srcW <= 0 || srcH <= 0) return null
    // cap fx resolution for performance
    const maxDim = 1600
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
    fx.drawImage(source, 0, 0, fw, fh)
    const img = fx.getImageData(0, 0, fw, fh)
    const changed = applyPixelEffects(img, {
      chroma: clip.chromaKey?.enabled ? clip.chromaKey : undefined,
      grade: this.hasGrade(clip) ? clip.colorGrade : undefined,
      lut: this.getLut(clip, mediaMap),
      lutIntensity: clip.lutIntensity ?? 1,
    })
    if (changed) fx.putImageData(img, 0, 0)
    return c
  }

  /* -------------------------------------------------- render */

  renderFrame() {
    const ctx = this.ctx
    const canvas = this.canvas
    const snap = this.snapshotFn?.()
    if (!ctx || !canvas || !snap) return
    const { project, mediaMap } = snap
    this.masterVolume = snap.masterVolume
    this.masterMuted = snap.masterMuted

    if (canvas.width !== project.canvasWidth || canvas.height !== project.canvasHeight) {
      canvas.width = project.canvasWidth
      canvas.height = project.canvasHeight
    }
    const W = canvas.width
    const H = canvas.height
    const t = this.time

    // background
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.filter = 'none'
    ctx.fillStyle = project.backgroundColor || '#000000'
    ctx.fillRect(0, 0, W, H)

    // draw bottom track first (tracks[0] is visually topmost)
    const tracks = project.tracks
    for (let i = tracks.length - 1; i >= 0; i--) {
      const track = tracks[i]
      if (track.kind === 'audio' || track.hidden) continue
      const clips = project.clips
        .filter((c) => c.trackId === track.id && t >= c.start - 0.0001 && t < c.start + c.duration)
        .sort((a, b) => a.start - b.start)
      for (const clip of clips) {
        this.drawClip(ctx, clip, t, W, H, mediaMap, project)
      }
    }

    // audio-only clips: keep their elements in sync even though nothing is drawn
    for (const track of tracks) {
      if (track.kind !== 'audio') continue
      const trackVolume = track.volume ?? 1
      const clips = project.clips.filter((c) => c.trackId === track.id && t >= c.start - 0.0001 && t < c.start + c.duration)
      for (const clip of clips) {
        if (!clip.mediaId) continue
        const asset = mediaMap.get(clip.mediaId)
        if (!asset) continue
        const entry = this.audios.get(clip.id)
        const el = entry && entry.mediaId === clip.mediaId ? entry.el : this.getOrCreateAudio(clip, clip.mediaId, asset.objectUrl)
        if (el) {
          const duck = this.duckFactor(project, clip, t)
          this.syncAudio(clip, t - clip.start, { el, mediaId: clip.mediaId, gain: this.audios.get(clip.id)?.gain }, !track.muted, trackVolume * duck)
        }
      }
    }

    this.cb?.onAfterRender?.()
  }

  private drawClip(ctx: CanvasRenderingContext2D, clip: Clip, t: number, W: number, H: number, mediaMap: Map<string, MediaAssetRuntime>, project: Project) {
    const tLocal = t - clip.start

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
    const alpha = (kfOpacity ?? clip.transform.opacity) * this.fadeFactor(clip, tLocal)
    if (alpha <= 0.002) return

    // audio sync for video clips happens here; visual draw below
    const snap = this.snapshotFn!
    if (clip.kind === 'video' && clip.mediaId) {
      const asset = mediaMap.get(clip.mediaId)
      if (asset) {
        const track = project.tracks.find((tr) => tr.id === clip.trackId)
        const entry = this.videos.get(clip.id)
        const el = entry && entry.mediaId === clip.mediaId ? (entry.el as HTMLVideoElement) : this.getOrCreateVideo(clip, clip.mediaId, asset.objectUrl)
        if (el) this.syncVideo(clip, tLocal, { el, mediaId: clip.mediaId, gain: this.videos.get(clip.id)?.gain }, !track?.muted, track?.volume ?? 1)
      }
    }

    ctx.save()
    ctx.globalAlpha = clamp(alpha, 0, 1)
    ctx.filter = buildFilterString(clip.filters)
    if (clip.blendMode && clip.blendMode !== 'source-over') {
      ctx.globalCompositeOperation = clip.blendMode
    }

    // motion (Ken Burns)
    const q = clip.duration > 0 ? clamp(tLocal / clip.duration, 0, 1) : 0
    const mi = clip.motionIntensity
    let motionScale = 1
    let motionX = 0
    let motionY = 0
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
      }
    }

    ctx.translate(W / 2 + tx * W + motionX, H / 2 + ty * H + motionY)
    ctx.rotate((trot * Math.PI) / 180)

    if (clip.kind === 'text' && clip.textStyle) {
      this.drawText(ctx, clip, tLocal, q, tx, ty)
    } else if (clip.kind === 'sticker' && clip.sticker) {
      this.drawSticker(ctx, clip, tLocal, q, tx, ty)
    } else if (clip.kind === 'image' && clip.mediaId) {
      const asset = mediaMap.get(clip.mediaId)
      const img = asset ? this.getImage(asset.id, asset.objectUrl) : null
      if (img && img.naturalWidth > 0) {
        const s = tscale * motionScale
        ctx.scale(s, s)
        const base = Math.max(W / img.naturalWidth, H / img.naturalHeight)
        const dw = img.naturalWidth * base
        const dh = img.naturalHeight * base
        const fxc = this.drawThroughFx(img, img.naturalWidth, img.naturalHeight, dw, dh, clip, mediaMap)
        if (fxc) ctx.drawImage(fxc, 0, 0, fxc.width, fxc.height, -dw / 2, -dh / 2, dw, dh)
        else ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh)
        this.bounds.set(clip.id, this.boundsFromTransform(clip, W, H, dw * s, dh * s, tx, ty, trot))
      } else {
        this.bounds.delete(clip.id)
      }
    } else if (clip.kind === 'video' && clip.mediaId) {
      const el = this.videos.get(clip.id)?.el as HTMLVideoElement | undefined
      if (el && el.readyState >= 2 && el.videoWidth > 0) {
        const s = tscale * motionScale
        ctx.scale(s, s)
        const base = Math.max(W / el.videoWidth, H / el.videoHeight)
        const dw = el.videoWidth * base
        const dh = el.videoHeight * base
        const fxc = this.drawThroughFx(el, el.videoWidth, el.videoHeight, dw, dh, clip, mediaMap)
        if (fxc) ctx.drawImage(fxc, 0, 0, fxc.width, fxc.height, -dw / 2, -dh / 2, dw, dh)
        else ctx.drawImage(el, -dw / 2, -dh / 2, dw, dh)
        this.bounds.set(clip.id, this.boundsFromTransform(clip, W, H, dw * s, dh * s, tx, ty, trot))
      } else {
        this.bounds.delete(clip.id)
      }
    }

    ctx.restore()
    ctx.filter = 'none'
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
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

  private drawText(ctx: CanvasRenderingContext2D, clip: Clip, tLocal: number, q: number, tx?: number, ty?: number) {
    const style = clip.textStyle!
    const W = this.canvas!.width
    const maxWidth = W * 0.9

    ctx.font = `${style.italic ? 'italic ' : ''}${style.bold ? 700 : 400} ${style.fontSize}px "${style.fontFamily}", sans-serif`
    const ctxAny = ctx as unknown as { letterSpacing: string }
    const supportsLetterSpacing = 'letterSpacing' in ctx
    if (supportsLetterSpacing) ctxAny.letterSpacing = `${style.letterSpacing}px`

    let content = style.content || ' '
    // text entry animations
    let animAlpha = 1
    let animY = 0
    let animScale = 1
    const ad = Math.max(0.01, style.animationDuration)
    if (style.animation !== 'none') {
      const p = clamp(tLocal / ad, 0, 1)
      switch (style.animation) {
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
      }
    }

    const lines = this.wrapLines(ctx, content, maxWidth)
    const lineH = style.fontSize * style.lineHeight
    const totalH = lines.length * lineH

    // measure widest line
    let maxW = 0
    for (const line of lines) maxW = Math.max(maxW, ctx.measureText(line).width)
    maxW = Math.max(maxW, style.fontSize * 0.5)

    ctx.globalAlpha *= animAlpha
    if (animScale !== 1) ctx.scale(animScale, animScale)
    ctx.translate(0, animY)

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
      ctx.shadowOffsetY = 2
    }

    ctx.textBaseline = 'middle'
    ctx.textAlign = style.align
    const anchorX = style.align === 'left' ? 0 : style.align === 'right' ? -maxW : 0
    // when textAlign=left we anchor at -maxW/2 so the block stays centered
    const drawX = style.align === 'left' ? -maxW / 2 : style.align === 'right' ? maxW / 2 : 0

    for (let i = 0; i < lines.length; i++) {
      const y = -totalH / 2 + lineH * (i + 0.5)
      const line = lines[i]
      if (!line) continue
      const x = supportsLetterSpacing ? drawX + anchorX : drawX
      if (style.strokeWidth > 0) {
        ctx.lineJoin = 'round'
        ctx.lineWidth = style.strokeWidth
        ctx.strokeStyle = style.strokeColor
        ctx.strokeText(line, x, y)
      }
      ctx.fillStyle = style.color
      ctx.fillText(line, x, y)
    }
    if (supportsLetterSpacing) ctxAny.letterSpacing = '0px'

    this.bounds.set(
      clip.id,
      this.boundsFromTransform(clip, W, this.canvas!.height, maxW * animScale, totalH * animScale, tx, ty)
    )
  }

  /* -------------------------------------------------- sticker drawing */

  private drawSticker(ctx: CanvasRenderingContext2D, clip: Clip, tLocal: number, _q: number, tx?: number, ty?: number) {
    const style = clip.sticker!
    const W = this.canvas!.width
    const H = this.canvas!.height

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
    ctx.font = `${style.size}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(style.emoji, 0, animY)

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
  if (!engineInstance) engineInstance = new PreviewEngine()
  return engineInstance
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
