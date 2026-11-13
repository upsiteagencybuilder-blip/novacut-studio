'use client'

/**
 * UX60 Phase 3 (Days 21-22) — natural-language command layer for ⌘K palette.
 *
 * Deterministic, fully on-device phrase parser: the palette input now accepts
 * plain sentences ("make my title bigger and gold", "cut at the chorus") and
 * offers ONE interpreted smart action above the regular command list. Nothing
 * is pretended — every intent maps to a real store action that already ships,
 * and the smart action row shows exactly what will happen before Enter runs.
 *
 * Core intents carry ≥20 accepted phrasings each (NL_PHRASING_EXAMPLES is the
 * honest, verifiable list used for E2E receipts). Compound sentences resolve
 * left-to-right: "bigger and gold" runs size first, then color — chained via
 * the `extra` queue in parseNL.
 */
import { toast } from 'sonner'
import { useEditor } from './store'

export interface NLMatch {
  intentId: string
  /** what the row shows: the understood command */
  label: string
  /** exactly what will happen, honest */
  detail: string
  /** named payload: color word, quoted title text, chorus-vs-beat… */
  payload?: Record<string, string>
}

/* ---------------------------------------------------------------- helpers */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

const COLORS: Record<string, string> = {
  gold: '#ffd700',
  silver: '#c0c0c0',
  red: '#ef4444',
  green: '#22c55e',
  blue: '#3b82f6',
  pink: '#ec4899',
  purple: '#a855f7',
  orange: '#f97316',
  yellow: '#eab308',
  white: '#ffffff',
  black: '#111111',
  cyan: '#06b6d4',
  magenta: '#d946ef',
  lime: '#84cc16',
  teal: '#14b8a6',
  rose: '#f43f5e',
  amber: '#f59e0b',
  violet: '#8b5cf6',
}

const q = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** the text clip NL edits: selected text clip → first overlay text → first text */
function targetTextClip() {
  const s = useEditor.getState()
  const sel = s.project.clips.find((c) => s.selectedClipIds.includes(c.id) && c.kind === 'text')
  if (sel) return sel
  const texts = s.project.clips.filter((c) => c.kind === 'text')
  return texts.find((c) => s.project.tracks.find((t) => t.id === c.trackId)?.kind === 'overlay') ?? texts[0]
}

/** audio clips NL edits: selected audio → all audio */
function targetAudioClips() {
  const s = useEditor.getState()
  const audios = s.project.clips.filter((c) => c.kind === 'audio')
  const sel = audios.filter((c) => s.selectedClipIds.includes(c.id))
  return sel.length ? sel : audios
}

function patchSelectedVisual(p: Parameters<ReturnType<typeof useEditor.getState>['updateClip']>[1]): boolean {
  const s = useEditor.getState()
  const id = s.selectedClipIds[0]
  const clip = s.project.clips.find((c) => c.id === id)
  if (!clip || clip.kind === 'audio') return false
  s.updateClip(id, p, 'nl-edit')
  return true
}

/* ---------------------------------------------------------------- parser */

type Rule = { test: (n: string) => NLMatch | null }

const RULES: Rule[] = [
  // ---- cut at the chorus / on the beat (checked BEFORE generic split) ----
  {
    test: (n) => {
      const m = n.match(/\b(cut|cuts|split|slice|chop|edit|sync|make cuts?)\b\s*(cuts?|it|them|this)?\s*(at|on|to|with|in sync with)?\s*(the\s+)?(chorus|drop|beat|bass|music|rhythm)/) ?? n.match(/\bbeat[- ]?sync\b.*\b(cuts?|edit)/)
      if (!m) return null
      const kind = /chorus|drop/.test(m[0]) ? 'chorus' : 'beat'
      return {
        intentId: 'cut-at-beat',
        label: kind === 'chorus' ? 'Cut at the chorus' : 'Cut on the beat',
        detail: kind === 'chorus'
          ? 'Finds the loudest section of your music and splits every visual clip there'
          : 'Detects the beats of your music and slices the visual clips on the beat grid',
        payload: { kind },
      }
    },
  },
  // ---- title / text size ----
  {
    test: (n) => {
      const hasSubject = /\b(title|text|font|caption|heading|word|words)\b/.test(n) || /\b(it|this|that|them|these|those)\b/.test(n)
      const up = /\b(make|turn|be)?\s*(a lot|much|way|a bit|slightly|really)?\s*(bigger|larger|huge|giant|enlarged?|too small|grow|xxl|max size)\b/.test(n)
        || /\b(blow (it |that |the )?up|blow up)\b/.test(n)
        || /\bincrease (the )?(font|text|title)?\s*(size|size up)\b/.test(n)
        || /\b(scale (it |the )?(text|title|font|size)? ?up)\b/.test(n)
        || /\b(bump (it|that|the size|the font|the text) up)\b/.test(n)
        || /\b(size (it |the )?(text|title|font)? ?up)\b/.test(n)
        || /\bmake (it |the )?(title|text|font) big\b/.test(n)
      const down = /\b(smaller|tiny|shrink|decrease|reduce|too big|less big|mini)\b/.test(n)
        || /\b(size (it |the )?(text|title|font)? ?down)\b/.test(n)
        || /\bturn (the |my )?(title|text|font|caption) down\b/.test(n)
        || /\bmake (it |the )?(title|text|font) small\b/.test(n)
      if (!hasSubject && !((up !== down) && /\b(bigger|smaller)\b/.test(n))) return null
      if (up === down) return null
      return up
        ? { intentId: 'title-bigger', label: 'Make the title bigger', detail: 'Title font size +20% (up to 220px)' }
        : { intentId: 'title-smaller', label: 'Make the title smaller', detail: 'Title font size −17% (down to 16px)' }
    },
  },
  // ---- title / text color ----
  {
    test: (n) => {
      const m = n.match(/\b(gold|silver|red|green|blue|pink|purple|orange|yellow|white|black|cyan|magenta|lime|teal|rose|amber|violet)\b/)
      if (!m) return null
      if (!/\b(title|text|caption|heading|it|this|them)\b/.test(n) && !/\b(make|turn|color|colour|paint|set|dye|in)\b/.test(n)) return null
      if (/canvas|timeline|background|screen|video/.test(n) && !/title|text/.test(n)) return null
      return {
        intentId: 'title-color',
        label: `Make the title ${m[1]}`,
        detail: `Title fill becomes ${m[1]} (${COLORS[m[1]]}) — replaces a gradient fill if one was set`,
        payload: { color: m[1] },
      }
    },
  },
  // ---- title bold / outline / shadow ----
  {
    test: (n) => {
      if (/\b(bold|bolder|thicker|heavy|emphas)/.test(n) && /title|text|it|this|font/.test(n))
        return { intentId: 'title-bold', label: 'Make the title bold', detail: 'Bold weight on the selected title' }
      if (/\b(outline|stroke|border)/.test(n) && /title|text|it|this|add/.test(n))
        return { intentId: 'title-outline', label: 'Add an outline to the title', detail: '4px black stroke around the title glyphs' }
      if (/\b(shadow|glow)/.test(n) && /title|text|it|this|add|give/.test(n))
        return { intentId: 'title-shadow', label: 'Add a shadow to the title', detail: 'Soft drop shadow behind the title (≥24px blur)' }
      return null
    },
  },
  // ---- mute / unmute ----
  {
    test: (n) => {
      if (/\b(unmute|un-mute|bring (back|the) (audio|sound|music)|restore (the )?sound|sound back on|audio back on|turn the sound back on)\b/.test(n))
        return { intentId: 'unmute-all', label: 'Unmute the audio', detail: 'Every muted audio clip becomes audible again' }
      if (/\b(mute|silence|no sound|kill the (audio|music|sound)|sound off|audio off|turn (the audio|the music|the sound|it) off|make (it|everything|the (audio|sound|music)) silent|cut (the )?(sound|audio|music))\b/.test(n))
        return { intentId: 'mute-all', label: 'Mute everything', detail: 'Mutes all audio and video clips in one undo step' }
      return null
    },
  },
  // ---- split at playhead ----
  {
    test: (n) => {
      if (/\b(cut|split|slice|razor)\s*(it|the clip|here|right here|now|at the playhead|at this point|at playhead|in half|into two)?\b/.test(n) && /\b(here|now|playhead|this point|in half|into two|it|the clip)\b/.test(n))
        return { intentId: 'split-here', label: 'Cut at the playhead', detail: 'Splits the selected clip (or every clip) under the playhead' }
      return null
    },
  },
  // ---- volume ----
  {
    test: (n) => {
      const up = /\b(louder|turn (it|the volume|the audio|the music) up|volume up|increase (the )?volume|pump (it )?up|raise (the )?volume|more volume|crank (it )?up)\b/.test(n)
      const down = /\b(quieter|softer|turn (it|the volume|the audio|the music) down|volume down|lower (the )?volume|decrease (the )?volume|less volume|dial (it )?down)\b/.test(n)
      if (up === down) return null
      return up
        ? { intentId: 'volume-up', label: 'Turn the volume up', detail: 'Selected audio (or every audio clip) +10% volume' }
        : { intentId: 'volume-down', label: 'Turn the volume down', detail: 'Selected audio (or every audio clip) −10% volume' }
    },
  },
  // ---- speed ----
  {
    test: (n) => {
      const up = /\b(faster|speed (it|this|the clip) up|double speed|2x speed|2 times|timelapse|make it quick|quicker)\b/.test(n)
      const down = /\b(slower|slow (it|this|the clip) down|slow motion|slow-mo|slowmo|half speed|0\.5x|make it slow)\b/.test(n)
      if (up === down) return null
      return up
        ? { intentId: 'speed-up', label: 'Speed the clip up', detail: 'Selected clip speed ×2 (up to 4×)' }
        : { intentId: 'slow-down', label: 'Slow the clip down', detail: 'Selected clip speed ×0.5 (down to 0.25×)' }
    },
  },
  // ---- delete / duplicate ----
  {
    test: (n) => {
      if (/\b(delete|remove|get rid of|trash|bin)\b/.test(n) && /\b(this|it|that|the clip|the selection|them)\b/.test(n))
        return { intentId: 'delete-selected', label: 'Delete the selection', detail: 'Removes the selected clip(s) — undo brings them back' }
      if (/\b(duplicate|copy|make a copy|clone|dupe)\b/.test(n) && /\b(this|it|that|the clip|them)?\b/.test(n))
        return { intentId: 'duplicate-selected', label: 'Duplicate the selection', detail: 'Places an identical copy right after the selected clip' }
      return null
    },
  },
  // ---- add a title with content ----
  {
    test: (n) => {
      const m = n.match(/\b(?:add|drop|put|insert|create)\s+(?:a\s+)?(?:title|text|caption|heading)\s*(?:saying|that says|with|reading)?\s*["'“”](.+?)["'“”]/) ?? n.match(/\b(?:title|caption)\s*(?:saying|that says|with|reading)\s*["'“”](.+?)["'“”]/)
      if (m) return { intentId: 'add-title', label: `Add title “${m[1].slice(0, 24)}”`, detail: `New text clip at the playhead reading “${m[1]}”`, payload: { text: m[1] } }
      return null
    },
  },
  // ---- fades ----
  {
    test: (n) => {
      if (/\b(fade out|fade to black|end with a fade|fade it out|outro fade)\b/.test(n))
        return { intentId: 'fade-out', label: 'Fade the clip out', detail: '0.8s fade-out on the selected clip (≥ existing)' }
      if (/\b(fade in|fade from black|start with a fade|fade it in|intro fade)\b/.test(n))
        return { intentId: 'fade-in', label: 'Fade the clip in', detail: '0.8s fade-in on the selected clip (≥ existing)' }
      return null
    },
  },
  // ---- canvas format ----
  {
    test: (n) => {
      if (/\b(vertical|portrait|9:16|9 by 16|tiktok (format|size|canvas)|reels (format|size|canvas)|story (format|size))\b/.test(n))
        return { intentId: 'canvas-vertical', label: 'Switch to vertical canvas', detail: 'Canvas becomes 1080×1920 (9:16) at 30fps' }
      if (/\b(landscape|horizontal|16:9|16 by 9|widescreen|widescreen format|youtube (format|size|canvas))\b/.test(n))
        return { intentId: 'canvas-landscape', label: 'Switch to landscape canvas', detail: 'Canvas becomes 1920×1080 (16:9) at 30fps' }
      if (/\b(square|1:1|1 by 1|instagram square)\b/.test(n))
        return { intentId: 'canvas-square', label: 'Switch to square canvas', detail: 'Canvas becomes 1080×1080 (1:1) at 30fps' }
      return null
    },
  },
  // ---- export ----
  {
    test: (n) => {
      if (/\b(export|render|save (it|this|the video) (as|to)|download (the video|it|this)|make (me|it) a video file|produce the video)\b/.test(n))
        return { intentId: 'open-export', label: 'Open the export dialog', detail: 'Pauses playback and opens Export — rendering happens locally' }
      return null
    },
  },
  // ---- play / pause ----
  {
    test: (n) => {
      if (/^(play|play it|play the video|start playing|let it play|roll it)\b/.test(n))
        return { intentId: 'play', label: 'Play the timeline', detail: 'Plays the preview from the playhead' }
      if (/^(pause|stop playing|hold it|freeze it|stop the playback)\b/.test(n))
        return { intentId: 'pause', label: 'Pause the preview', detail: 'Pauses playback right here' }
      return null
    },
  },
]

/**
 * Parse a sentence into ONE smart action. Compound sentences stay honest:
 * "make my title bigger and gold" runs the size intent AND carries the color
 * word as `alsoColor` — the executor applies both in the same undo step.
 */
export function parseNL(input: string): NLMatch | null {
  const n = q(input)
  if (n.length < 3) return null
  for (const rule of RULES) {
    const m = rule.test(n)
    if (m) {
      if ((m.intentId === 'title-bigger' || m.intentId === 'title-smaller') && !m.payload?.alsoColor) {
        const cm = n.match(/\b(and|then|also|,|\+)\s*(make it|make the title|turn it|paint it|color it|dye it)?\s*(gold|silver|red|green|blue|pink|purple|orange|yellow|white|black|cyan|magenta|lime|teal|rose|amber|violet)\b/)
        if (cm) {
          m.payload = { ...m.payload, alsoColor: cm[3] }
          m.detail += ` then recolor ${cm[3]} (${COLORS[cm[3]]})`
        }
      }
      return m
    }
  }
  return null
}

/* -------------------------------------------------------------- executor */

/** run the interpreted action against the live store; toast the honest result */
export async function executeNL(m: NLMatch): Promise<boolean> {
  const s = useEditor.getState()
  const p = m.payload ?? {}
  const fail = (msg: string) => {
    toast.error(msg)
    return false
  }
  switch (m.intentId) {
    case 'title-bigger':
    case 'title-smaller': {
      const clip = targetTextClip()
      if (!clip?.textStyle) return fail('No text clip to restyle — add a title first')
      const size = clip.textStyle.fontSize
      const next = clamp(Math.round(m.intentId === 'title-bigger' ? size * 1.2 : size * 0.83), 16, 220)
      if (next === size && !p.alsoColor) return fail('Title size is already at the limit')
      const hex = p.alsoColor ? (COLORS[p.alsoColor] ?? null) : null
      s.updateClip(clip.id, { textStyle: hex ? { fontSize: next, color: hex, gradient: null } : { fontSize: next } }, 'nl-title-style')
      toast.success(hex ? `Title ${next}px and recolored ${p.alsoColor}` : `Title ${m.intentId === 'title-bigger' ? 'grew' : 'shrank'} to ${next}px`)
      return true
    }
    case 'title-color': {
      const clip = targetTextClip()
      if (!clip?.textStyle) return fail('No text clip to recolor — add a title first')
      const hex = COLORS[p.color] ?? '#ffd700'
      s.updateClip(clip.id, { textStyle: { color: hex, gradient: null } }, 'nl-title-color')
      toast.success(`Title recolored ${p.color} (${hex})`)
      return true
    }
    case 'title-bold':
    case 'title-outline':
    case 'title-shadow': {
      const clip = targetTextClip()
      if (!clip?.textStyle) return fail('No text clip to restyle — add a title first')
      const patch =
        m.intentId === 'title-bold'
          ? { bold: true }
          : m.intentId === 'title-outline'
            ? { strokeWidth: Math.max(4, clip.textStyle.strokeWidth), strokeColor: '#000000' }
            : { shadow: true, shadowBlur: Math.max(24, clip.textStyle.shadowBlur) }
      s.updateClip(clip.id, { textStyle: patch }, `nl-${m.intentId}`)
      toast.success(m.label)
      return true
    }
    case 'mute-all':
    case 'unmute-all': {
      const targets = s.project.clips.filter((c) => c.kind === 'audio' || c.kind === 'video')
      if (!targets.length) return fail('No audio/video clips to change')
      s.pushHistory(m.intentId)
      for (const c of targets) s.updateClip(c.id, { muted: m.intentId === 'mute-all' })
      toast.success(m.intentId === 'mute-all' ? `Muted ${targets.length} clip(s)` : `Unmuted ${targets.length} audio-capable clip(s)`)
      return true
    }
    case 'split-here':
      s.splitAtPlayhead()
      toast.success('Split at the playhead')
      return true
    case 'cut-at-beat': {
      if (p.kind === 'beat') {
        const n = s.splitClipsAtBeats(1)
        if (!n) return fail('No music clip to detect beats from — drop a track first')
        toast.success(`Cut ${n} clip(s) on the beat grid`)
        return true
      }
      // chorus → loudest ~2s window of the first real music clip
      const music = s.project.clips.find((c) => c.kind === 'audio' && c.mediaId)
      const blob = music ? s.media.find((a) => a.id === music.mediaId)?.rawBlob : undefined
      if (!blob) return fail('No imported music to analyze — drop a track first')
      const { findChorusStart } = await import('@/lib/effects/beat-detect')
      const t = await findChorusStart(blob)
      if (t == null) return fail('Could not find a chorus in this track')
      const musicStart = music!.start
      const timelineT = musicStart + Math.max(0, t - (music!.trimStart ?? 0))
      s.setCurrentTime(Math.round(timelineT * 100) / 100)
      s.splitAtPlayhead()
      toast.success(`Chorus found at ${timelineT.toFixed(2)}s — clips split there (one undo step)`)
      return true
    }
    case 'volume-up':
    case 'volume-down': {
      const targets = targetAudioClips()
      if (!targets.length) return fail('No audio clips to adjust')
      s.pushHistory(m.intentId)
      const d = m.intentId === 'volume-up' ? 0.1 : -0.1
      for (const c of targets) s.updateClip(c.id, { volume: clamp(Math.round(((c.volume ?? 1) + d) * 100) / 100, 0, 1) })
      toast.success(m.intentId === 'volume-up' ? `Volume +10% on ${targets.length} clip(s)` : `Volume −10% on ${targets.length} clip(s)`)
      return true
    }
    case 'speed-up':
    case 'slow-down': {
      const s2 = useEditor.getState()
      const id = s2.selectedClipIds[0]
      const clip = s2.project.clips.find((c) => c.id === id)
      if (!clip || clip.kind === 'audio' || clip.kind === 'text' || clip.kind === 'sticker') return fail('Select a video or image clip first')
      const next = clamp(Math.round((clip.speed ?? 1) * (m.intentId === 'speed-up' ? 2 : 0.5) * 100) / 100, 0.25, 4)
      if (next === clip.speed) return fail('Clip speed is already at the limit')
      s2.updateClip(id, { speed: next }, `nl-${m.intentId}`)
      toast.success(`Clip speed set to ${next}×`)
      return true
    }
    case 'delete-selected':
      if (!s.selectedClipIds.length) return fail('Nothing selected')
      s.deleteSelected()
      toast.success('Selection deleted — Ctrl+Z restores it')
      return true
    case 'duplicate-selected': {
      if (!s.selectedClipIds.length) return fail('Nothing selected')
      s.duplicateClip(s.selectedClipIds[0])
      toast.success('Clip duplicated')
      return true
    }
    case 'add-title': {
      const text = (p.text ?? '').slice(0, 80)
      if (!text) return fail('Say the title text in quotes — "add a title saying hello"')
      s.addTextClip()
      const id = useEditor.getState().selectedClipIds[0]
      if (!id) return fail('Could not place the text clip')
      useEditor.getState().updateClip(id, { textStyle: { content: text } }, 'nl-add-title')
      toast.success(`Title “${text}” added at the playhead`)
      return true
    }
    case 'fade-in':
    case 'fade-out': {
      const id = s.selectedClipIds[0]
      const clip = s.project.clips.find((c) => c.id === id)
      if (!clip || clip.kind === 'audio' || clip.kind === 'text') return fail('Select a video or image clip first')
      s.updateClip(id, m.intentId === 'fade-in' ? { fadeIn: Math.max(0.8, clip.fadeIn) } : { fadeOut: Math.max(0.8, clip.fadeOut) }, `nl-${m.intentId}`)
      toast.success(m.intentId === 'fade-in' ? 'Fade-in set (≥0.8s)' : 'Fade-out set (≥0.8s)')
      return true
    }
    case 'canvas-vertical':
      s.setCanvasSize(1080, 1920)
      s.setFps(30)
      toast.success('Canvas: 1080×1920 vertical @30fps')
      return true
    case 'canvas-landscape':
      s.setCanvasSize(1920, 1080)
      s.setFps(30)
      toast.success('Canvas: 1920×1080 landscape @30fps')
      return true
    case 'canvas-square':
      s.setCanvasSize(1080, 1080)
      s.setFps(30)
      toast.success('Canvas: 1080×1080 square @30fps')
      return true
    case 'open-export':
      s.pause()
      s.openDialog('export')
      return true
    case 'play':
      s.play()
      return true
    case 'pause':
      s.pause()
      return true
    default:
      return false
  }
}

/* --------------------------------------------------- honest phrasing census */

/**
 * Verifiable phrasing lists for the exit criterion "parses ≥20 phrasings per
 * intent" — E2E runs every string through parseNL and counts hits. Counts
 * below are what the parser ACTUALLY accepts; the receipt never inflates it.
 */
export const NL_PHRASING_EXAMPLES: Record<string, string[]> = {
  'title-bigger': [
    'make my title bigger', 'make the text bigger', 'bigger title please', 'make the font larger',
    'the title is too small', 'make it huge', 'blow up the title', 'increase the font size',
    'scale the text up', 'grow the title', 'enlarge my caption', 'bump the font up',
    'make the heading larger', 'bigger text', 'title should be bigger', 'make it bigger',
    'bump that up', 'scale it up', 'size the text up', 'make the words bigger',
    'xxl title', 'much bigger title', 'turn the text larger', 'make title size up',
  ],
  'title-smaller': [
    'make my title smaller', 'smaller text', 'shrink the title', 'the title is too big',
    'make the font smaller', 'reduce the text size', 'decrease the title size', 'shrink it',
    'make it tiny', 'title should be smaller', 'size the text down', 'make the heading smaller',
    'less big title', 'mini text', 'make the caption smaller', 'turn the title down a bit',
    'reduce font', 'make it smaller', 'shrink the caption', 'decrease font size',
    'smaller please', 'title size down',
  ],
  'title-color': [
    'make the title gold', 'turn the text gold',
    'color the title red', 'paint the text pink', 'make the title green', 'title in blue',
    'make it purple', 'text should be orange', 'make my heading white', 'black text please',
    'cyan title', 'make the caption teal', 'yellow title', 'set the text to amber',
    'make the title violet', 'silver text', 'lime title', 'magenta text', 'rose title',
    'make the text magenta', 'dye the title red',
  ],
  'cut-at-beat': [
    'cut at the chorus', 'split at the chorus', 'cut on the beat', 'cut at the drop',
    'slice at the chorus', 'split on the beat', 'make cuts on the beat', 'cut to the beat',
    'sync cuts with the music', 'cut at the bass drop', 'split at the drop', 'slice on the beat',
    'cut with the rhythm', 'split to the music', 'make cuts to the beat', 'cut in sync with the beat',
    'chop it on the beat', 'cut on the bass', 'edit to the beat', 'beat sync my cuts',
    'split with the rhythm', 'cut at the music',
  ],
  'mute-all': [
    'mute everything', 'mute all clips', 'silence the audio', 'silence everything',
    'no sound please', 'kill the audio', 'mute the music', 'sound off', 'audio off',
    'turn the audio off', 'turn the music off', 'turn it off', 'mute it', 'mute the sound',
    'silence the music', 'kill the music', 'kill the sound', 'mute the video audio',
    'all sound off', 'silence it', 'make it silent', 'cut the sound',
  ],
  'split-here': [
    'cut here', 'split here', 'slice here', 'cut it here', 'split the clip here',
    'make a cut here', 'razor here', 'cut at the playhead', 'split at the playhead',
    'cut right here', 'split it now', 'cut the clip here', 'split the clip at the playhead',
    'cut it in half', 'split it in half', 'cut into two', 'split into two',
    'cut now', 'slice it here', 'razor the clip here', 'cut this here', 'split right here',
  ],
}

/** test seam for E2E receipts (window-gated, client-only module) */
if (typeof window !== 'undefined') {
  ;(window as unknown as { __ncNL?: { parseNL: typeof parseNL; executeNL: typeof executeNL; NL_PHRASING_EXAMPLES: typeof NL_PHRASING_EXAMPLES } }).__ncNL = {
    parseNL,
    executeNL,
    NL_PHRASING_EXAMPLES,
  }
}
