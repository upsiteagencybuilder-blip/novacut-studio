import type { ProTool } from '../types'

/**
 * Pro Toolkit — vfx section.
 * Keying, roto, tracking, blending, animation and 3D tools mapped to NovaCut:
 * a real per-clip chroma keyer, fifteen canvas blend modes, keyframes with
 * per-key easing and canvas particle overlays ship today.
 */

export const VFX_TOOLS: ProTool[] = [
  // -------- Keying --------
  { id: 'vfx-chroma-keyer', name: 'Chroma Keyer', section: 'vfx', group: 'Keying', status: 'live', desc: 'Chroma section in properties keys any color with similarity and smoothness' },
  { id: 'vfx-ultra-keyer', name: 'Ultra Keyer', section: 'vfx', group: 'Keying', status: 'planned', desc: 'Advanced keyer with auto-spill, edge and light wrap controls' },
  { id: 'vfx-delta-keyer', name: 'Delta Keyer', section: 'vfx', group: 'Keying', status: 'planned', desc: 'Resolve-class delta keyer with matte finesse controls' },
  { id: 'vfx-luma-keyer', name: 'Luma Keyer', section: 'vfx', group: 'Keying', status: 'planned', desc: 'Key footage by brightness range for skies and smoke' },
  { id: 'vfx-difference-keyer', name: 'Difference Keyer', section: 'vfx', group: 'Keying', status: 'planned', desc: 'Key by difference against a clean background plate' },
  { id: 'vfx-linear-color-keyer', name: 'Linear Color Keyer', section: 'vfx', group: 'Keying', status: 'planned', desc: 'Simple linear color-distance key with matching tolerance' },
  { id: 'vfx-spill-suppressor', name: 'Spill Suppressor', section: 'vfx', group: 'Keying', status: 'planned', desc: 'Neutralize green or blue spill on keyed edges and skin' },
  { id: 'vfx-matte-cleaner', name: 'Matte Cleaner', section: 'vfx', group: 'Keying', status: 'planned', desc: 'Despeckle and solidify noisy mattes automatically' },
  { id: 'vfx-matte-choker', name: 'Matte Choker', section: 'vfx', group: 'Keying', status: 'planned', desc: 'Choke or grow matte edges to remove fringing' },

  // -------- Roto & masks --------
  { id: 'vfx-feather-control', name: 'Feather Control', section: 'vfx', group: 'Roto & masks', status: 'planned', desc: 'Soften mask edges with adjustable feather falloff' },
  { id: 'vfx-roto-brush-tool', name: 'Roto Brush Tool', section: 'vfx', group: 'Roto & masks', status: 'planned', desc: 'Paint a stroke and let propagation build the matte' },
  { id: 'vfx-planar-tracker', name: 'Planar Tracker', section: 'vfx', group: 'Roto & masks', status: 'planned', desc: 'Track planar surfaces to pin screens and signs' },
  { id: 'vfx-camera-tracker', name: 'Camera Tracker (3D)', section: 'vfx', group: 'Roto & masks', status: 'planned', desc: 'Solve the 3D camera from footage for CG placement' },
  { id: 'vfx-point-tracker', name: 'Point Tracker', section: 'vfx', group: 'Roto & masks', status: 'planned', desc: 'Track feature points to drive corner pins and elements' },
  { id: 'vfx-mocha-tracker', name: 'Mocha Tracker', section: 'vfx', group: 'Roto & masks', status: 'planned', desc: 'Spline-based planar tracking with occlusion handling' },
  { id: 'vfx-mask-expansion-slider', name: 'Mask Expansion Slider', section: 'vfx', group: 'Roto & masks', status: 'planned', desc: 'Grow or shrink mask outlines numerically per mask' },
  { id: 'vfx-mask-opacity-slider', name: 'Mask Opacity Slider', section: 'vfx', group: 'Roto & masks', status: 'planned', desc: 'Blend mask strength without changing the mask shape' },
  { id: 'vfx-mask-feather-slider', name: 'Mask Feather Slider', section: 'vfx', group: 'Roto & masks', status: 'planned', desc: 'Feather each mask edge with a numeric slider' },

  // -------- Blending modes --------
  { id: 'vfx-blending-modes', name: 'Blending Modes', section: 'vfx', group: 'Blending modes', status: 'live', desc: 'Fifteen canvas blend modes in clip properties composite via the engine' },
  { id: 'vfx-normal-mode', name: 'Normal Mode', section: 'vfx', group: 'Blending modes', status: 'live', desc: 'Default source-over compositing, the Normal entry in the dropdown' },
  { id: 'vfx-dissolve-mode', name: 'Dissolve Mode', section: 'vfx', group: 'Blending modes', status: 'planned', desc: 'Randomly dither pixels between layers by opacity' },
  { id: 'vfx-darken-mode', name: 'Darken Mode', section: 'vfx', group: 'Blending modes', status: 'live', desc: 'Pick Darken in the blend dropdown to keep the darker pixels' },
  { id: 'vfx-multiply-mode', name: 'Multiply Mode', section: 'vfx', group: 'Blending modes', status: 'live', desc: 'Pick Multiply in the blend dropdown to darken like ink layers' },
  { id: 'vfx-color-burn-mode', name: 'Color Burn Mode', section: 'vfx', group: 'Blending modes', status: 'live', desc: 'Pick Color Burn for high-contrast darkening of the base' },
  { id: 'vfx-linear-burn-mode', name: 'Linear Burn Mode', section: 'vfx', group: 'Blending modes', status: 'planned', desc: 'Subtractive darkening without the burn contrast curve' },
  { id: 'vfx-darker-color-mode', name: 'Darker Color Mode', section: 'vfx', group: 'Blending modes', status: 'planned', desc: 'Keep the darker color per pixel, not per channel' },
  { id: 'vfx-lighten-mode', name: 'Lighten Mode', section: 'vfx', group: 'Blending modes', status: 'live', desc: 'Pick Lighten in the blend dropdown to keep brighter pixels' },
  { id: 'vfx-screen-mode', name: 'Screen Mode', section: 'vfx', group: 'Blending modes', status: 'live', desc: 'Pick Screen for glows, smoke and light leak comps' },
  { id: 'vfx-color-dodge-mode', name: 'Color Dodge Mode', section: 'vfx', group: 'Blending modes', status: 'live', desc: 'Pick Color Dodge for bright, blown-out glow comps' },
  { id: 'vfx-linear-dodge-mode', name: 'Linear Dodge Mode', section: 'vfx', group: 'Blending modes', status: 'planned', desc: 'Additive blend that simply adds the pixel values' },
  { id: 'vfx-lighter-color-mode', name: 'Lighter Color Mode', section: 'vfx', group: 'Blending modes', status: 'planned', desc: 'Keep the lighter color per pixel, not per channel' },
  { id: 'vfx-overlay-mode', name: 'Overlay Mode', section: 'vfx', group: 'Blending modes', status: 'live', desc: 'Pick Overlay to boost contrast while keeping midtones' },
  { id: 'vfx-soft-light-mode', name: 'Soft Light Mode', section: 'vfx', group: 'Blending modes', status: 'live', desc: 'Pick Soft Light for a gentle photographic contrast lift' },
  { id: 'vfx-hard-light-mode', name: 'Hard Light Mode', section: 'vfx', group: 'Blending modes', status: 'live', desc: 'Pick Hard Light for punchy directional contrast' },
  { id: 'vfx-vivid-light-mode', name: 'Vivid Light Mode', section: 'vfx', group: 'Blending modes', status: 'planned', desc: 'Extreme burn-and-dodge blend for poster-like contrast' },
  { id: 'vfx-linear-light-mode', name: 'Linear Light Mode', section: 'vfx', group: 'Blending modes', status: 'planned', desc: 'Linear burn-and-dodge blend for strong local contrast' },
  { id: 'vfx-pin-light-mode', name: 'Pin Light Mode', section: 'vfx', group: 'Blending modes', status: 'planned', desc: 'Pin-light blend that drops pixels for graphic looks' },
  { id: 'vfx-hard-mix-mode', name: 'Hard Mix Mode', section: 'vfx', group: 'Blending modes', status: 'planned', desc: 'Posterize each pixel to pure primary channel values' },
  { id: 'vfx-difference-mode', name: 'Difference Mode', section: 'vfx', group: 'Blending modes', status: 'live', desc: 'Pick Difference for inversion and alignment checks' },
  { id: 'vfx-exclusion-mode', name: 'Exclusion Mode', section: 'vfx', group: 'Blending modes', status: 'live', desc: 'Pick Exclusion for softer difference-style inversions' },
  { id: 'vfx-subtract-mode', name: 'Subtract Mode', section: 'vfx', group: 'Blending modes', status: 'planned', desc: 'Subtract layer values channel by channel' },
  { id: 'vfx-divide-mode', name: 'Divide Mode', section: 'vfx', group: 'Blending modes', status: 'planned', desc: 'Divide layers channel by channel for plate math' },
  { id: 'vfx-hue-mode', name: 'Hue Mode', section: 'vfx', group: 'Blending modes', status: 'live', desc: 'Pick Hue to recolor while keeping base luminance detail' },
  { id: 'vfx-saturation-mode', name: 'Saturation Mode', section: 'vfx', group: 'Blending modes', status: 'live', desc: 'Pick Saturation to paint chroma over base luminosity' },
  { id: 'vfx-color-mode', name: 'Color Mode', section: 'vfx', group: 'Blending modes', status: 'live', desc: 'Pick Color to transfer hue and chroma onto detail' },
  { id: 'vfx-luminosity-mode', name: 'Luminosity Mode', section: 'vfx', group: 'Blending modes', status: 'live', desc: 'Pick Luminosity to borrow brightness while keeping color' },

  // -------- Layers & animation --------
  { id: 'vfx-adjustment-layer', name: 'Adjustment Layer', section: 'vfx', group: 'Layers & animation', status: 'planned', desc: 'One layer whose effects apply to everything underneath' },
  { id: 'vfx-solid-color-layer', name: 'Solid Color Layer', section: 'vfx', group: 'Layers & animation', status: 'planned', desc: 'Generate flat color solids as comp backdrops' },
  { id: 'vfx-null-object', name: 'Null Object', section: 'vfx', group: 'Layers & animation', status: 'planned', desc: 'Invisible rig layer that drives other layer transforms' },
  { id: 'vfx-parenting-link', name: 'Parenting Link', section: 'vfx', group: 'Layers & animation', status: 'planned', desc: 'Parent layers so children inherit transforms hierarchically' },
  { id: 'vfx-expression-editor', name: 'Expression Editor', section: 'vfx', group: 'Layers & animation', status: 'planned', desc: 'Write JavaScript expressions that drive layer properties' },
  { id: 'vfx-keyframe-assistant', name: 'Keyframe Assistant', section: 'vfx', group: 'Layers & animation', status: 'live', desc: 'Press K to add a keyframe for the selected property at the playhead' },
  { id: 'vfx-easy-ease-in', name: 'Easy Ease In', section: 'vfx', group: 'Layers & animation', status: 'live', desc: 'Choose Ease In per keyframe in the properties easing menu' },
  { id: 'vfx-easy-ease-out', name: 'Easy Ease Out', section: 'vfx', group: 'Layers & animation', status: 'live', desc: 'Choose Ease Out per keyframe in the properties easing menu' },
  { id: 'vfx-easy-ease', name: 'Easy Ease', section: 'vfx', group: 'Layers & animation', status: 'live', desc: 'Choose Ease In Out per keyframe in the properties easing menu' },
  { id: 'vfx-graph-editor', name: 'Graph Editor', section: 'vfx', group: 'Layers & animation', status: 'planned', desc: 'Sculpt value and speed curves visually over time' },
  { id: 'vfx-value-graph', name: 'Value Graph', section: 'vfx', group: 'Layers & animation', status: 'planned', desc: 'Edit property values as bezier curves over time' },
  { id: 'vfx-speed-graph', name: 'Speed Graph', section: 'vfx', group: 'Layers & animation', status: 'planned', desc: 'Shape motion velocity directly in a speed curve' },
  { id: 'vfx-motion-blur-toggle', name: 'Motion Blur Toggle', section: 'vfx', group: 'Layers & animation', status: 'planned', desc: 'Sample sub-frames to blur fast-moving layers realistically' },
  { id: 'vfx-frame-blending-toggle', name: 'Frame Blending Toggle', section: 'vfx', group: 'Layers & animation', status: 'planned', desc: 'Blend neighboring frames when retiming footage' },
  { id: 'vfx-optical-flow-engine', name: 'Optical Flow Engine', section: 'vfx', group: 'Layers & animation', status: 'planned', desc: 'Synthesize in-between frames from pixel motion vectors' },

  // -------- Time & warp --------
  { id: 'vfx-time-warp-tool', name: 'Time Warp Tool', section: 'vfx', group: 'Time & warp', status: 'planned', desc: 'Retime footage with sub-frame precision and motion interpolation' },
  { id: 'vfx-stabilizer-panel', name: 'Stabilizer Panel', section: 'vfx', group: 'Stabilizing & repair', status: 'planned', desc: 'Analyze and smooth camera shake with crop borders' },
  { id: 'vfx-warp-stabilizer', name: 'Warp Stabilizer', section: 'vfx', group: 'Stabilizing & repair', status: 'planned', desc: 'One-click stabilized shots with warping and cropping' },
  { id: 'vfx-rolling-shutter-repair', name: 'Rolling Shutter Repair', section: 'vfx', group: 'Stabilizing & repair', status: 'planned', desc: 'Fix skew and wobble from rolling shutter sensors' },
  { id: 'vfx-lens-distortion-correction', name: 'Lens Distortion Correction', section: 'vfx', group: 'Stabilizing & repair', status: 'planned', desc: 'Remove barrel and pincushion distortion using analysis' },

  // -------- Lighting & 3D --------
  { id: 'vfx-particle-system', name: 'Particle System', section: 'vfx', group: 'Lighting & 3D', status: 'live', desc: 'Canvas particle overlays render rain, snow, sparks and embers', action: 'open-effects' },
  { id: 'vfx-3d-camera', name: '3D Camera', section: 'vfx', group: 'Lighting & 3D', status: 'planned', desc: 'Virtual 3D camera with parallax through layered comps' },
  { id: 'vfx-3d-light', name: '3D Light', section: 'vfx', group: 'Lighting & 3D', status: 'planned', desc: 'Scene lights that shade 3D layers and cast shadows' },
  { id: 'vfx-ambient-light', name: 'Ambient Light', section: 'vfx', group: 'Lighting & 3D', status: 'planned', desc: 'Omnidirectional fill light with no falloff or shadows' },
  { id: 'vfx-point-light', name: 'Point Light', section: 'vfx', group: 'Lighting & 3D', status: 'planned', desc: 'Radial light source that falls off with distance' },
  { id: 'vfx-spot-light', name: 'Spot Light', section: 'vfx', group: 'Lighting & 3D', status: 'planned', desc: 'Cone light with angle, feather and shadow casting' },
  { id: 'vfx-parallel-light', name: 'Parallel Light', section: 'vfx', group: 'Lighting & 3D', status: 'planned', desc: 'Directional sun-style light without perspective falloff' },
  { id: 'vfx-shadow-map-settings', name: 'Shadow Map Settings', section: 'vfx', group: 'Lighting & 3D', status: 'planned', desc: 'Control shadow resolution, softness and darkness per light' },
  { id: 'vfx-ray-traced-renderer', name: 'Ray-Traced Renderer', section: 'vfx', group: 'Lighting & 3D', status: 'planned', desc: 'Physically accurate ray-traced 3D comp rendering' },
  { id: 'vfx-cinema-4d-renderer', name: 'Cinema 4D Renderer', section: 'vfx', group: 'Lighting & 3D', status: 'planned', desc: 'Integrated Cinema 4D layer rendering inside comps' },
]
