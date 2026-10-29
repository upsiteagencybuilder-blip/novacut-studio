import type { ProTool } from '../types'

/**
 * Pro Toolkit — ai section.
 * AI features mapped to NovaCut's on-device AI panel: the conversational
 * copilot, auto captions (+ transcript translation), silence detection cut,
 * audio enhance, text-to-speech voiceover, AI image B-roll and the procedural
 * music generator; the per-clip chroma keyer also lives here.
 */

export const AI_TOOLS: ProTool[] = [
  // -------- AI editing --------
  { id: 'ai-copilot-editing', name: 'AI Copilot v2', section: 'ai', group: 'AI editing', status: 'live', desc: 'One chat instruction runs a full multi-step edit sequence — titles, stickers, looks, motion, crossfades, fades, PiP transforms, adjustment layers, trim/duplicate — applied as ONE undoable step with follow-up conversation memory', action: 'open-ai' },
  { id: 'ai-text-to-video', name: 'AI Text-to-Video', section: 'ai', group: 'AI editing', status: 'live', desc: 'AI image B-roll from prompts, generated straight into the media library', action: 'open-ai' },
  { id: 'ai-smart-cutout', name: 'AI Smart Cutout', section: 'ai', group: 'AI editing', status: 'planned', desc: 'Lift subjects from footage with AI segmentation' },
  { id: 'ai-motion-tracking', name: 'AI Motion Tracking', section: 'ai', group: 'AI editing', status: 'planned', desc: 'Track subjects automatically to pin elements on them' },
  { id: 'ai-portrait', name: 'AI Portrait', section: 'ai', group: 'AI editing', status: 'planned', desc: 'Skin-aware portrait retouching and relighting' },
  { id: 'ai-auto-reframe', name: 'AI Auto Reframe', section: 'ai', group: 'AI editing', status: 'planned', desc: 'Re-crop widescreen footage for vertical using subject tracking' },

  // -------- AI cleanup --------
  { id: 'ai-bg-removal-auto', name: 'One-Tap Background Removal', section: 'ai', group: 'AI cleanup', status: 'live', desc: 'Auto-detects the dominant border color of the frame and applies a tuned chroma key (tolerance from backdrop spread, spill cleanup) in one tap — honest chroma-based detection, all controls stay editable', action: 'open-properties-chroma' },
  { id: 'ai-object-remove', name: 'AI Object Remove', section: 'ai', group: 'AI cleanup', status: 'planned', desc: 'Erase objects and let AI inpaint the background' },
  { id: 'ai-silence-detection', name: 'AI Silence Detection', section: 'ai', group: 'AI cleanup', status: 'live', desc: 'Silence cut panel detects gaps and ripple-removes them on device', action: 'open-ai' },
  { id: 'ai-audio-denoise', name: 'AI Audio Denoise', section: 'ai', group: 'AI cleanup', status: 'live', desc: 'One-tap speech cleanup — de-rumble EQ, de-hiss top and gentle compression', action: 'open-ai' },

  // -------- AI audio --------
  { id: 'ai-vocal-remover', name: 'AI Vocal Remover', section: 'ai', group: 'AI audio', status: 'planned', desc: 'Split songs into instrumental and vocal stems' },
  { id: 'ai-audio-stretch', name: 'AI Audio Stretch', section: 'ai', group: 'AI audio', status: 'planned', desc: 'Change narration length without pitch artifacts' },
  { id: 'ai-music-generator', name: 'AI Music Generator', section: 'ai', group: 'AI audio', status: 'beta', desc: 'Sixty four procedural music tracks render straight into the library' },

  // -------- AI captions & voice --------
  { id: 'ai-speech-to-text', name: 'AI Speech-to-Text (Auto Caption)', section: 'ai', group: 'AI captions & voice', status: 'live', desc: 'Auto captions transcribe the selected clip into styled caption clips', action: 'open-ai' },
  { id: 'ai-text-to-speech', name: 'AI Text-to-Speech (TTS)', section: 'ai', group: 'AI captions & voice', status: 'live', desc: 'AI voiceover turns scripts into narrated audio, chunked automatically', action: 'open-ai' },
  { id: 'ai-caption-translate', name: 'AI Caption Translate', section: 'ai', group: 'AI captions & voice', status: 'live', desc: 'Translate transcripts to Bangla, English, Hindi and more before captioning', action: 'open-ai' },

  // -------- Utility AI --------
  { id: 'ai-chroma-key', name: 'Chroma Key (Green Screen)', section: 'ai', group: 'Utility AI', status: 'live', desc: 'Chroma section in clip properties keys green, blue or custom colors with spill suppression and edge shaping' },
  { id: 'ai-video-stabilizer', name: 'Video Stabilizer', section: 'ai', group: 'Utility AI', status: 'planned', desc: 'Analyze and smooth shaky handheld footage automatically' },
  { id: 'ai-keyframing-panel', name: 'Keyframing Panel', section: 'ai', group: 'Utility AI', status: 'live', desc: 'Keyframe cards per property add keys with easing at the playhead' },
  { id: 'ai-masking-tool', name: 'Masking Tool', section: 'ai', group: 'Utility AI', status: 'planned', desc: 'Draw and track masks for localized effects' },
]
