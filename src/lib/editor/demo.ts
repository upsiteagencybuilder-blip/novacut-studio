'use client'

/**
 * Demo project builder — gives first-time users an instant playground.
 * Uses bundled sample images + a runtime-synthesized music loop (no network needed).
 */
import type { Clip, MediaAssetRuntime, Project } from './types'
import {
  createDefaultProject,
  createTextClip,
  DEFAULT_FILTERS,
  DEFAULT_TRANSFORM,
  TRACK_HEIGHT,
} from './constants'
import { uid } from './utils'
import * as db from './db'

/** Synthesize a pleasant 8s chord-arp loop as a WAV blob */
async function synthMusicBlob(): Promise<Blob> {
  const sampleRate = 22050
  const duration = 8
  const length = sampleRate * duration
  const offline = new OfflineAudioContext(2, length, sampleRate)

  // chord progression: Am - F - C - G (2s each)
  const chords = [
    [220, 261.63, 329.63], // A minor
    [174.61, 220, 261.63], // F major
    [130.81, 164.81, 196], // C major
    [196, 246.94, 293.66], // G major
  ]
  const master = offline.createGain()
  master.gain.value = 0.55
  const comp = offline.createDynamicsCompressor()
  master.connect(comp)
  comp.connect(offline.destination)

  chords.forEach((chord, ci) => {
    const chordStart = ci * 2
    chord.forEach((freq, ni) => {
      const osc = offline.createOscillator()
      osc.type = ni === 0 ? 'sawtooth' : 'triangle'
      osc.frequency.value = freq
      const g = offline.createGain()
      g.gain.setValueAtTime(0, chordStart)
      g.gain.linearRampToValueAtTime(0.12 / (ni + 1), chordStart + 0.15)
      g.gain.setValueAtTime(0.12 / (ni + 1), chordStart + 1.6)
      g.gain.linearRampToValueAtTime(0.0001, chordStart + 2)
      const filter = offline.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 1400
      osc.connect(g)
      g.connect(filter)
      filter.connect(master)
      osc.start(chordStart)
      osc.stop(chordStart + 2.05)
    })
    // sparkle arpeggio
    for (let i = 0; i < 4; i++) {
      const osc = offline.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = chord[2] * 2 * (i % 2 === 0 ? 1 : 1.5)
      const g = offline.createGain()
      const t0 = chordStart + i * 0.5
      g.gain.setValueAtTime(0, t0)
      g.gain.linearRampToValueAtTime(0.08, t0 + 0.03)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45)
      osc.connect(g)
      g.connect(master)
      osc.start(t0)
      osc.stop(t0 + 0.5)
    }
  })

  const buffer = await offline.startRendering()
  // encode WAV
  const numCh = buffer.numberOfChannels
  const bytesPerSample = 2
  const blockAlign = numCh * bytesPerSample
  const dataSize = buffer.length * blockAlign
  const ab = new ArrayBuffer(44 + dataSize)
  const view = new DataView(ab)
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numCh, true)
  view.setUint32(24, buffer.sampleRate, true)
  view.setUint32(28, buffer.sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)
  let offset = 44
  const chans = Array.from({ length: numCh }, (_, i) => buffer.getChannelData(i))
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numCh; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]))
      view.setInt16(offset, v * 0x7fff, true)
      offset += 2
    }
  }
  return new Blob([ab], { type: 'audio/wav' })
}

/** Build the demo project; assets get persisted into IndexedDB like normal imports */
export async function buildDemoProject(existingMedia: MediaAssetRuntime[]): Promise<{ project: Project; newAssets: MediaAssetRuntime[] }> {
  const project = createDefaultProject('My First Edit ✨')
  const media: MediaAssetRuntime[] = [...existingMedia]
  const usedSampleIds = new Set<string>()

  // import bundled samples if missing
  const samples = [
    { url: '/samples/demo-1.jpg', name: 'sunrise.jpg' },
    { url: '/samples/demo-2.jpg', name: 'neon-city.jpg' },
    { url: '/samples/demo-3.jpg', name: 'mountains.jpg' },
  ]
  for (const s of samples) {
    const found = media.find((m) => m.name === s.name)
    if (found) {
      usedSampleIds.add(found.id)
      continue
    }
    try {
      const res = await fetch(s.url)
      const blob = await res.blob()
      const file = new File([blob], s.name, { type: blob.type || 'image/jpeg' })
      const { importFile } = await import('./importer')
      const asset = await importFile(file)
      if (asset) {
        media.unshift(asset)
        usedSampleIds.add(asset.id)
        await db.putAsset(
          {
            id: asset.id,
            name: asset.name,
            kind: asset.kind,
            mimeType: asset.mimeType,
            size: asset.size,
            duration: asset.duration,
            width: asset.width,
            height: asset.height,
            thumbnail: asset.thumbnail,
            thumbs: asset.thumbs,
            peaks: asset.peaks,
            createdAt: asset.createdAt,
          },
          asset.rawBlob
        )
      }
    } catch {
      /* sample missing — skip */
    }
  }

  // synth music
  let musicAsset = media.find((m) => m.name === 'novacut-vibe.wav')
  if (!musicAsset) {
    try {
      const blob = await synthMusicBlob()
      const file = new File([blob], 'novacut-vibe.wav', { type: 'audio/wav' })
      const { importFile } = await import('./importer')
      const asset = await importFile(file)
      if (asset) {
        media.unshift(asset)
        musicAsset = asset
        await db.putAsset(
          {
            id: asset.id,
            name: asset.name,
            kind: asset.kind,
            mimeType: asset.mimeType,
            size: asset.size,
            duration: asset.duration,
            width: asset.width,
            height: asset.height,
            thumbnail: asset.thumbnail,
            thumbs: asset.thumbs,
            peaks: asset.peaks,
            createdAt: asset.createdAt,
          },
          asset.rawBlob
        )
      }
    } catch {
      /* audio synth unsupported — skip */
    }
  }

  const imageIds = Array.from(usedSampleIds)
  const perImage = 2.6
  const clips: Clip[] = []
  const videoTrack = project.tracks.find((t) => t.kind === 'video')!
  const overlayTrack = project.tracks.find((t) => t.kind === 'overlay')!
  const audioTrack = project.tracks.find((t) => t.kind === 'audio')!

  imageIds.slice(0, 3).forEach((mediaId, i) => {
    const asset = media.find((m) => m.id === mediaId)!
    clips.push({
      id: uid('clip_'),
      trackId: videoTrack.id,
      kind: 'image',
      name: asset.name,
      mediaId,
      start: i * perImage,
      duration: perImage,
      trimStart: 0,
      sourceDuration: 3600,
      speed: 1,
      volume: 0,
      muted: true,
      fadeIn: i === 0 ? 0.6 : 0,
      fadeOut: i === imageIds.length - 1 ? 0.6 : 0,
      transform: { ...DEFAULT_TRANSFORM },
      filters: i === 1 ? { ...DEFAULT_FILTERS, saturation: 1.35, contrast: 1.1 } : { ...DEFAULT_FILTERS },
      motion: i % 2 === 0 ? 'zoomIn' : 'panRight',
      motionIntensity: 0.4,
      color: '#a855f7',
    })
  })

  // title text
  const title = createTextClip(project, undefined, overlayTrack.id, 0.15)
  title.duration = 2.4
  title.textStyle = {
    ...title.textStyle!,
    content: 'NOVACUT ✨',
    fontFamily: 'Anton',
    fontSize: 120,
    color: '#ffffff',
    shadow: true,
    shadowColor: 'rgba(217,70,239,0.9)',
    shadowBlur: 42,
    letterSpacing: 8,
    animation: 'pop',
    animationDuration: 0.7,
  }
  clips.push(title)

  const sub = createTextClip(project, undefined, overlayTrack.id, 2.7)
  sub.duration = 2.6
  sub.textStyle = {
    ...sub.textStyle!,
    content: 'Made with NovaCut Studio',
    fontFamily: 'Montserrat',
    fontSize: 44,
    bold: true,
    color: '#ffffff',
    background: 'rgba(168,85,247,0.85)',
    backgroundPadding: 20,
    animation: 'slideUp',
  }
  sub.transform = { ...sub.transform, y: 0.34 }
  clips.push(sub)

  if (musicAsset) {
    clips.push({
      id: uid('clip_'),
      trackId: audioTrack.id,
      kind: 'audio',
      name: musicAsset.name,
      mediaId: musicAsset.id,
      start: 0,
      duration: Math.min(musicAsset.duration, imageIds.length * perImage || 8),
      trimStart: 0,
      sourceDuration: musicAsset.duration,
      speed: 1,
      volume: 0.8,
      muted: false,
      fadeIn: 0.5,
      fadeOut: 1,
      transform: { ...DEFAULT_TRANSFORM },
      filters: { ...DEFAULT_FILTERS },
      motion: 'none',
      motionIntensity: 0.35,
      color: '#10b981',
    })
  }

  project.clips = clips
  project.updatedAt = Date.now()
  return { project, newAssets: media.filter((m) => !existingMedia.includes(m)) }
}
