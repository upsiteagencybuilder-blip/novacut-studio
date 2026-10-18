import type { ProTool } from '../types'

/**
 * Pro Toolkit — libraries section.
 * Stock and element libraries mapped to NovaCut: local persistent media
 * library, six sticker categories, 200 procedural SFX (incl. nature,
 * human, foley and transition families) and 64 procedural music tracks.
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
  { id: 'library-featured-music', name: 'Featured Music Library', section: 'libraries', group: 'Stock & assets', status: 'beta', desc: 'Sixty four procedural music tracks across genres and moods' },
  { id: 'library-sfx', name: 'Sound Effects (SFX) Library', section: 'libraries', group: 'Stock & assets', status: 'live', desc: 'Two hundred procedural SFX render to WAV and import', action: 'open-effects' },
  { id: 'library-atmosphere-sounds', name: 'Atmosphere Sounds', section: 'libraries', group: 'Stock & assets', status: 'live', desc: 'Nature family renders weather and ambience beds like storms' },
  { id: 'library-transition-sfx', name: 'Transition SFX', section: 'libraries', group: 'Stock & assets', status: 'live', desc: 'Whoosh, riser and sweep families are tagged for transitions' },
  { id: 'library-game-sounds', name: 'Game Sounds', section: 'libraries', group: 'Stock & assets', status: 'planned', desc: 'Laser and zap families touch it, dedicated game packs remain roadmap' },
  { id: 'library-human-sounds', name: 'Human Sounds', section: 'libraries', group: 'Stock & assets', status: 'live', desc: 'Human and Life family renders heartbeats, crowds and applause' },

  // -------- Elements & stickers --------
  { id: 'library-social-elements', name: 'Social Media Elements', section: 'libraries', group: 'Elements & stickers', status: 'planned', desc: 'Dedicated social element packs beyond sticker sets remain roadmap' },
  { id: 'library-emojis-stickers', name: 'Emojis & Stickers', section: 'libraries', group: 'Elements & stickers', status: 'live', desc: 'Six sticker categories add emoji clips from the sticker panel', action: 'open-stickers' },
  { id: 'library-shapes', name: 'Shapes Library', section: 'libraries', group: 'Elements & stickers', status: 'planned', desc: 'Vector shapes and badges as draggable overlay elements' },
  { id: 'library-vlog-elements', name: 'Vlog Elements', section: 'libraries', group: 'Elements & stickers', status: 'planned', desc: 'Vlog-style frames, arrows and callout element packs' },
  { id: 'library-split-screen-layouts', name: 'Split Screen Layouts', section: 'libraries', group: 'Elements & stickers', status: 'planned', desc: 'Preset multi-clip grid layouts for split screens' },
]
