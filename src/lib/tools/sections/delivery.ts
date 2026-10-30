import type { ProTool } from '../types'

/**
 * Pro Toolkit — delivery section.
 * Export and delivery tools mapped to the ExportDialog: WebM (VP9/VP8) and
 * MP4 (H.264) via MediaRecorder, quality presets + free bitrate slider, fps,
 * custom resolution, audio-track bitrate, timecode burn-in, platform canvas
 * presets, an OFFLINE audio mixdown (WAV / MP3, faster than real time) and an
 * .srt caption sidecar — plus a live estimated file size.
 */

export const DELIVERY_TOOLS: ProTool[] = [
  // -------- Formats & containers --------
  { id: 'delivery-media-encoder-queue', name: 'Media Encoder Queue', section: 'delivery', group: 'Formats & containers', status: 'planned', desc: 'Batch export queue that renders while you keep editing' },
  { id: 'delivery-format-dropdown', name: 'Format Dropdown', section: 'delivery', group: 'Formats & containers', status: 'live', desc: 'Pick WebM VP9 or MP4 H.264 in the format dropdown', action: 'open-export' },
  { id: 'delivery-mov-container', name: 'QuickTime Container (.mov)', section: 'delivery', group: 'Formats & containers', status: 'planned', desc: 'QuickTime wrapper for ProRes and editorial mezzanines' },
  { id: 'delivery-mp4-container', name: 'MPEG-4 Container (.mp4)', section: 'delivery', group: 'Formats & containers', status: 'live', desc: 'MP4 is the second export format alongside WebM' },
  { id: 'delivery-mxf-container', name: 'Material Exchange Format (.mxf)', section: 'delivery', group: 'Formats & containers', status: 'planned', desc: 'Broadcast-standard MXF wrappers for station delivery' },
  { id: 'delivery-avi-container', name: 'Audio Video Interleave (.avi)', section: 'delivery', group: 'Formats & containers', status: 'planned', desc: 'Legacy AVI container for legacy pipelines' },

  // -------- Codecs --------
  { id: 'delivery-h264-encoder', name: 'H.264 Encoder', section: 'delivery', group: 'Codecs', status: 'live', desc: 'MP4 export uses the browser H.264 encoder when supported' },
  { id: 'delivery-hevc-encoder', name: 'HEVC / H.265 Encoder', section: 'delivery', group: 'Codecs', status: 'planned', desc: 'Half-bitrate successor codec for 4K delivery' },
  { id: 'delivery-prores-encoder', name: 'Apple ProRes Encoder', section: 'delivery', group: 'Codecs', status: 'planned', desc: 'Apple mezzanine codec family for finishing' },
  { id: 'delivery-prores-422-proxy', name: 'ProRes 422 Proxy', section: 'delivery', group: 'Codecs', status: 'planned', desc: 'Lightest ProRes tier for offline editorial' },
  { id: 'delivery-prores-422-lt', name: 'ProRes 422 LT', section: 'delivery', group: 'Codecs', status: 'planned', desc: 'Lightweight ProRes for smaller master files' },
  { id: 'delivery-prores-422', name: 'ProRes 422', section: 'delivery', group: 'Codecs', status: 'planned', desc: 'Standard ProRes mezzanine for post houses' },
  { id: 'delivery-prores-422-hq', name: 'ProRes 422 HQ', section: 'delivery', group: 'Codecs', status: 'planned', desc: 'Higher-bitrate ProRes for demanding grades' },
  { id: 'delivery-prores-4444', name: 'ProRes 4444', section: 'delivery', group: 'Codecs', status: 'planned', desc: 'ProRes with alpha channel for graphics handoffs' },
  { id: 'delivery-prores-4444-xq', name: 'ProRes 4444 XQ', section: 'delivery', group: 'Codecs', status: 'planned', desc: 'Maximum-fidelity ProRes for heavy grading' },
  { id: 'delivery-dnxhd-encoder', name: 'Avid DNxHD Encoder', section: 'delivery', group: 'Codecs', status: 'planned', desc: 'Avid HD mezzanine codec for Media Composer' },
  { id: 'delivery-dnxhr-encoder', name: 'Avid DNxHR Encoder', section: 'delivery', group: 'Codecs', status: 'planned', desc: 'Resolution-independent Avid finishing codec' },
  { id: 'delivery-cineform-encoder', name: 'GoPro CineForm Encoder', section: 'delivery', group: 'Codecs', status: 'planned', desc: 'Visually lossless CineForm wavelet codec' },

  // -------- Export settings --------
  { id: 'delivery-export-settings-dialogue', name: 'Export Settings Dialogue', section: 'delivery', group: 'Export settings', status: 'live', desc: 'Export dialog covers format, quality, bitrate, fps, resolution, audio and presets', action: 'open-export' },
  { id: 'delivery-preset-dropdown', name: 'Preset Dropdown', section: 'delivery', group: 'Export settings', status: 'live', desc: 'Quality tiers (Draft→Ultra) and platform presets drive the render settings', action: 'open-export' },
  { id: 'delivery-export-preset-manager', name: 'Export Preset Manager (Bundles)', section: 'delivery', group: 'Export settings', status: 'live', desc: 'Named savable bundles — YouTube / Reels / TikTok / Square stock + custom capture of resolution·fps·bitrate·format·audio·burn-in, one-click apply, star-to-default auto-applies on open, delete customs, localStorage persistence', action: 'open-export' },
  { id: 'delivery-frame-rate-dropdown', name: 'Frame Rate Dropdown', section: 'delivery', group: 'Export settings', status: 'live', desc: 'Choose 24, 30 or 60 fps in the export dialog', action: 'open-export' },
  { id: 'delivery-resolution-width-input', name: 'Resolution Width Input', section: 'delivery', group: 'Export settings', status: 'live', desc: 'Type a custom width up to 7680 in the dialog', action: 'open-export' },
  { id: 'delivery-resolution-height-input', name: 'Resolution Height Input', section: 'delivery', group: 'Export settings', status: 'live', desc: 'Paired height input accepts any value from 16 upward', action: 'open-export' },
  { id: 'delivery-field-order-dropdown', name: 'Field Order Dropdown', section: 'delivery', group: 'Export settings', status: 'planned', desc: 'Interlaced field order control for broadcast masters' },
  { id: 'delivery-progressive-scan-toggle', name: 'Progressive Scan Toggle', section: 'delivery', group: 'Export settings', status: 'planned', desc: 'Switch between progressive and interlaced output' },
  { id: 'delivery-upper-field-first-toggle', name: 'Upper Field First Toggle', section: 'delivery', group: 'Export settings', status: 'planned', desc: 'Set upper-field dominance for legacy interlace' },
  { id: 'delivery-lower-field-first-toggle', name: 'Lower Field First Toggle', section: 'delivery', group: 'Export settings', status: 'planned', desc: 'Set lower-field dominance for legacy interlace' },
  { id: 'delivery-pixel-aspect-ratio', name: 'Pixel Aspect Ratio Selector', section: 'delivery', group: 'Export settings', status: 'planned', desc: 'Non-square pixel ratios for SD and anamorphic' },
  { id: 'delivery-source-scaling', name: 'Source Scaling Dropdown', section: 'delivery', group: 'Export settings', status: 'planned', desc: 'Choose how clips fit when sequence size changes' },
  { id: 'delivery-gpu-acceleration-toggle', name: 'GPU Acceleration Toggle', section: 'delivery', group: 'Export settings', status: 'planned', desc: 'Hardware acceleration is browser-managed, a manual toggle stays roadmap' },

  // -------- Bitrate & quality --------
  { id: 'delivery-render-max-depth', name: 'Render at Maximum Depth Toggle', section: 'delivery', group: 'Bitrate & quality', status: 'planned', desc: 'Render in higher bit depth for grading headroom' },
  { id: 'delivery-max-render-quality', name: 'Use Maximum Render Quality Toggle', section: 'delivery', group: 'Bitrate & quality', status: 'planned', desc: 'Highest-quality scaling and debayering on export' },
  { id: 'delivery-bitrate-encoding-dropdown', name: 'Bitrate Encoding Dropdown', section: 'delivery', group: 'Bitrate & quality', status: 'planned', desc: 'Choose CBR or VBR rate control strategies' },
  { id: 'delivery-cbr', name: 'CBR (Constant Bitrate)', section: 'delivery', group: 'Bitrate & quality', status: 'planned', desc: 'Fixed bitrate for predictable delivery sizes' },
  { id: 'delivery-vbr-1-pass', name: 'VBR 1-Pass (Variable Bitrate)', section: 'delivery', group: 'Bitrate & quality', status: 'planned', desc: 'Single-pass variable bitrate spending bits adaptively' },
  { id: 'delivery-vbr-2-pass', name: 'VBR 2-Pass', section: 'delivery', group: 'Bitrate & quality', status: 'planned', desc: 'Two-pass analysis for the best quality ceiling' },
  { id: 'delivery-target-bitrate-slider', name: 'Target Bitrate Slider', section: 'delivery', group: 'Bitrate & quality', status: 'live', desc: 'Free 1–40 Mbps slider in the export dialog — quality tiers snap it to presets', action: 'open-export' },
  { id: 'delivery-quality-ladder', name: 'Quality Ladder (540p·24 → 4K·60)', section: 'delivery', group: 'Bitrate & quality', status: 'live', desc: 'Seven one-click rungs setting resolution+fps+bitrate together with per-rung estimated size, honest device-capability caveats on 4K rungs, and verified real exports (720p30, 1080p60, 4K30, 4K60 blobs probed to exact dimensions)', action: 'open-export' },
  { id: 'delivery-max-bitrate-slider', name: 'Maximum Bitrate Slider', section: 'delivery', group: 'Bitrate & quality', status: 'planned', desc: 'Cap VBR spikes with a maximum bitrate' },
  { id: 'delivery-keyframe-distance', name: 'Keyframe Distance Input', section: 'delivery', group: 'Bitrate & quality', status: 'planned', desc: 'Control GOP length for streaming compatibility' },

  // -------- Audio export --------
  { id: 'delivery-wav', name: 'Waveform Audio (.wav)', section: 'delivery', group: 'Audio export', status: 'live', desc: 'Offline mixdown renders a lossless 16-bit WAV in seconds — full FX, fades, duck', action: 'open-export' },
  { id: 'delivery-gif-export', name: 'Animated GIF Export', section: 'delivery', group: 'Formats & containers', status: 'live', desc: 'Offline frame walk → gifenc per-frame 256-color quantization at 360/480/640 px, 10/12/15 fps — no realtime recording, honest format limits disclosed in the dialog', action: 'open-export' },
  { id: 'delivery-png-frame-sequence', name: 'PNG Frame Sequence (.zip)', section: 'delivery', group: 'Formats & containers', status: 'live', desc: 'Every Nth frame as numbered full/scaled-width PNGs zipped with fflate (store level — PNGs are pre-compressed), live frame-count estimate', action: 'open-export' },
  { id: 'delivery-mp3', name: 'MPEG Audio Layer 3 (.mp3)', section: 'delivery', group: 'Audio export', status: 'live', desc: 'MP3 encode at 192/320 kbps from the same offline mixdown', action: 'open-export' },
  { id: 'delivery-aac', name: 'Advanced Audio Coding (.aac)', section: 'delivery', group: 'Audio export', status: 'planned', desc: 'MP4 video exports carry AAC audio; a standalone .aac file stays roadmap' },
  { id: 'delivery-audio-sample-rate', name: 'Audio Sample Rate Dropdown', section: 'delivery', group: 'Audio export', status: 'live', desc: 'Pick 44.1 or 48 kHz for the audio mixdown', action: 'open-export' },
  { id: 'delivery-audio-channels', name: 'Audio Channels Dropdown (Stereo/Mono/5.1)', section: 'delivery', group: 'Audio export', status: 'live', desc: 'Stereo or mono downmix on the mixdown; 5.1 stays roadmap', action: 'open-export' },
  { id: 'delivery-audio-bitrate', name: 'Audio Bitrate Dropdown', section: 'delivery', group: 'Audio export', status: 'live', desc: 'Video audio track 96–256 kbps, MP3 mixdown 192/320 kbps', action: 'open-export' },

  // -------- Captions & metadata --------
  { id: 'delivery-captions-export', name: 'Captions Export Dropdown', section: 'delivery', group: 'Captions & metadata', status: 'live', desc: 'Captions export as an .srt sidecar and render into the picture as text clips', action: 'open-export' },
  { id: 'delivery-burn-captions', name: 'Burn Captions into Video Option', section: 'delivery', group: 'Captions & metadata', status: 'live', desc: 'AI captions are ordinary text clips — every export renders them into the picture', action: 'open-export' },
  { id: 'delivery-sidecar-srt', name: 'Create Sidecar File (.srt)', section: 'delivery', group: 'Captions & metadata', status: 'live', desc: 'Download an .srt built from AI Auto Captions with timestamps', action: 'open-export' },
  { id: 'delivery-metadata-export', name: 'Metadata Export Options', section: 'delivery', group: 'Captions & metadata', status: 'planned', desc: 'Embed title, creator and rights metadata' },
  { id: 'delivery-timecode-burn-in', name: 'Timecode Burn-in Effect', section: 'delivery', group: 'Captions & metadata', status: 'live', desc: 'Toggle in the export dialog stamps a running timecode pill for review copies', action: 'open-export' },

  // -------- Device & social presets --------
  { id: 'delivery-estimated-file-size', name: 'Estimated File Size Indicator', section: 'delivery', group: 'Device & social presets', status: 'live', desc: 'Dialog estimates file size from bitrate and duration live', action: 'open-export' },
  { id: 'delivery-local-profiles', name: 'Local Profiles (MP4 · MOV · MKV · AVI · MP3)', section: 'delivery', group: 'Device & social presets', status: 'planned', desc: 'WebM and MP4 ship today, the full profile set remains roadmap' },
  { id: 'delivery-device-optimized', name: 'Device Optimized Export (iPhone · iPad · Android · PlayStation)', section: 'delivery', group: 'Device & social presets', status: 'planned', desc: 'Device profiles beyond the current canvas presets remain roadmap' },
  { id: 'delivery-social-direct-export', name: 'Social Direct Export (YouTube · TikTok · Vimeo)', section: 'delivery', group: 'Device & social presets', status: 'planned', desc: 'Upload straight to platforms without leaving the app' },
  { id: 'delivery-dvd-burning', name: 'DVD Burning Panel', section: 'delivery', group: 'Device & social presets', status: 'planned', desc: 'Author discs with menus and ISO burning' },
]
