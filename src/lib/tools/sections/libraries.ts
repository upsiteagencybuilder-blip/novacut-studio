import type { ProTool } from '../types'

/**
 * Pro Toolkit — libraries section.
 * Stock and element libraries mapped to NovaCut: local persistent media
 * library, emoji sticker packs + procedural vector shapes, social elements
 * and vlog callouts, 200 procedural SFX (incl. nature, human, foley and
 * transition families) and 64 procedural music tracks.
 */

export const LIBRARIES_TOOLS: ProTool[] = [
  // -------- Project media --------
  { id: 'library-project-media', name: 'Project Media', section: 'libraries', group: 'Project media', status: 'live', desc: 'Imported files persist locally with thumbnails, waveforms and durations', action: 'open-media' },
  { id: 'library-shared-media', name: 'Shared Media', section: 'libraries', group: 'Project media', status: 'planned', desc: 'Cloud-synced media shared across devices and teams' },

  // -------- Stock & assets --------
  { id: 'library-sample-colors', name: 'Sample Colors', section: 'libraries', group: 'Stock & assets', status: 'planned', desc: 'Curated solid color swatches for backgrounds and slates' },
  { id: 'library-sample-videos', name: 'Sample Videos', section: 'libraries', group: 'Stock & assets', status: 'planned', desc: 'Demo project bundles three sample images, not videos' },
  { id: 'library-filmstock', name: 'Filmstock Library', section: 'libraries', group: 'Stock & assets', status: 'planned', desc: 'Browsable packs of footage, templates and licensed media' },
  { id: 'library-giphy', name: 'GIPHY Library', section: 'libraries', group: 'Stock & assets', status: 'planned', desc: 'Search and drop GIFs straight from GIPHY' },
  { id: 'library-pixabay', name: 'Pixabay Library', section: 'libraries', group: 'Stock & assets', status: 'planned', desc: 'Royalty-free Pixabay videos and images in-app' },
  { id: 'library-unsplash', name: 'Unsplash Library', section: 'libraries', group: 'Stock & assets', status: 'planned', desc: 'High-resolution Unsplash photography search built in' },
  { id: 'library-pexels', name: 'Pexels Library', section: 'libraries', group: 'Stock & assets', status: 'planned', desc: 'Free Pexels stock video and photo integration' },
  { id: 'library-featured-music', name: 'Featured Music Library', section: 'libraries', group: 'Stock & assets', status: 'live', desc: 'Sixty four procedural music tracks browsable and previewable in the Audio hub', action: 'open-audio' },
  { id: 'library-sfx', name: 'Sound Effects (SFX) Library', section: 'libraries', group: 'Stock & assets', status: 'live', desc: 'Two hundred procedural SFX across 20 families, browsable in the Audio hub', action: 'open-audio' },
  { id: 'library-audio-favorites', name: 'Audio Favorites & Recents', section: 'libraries', group: 'Stock & assets', status: 'live', desc: 'Star music, SFX and imported audio — favorites persist on device and sync across panels', action: 'open-audio' },
  { id: 'library-atmosphere-sounds', name: 'Atmosphere Sounds', section: 'libraries', group: 'Stock & assets', status: 'live', desc: 'Nature family renders weather and ambience beds like storms' },
  { id: 'library-transition-sfx', name: 'Transition SFX', section: 'libraries', group: 'Stock & assets', status: 'live', desc: 'Whoosh, riser and sweep families are tagged for transitions' },
  { id: 'library-game-sounds', name: 'Game Sounds', section: 'libraries', group: 'Stock & assets', status: 'planned', desc: 'Laser and zap families touch it, dedicated game packs remain roadmap' },
  { id: 'library-human-sounds', name: 'Human Sounds', section: 'libraries', group: 'Stock & assets', status: 'live', desc: 'Human and Life family renders heartbeats, crowds and applause' },

  // -------- Elements & stickers --------
  { id: 'library-social-elements', name: 'Social Media Elements', section: 'libraries', group: 'Elements & stickers', status: 'live', desc: 'Like, comment, subscribe, LIVE badge and follower elements draw procedurally', action: 'open-stickers' },
  { id: 'library-emojis-stickers', name: 'Emojis & Stickers', section: 'libraries', group: 'Elements & stickers', status: 'live', desc: 'Six emoji packs plus shapes, social and vlog stickers from the sticker panel', action: 'open-stickers' },
  { id: 'library-shapes', name: 'Shapes Library', section: 'libraries', group: 'Elements & stickers', status: 'live', desc: '18 vector shapes — stars, bursts, hearts, arrows, polygons — recolorable', action: 'open-stickers' },
  { id: 'library-vlog-elements', name: 'Vlog Elements', section: 'libraries', group: 'Elements & stickers', status: 'live', desc: 'Callouts, speech bubbles, frames, progress bars and curved arrows', action: 'open-stickers' },
  { id: 'library-split-screen-layouts', name: 'Split Screen Layouts', section: 'libraries', group: 'Elements & stickers', status: 'planned', desc: 'Preset multi-clip grid layouts for split screens' },
]
