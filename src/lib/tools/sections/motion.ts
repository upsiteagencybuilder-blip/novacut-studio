import type { ProTool } from '../types'

/**
 * Pro Toolkit — motion section.
 * Typography and title tools mapped to NovaCut's text engine: TextStyle ships
 * align, font family, size, letter spacing (tracking), line height (leading),
 * fill, stroke, background, shadow + blur, with 21 text animations and 150
 * text effects in the browser.
 */

export const MOTION_TOOLS: ProTool[] = [
  // -------- Typography controls --------
  { id: 'motion-text-align-left', name: 'Text Align Left', section: 'motion', group: 'Typography controls', status: 'live', desc: 'Pick left alignment for a text clip in the properties' },
  { id: 'motion-text-align-center', name: 'Text Align Center', section: 'motion', group: 'Typography controls', status: 'live', desc: 'Pick center alignment for a text clip in the properties', action: 'open-text' },
  { id: 'motion-text-align-right', name: 'Text Align Right', section: 'motion', group: 'Typography controls', status: 'live', desc: 'Pick right alignment for a text clip in the properties' },
  { id: 'motion-font-family-dropdown', name: 'Font Family Dropdown', section: 'motion', group: 'Typography controls', status: 'live', desc: 'Fourteen fonts including Bangla families in the text styling dropdown', action: 'open-text' },
  { id: 'motion-font-style-selector', name: 'Font Style Selector', section: 'motion', group: 'Typography controls', status: 'planned', desc: 'Full weight and width axes beyond bold remain roadmap' },
  { id: 'motion-font-size-slider', name: 'Font Size Slider', section: 'motion', group: 'Typography controls', status: 'live', desc: 'Size slider scales text in canvas pixel units in properties', action: 'open-text' },
  { id: 'motion-tracking-control', name: 'Tracking Control', section: 'motion', group: 'Typography controls', status: 'live', desc: 'Letter spacing slider adds tracking between characters in properties', action: 'open-text' },
  { id: 'motion-kerning-control', name: 'Kerning Control', section: 'motion', group: 'Typography controls', status: 'planned', desc: 'Adjust spacing between individual character pairs' },
  { id: 'motion-leading-control', name: 'Leading Control', section: 'motion', group: 'Typography controls', status: 'live', desc: 'Line height slider sets leading for multiline text' },
  { id: 'motion-baseline-shift-slider', name: 'Baseline Shift Slider', section: 'motion', group: 'Typography controls', status: 'planned', desc: 'Raise or lower characters relative to the baseline' },
  { id: 'motion-tsume-control', name: 'Tsume Control', section: 'motion', group: 'Typography controls', status: 'planned', desc: 'Tighten CJK glyph spacing with tsume adjustment' },
  { id: 'motion-paragraph-formatting-panel', name: 'Paragraph Formatting Panel', section: 'motion', group: 'Typography controls', status: 'planned', desc: 'Dedicated paragraph panel with indents and justification' },
  { id: 'motion-character-formatting-panel', name: 'Character Formatting Panel', section: 'motion', group: 'Typography controls', status: 'planned', desc: 'Full character sheet beyond the current styling sliders' },
  { id: 'motion-glyphs-panel', name: 'Glyphs Panel', section: 'motion', group: 'Typography controls', status: 'planned', desc: 'Browse and insert every glyph a font provides' },
  { id: 'motion-text-path-tool', name: 'Text Path Tool', section: 'motion', group: 'Typography controls', status: 'planned', desc: 'Flow type along a drawn bezier path' },

  // -------- Text styling --------
  { id: 'motion-faux-bold-toggle', name: 'Faux Bold Toggle', section: 'motion', group: 'Text styling', status: 'live', desc: 'Bold toggle synthesizes a heavier weight even for fonts without one' },
  { id: 'motion-faux-italic-toggle', name: 'Faux Italic Toggle', section: 'motion', group: 'Text styling', status: 'live', desc: 'Italic toggle synthesizes the slant even for upright fonts' },
  { id: 'motion-all-caps-toggle', name: 'All Caps Toggle', section: 'motion', group: 'Text styling', status: 'live', desc: 'Uppercase toggle renders text in caps without editing the source' },
  { id: 'motion-small-caps-toggle', name: 'Small Caps Toggle', section: 'motion', group: 'Text styling', status: 'planned', desc: 'Render lowercase as scaled-down capitals' },
  { id: 'motion-superscript-toggle', name: 'Superscript Toggle', section: 'motion', group: 'Text styling', status: 'planned', desc: 'Raise and shrink characters like exponents' },
  { id: 'motion-subscript-toggle', name: 'Subscript Toggle', section: 'motion', group: 'Text styling', status: 'planned', desc: 'Lower and shrink characters like formula indices' },
  { id: 'motion-underline-toggle', name: 'Underline Toggle', section: 'motion', group: 'Text styling', status: 'live', desc: 'Underline toggle draws an underline beneath the selected text' },
  { id: 'motion-strikethrough-toggle', name: 'Strikethrough Toggle', section: 'motion', group: 'Text styling', status: 'live', desc: 'Strikethrough toggle strikes a line through selected text' },
  { id: 'motion-text-fill-color-picker', name: 'Text Fill Color Picker', section: 'motion', group: 'Text styling', status: 'live', desc: 'Color picker sets the text fill in properties', action: 'open-text' },
  { id: 'motion-text-stroke-color-picker', name: 'Text Stroke Color Picker', section: 'motion', group: 'Text styling', status: 'live', desc: 'Stroke color picker pairs with the stroke width slider' },
  { id: 'motion-stroke-width-slider', name: 'Stroke Width Slider', section: 'motion', group: 'Text styling', status: 'live', desc: 'Stroke width slider outlines characters in any color', action: 'open-text' },
  { id: 'motion-text-background-toggle', name: 'Text Background Toggle', section: 'motion', group: 'Text styling', status: 'live', desc: 'Background toggle and color chip pad the text block' },
  { id: 'motion-text-shadow-toggle', name: 'Text Shadow Toggle', section: 'motion', group: 'Text styling', status: 'live', desc: 'Shadow toggle enables the drop shadow with blur control' },
  { id: 'motion-shadow-opacity-slider', name: 'Shadow Opacity Slider', section: 'motion', group: 'Text styling', status: 'live', desc: 'Shadow opacity slider dials shadow strength separately from its color' },
  { id: 'motion-shadow-angle-wheel', name: 'Shadow Angle Wheel', section: 'motion', group: 'Text styling', status: 'live', desc: 'Shadow angle dial aims the drop shadow around the text block' },
  { id: 'motion-shadow-distance-slider', name: 'Shadow Distance Slider', section: 'motion', group: 'Text styling', status: 'live', desc: 'Shadow distance slider pushes the drop shadow closer or further from glyphs' },
  { id: 'motion-shadow-blur-slider', name: 'Shadow Blur Slider', section: 'motion', group: 'Text styling', status: 'live', desc: 'Shadow blur slider softens the text drop shadow' },

  // -------- Titles & templates --------
  { id: 'motion-responsive-design-time', name: 'Responsive Design (Time)', section: 'motion', group: 'Titles & templates', status: 'planned', desc: 'Protect intro and outro animation time when resizing titles' },
  { id: 'motion-responsive-design-position', name: 'Responsive Design (Position)', section: 'motion', group: 'Titles & templates', status: 'planned', desc: 'Pin title regions so text swaps keep alignment' },
  { id: 'motion-pin-to-layer-option', name: 'Pin to Layer Option', section: 'motion', group: 'Titles & templates', status: 'planned', desc: 'Attach graphics to tracked layers or regions' },
  { id: 'motion-roll-title-toggle', name: 'Roll Title Toggle', section: 'motion', group: 'Titles & templates', status: 'live', desc: 'Roll animation scrolls a title vertically like end credits' },
  { id: 'motion-crawl-title-toggle', name: 'Crawl Title Toggle', section: 'motion', group: 'Titles & templates', status: 'live', desc: 'Crawl animation scrolls a title horizontally like a news ticker' },
  { id: 'motion-mogrt-templates', name: 'Essential Graphics Templates (.mogrt)', section: 'motion', group: 'Titles & templates', status: 'planned', desc: 'Import Premiere motion graphics template packages' },
  { id: 'motion-opener-library', name: 'Opener Library', section: 'motion', group: 'Titles & templates', status: 'planned', desc: 'Ready-made openers and intro stingers library' },
  { id: 'motion-titles-library', name: 'Titles Library', section: 'motion', group: 'Titles & templates', status: 'live', desc: 'Title presets like Big Title and Neon Glow add styled clips', action: 'open-text' },
  { id: 'motion-lower-thirds-library', name: 'Lower Thirds Library', section: 'motion', group: 'Titles & templates', status: 'live', desc: 'Lower Third and Lower Third Bar presets ship in the text panel' },
  { id: 'motion-subtitles-library', name: 'Subtitles Library', section: 'motion', group: 'Titles & templates', status: 'live', desc: 'Caption preset styles subtitle text, auto captions fill content' },
  { id: 'motion-end-credits-library', name: 'End Credits Library', section: 'motion', group: 'Titles & templates', status: 'planned', desc: 'Rolling credit templates with industry-standard layout' },
  { id: 'motion-wordart-styles', name: 'WordArt Styles', section: 'motion', group: 'Titles & templates', status: 'live', desc: 'Comic Pop and Outline Bold presets give instant word-art looks' },

  // -------- Text animation --------
  { id: 'motion-source-text-keyframe-tool', name: 'Source Text Keyframe Tool', section: 'motion', group: 'Text animation', status: 'planned', desc: 'Keyframe the text content itself over time' },
  { id: 'motion-text-animator-properties', name: 'Text Animator Properties', section: 'motion', group: 'Text animation', status: 'live', desc: 'Twenty one text animations with per clip duration in properties', action: 'open-effects' },
  { id: 'motion-range-selector', name: 'Range Selector', section: 'motion', group: 'Text animation', status: 'planned', desc: 'Animate character ranges with start, end and offset' },
  { id: 'motion-wiggly-selector', name: 'Wiggly Selector', section: 'motion', group: 'Text animation', status: 'planned', desc: 'Randomize per-character animation with wiggly controls' },
  { id: 'motion-expression-selector', name: 'Expression Selector', section: 'motion', group: 'Text animation', status: 'planned', desc: 'Drive per-character animation with expressions' },
  { id: 'motion-text-animation-panel', name: 'Text Animation Panel', section: 'motion', group: 'Text animation', status: 'live', desc: 'Effects browser text category carries 150 animated text effects', action: 'open-effects' },
]
