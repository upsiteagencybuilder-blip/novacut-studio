import type { ProTool } from '../types'

/**
 * Pro Toolkit — filters section.
 * AE/Filmora-style effect tools mapped to NovaCut: CSS-filter sliders
 * (blur, invert, brightness...), 60 vision effects (pixelate, mirror,
 * kaleidoscope, duotone, VHS, poster, glow...), 90 canvas overlays
 * (particles, grain, vignette, light leaks) and 220 color presets.
 */

export const FILTERS_TOOLS: ProTool[] = [
  // -------- Blur & sharpen --------
  { id: 'filter-gaussian-blur', name: 'Gaussian Blur', section: 'filters', group: 'Blur & sharpen', status: 'live', desc: 'Blur slider in clip properties applies CSS gaussian blur' },
  { id: 'filter-fast-box-blur', name: 'Fast Box Blur', section: 'filters', group: 'Blur & sharpen', status: 'planned', desc: 'Cheap box blur with iteration control for speed' },
  { id: 'filter-directional-blur', name: 'Directional Blur', section: 'filters', group: 'Blur & sharpen', status: 'planned', desc: 'Blur along an angle to fake motion streaks' },
  { id: 'filter-radial-blur', name: 'Radial Blur', section: 'filters', group: 'Blur & sharpen', status: 'planned', desc: 'Spin or zoom blur around a chosen center' },
  { id: 'filter-camera-blur', name: 'Camera Blur', section: 'filters', group: 'Blur & sharpen', status: 'planned', desc: 'Simulate out-of-focus lens blur on plates' },
  { id: 'filter-bilateral-blur', name: 'Bilateral Blur', section: 'filters', group: 'Blur & sharpen', status: 'planned', desc: 'Smooth while preserving edges and detail' },
  { id: 'filter-sharpness-slider', name: 'Sharpness Slider', section: 'filters', group: 'Blur & sharpen', status: 'planned', desc: 'Crisp the image with a single sharpness control' },
  { id: 'filter-unsharp-mask', name: 'Unsharp Mask', section: 'filters', group: 'Blur & sharpen', status: 'planned', desc: 'Classic sharpening with radius and threshold' },

  // -------- Generate --------
  { id: 'filter-lens-flare-effect', name: 'Lens Flare Effect', section: 'filters', group: 'Generate', status: 'planned', desc: 'Positional flare with anamorphic streaks and ghosts' },
  { id: 'filter-lightning-effect', name: 'Lightning Effect', section: 'filters', group: 'Generate', status: 'planned', desc: 'Procedural lightning bolts between two points' },
  { id: 'filter-grid-generator', name: 'Grid Generator', section: 'filters', group: 'Generate', status: 'planned', desc: 'Render adjustable grids as design overlays' },
  { id: 'filter-ramp-generator', name: 'Ramp Generator (Gradient)', section: 'filters', group: 'Generate', status: 'planned', desc: 'Two-color gradients as backgrounds and tint maps' },
  { id: 'filter-noise-generator', name: 'Noise Generator', section: 'filters', group: 'Generate', status: 'planned', desc: 'Procedural noise fields for mattes and texture' },
  { id: 'filter-grain-generator', name: 'Grain Generator', section: 'filters', group: 'Generate', status: 'live', desc: 'Deterministic grain overlays render over the composite' },

  // -------- Distort & warp --------
  { id: 'filter-dust-scratches', name: 'Dust & Scratches Filter', section: 'filters', group: 'Distort & warp', status: 'planned', desc: 'Remove dust specks while keeping real detail' },
  { id: 'filter-artifact-removal', name: 'Artifact Removal Tool', section: 'filters', group: 'Distort & warp', status: 'planned', desc: 'Clean compression blocking and banding automatically' },
  { id: 'filter-corner-pin', name: 'Corner Pin Effect', section: 'filters', group: 'Distort & warp', status: 'planned', desc: 'Drag four corners to skew screens into place' },
  { id: 'filter-transform-effect', name: 'Transform Effect', section: 'filters', group: 'Distort & warp', status: 'live', desc: 'Position, scale and rotation sliders with keyframes in properties' },
  { id: 'filter-mirror-effect', name: 'Mirror Effect', section: 'filters', group: 'Distort & warp', status: 'live', desc: 'Vision mirror presets reflect the frame in five modes', action: 'open-effects' },
  { id: 'filter-magnify-effect', name: 'Magnify Effect', section: 'filters', group: 'Distort & warp', status: 'planned', desc: 'Loupe-style circular enlargement of a region' },
  { id: 'filter-spherize-effect', name: 'Spherize Effect', section: 'filters', group: 'Distort & warp', status: 'planned', desc: 'Bulge the image as if wrapped on a sphere' },
  { id: 'filter-twirl-effect', name: 'Twirl Effect', section: 'filters', group: 'Distort & warp', status: 'planned', desc: 'Swirl pixels around a center by an angle' },
  { id: 'filter-wave-warp-effect', name: 'Wave Warp Effect', section: 'filters', group: 'Distort & warp', status: 'planned', desc: 'Animated wave displacement for flags and water' },
  { id: 'filter-turbulent-displace', name: 'Turbulent Displace', section: 'filters', group: 'Distort & warp', status: 'planned', desc: 'Fractal noise warping for heat and water wobble' },

  // -------- Stylize --------
  { id: 'filter-find-edges', name: 'Find Edges Filter', section: 'filters', group: 'Stylize', status: 'planned', desc: 'Outline contours like a pencil sketch overlay' },
  { id: 'filter-posterize-effect', name: 'Posterize Effect', section: 'filters', group: 'Stylize', status: 'live', desc: 'Vision poster presets crush colors into poster tones', action: 'open-effects' },
  { id: 'filter-solarize-effect', name: 'Solarize Effect', section: 'filters', group: 'Stylize', status: 'planned', desc: 'Partially invert tones above a threshold' },
  { id: 'filter-threshold-filter', name: 'Threshold Filter', section: 'filters', group: 'Stylize', status: 'planned', desc: 'Snap every pixel to pure black or white' },
  { id: 'filter-utility-effects', name: 'Utility Effects (Image Mask · Crop · Tilt-Shift)', section: 'filters', group: 'Stylize', status: 'planned', desc: 'Mask-driven utility trio for crops and miniatures' },

  // -------- Color effects --------
  { id: 'filter-tint-effect', name: 'Tint Effect', section: 'filters', group: 'Color effects', status: 'live', desc: 'Duotone vision effect maps shadows and highlights to two colors', action: 'open-effects' },
  { id: 'filter-tritone-effect', name: 'Tritone Effect', section: 'filters', group: 'Color effects', status: 'planned', desc: 'Map shadows, midtones and highlights to three colors' },
  { id: 'filter-color-balance', name: 'Color Balance Filter', section: 'filters', group: 'Color effects', status: 'planned', desc: 'Push red, green and blue per tonal range' },
  { id: 'filter-leave-color', name: 'Leave Color Filter', section: 'filters', group: 'Color effects', status: 'planned', desc: 'Desaturate everything except one chosen color' },
  { id: 'filter-change-color-tool', name: 'Change Color Tool', section: 'filters', group: 'Color effects', status: 'planned', desc: 'Hue-shift a sampled color range on the canvas' },
  { id: 'filter-invert-effect', name: 'Invert Effect', section: 'filters', group: 'Color effects', status: 'live', desc: 'Invert slider flips colors to negative in properties' },
  { id: 'filter-lut-library', name: 'LUT (Look-Up Tables) Library', section: 'filters', group: 'Color effects', status: 'beta', desc: '220 preset looks plus .cube LUT import stand in for LUT packs' },

  // -------- Overlay packs --------
  { id: 'filter-filters-library', name: 'Filters Library', section: 'filters', group: 'Overlay packs', status: 'live', desc: 'Effects browser collects every effect category with search', action: 'open-effects' },
  { id: 'filter-overlays-library', name: 'Overlays Library', section: 'filters', group: 'Overlay packs', status: 'live', desc: 'Ninety canvas overlays from vignettes to zoom pulses', action: 'open-effects' },
  { id: 'filter-light-leaks', name: 'Light Leaks & Lens Flare Overlays', section: 'filters', group: 'Overlay packs', status: 'live', desc: 'Twelve light leak overlays sweep and flicker in four hues' },
  { id: 'filter-film-grain-overlays', name: 'Film Grain & Scratches Overlays', section: 'filters', group: 'Overlay packs', status: 'planned', desc: 'Grain overlays ship today, scratch layers stay roadmap' },
  { id: 'filter-rain-snow-overlays', name: 'Rain & Snow Overlays', section: 'filters', group: 'Overlay packs', status: 'live', desc: 'Particle overlays render rain, snow, dust and bubbles', action: 'open-effects' },
  { id: 'filter-boris-newblue-panel', name: 'Boris FX & NewBlueFX Panel', section: 'filters', group: 'Overlay packs', status: 'planned', desc: 'Third-party plugin suites for specialty looks remain roadmap' },
]
