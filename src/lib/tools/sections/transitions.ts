import type { ProTool } from '../types'

/**
 * Pro Toolkit — transitions section.
 * Industry transitions mapped to the 240 shipped transition definitions
 * (24 families incl. Dissolve, Fade, Slide, Push, Wipe, Zoom, Flash, Spin,
 * Glitch, Warp Zoom, Cube Spin, Stutter Cut, Film Dissolve, Iris, Clock Wipe,
 * Barn Doors, Split). Fades bridge into TRUE crossfades over the cut; wipe
 * families reveal through animated canvas masks.
 */

export const TRANSITIONS_TOOLS: ProTool[] = [
  // -------- Dissolves & dips --------
  { id: 'transition-cross-dissolve', name: 'Cross Dissolve', section: 'transitions', group: 'Dissolves & dips', status: 'live', desc: 'Dissolve family blends both clips with a true crossfade — the outgoing clip keeps playing underneath', action: 'open-effects' },
  { id: 'transition-dip-to-black', name: 'Dip to Black', section: 'transitions', group: 'Dissolves & dips', status: 'live', desc: 'Stutter cut variants dip through black via opacity fades' },
  { id: 'transition-dip-to-white', name: 'Dip to White', section: 'transitions', group: 'Dissolves & dips', status: 'live', desc: 'Stutter cut dip variants flash through white shutters' },
  { id: 'transition-film-dissolve', name: 'Film Dissolve', section: 'transitions', group: 'Dissolves & dips', status: 'live', desc: 'Film Dissolve family: true crossfade with photochemical gate-weave jitter', action: 'open-effects' },
  { id: 'transition-additive-dissolve', name: 'Additive Dissolve', section: 'transitions', group: 'Dissolves & dips', status: 'planned', desc: 'Brightening dissolve that glows through the cut' },
  { id: 'transition-non-additive-dissolve', name: 'Non-Additive Dissolve', section: 'transitions', group: 'Dissolves & dips', status: 'planned', desc: 'Map luminance from one clip into the other' },
  { id: 'transition-morph-cut', name: 'Morph Cut', section: 'transitions', group: 'Dissolves & dips', status: 'planned', desc: 'Face-aware blend that hides jump cuts in talking heads' },
  { id: 'transition-basic-transitions', name: 'Basic Transitions (Fade · Dissolve · Flash · Blind)', section: 'transitions', group: 'Dissolves & dips', status: 'live', desc: 'Fade, dissolve and flash families ship as true crossfades, blinds remain roadmap' },

  // -------- Wipes & irises --------
  { id: 'transition-split-transition', name: 'Split Transition', section: 'transitions', group: 'Wipes & irises', status: 'live', desc: 'Split family parts the frame at center — a gap grows outward revealing the incoming shot', action: 'open-effects' },
  { id: 'transition-wipe', name: 'Wipe Transition', section: 'transitions', group: 'Wipes & irises', status: 'live', desc: 'Wipe family reveals the incoming clip along directional edges', action: 'open-effects' },
  { id: 'transition-clock-wipe', name: 'Clock Wipe', section: 'transitions', group: 'Wipes & irises', status: 'live', desc: 'Clock Wipe family sweeps a pie mask around the center like a clock hand', action: 'open-effects' },
  { id: 'transition-radial-wipe', name: 'Radial Wipe', section: 'transitions', group: 'Wipes & irises', status: 'live', desc: 'Circular edge wipes outward from center — see the Iris Round family', action: 'open-effects' },
  { id: 'transition-barn-doors-wipe', name: 'Barn Doors Wipe', section: 'transitions', group: 'Wipes & irises', status: 'live', desc: 'Barn Doors family closes two panels in from the frame edges', action: 'open-effects' },
  { id: 'transition-iris-box', name: 'Iris Box', section: 'transitions', group: 'Wipes & irises', status: 'live', desc: 'Iris Box family grows a rectangular mask around the cut', action: 'open-effects' },
  { id: 'transition-iris-cross', name: 'Iris Cross', section: 'transitions', group: 'Wipes & irises', status: 'live', desc: 'Iris Cross family opens a plus-shaped mask over the incoming shot', action: 'open-effects' },
  { id: 'transition-iris-diamond', name: 'Iris Diamond', section: 'transitions', group: 'Wipes & irises', status: 'live', desc: 'Iris Diamond family reveals through a growing diamond mask', action: 'open-effects' },
  { id: 'transition-iris-round', name: 'Iris Round', section: 'transitions', group: 'Wipes & irises', status: 'live', desc: 'Iris Round family — the classic circular iris over a live outgoing clip', action: 'open-effects' },
  { id: 'transition-page-peel', name: 'Page Peel', section: 'transitions', group: 'Wipes & irises', status: 'planned', desc: 'Curl the outgoing clip away like a page corner' },
  { id: 'transition-page-turn', name: 'Page Turn', section: 'transitions', group: 'Wipes & irises', status: 'planned', desc: 'Full page turn with backface and soft shadow' },

  // -------- 3D & motion --------
  { id: 'transition-push', name: 'Push Transition', section: 'transitions', group: '3D & motion', status: 'live', desc: 'Push family slides the outgoing clip off while incoming enters', action: 'open-effects' },
  { id: 'transition-slide', name: 'Slide Transition', section: 'transitions', group: '3D & motion', status: 'live', desc: 'Slide family throws clips across the frame edge to edge', action: 'open-effects' },
  { id: 'transition-zoom', name: 'Zoom Transition', section: 'transitions', group: '3D & motion', status: 'live', desc: 'Zoom family scales clips through the cut, in or out', action: 'open-effects' },
  { id: 'transition-3d-transitions', name: '3D Transitions (Cube · Flip · Sphere · Room)', section: 'transitions', group: '3D & motion', status: 'planned', desc: 'Cube spin family ships, flip, sphere and room stay roadmap' },

  // -------- Glitch & stylized --------
  { id: 'transition-ripple-dissolve', name: 'Ripple & Dissolve Transitions', section: 'transitions', group: 'Glitch & stylized', status: 'planned', desc: 'Drift dissolve variants ship, true ripple distortion stays roadmap' },
  { id: 'transition-speed-blur', name: 'Speed Blur Transitions (Swirl · Zoom · Push)', section: 'transitions', group: 'Glitch & stylized', status: 'planned', desc: 'Warp zoom and blur families ship, swirl variants stay roadmap' },
  { id: 'transition-warp-glitch', name: 'Warp & Glitch Transitions', section: 'transitions', group: 'Glitch & stylized', status: 'live', desc: 'Warp zoom and glitch families deliver stylized throw transitions', action: 'open-effects' },
]
