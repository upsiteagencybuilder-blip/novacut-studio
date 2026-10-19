import type { ProTool } from '../types'

/**
 * Pro Toolkit — sound section.
 * Audio post tools mapped to NovaCut: per-clip volume with keyframes, track
 * mixer with live meter, auto-duck, voice FX DSP chain (tilt EQ, reverb,
 * echo, tremolo, granular pitch shift) and the master soft-limiter in the
 * render chain.
 */

export const SOUND_TOOLS: ProTool[] = [
  // -------- EQ & filters --------
  { id: 'sound-parametric-equalizer', name: 'Parametric Equalizer', section: 'sound', group: 'EQ & filters', status: 'beta', desc: 'Voice FX chain applies a tilt EQ to processed audio clips' },
  { id: 'sound-graphic-equalizer', name: 'Graphic Equalizer', section: 'sound', group: 'EQ & filters', status: 'planned', desc: 'Fixed-band sliders for broad tonal shaping' },
  { id: 'sound-high-pass-filter', name: 'High Pass Filter', section: 'sound', group: 'EQ & filters', status: 'planned', desc: 'Cut rumble and wind below a chosen frequency' },
  { id: 'sound-low-pass-filter', name: 'Low Pass Filter', section: 'sound', group: 'EQ & filters', status: 'planned', desc: 'Roll off highs for muffled or distant perspectives' },
  { id: 'sound-notch-filter', name: 'Notch Filter', section: 'sound', group: 'EQ & filters', status: 'planned', desc: 'Surgically remove a narrow whine or hum band' },

  // -------- Dynamics --------
  { id: 'sound-dynamic-compressor', name: 'Dynamic Compressor', section: 'sound', group: 'Dynamics', status: 'beta', desc: 'Master render chain runs a soft compressor before output' },
  { id: 'sound-multiband-compressor', name: 'Multiband Compressor', section: 'sound', group: 'Dynamics', status: 'planned', desc: 'Compress low, mid and high bands independently' },
  { id: 'sound-limiter', name: 'Limiter', section: 'sound', group: 'Dynamics', status: 'planned', desc: 'True brickwall limiting beyond the soft master limiter stays roadmap' },
  { id: 'sound-hard-limiter', name: 'Hard Limiter', section: 'sound', group: 'Dynamics', status: 'planned', desc: 'Clamp peaks hard at a ceiling with lookahead' },
  { id: 'sound-vocal-enhancer', name: 'Vocal Enhancer', section: 'sound', group: 'Dynamics', status: 'planned', desc: 'One-knob dialogue presence and warmth optimization' },
  { id: 'sound-de-esser', name: 'De-Esser', section: 'sound', group: 'Dynamics', status: 'planned', desc: 'Tame harsh sibilance in the 5 to 8 kHz range' },

  // -------- Restoration --------
  { id: 'sound-de-hummer', name: 'De-Hummer', section: 'sound', group: 'Restoration', status: 'planned', desc: 'Remove mains hum and its harmonics automatically' },
  { id: 'sound-de-reverb-tool', name: 'De-Reverb Tool', section: 'sound', group: 'Restoration', status: 'planned', desc: 'Reduce room echo captured in difficult locations' },
  { id: 'sound-de-noise-tool', name: 'De-Noise Tool', section: 'sound', group: 'Restoration', status: 'planned', desc: 'Learn a noise print and subtract it from dialogue' },
  { id: 'sound-noise-gate', name: 'Noise Gate', section: 'sound', group: 'Restoration', status: 'planned', desc: 'Silence the signal below an adjustable threshold' },
  { id: 'sound-expander', name: 'Expander', section: 'sound', group: 'Restoration', status: 'planned', desc: 'Push quiet noise further down for gentler gating' },

  // -------- Reverb & delay --------
  { id: 'sound-studio-reverb', name: 'Studio Reverb', section: 'sound', group: 'Reverb & delay', status: 'planned', desc: 'A dedicated reverb unit beyond the voice FX reverb stage' },
  { id: 'sound-surround-reverb', name: 'Surround Reverb', section: 'sound', group: 'Reverb & delay', status: 'planned', desc: 'Multichannel reverb tails for 5.1 and 7.1 mixes' },
  { id: 'sound-convolution-reverb', name: 'Convolution Reverb', section: 'sound', group: 'Reverb & delay', status: 'planned', desc: 'Impulse-response reverb sampled from real spaces' },
  { id: 'sound-delay-effect', name: 'Delay Effect', section: 'sound', group: 'Reverb & delay', status: 'planned', desc: 'Standalone delay unit with feedback and filtering' },
  { id: 'sound-analog-delay', name: 'Analog Delay', section: 'sound', group: 'Reverb & delay', status: 'planned', desc: 'Tape-style delay with drift, wow and saturation' },

  // -------- Modulation --------
  { id: 'sound-chorus-effect', name: 'Chorus Effect', section: 'sound', group: 'Modulation', status: 'planned', desc: 'Thicken voices with detuned doubled copies' },
  { id: 'sound-flanger', name: 'Flanger', section: 'sound', group: 'Modulation', status: 'planned', desc: 'Sweeping comb-filter jet effect for movement' },
  { id: 'sound-phaser', name: 'Phaser', section: 'sound', group: 'Modulation', status: 'planned', desc: 'Cascaded notch sweeps for swooshy texture' },

  // -------- Pitch & time --------
  { id: 'sound-pitch-shifter', name: 'Pitch Shifter', section: 'sound', group: 'Pitch & time', status: 'beta', desc: 'Granular pitch shift ships inside the voice FX processor' },
  { id: 'sound-time-stretch', name: 'Time Stretch (Audio)', section: 'sound', group: 'Pitch & time', status: 'live', desc: 'Speed slider and presets retime audio clips with duration compensation', action: 'open-effects' },

  // -------- Mixing & routing --------
  { id: 'sound-gain-control-slider', name: 'Gain Control Slider', section: 'sound', group: 'Mixing & routing', status: 'live', desc: 'Volume slider per clip plus master volume in the audio panel' },
  { id: 'sound-volume-keyframe-tool', name: 'Volume Keyframe Tool', section: 'sound', group: 'Mixing & routing', status: 'live', desc: 'Keyframe volume like any property, easing applies between keys' },
  { id: 'sound-pan-slider', name: 'Pan Slider (Left/Right)', section: 'sound', group: 'Mixing & routing', status: 'planned', desc: 'Balance a clip across the stereo field' },
  { id: 'sound-surround-panner', name: 'Surround Panner (5.1/7.1)', section: 'sound', group: 'Mixing & routing', status: 'planned', desc: 'Position sounds around multichannel speaker layouts' },
  { id: 'sound-audio-track-mixer', name: 'Audio Track Mixer', section: 'sound', group: 'Mixing & routing', status: 'live', desc: 'Mixer dialog faders, mute switches and a live master meter', action: 'open-mixer' },
  { id: 'sound-audio-submix-track', name: 'Audio Submix Track', section: 'sound', group: 'Mixing & routing', status: 'planned', desc: 'Group tracks into a submix bus with one fader' },
  { id: 'sound-audio-bus-track', name: 'Audio Bus Track', section: 'sound', group: 'Mixing & routing', status: 'planned', desc: 'Route stems through buses for shared processing' },
  { id: 'sound-master-audio-track', name: 'Master Audio Track', section: 'sound', group: 'Mixing & routing', status: 'live', desc: 'Master volume slider and mute sit in the audio panel', action: 'open-audio' },
  { id: 'sound-mute-toggle', name: 'Mute Toggle (M)', section: 'sound', group: 'Mixing & routing', status: 'live', desc: 'Press M to mute or unmute the selected clip' },
  { id: 'sound-solo-toggle', name: 'Solo Toggle (S)', section: 'sound', group: 'Mixing & routing', status: 'planned', desc: 'Isolate one track or clip while everything else ducks' },
  { id: 'sound-record-enable-toggle', name: 'Record Enable Toggle (R)', section: 'sound', group: 'Mixing & routing', status: 'planned', desc: 'Arm individual tracks for per-track recording' },

  // -------- Meters & analysis --------
  { id: 'sound-audio-meters-panel', name: 'Audio Meters Panel', section: 'sound', group: 'Meters & analysis', status: 'live', desc: 'Mixer dialog draws a live master peak meter from the engine', action: 'open-mixer' },
  { id: 'sound-vu-meter', name: 'VU Meter', section: 'sound', group: 'Meters & analysis', status: 'planned', desc: 'Ballistic VU needle response for analog-style leveling' },
  { id: 'sound-loudness-radar-meter', name: 'Loudness Radar Meter', section: 'sound', group: 'Meters & analysis', status: 'planned', desc: 'Track program loudness over time against a target' },
  { id: 'sound-lufs-indicator', name: 'LUFS Indicator', section: 'sound', group: 'Meters & analysis', status: 'planned', desc: 'Integrated LUFS number for streaming delivery specs' },
  { id: 'sound-true-peak-meter', name: 'True Peak Meter', section: 'sound', group: 'Meters & analysis', status: 'planned', desc: 'Oversampled peak readings to prevent encoder clipping' },

  // -------- Sync & post --------
  { id: 'sound-foley-sampler', name: 'Foley Sampler', section: 'sound', group: 'Sync & post', status: 'planned', desc: 'Pad-based performance instrument for triggering foley hits' },
  { id: 'sound-audio-sync-tool', name: 'Audio Sync Tool (Waveform Matching)', section: 'sound', group: 'Sync & post', status: 'planned', desc: 'Align clips by matching their waveforms automatically' },
  { id: 'sound-ltc-timecode-reader', name: 'LTC Timecode Reader', section: 'sound', group: 'Sync & post', status: 'planned', desc: 'Decode linear timecode from an audio track' },
  { id: 'sound-audio-ducking-controls', name: 'Audio Ducking Controls', section: 'sound', group: 'Sync & post', status: 'live', desc: 'Auto-duck toggle in clip properties ducks music under dialogue' },
  { id: 'sound-essential-sound-panel', name: 'Essential Sound Panel', section: 'sound', group: 'Sync & post', status: 'planned', desc: 'Tag-based sound workflow stays roadmap, voice FX cover enhancement' },
  { id: 'sound-dialogue-enhancer', name: 'Dialogue Enhancer', section: 'sound', group: 'Sync & post', status: 'beta', desc: 'Voice FX enhancer presets brighten and clean dialogue clips' },
  { id: 'sound-music-ducking-threshold', name: 'Music Ducking Threshold', section: 'sound', group: 'Sync & post', status: 'planned', desc: 'Set sensitivity, attack and release for auto ducking' },
  { id: 'sound-sfx-spatializer', name: 'SFX Spatializer', section: 'sound', group: 'Sync & post', status: 'planned', desc: 'Place effects in simulated 3D space around the listener' },
  { id: 'sound-ambience-matcher', name: 'Ambience Matcher', section: 'sound', group: 'Sync & post', status: 'planned', desc: 'Match room tone across cuts for seamless dialogue' },
]
