import type { ProTool } from '../types'

/**
 * Pro Toolkit — transitions section.
 * Industry transitions mapped to the 160 shipped transition definitions
 * (16 families incl. Dissolve, Fade, Slide, Push, Wipe, Zoom, Flash, Spin,
 * Glitch, Warp Zoom, Cube Spin, Stutter Cut).
 */

export const TRANSITIONS_TOOLS: ProTool[] = [
  // -------- Dissolves & dips --------
  { id: 'transition-cross-dissolve', name: 'Cross Dissolve', section: 'transitions', group: 'Dissolves & dips', status: 'live', desc: 'Dissolve family crossfades out and in with matched timing', action: 'open-effects' },
  { id: 'transition-dip-to-black', name: 'Dip to Black', section: 'transitions', group: 'Dissolves & dips', status: 'live', desc: 'Stutter cut variants dip through black via opacity fades' },
  { id: 'transition-dip-to-white', name: 'Dip to White', section: 'transitions', group: 'Dissolves & dips', status: 'live', desc: 'Stutter cut dip variants flash through white shutters' },
  { id: 'transition-film-dissolve', name: 'Film Dissolve', section: 'transitions', group: 'Dissolves & dips', status: 'planned', desc: 'Dissolve with grain and gate weave for a photochemical feel' },
  { id: 'transition-additive-dissolve', name: 'Additive Dissolve', section: 'transitions', group: 'Dissolves & dips', status: 'planned', desc: 'Brightening dissolve that glows through the cut' },
  { id: 'transition-non-additive-dissolve', name: 'Non-Additive Dissolve', section: 'transitions', group: 'Dissolves & dips', status: 'planned', desc: 'Map luminance from one clip into the other' },
  { id: 'transition-morph-cut', name: 'Morph Cut', section: 'transitions', group: 'Dissolves & dips', status: 'planned', desc: 'Face-aware blend that hides jump cuts in talking heads' },
  { id: 'transition-basic-transitions', name: 'Basic Transitions (Fade · Dissolve · Flash · Blind)', section: 'transitions', group: 'Dissolves & dips', status: 'live', desc: 'Fade, dissolve and flash families ship, blinds remain roadmap' },

  // -------- Wipes & irises --------
  { id: 'transition-split-transition', name: 'Split Transition', section: 'transitions', group: 'Wipes & irises', status: 'planned', desc: 'Frame splits in half and wipes both ways off screen' },
  { id: 'transition-wipe', name: 'Wipe Transition', section: 'transitions', group: 'Wipes & irises', status: 'live', desc: 'Wipe family reveals the incoming clip along directional edges', action: 'open-effects' },
  { id: 'transition-clock-wipe', name: 'Clock Wipe', section: 'transitions', group: 'Wipes & irises', status: 'planned', desc: 'Reveal sweeps around the center like a clock hand' },
  { id: 'transition-radial-wipe', name: 'Radial Wipe', section: 'transitions', group: 'Wipes & irises', status: 'planned', desc: 'Circular edge wipes outward from a center point' },
  { id: 'transition-barn-doors-wipe', name: 'Barn Doors Wipe', section: 'transitions', group: 'Wipes & irises', status: 'planned', desc: 'Two halves part from the center like doors' },
  { id: 'transition-iris-box', name: 'Iris Box', section: 'transitions', group: 'Wipes & irises', status: 'planned', desc: 'Rectangular iris shrinks or grows around the cut' },
  { id: 'transition-iris-cross', name: 'Iris Cross', section: 'transitions', group: 'Wipes & irises', status: 'planned', desc: 'Cross-shaped iris opens or closes on the frame' },
  { id: 'transition-iris-diamond', name: 'Iris Diamond', section: 'transitions', group: 'Wipes & irises', status: 'planned', desc: 'Diamond iris reveals the incoming shot' },
  { id: 'transition-iris-round', name: 'Iris Round', section: 'transitions', group: 'Wipes & irises', status: 'planned', desc: 'Classic round iris like vintage cartoon closings' },
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
