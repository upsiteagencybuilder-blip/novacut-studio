import type { ProTool } from '../types'

/**
 * Pro Toolkit — color section.
 * Resolve-style grading tools mapped to what NovaCut ships: per-clip grade
 * sliders (temperature, tint, shadows, highlights, vibrance), CSS-filter
 * luminance/saturation/hue controls, one-tap look presets and real .cube LUT
 * import.
 */

export const COLOR_TOOLS: ProTool[] = [
  // -------- Wheels & primaries --------
  { id: 'color-primary-color-wheels', name: 'Primary Color Wheels', section: 'color', group: 'Wheels & primaries', status: 'beta', desc: 'Temperature, tint, shadows and highlights sliders grade primaries today' },
  { id: 'color-secondary-correction-tool', name: 'Secondary Color Correction Tool', section: 'color', group: 'Wheels & primaries', status: 'planned', desc: 'Isolate and correct one color range without touching the rest' },
  { id: 'color-lift-wheel', name: 'Lift Wheel', section: 'color', group: 'Wheels & primaries', status: 'planned', desc: 'Push shadows toward a color with the lift wheel' },
  { id: 'color-gamma-wheel', name: 'Gamma Wheel', section: 'color', group: 'Wheels & primaries', status: 'planned', desc: 'Tint midtones with the gamma color wheel' },
  { id: 'color-gain-wheel', name: 'Gain Wheel', section: 'color', group: 'Wheels & primaries', status: 'planned', desc: 'Tint highlights with the gain color wheel' },
  { id: 'color-offset-wheel', name: 'Offset Wheel', section: 'color', group: 'Wheels & primaries', status: 'planned', desc: 'Shift the whole image with the offset wheel' },
  { id: 'color-shadows-slider', name: 'Shadows Slider', section: 'color', group: 'Wheels & primaries', status: 'live', desc: 'Shadows slider in clip properties lifts or crushes shadow detail' },
  { id: 'color-midtones-slider', name: 'Midtones Slider', section: 'color', group: 'Wheels & primaries', status: 'planned', desc: 'Adjust gamma midtones independently of shadows and highlights' },
  { id: 'color-highlights-slider', name: 'Highlights Slider', section: 'color', group: 'Wheels & primaries', status: 'live', desc: 'Highlights slider rolls off or boosts highlights in clip properties' },
  { id: 'color-color-wheels', name: 'Color Wheels', section: 'color', group: 'Wheels & primaries', status: 'planned', desc: 'Full lift, gamma, gain and offset wheel set' },
  { id: 'color-color-bars', name: 'Color Bars', section: 'color', group: 'Wheels & primaries', status: 'planned', desc: 'Generate SMPTE bars for calibration and test outputs' },
  { id: 'color-log-controls', name: 'Log Controls', section: 'color', group: 'Wheels & primaries', status: 'planned', desc: 'Log-space low, mid and high controls for camera originals' },
  { id: 'color-temperature-slider', name: 'Temperature Slider', section: 'color', group: 'Wheels & primaries', status: 'live', desc: 'Temperature slider warms or cools the grade in clip properties' },
  { id: 'color-tint-slider', name: 'Tint Slider', section: 'color', group: 'Wheels & primaries', status: 'live', desc: 'Tint slider shifts green to magenta in clip properties' },
  { id: 'color-contrast-slider', name: 'Contrast Slider', section: 'color', group: 'Wheels & primaries', status: 'live', desc: 'Contrast slider in properties expands or flattens tonal range' },
  { id: 'color-pivot-control', name: 'Pivot Control', section: 'color', group: 'Wheels & primaries', status: 'planned', desc: 'Move the contrast pivot around which tones expand' },
  { id: 'color-saturation-slider', name: 'Saturation Slider', section: 'color', group: 'Wheels & primaries', status: 'live', desc: 'Saturation slider controls intensity from grayscale to vivid' },
  { id: 'color-hue-slider', name: 'Hue Slider', section: 'color', group: 'Wheels & primaries', status: 'live', desc: 'Hue slider rotates all colors around the wheel in properties' },
  { id: 'color-luma-slider', name: 'Luma Slider', section: 'color', group: 'Wheels & primaries', status: 'live', desc: 'Brightness slider scales overall luminance in clip properties' },

  // -------- Curves --------
  { id: 'color-curves-panel', name: 'Curves Panel', section: 'color', group: 'Curves', status: 'planned', desc: 'Adjust tone and color by bending interactive curves' },
  { id: 'color-custom-curves-rgb', name: 'Custom Curves (RGB)', section: 'color', group: 'Curves', status: 'planned', desc: 'Bend red, green and blue channels independently with spline points' },
  { id: 'color-hue-vs-hue-curve', name: 'Hue vs Hue Curve', section: 'color', group: 'Curves', status: 'planned', desc: 'Shift specific hues to other hues along the curve' },
  { id: 'color-hue-vs-sat-curve', name: 'Hue vs Sat Curve', section: 'color', group: 'Curves', status: 'planned', desc: 'Boost or drain saturation for chosen hues only' },
  { id: 'color-hue-vs-luma-curve', name: 'Hue vs Luma Curve', section: 'color', group: 'Curves', status: 'planned', desc: 'Darken or lift specific hues along the luma curve' },
  { id: 'color-luma-vs-sat-curve', name: 'Luma vs Sat Curve', section: 'color', group: 'Curves', status: 'planned', desc: 'Control saturation per brightness band with a curve' },
  { id: 'color-sat-vs-sat-curve', name: 'Sat vs Sat Curve', section: 'color', group: 'Curves', status: 'planned', desc: 'Re-map saturation levels against themselves with a curve' },
  { id: 'color-sat-vs-luma-curve', name: 'Sat vs Luma Curve', section: 'color', group: 'Curves', status: 'planned', desc: 'Limit saturation per luma band to tame noise' },

  // -------- Secondaries & qualifiers --------
  { id: 'color-color-match-tool', name: 'Color Match Tool', section: 'color', group: 'Secondaries & qualifiers', status: 'planned', desc: 'Match shots to a reference frame automatically with analysis' },
  { id: 'color-color-warper', name: 'Color Warper', section: 'color', group: 'Secondaries & qualifiers', status: 'planned', desc: 'Warp the color cloud point mesh for creative re-mapping' },
  { id: 'color-hdr-palette', name: 'HDR Palette', section: 'color', group: 'Secondaries & qualifiers', status: 'planned', desc: 'Grade with HDR tone controls and high dynamic range wheels' },
  { id: 'color-rgb-mixer', name: 'RGB Mixer', section: 'color', group: 'Secondaries & qualifiers', status: 'planned', desc: 'Mix channel cross-contributions for stylized color responses' },
  { id: 'color-motion-tracker-color', name: 'Motion Tracker (Color)', section: 'color', group: 'Secondaries & qualifiers', status: 'planned', desc: 'Track a point so windows follow moving subjects' },
  { id: 'color-qualifier-tool', name: 'Qualifier Tool', section: 'color', group: 'Secondaries & qualifiers', status: 'planned', desc: 'Sample pixels to build a keyed secondary color range' },
  { id: 'color-hsl-qualifier', name: 'HSL Qualifier', section: 'color', group: 'Secondaries & qualifiers', status: 'planned', desc: 'Qualify secondaries with hue, saturation and luma ranges' },
  { id: 'color-rgb-qualifier', name: 'RGB Qualifier', section: 'color', group: 'Secondaries & qualifiers', status: 'planned', desc: 'Qualify a secondary by red, green and blue thresholds' },
  { id: 'color-luma-qualifier', name: 'Luma Qualifier', section: 'color', group: 'Secondaries & qualifiers', status: 'planned', desc: 'Qualify a secondary by brightness range alone' },
  { id: 'color-3d-qualifier', name: '3D Qualifier', section: 'color', group: 'Secondaries & qualifiers', status: 'planned', desc: 'Sample color ranges in three-dimensional color space' },
  { id: 'color-magic-mask-tool', name: 'Magic Mask Tool', section: 'color', group: 'Secondaries & qualifiers', status: 'planned', desc: 'AI-isolate people or objects for automatic masked grades' },

  // -------- Windows & masks --------
  { id: 'color-key-palette', name: 'Key Palette', section: 'color', group: 'Windows & masks', status: 'planned', desc: 'Refine secondary keys with softness, denoise and blur controls' },
  { id: 'color-sizing-palette', name: 'Sizing Palette', section: 'color', group: 'Windows & masks', status: 'planned', desc: 'Reframe shots with pan, tilt, zoom and edge softness' },
  { id: 'color-power-window', name: 'Power Window', section: 'color', group: 'Windows & masks', status: 'planned', desc: 'Trackable geometric masks that confine grades to regions' },
  { id: 'color-linear-window', name: 'Linear Window', section: 'color', group: 'Windows & masks', status: 'planned', desc: 'Linear gradient window for skies and horizons' },
  { id: 'color-circle-window', name: 'Circle Window', section: 'color', group: 'Windows & masks', status: 'planned', desc: 'Circular window with feather for vignettes and spots' },
  { id: 'color-polygon-window', name: 'Polygon Window', section: 'color', group: 'Windows & masks', status: 'planned', desc: 'Draw arbitrary polygon windows around subjects' },
  { id: 'color-curve-window', name: 'Curve Window', section: 'color', group: 'Windows & masks', status: 'planned', desc: 'Bezier-drawn window shapes that follow contours' },
  { id: 'color-gradient-window', name: 'Gradient Window', section: 'color', group: 'Windows & masks', status: 'planned', desc: 'Soft ramp window blending a grade across the frame' },

  // -------- LUTs & color management --------
  { id: 'color-input-lut-dropdown', name: 'Input LUT Dropdown', section: 'color', group: 'LUTs & color management', status: 'live', desc: 'Import .cube LUTs in the media panel, then pick one per clip' },
  { id: 'color-output-lut-dropdown', name: 'Output LUT Dropdown', section: 'color', group: 'LUTs & color management', status: 'planned', desc: 'Apply a display LUT at the output stage of the grade' },
  { id: 'color-3d-lut-creator', name: '3D LUT Creator', section: 'color', group: 'LUTs & color management', status: 'planned', desc: 'Author and export custom .cube LUTs from a grade' },
  { id: 'color-cst', name: 'Color Space Transform (CST)', section: 'color', group: 'LUTs & color management', status: 'planned', desc: 'Convert footage between camera log and working color spaces' },
  { id: 'color-aces-workflow-toggle', name: 'ACES Workflow Toggle', section: 'color', group: 'LUTs & color management', status: 'planned', desc: 'Enable the ACES color-managed pipeline for the project' },

  // -------- Scopes & monitoring --------
  { id: 'color-video-scopes', name: 'Video Scopes', section: 'color', group: 'Scopes & monitoring', status: 'planned', desc: 'Combined scope suite synchronized to the playhead frame' },
  { id: 'color-waveform-monitor', name: 'Waveform Monitor', section: 'color', group: 'Scopes & monitoring', status: 'planned', desc: 'Read luminance distribution per scanline on a waveform' },
  { id: 'color-vectorscope', name: 'Vectorscope', section: 'color', group: 'Scopes & monitoring', status: 'planned', desc: 'Judge hue and saturation against the skin-tone line' },
  { id: 'color-parade-monitor', name: 'Parade Monitor (RGB)', section: 'color', group: 'Scopes & monitoring', status: 'planned', desc: 'Side-by-side RGB waveforms for channel balancing' },
  { id: 'color-histogram', name: 'Histogram', section: 'color', group: 'Scopes & monitoring', status: 'planned', desc: 'Tonal distribution graph for exposure decisions' },
  { id: 'color-cie-chromaticity-diagram', name: 'CIE Chromaticity Diagram', section: 'color', group: 'Scopes & monitoring', status: 'planned', desc: 'Visualize gamut coverage on the CIE chromaticity plane' },
  { id: 'color-false-color-overlay', name: 'False Color Overlay', section: 'color', group: 'Scopes & monitoring', status: 'planned', desc: 'Paint exposure bands as colors over the monitor' },
  { id: 'color-zebra-strips-overlay', name: 'Zebra Strips Overlay', section: 'color', group: 'Scopes & monitoring', status: 'planned', desc: 'Stripe the image wherever luma crosses a threshold' },
  { id: 'color-skin-tone-indicator', name: 'Skin Tone Indicator Line', section: 'color', group: 'Scopes & monitoring', status: 'planned', desc: 'Vectorscope guide line for healthy skin tones' },
  { id: 'color-broadcast-safe-filter', name: 'Broadcast Safe Filter', section: 'color', group: 'Scopes & monitoring', status: 'planned', desc: 'Clamp luma and chroma inside legal broadcast ranges' },
]
