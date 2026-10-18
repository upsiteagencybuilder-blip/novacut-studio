/**
 * NovaCut Studio — Mega Effects Library: procedural music loops (category 'music')
 *
 * 8 genres × 2 moods × 4 keys = 64 MusicEffect definitions.
 * Each effect carries a serializable MusicSpec recipe (drum velocity grid,
 * scale-degree bass/lead patterns, chord stacks) interpreted by the offline
 * renderer in `audio-render.ts` — no audio data is stored here.
 *
 * Conventions shared with the renderer:
 * - drums: 16-step velocity arrays 0..1 (0 = skip the step), one bar per grid
 * - bass:  8 entries, one per 8th note, scale-degree indices (0..7, -1 = rest)
 * - lead:  16 entries, one per 16th, scale-degree indices (or -1)
 * - pad:   chords = semitone stacks from the root note
 */
import type { MusicEffect, MusicSpec } from './types'

/* --------------------------- musical basics --------------------------- */

/** Semitone interval sets per scale flavor (renderer maps degrees → midi). */
export const SCALES: Record<MusicSpec['scale'], number[]> = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
}

/** Root MIDI notes for the supported keys (A3/C3/E3/G3). */
export const ROOT_MIDI: Record<string, number> = { Am: 57, Cm: 48, Em: 52, Gm: 55 }

type Mood = 'chill' | 'uplifting'

const MOODS: Mood[] = ['chill', 'uplifting']
const MOOD_LABEL: Record<Mood, string> = { chill: 'Chill', uplifting: 'Uplifting' }

const KEYS = [
  { label: 'Am', slug: 'am' },
  { label: 'Cm', slug: 'cm' },
  { label: 'Em', slug: 'em' },
  { label: 'Gm', slug: 'gm' },
] as const

type GenreParts = Pick<MusicSpec, 'drums' | 'bass' | 'lead' | 'pad' | 'swing'>

interface GenreTemplate {
  genre: string
  slug: string
  emoji: string
  bpm: Record<Mood, number>
  scale: MusicSpec['scale']
  build: (mood: Mood) => GenreParts
}

/** Rotate a pattern array — gives each key a different melodic contour. */
function rotate<T>(arr: T[], by: number): T[] {
  const n = arr.length
  const k = ((by % n) + n) % n
  return [...arr.slice(k), ...arr.slice(0, k)]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/* ----------------------------- genre templates ----------------------------- */

const GENRES: GenreTemplate[] = [
  {
    genre: 'Lo-fi',
    slug: 'lofi',
    emoji: '🎧',
    bpm: { chill: 72, uplifting: 84 },
    scale: 'dorian',
    build: (mood) => ({
      swing: 0.16,
      drums: {
        kick: [0.95, 0, 0, 0, 0, 0, 0.7, 0, 0, 0.55, 0, 0, 0.75, 0, 0, 0],
        snare: [0, 0, 0, 0, 0.8, 0, 0, 0.22, 0, 0, 0, 0, 0.8, 0, 0.28, 0],
        hat: mood === 'chill'
          ? [0.55, 0, 0.4, 0, 0.55, 0, 0.4, 0.25, 0.55, 0, 0.4, 0, 0.55, 0, 0.4, 0.3]
          : [0.6, 0.2, 0.45, 0.2, 0.6, 0, 0.45, 0.3, 0.6, 0.2, 0.45, 0, 0.6, 0.2, 0.45, 0.35],
      },
      bass: {
        wave: 'triangle',
        octave: -1,
        pattern: mood === 'chill' ? [0, -1, -1, 2, -1, -1, 4, -1] : [0, -1, 4, -1, 2, -1, 5, 4],
      },
      lead: {
        wave: 'sine',
        octave: 1,
        arp: mood === 'chill'
          ? [0, -1, 2, -1, 4, -1, 2, -1, 0, -1, 2, -1, 6, -1, 4, -1]
          : [0, 2, 4, -1, 7, -1, 4, 2, 0, 2, 4, 7, -1, 4, 2, 0],
      },
      pad: {
        wave: 'triangle',
        chords: [[0, 3, 7], [8, 12, 15], [5, 8, 12], [3, 7, 10]],
        level: 0.16,
      },
    }),
  },
  {
    genre: 'EDM',
    slug: 'edm',
    emoji: '🔮',
    bpm: { chill: 124, uplifting: 132 },
    scale: 'minor',
    build: (mood) => ({
      swing: 0,
      drums: {
        kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
        snare: [0, 0, 0, 0, 0.9, 0, 0, 0, 0, 0, 0, 0, 0.9, 0, 0, mood === 'uplifting' ? 0.3 : 0],
        hat: [0, 0, 0.75, 0, 0, 0, 0.75, 0, 0, 0, 0.75, 0, 0, 0, 0.75, mood === 'uplifting' ? 0.55 : 0.4],
      },
      bass: {
        wave: 'sawtooth',
        octave: -1,
        pattern: mood === 'chill' ? [0, -1, 0, -1, 0, -1, 0, -1] : [0, -1, 0, -1, 0, -1, 5, -1],
      },
      lead: {
        wave: 'sawtooth',
        octave: 1,
        arp: mood === 'chill'
          ? [0, -1, 4, -1, 7, -1, 4, -1, 0, -1, 4, -1, 7, -1, 4, -1]
          : [0, 4, 7, 4, 0, 4, 7, 4, 0, 4, 7, 4, 6, 4, 2, 4],
      },
    }),
  },
  {
    genre: 'Cinematic',
    slug: 'cinematic',
    emoji: '🎬',
    bpm: { chill: 80, uplifting: 96 },
    scale: 'minor',
    build: (mood) => ({
      swing: 0,
      drums: {
        kick: [0.9, 0, 0, 0, 0, 0, 0, 0, 0.7, 0, 0, 0, 0, 0, 0, 0],
        snare: [0, 0, 0, 0, 0, 0, 0, 0, 0.55, 0, 0, 0, 0, 0, 0.3, 0],
        hat: [0, 0, 0.22, 0, 0, 0, 0.22, 0, 0, 0, 0.28, 0, 0, 0, 0.22, 0],
      },
      bass: {
        wave: 'sawtooth',
        octave: -1,
        pattern: mood === 'chill' ? [0, -1, -1, -1, -1, -1, 4, -1] : [0, -1, -1, 4, -1, -1, 5, -1],
      },
      lead: {
        wave: 'triangle',
        octave: 1,
        arp: mood === 'chill'
          ? [0, -1, -1, 4, -1, -1, 7, -1, -1, -1, 4, -1, -1, -1, 2, -1]
          : [0, -1, 4, -1, 7, -1, 4, -1, 5, -1, 7, -1, 9, -1, 7, -1],
      },
      pad: {
        wave: 'sawtooth',
        chords: [[0, 3, 7], [5, 8, 12], [3, 7, 10], [8, 12, 15]],
        level: mood === 'chill' ? 0.2 : 0.17,
      },
    }),
  },
  {
    genre: 'Hip-Hop',
    slug: 'hiphop',
    emoji: '🎤',
    bpm: { chill: 86, uplifting: 96 },
    scale: 'minor',
    build: (mood) => ({
      swing: 0.18,
      drums: {
        kick: [0.95, 0, 0, 0.4, 0, 0, 0.8, 0, 0, 0, 0.9, 0, 0, 0.5, 0, 0],
        snare: [0, 0, 0, 0, 0.9, 0, 0, 0.2, 0, 0, 0, 0, 0.9, 0, 0.25, 0.3],
        hat: mood === 'chill'
          ? [0.5, 0.3, 0.55, 0.3, 0.5, 0.3, 0.55, 0.35, 0.5, 0.3, 0.55, 0.3, 0.5, 0.3, 0.55, 0.4]
          : [0.6, 0.35, 0.6, 0.35, 0.6, 0.35, 0.6, 0.4, 0.6, 0.35, 0.6, 0.35, 0.6, 0.35, 0.6, 0.5],
      },
      bass: {
        wave: 'sine',
        octave: -2,
        pattern: mood === 'chill' ? [0, -1, -1, -1, 0, -1, -1, 4] : [0, -1, 0, -1, 3, -1, -1, 4],
      },
      lead: {
        wave: 'triangle',
        octave: 1,
        arp: mood === 'chill'
          ? [0, -1, 4, -1, 7, -1, -1, 4, -1, -1, 2, -1, 4, -1, -1, -1]
          : [0, -1, 3, -1, 7, -1, 4, -1, -1, 2, -1, 4, 7, -1, -1, -1],
      },
    }),
  },
  {
    genre: 'Ambient',
    slug: 'ambient',
    emoji: '🌌',
    bpm: { chill: 60, uplifting: 72 },
    scale: 'dorian',
    build: (mood) => ({
      swing: 0,
      drums: {
        kick: [0.7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0],
        snare: [0, 0, 0, 0, 0.25, 0, 0, 0, 0, 0, 0, 0, 0.3, 0, 0, 0],
        hat: [0, 0, 0.18, 0, 0, 0, 0, 0, 0, 0, 0.2, 0, 0, 0, 0.18, 0],
      },
      bass: {
        wave: 'sine',
        octave: -1,
        pattern: mood === 'chill' ? [0, -1, -1, -1, -1, -1, -1, -1] : [0, -1, -1, -1, 4, -1, -1, -1],
      },
      lead: {
        wave: 'sine',
        octave: 2,
        arp: mood === 'chill'
          ? [-1, -1, 0, -1, -1, -1, 4, -1, -1, -1, 7, -1, -1, -1, 4, -1]
          : [0, -1, 4, -1, -1, 7, -1, -1, 4, -1, -1, 9, -1, -1, 7, -1],
      },
      pad: {
        wave: 'sine',
        chords: [[0, 3, 7, 10], [5, 8, 12, 15], [3, 7, 10, 14], [8, 12, 15, 19]],
        level: 0.25,
      },
    }),
  },
  {
    genre: 'Corporate',
    slug: 'corporate',
    emoji: '💼',
    bpm: { chill: 104, uplifting: 118 },
    scale: 'minor',
    build: (mood) => ({
      swing: 0,
      drums: {
        kick: [0.9, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, 0, 0, 0, 0, 0],
        snare: [0, 0, 0, 0, 0.85, 0, 0, 0, 0, 0, 0, 0, 0.85, 0, 0, mood === 'uplifting' ? 0.25 : 0],
        hat: [0.5, 0, 0.45, 0, 0.5, 0, 0.45, 0, 0.5, 0, 0.45, 0, 0.5, 0, 0.45, 0.3],
      },
      bass: {
        wave: 'triangle',
        octave: -1,
        pattern: mood === 'chill' ? [0, -1, 4, -1, 0, -1, 4, -1] : [0, -1, 4, -1, 5, -1, 4, 2],
      },
      lead: {
        wave: 'square',
        octave: 1,
        arp: mood === 'chill'
          ? [0, -1, 4, -1, 7, -1, 4, -1, 0, -1, 4, -1, 7, -1, 4, -1]
          : [0, 4, 7, 4, 5, 4, 2, 4, 0, 4, 7, 4, 5, 7, 9, 7],
      },
    }),
  },
  {
    genre: 'Trap',
    slug: 'trap',
    emoji: '🔥',
    bpm: { chill: 136, uplifting: 148 },
    scale: 'minor',
    build: (mood) => ({
      swing: 0,
      drums: {
        kick: [0.95, 0, 0, 0, 0, 0, 0.8, 0, 0, 0, 0.7, 0, 0, 0.85, 0, 0],
        snare: [0, 0, 0, 0, 0, 0, 0, 0, 0.85, 0, 0, 0, 0, 0, 0, 0.3],
        hat: mood === 'chill'
          ? [0.7, 0.35, 0.55, 0.35, 0.7, 0.35, 0.55, 0.5, 0.35, 0.55, 0.35, 0.7, 0.5, 0.35, 0.55, 0.7]
          : [0.75, 0.4, 0.6, 0.4, 0.75, 0.4, 0.6, 0.55, 0.4, 0.6, 0.4, 0.75, 0.55, 0.4, 0.6, 0.75],
      },
      bass: {
        wave: 'sine',
        octave: -2,
        pattern: mood === 'chill' ? [0, -1, -1, -1, 0, -1, 3, -1] : [0, -1, -1, 0, -1, 3, -1, 4],
      },
      lead: {
        wave: 'square',
        octave: 1,
        arp: mood === 'chill'
          ? [0, -1, -1, 7, -1, -1, 4, -1, -1, -1, 7, -1, -1, 2, -1, -1]
          : [0, -1, 7, -1, 4, -1, -1, 7, -1, 2, -1, -1, 7, -1, 4, -1],
      },
    }),
  },
  {
    genre: 'House',
    slug: 'house',
    emoji: '🏠',
    bpm: { chill: 120, uplifting: 128 },
    scale: 'minor',
    build: (mood) => ({
      swing: 0,
      drums: {
        kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
        snare: [0, 0, 0, 0, 0.9, 0, 0, 0, 0, 0, 0, 0, 0.9, 0, 0, 0.25],
        hat: [0.3, 0, 0.7, 0.3, 0, 0, 0.7, 0.3, 0, 0, 0.7, 0.3, 0, 0, 0.7, 0.4],
      },
      bass: {
        wave: 'sawtooth',
        octave: -1,
        pattern: mood === 'chill' ? [0, -1, 0, -1, 0, -1, 0, -1] : [0, -1, 0, -1, 0, -1, 3, -1],
      },
      lead: {
        wave: 'sawtooth',
        octave: 1,
        arp: mood === 'chill'
          ? [0, -1, 7, -1, 4, -1, 7, -1, 0, -1, 7, -1, 4, -1, 7, -1]
          : [0, 7, 4, 7, 0, 7, 4, 7, 0, 7, 4, 7, 5, 7, 4, 2],
      },
    }),
  },
]

/* ------------------------------- assembly ------------------------------- */

/** All 64 procedural music loops — consumed by the effects registry. */
export const MUSIC_EFFECTS: MusicEffect[] = GENRES.flatMap((g) =>
  MOODS.flatMap((mood): MusicEffect[] =>
    KEYS.map((key, keyIndex): MusicEffect => {
      const bpm = g.bpm[mood]
      const parts = g.build(mood)
      const spec: MusicSpec = {
        bpm,
        bars: 8,
        key: key.label,
        scale: g.scale,
        drums: parts.drums,
        bass: parts.bass,
        lead: { ...parts.lead, arp: rotate(parts.lead.arp, keyIndex * 4) },
        pad: parts.pad,
        swing: parts.swing,
      }
      const duration = round2((spec.bars * 4 * 60) / bpm)
      return {
        id: `music-${g.slug}-${mood}-${key.slug}`,
        name: `${g.genre} ${MOOD_LABEL[mood]} · ${key.label}`,
        family: g.genre,
        category: 'music',
        tags: [g.slug, mood, key.slug],
        emoji: g.emoji,
        bpm,
        bars: spec.bars,
        duration,
        spec,
      }
    }),
  ),
)
