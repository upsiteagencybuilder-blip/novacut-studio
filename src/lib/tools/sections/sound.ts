import type { ProTool } from '../types'

/**
 * Pro Toolkit — sound section.
 * Audio post tools mapped to NovaCut: per-clip audio FX chain (pan, 3-band EQ,
 * high/low-pass, compressor, convolution reverb, delay, chorus/flanger/phaser)
 * built by the engine for preview + export, per-clip volume with keyframes,
 * track mixer with solo, per-track meters and a live master meter, auto-duck
 * with depth control, beat-sync markers, voice FX DSP chain and offline
 * procedural SFX/music renderers.
 */

export const SOUND_TOOLS: ProTool[] = [
  // -------- EQ & filters --------
  { id: 'sound-parametric-equalizer', name: 'Parametric Equalizer', section: 'sound', group: 'EQ & filters', status: 'live', desc: 'Audio FX 3-band EQ — low shelf, mid peak, high shelf — on any clip' },
  { id: 'sound-graphic-equalizer', name: 'Graphic Equalizer', section: 'sound', group: 'EQ & filters', status: 'live', desc: 'Three EQ sliders (±24dB) for broad tonal shaping per clip' },
  { id: 'sound-high-pass-filter', name: 'High Pass Filter', section: 'sound', group: 'EQ & filters', status: 'live', desc: 'Cut rumble and wind below a chosen frequency (Audio FX Cut Low)' },
  { id: 'sound-low-pass-filter', name: 'Low Pass Filter', section: 'sound', group: 'EQ & filters', status: 'live', desc: 'Roll off highs for muffled or distant perspectives (Audio FX Cut High)' },
  { id: 'sound-notch-filter', name: 'Notch Filter', section: 'sound', group: 'EQ & filters', status: 'planned', desc: 'Surgically remove a narrow whine or hum band' },

  // -------- Dynamics --------
  { id: 'sound-dynamic-compressor', name: 'Dynamic Compressor', section: 'sound', group: 'Dynamics', status: 'live', desc: 'Per-clip compressor with amount control in the Audio FX chain' },
  { id: 'sound-multiband-compressor', name: 'Multiband Compressor', section: 'sound', group: 'Dynamics', status: 'planned', desc: 'Compress low, mid and high bands independently' },
  { id: 'sound-limiter', name: 'Limiter', section: 'sound', group: 'Dynamics', status: 'planned', desc: 'True brickwall limiting beyond the soft master limiter stays roadmap' },
  { id: 'sound-hard-limiter', name: 'Hard Limiter', section: 'sound', group: 'Dynamics', status: 'planned', desc: 'Clamp peaks hard at a ceiling with lookahead' },
  { id: 'sound-vocal-enhancer', name: 'Vocal Enhancer', section: 'sound', group: 'Dynamics', status: 'live', desc: 'Dialogue Clarity preset — high-pass + presence EQ + compressor' },
  { id: 'sound-de-esser', name: 'De-Esser', section: 'sound', group: 'Dynamics', status: 'planned', desc: 'Tame harsh sibilance in the 5 to 8 kHz range' },

  // -------- Restoration --------
  { id: 'sound-de-hummer', name: 'De-Hummer', section: 'sound', group: 'Restoration', status: 'planned', desc: 'Remove mains hum and its harmonics automatically' },
  { id: 'sound-de-reverb-tool', name: 'De-Reverb Tool', section: 'sound', group: 'Restoration', status: 'planned', desc: 'Reduce room echo captured in difficult locations' },
  { id: 'sound-de-noise-tool', name: 'De-Noise Tool', section: 'sound', group: 'Restoration', status: 'planned', desc: 'Learn a noise print and subtract it from dialogue' },
  { id: 'sound-noise-gate', name: 'Noise Gate', section: 'sound', group: 'Restoration', status: 'planned', desc: 'Silence the signal below an adjustable threshold' },
  { id: 'sound-expander', name: 'Expander', section: 'sound', group: 'Restoration', status: 'planned', desc: 'Push quiet noise further down for gentler gating' },

  // -------- Reverb & delay --------
  { id: 'sound-studio-reverb', name: 'Studio Reverb', section: 'sound', group: 'Reverb & delay', status: 'live', desc: 'Convolution reverb per clip with Room / Hall / Stadium sizes' },
  { id: 'sound-surround-reverb', name: 'Surround Reverb', section: 'sound', group: 'Reverb & delay', status: 'planned', desc: 'Multichannel reverb tails for 5.1 and 7.1 mixes' },
  { id: 'sound-convolution-reverb', name: 'Convolution Reverb', section: 'sound', group: 'Reverb & delay', status: 'planned', desc: 'Impulse-response reverb sampled from real spaces (generated IR ships today)' },
  { id: 'sound-delay-effect', name: 'Delay Effect', section: 'sound', group: 'Reverb & delay', status: 'live', desc: 'Feedback delay unit with time, repeat and wet mix per clip' },
  { id: 'sound-analog-delay', name: 'Analog Delay', section: 'sound', group: 'Reverb & delay', status: 'planned', desc: 'Tape-style delay with drift, wow and saturation' },

  // -------- Modulation --------
  { id: 'sound-chorus-effect', name: 'Chorus Effect', section: 'sound', group: 'Modulation', status: 'live', desc: 'Detuned doubled copies thicken voices (Audio FX Modulate: Chorus)' },
  { id: 'sound-flanger', name: 'Flanger', section: 'sound', group: 'Modulation', status: 'live', desc: 'Sweeping comb-filter jet effect (Audio FX Modulate: Flanger)' },
  { id: 'sound-phaser', name: 'Phaser', section: 'sound', group: 'Modulation', status: 'live', desc: 'Cascaded allpass sweeps for swooshy texture (Audio FX Modulate: Phaser)' },

  // -------- Pitch & time --------
  { id: 'sound-pitch-shifter', name: 'Pitch Shifter', section: 'sound', group: 'Pitch & time', status: 'live', desc: 'Per-clip granular pitch shift −12..+12 semitones with tempo preserved and a wet/dry mix knob — heard in preview, baked into audio + video exports', action: 'open-properties-audiofx' },
  { id: 'sound-voice-formant-shifter', name: 'Voice Formant Shifter', section: 'sound', group: 'Pitch & time', status: 'live', desc: 'STFT cepstral formant shift ±12 semitones in the Voice Chain — vocal-tract resonances move while pitch and tempo stay put; heard in preview, baked into exports', action: 'open-properties-audiofx' },
  { id: 'sound-voice-tempo-control', name: 'Voice Tempo Control', section: 'sound', group: 'Pitch & time', status: 'live', desc: 'Voice Chain tempo slider retimes extracted audio 0.5–2× with duration compensation in one undoable step', action: 'open-properties-audiofx' },
  { id: 'sound-per-effect-controls', name: 'Per-Effect Custom Controls', section: 'sound', group: 'Pitch & time', status: 'live', desc: 'Every audio FX owns its parameters — pitch semitones + blend, reverb room size, delay time/repeat, comp amount, mod depth, 3-band EQ — all inline in Properties → Audio FX', action: 'open-properties-audiofx' },
  { id: 'sound-time-stretch', name: 'Time Stretch (Audio)', section: 'sound', group: 'Pitch & time', status: 'live', desc: 'Speed slider and presets retime audio clips with duration compensation', action: 'open-effects' },

  // -------- Mixing & routing --------
  { id: 'sound-gain-control-slider', name: 'Gain Control Slider', section: 'sound', group: 'Mixing & routing', status: 'live', desc: 'Volume slider per clip plus master volume in the audio panel' },
  { id: 'sound-volume-keyframe-tool', name: 'Volume Keyframe Tool', section: 'sound', group: 'Mixing & routing', status: 'live', desc: 'Keyframe volume like any property, easing applies between keys' },
  { id: 'sound-audio-fades', name: 'Audio Fade In / Out', section: 'sound', group: 'Mixing & routing', status: 'live', desc: 'Per-clip gain ramps drawn as fade wedges on the timeline', action: 'open-effects' },
  { id: 'sound-pan-slider', name: 'Pan Slider (Left/Right)', section: 'sound', group: 'Mixing & routing', status: 'live', desc: 'Balance a clip across the stereo field (Audio FX Pan)' },
  { id: 'sound-surround-panner', name: 'Surround Panner (5.1/7.1)', section: 'sound', group: 'Mixing & routing', status: 'planned', desc: 'Position sounds around multichannel speaker layouts' },
  { id: 'sound-audio-track-mixer', name: 'Audio Track Mixer', section: 'sound', group: 'Mixing & routing', status: 'live', desc: 'Mixer faders, mute, solo headphones, per-track meters and a live master meter', action: 'open-mixer' },
  { id: 'sound-audio-submix-track', name: 'Audio Submix Track', section: 'sound', group: 'Mixing & routing', status: 'planned', desc: 'Group tracks into a submix bus with one fader' },
  { id: 'sound-audio-bus-track', name: 'Audio Bus Track', section: 'sound', group: 'Mixing & routing', status: 'planned', desc: 'Route stems through buses for shared processing' },
  { id: 'sound-master-audio-track', name: 'Master Audio Track', section: 'sound', group: 'Mixing & routing', status: 'live', desc: 'Master volume slider and mute sit in the audio panel', action: 'open-audio' },
  { id: 'sound-mute-toggle', name: 'Mute Toggle (M)', section: 'sound', group: 'Mixing & routing', status: 'live', desc: 'Press M to mute or unmute the selected clip' },
  { id: 'sound-solo-toggle', name: 'Solo Toggle (Headphones)', section: 'sound', group: 'Mixing & routing', status: 'live', desc: 'Mixer headphone buttons isolate one track during playback', action: 'open-mixer' },
  { id: 'sound-record-enable-toggle', name: 'Record Enable Toggle (R)', section: 'sound', group: 'Mixing & routing', status: 'planned', desc: 'Arm individual tracks for per-track recording' },

  // -------- Meters & analysis --------
  { id: 'sound-audio-meters-panel', name: 'Audio Meters Panel', section: 'sound', group: 'Meters & analysis', status: 'live', desc: 'Mixer draws live per-track meters plus a master meter', action: 'open-mixer' },
  { id: 'sound-vu-meter', name: 'VU Meter', section: 'sound', group: 'Meters & analysis', status: 'live', desc: 'Master meter with dB tick scale and falling peak hold', action: 'open-mixer' },
  { id: 'sound-loudness-radar-meter', name: 'Loudness Radar Meter', section: 'sound', group: 'Meters & analysis', status: 'planned', desc: 'Track program loudness over time against a target' },
  { id: 'sound-lufs-indicator', name: 'LUFS Indicator', section: 'sound', group: 'Meters & analysis', status: 'planned', desc: 'Integrated LUFS number for streaming delivery specs' },
  { id: 'sound-true-peak-meter', name: 'True Peak Meter', section: 'sound', group: 'Meters & analysis', status: 'planned', desc: 'Oversampled peak readings to prevent encoder clipping' },

  // -------- Sync & post --------
  { id: 'sound-foley-sampler', name: 'Foley Sampler', section: 'sound', group: 'Sync & post', status: 'planned', desc: 'Pad-based performance instrument for triggering foley hits' },
  { id: 'sound-audio-sync-tool', name: 'Audio Sync Tool (Waveform Matching)', section: 'sound', group: 'Sync & post', status: 'planned', desc: 'Align clips by matching their waveforms automatically' },
  { id: 'sound-ltc-timecode-reader', name: 'LTC Timecode Reader', section: 'sound', group: 'Sync & post', status: 'planned', desc: 'Decode linear timecode from an audio track' },
  { id: 'sound-audio-ducking-controls', name: 'Audio Ducking Controls', section: 'sound', group: 'Sync & post', status: 'live', desc: 'Auto-duck toggle in clip properties ducks music under dialogue' },
  { id: 'sound-extract-audio', name: 'Extract Audio (Detach)', section: 'sound', group: 'Sync & post', status: 'live', desc: 'Detach the video soundtrack into an editable audio clip in one click — Extract & edit voice lands straight on the Voice Chain (pitch / tempo / formant)' },
  { id: 'sound-essential-sound-panel', name: 'Essential Sound Panel', section: 'sound', group: 'Sync & post', status: 'planned', desc: 'Tag-based sound workflow stays roadmap, voice FX cover enhancement' },
  { id: 'sound-dialogue-enhancer', name: 'Dialogue Enhancer', section: 'sound', group: 'Sync & post', status: 'live', desc: 'Dialogue Clarity audio FX preset plus voice FX enhancer presets' },
  { id: 'sound-music-ducking-threshold', name: 'Music Ducking Depth', section: 'sound', group: 'Sync & post', status: 'live', desc: 'Duck depth slider sets how far music drops under video audio' },
  { id: 'sound-sfx-spatializer', name: 'SFX Spatializer', section: 'sound', group: 'Sync & post', status: 'planned', desc: 'Place effects in simulated 3D space around the listener' },
  { id: 'sound-ambience-matcher', name: 'Ambience Matcher', section: 'sound', group: 'Sync & post', status: 'planned', desc: 'Match room tone across cuts for seamless dialogue' },
]
