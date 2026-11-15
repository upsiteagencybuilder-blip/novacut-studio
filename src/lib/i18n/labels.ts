'use client'

/**
 * NovaCut Studio — UX60 Phase 6 (Days 46–47): Bangla UI glossary.
 *
 * A single bilingual dictionary keyed by the exact English string used in
 * the code. `useLabel()` returns a `l('Import media')` function that
 * translates when the device locale is `bn` (cookie `novacut.locale`,
 * server-driven via next-intl) and passes through otherwise — zero runtime
 * cost when untouched and never breaking an untranslated string.
 *
 * Honesty rule: this glossary covers the PRIMARY CHROME (rail, top bar,
 * transport, timeline toolbar, panel headers/buttons/empty states,
 * properties section titles, dialog titles, shortcuts dialog + printable
 * sheet). Deep tooltips, long-form descriptions and catalog bodies stay
 * English; the coverage is measured in E2E and disclosed in the worklog —
 * never claimed beyond what ships.
 */
import { useLocale } from 'next-intl'

const BN: Record<string, string> = {
  /* ---- rail + panel titles ---- */
  Media: 'মিডিয়া',
  Text: 'টেক্সট',
  Stickers: 'স্টিকার',
  Effects: 'এফেক্ট',
  Audio: 'অডিও',
  AI: 'এআই',
  Pro: 'প্রো',
  Help: 'সহায়তা',
  'Media library': 'মিডিয়া লাইব্রেরি',
  'Tool panels — arrows move, Alt+1–9 jumps': 'টুল প্যানেল — তীরে সরুন, Alt+১–৯ লাফ দেয়',
  'Text & titles': 'টেক্সট ও টাইটেল',
  'AI magic': 'এআই ম্যাজিক',
  'Pro toolkit': 'প্রো টুলকিট',

  /* ---- top bar ---- */
  Undo: 'আনডু',
  Redo: 'রিডো',
  Language: 'ভাষা',
  'Edit history': 'এডিট ইতিহাস',
  'Edit history (undo/redo stack)': 'এডিট ইতিহাস (আনডু/রিডো স্ট্যাক)',
  'Version history': 'সংস্করণ ইতিহাস',
  'Audio mixer': 'অডিও মিক্সার',
  'Simple mode — hides pro-only controls (curves, wheels, LUTs, keyframes…). One switch brings them back.':
    'সিম্পল মোড — শুধু প্রো-নিয়ন্ত্রণ লুকায় (কার্ভ, হুইল, LUT, কিফ্রেম…)। এক সুইচে সব ফিরে আসে।',
  'Toggle Simple mode': 'সিম্পল মোড টগল',
  Simple: 'সিম্পল',
  Display: 'ডিসপ্লে',
  'Display: panel density + Simple mode': 'ডিসপ্লে: প্যানেল ঘনত্ব + সিম্পল মোড',
  'Display settings': 'ডিসপ্লে সেটিংস',
  'Panel density': 'প্যানেল ঘনত্ব',
  Comfortable: 'আরামদায়ক',
  Compact: 'কমপ্যাক্ট',
  'Simple mode': 'সিম্পল মোড',
  'Compact tightens panel paddings — controls keep their touch size. Remembered per device.':
    'কমপ্যাক্ট প্যানেলের প্যাডিং কমায় — নিয়ন্ত্রণের স্পর্শ-আকার অপরিবর্তিত থাকে। প্রতি ডিভাইসে মনে রাখা হয়।',
  Projects: 'প্রজেক্ট',
  'Theme Studio': 'থিম স্টুডিও',
  'Theme Studio — change the whole look': 'থিম স্টুডিও — পুরো চেহারা বদলান',
  'Open Theme Studio': 'থিম স্টুডিও খুলুন',
  'Open Theme Studio panel': 'থিম স্টুডিও প্যানেল খুলুন',
  'Keyboard shortcuts': 'কীবোর্ড শর্টকাট',
  'Send feedback': 'মতামত পাঠান',
  'Account (optional sign-in)': 'অ্যাকাউন্ট (ঐচ্ছিক সাইন-ইন)',
  Export: 'এক্সপোর্ট',
  Saved: 'সেভ হয়েছে',
  'Saving…': 'সেভ হচ্ছে…',
  Retrying: 'আবার চেষ্টা করছে',
  Ready: 'প্রস্তুত',
  'Project name': 'প্রজেক্টের নাম',

  /* ---- transport + preview ---- */
  'Go to start': 'শুরুতে যান',
  'Previous frame': 'আগের ফ্রেম',
  Play: 'প্লে',
  Pause: 'বিরতি',
  'Next frame': 'পরের ফ্রেম',
  'Go to end': 'শেষে যান',
  'Monitor overlays menu': 'মনিটর ওভারলে মেনু',
  'Zebra threshold': 'জেব্রা থ্রেশহোল্ড',
  'Compare split view': 'তুলনা স্প্লিট ভিউ',
  'Exit compare split': 'তুলনা স্প্লিট বন্ধ',
  'Mute master volume': 'মাস্টার ভলিউম মিউট',
  'Unmute master volume': 'মাস্টার ভলিউম আনমিউট',
  'Master volume': 'মাস্টার ভলিউম',
  'Toggle fullscreen preview': 'ফুলস্ক্রিন প্রিভিউ টগল',
  'Compare split position': 'তুলনা স্প্লিট অবস্থান',
  'Program preview — live composite of the timeline at the playhead':
    'প্রোগ্রাম প্রিভিউ — প্লেহেডে টাইমলাইনের সরাসরি কম্পোজিট',
  Restore: 'পুনরুদ্ধার',
  'Restore full preview resolution and auto-scaling':
    'প্রিভিউয়ের পূর্ণ রেজোলিউশন ও অটো-স্কেলিং পুনরুদ্ধার',
  'Pause (Space)': 'বিরতি (Space)',
  'Play (Space)': 'প্লে (Space)',
  'Compare split: original ⇔ graded': 'তুলনা স্প্লিট: আসল ⇔ গ্রেডেড',
  Unmute: 'আনমিউট',
  Mute: 'মিউট',
  'Mute track': 'ট্র্যাক মিউট',
  'Unmute track': 'ট্র্যাক আনমিউট',
  panel: 'প্যানেল',
  'Install NovaCut as an app': 'NovaCut অ্যাপ হিসেবে ইনস্টল করুন',

  /* ---- timeline toolbar ---- */
  'Copy selected clips': 'নির্বাচিত ক্লিপ কপি',
  'Cut selected clips': 'নির্বাচিত ক্লিপ কাট',
  'Paste clips at playhead': 'প্লেহেডে ক্লিপ পেস্ট',
  'Split at playhead': 'প্লেহেডে স্প্লিট',
  'Insert freeze frame at playhead': 'প্লেহেডে ফ্রিজ ফ্রেম',
  'Extract audio from video clip': 'ভিডিও ক্লিপ থেকে অডিও আলাদা',
  'Add adjustment layer at playhead': 'প্লেহেডে অ্যাডজাস্টমেন্ট লেয়ার',
  'Duplicate selected clip': 'নির্বাচিত ক্লিপের অনুলিপি',
  'Delete selected clips': 'নির্বাচিত ক্লিপ মুছুন',
  'More delete options': 'আরও মুছে-ফেলার অপশন',
  'Toggle snapping': 'স্ন্যাপিং টগল',
  'Timeline markers': 'টাইমলাইন মার্কার',
  'Beat sync markers': 'বিট সিঙ্ক মার্কার',
  'Suggest highlights — find and trim dead air': 'হাইলাইট সাজেস্ট — নীরবতা খুঁজে ছাঁটুন',
  'Blade tool': 'ব্লেড টুল',
  'Ripple edit tool': 'রিপল এডিট টুল',
  'Roll edit tool': 'রোল এডিট টুল',
  'Slip tool': 'স্লিপ টুল',
  'Slide tool': 'স্লাইড টুল',
  'In and Out points': 'ইন ও আউট পয়েন্ট',
  'Previous edit point': 'আগের এডিট পয়েন্ট',
  'Next edit point': 'পরের এডিট পয়েন্ট',
  'Zoom out': 'জুম আউট',
  'Timeline zoom': 'টাইমলাইন জুম',
  'Zoom in': 'জুম ইন',
  'Fit timeline': 'টাইমলাইন ফিট',

  /* ---- properties section titles ---- */
  Sticker: 'স্টিকার',
  'Audio FX': 'অডিও এফেক্ট',
  'Shape Mask': 'শেপ মাস্ক',
  Crop: 'ক্রপ',
  'Adjustment Layer': 'অ্যাডজাস্টমেন্ট লেয়ার',
  Duration: 'দৈর্ঘ্য',
  Transform: 'ট্রান্সফর্ম',
  Filters: 'ফিল্টার',
  Fade: 'ফেড',
  Project: 'প্রজেক্ট',
  Animation: 'অ্যানিমেশন',
  'Blend Mode': 'ব্লেন্ড মোড',
  'Color Grade': 'কালার গ্রেড',
  'Color Wheels': 'কালার হুইল',
  Curves: 'কার্ভস',
  'Green Screen': 'গ্রিন স্ক্রিন',
  LUT: 'LUT',
  Scopes: 'স্কোপ',
  Video: 'ভিডিও',
  Image: 'ছবি',
  Compound: 'কম্পাউন্ড',
  Adjustment: 'অ্যাডজাস্টমেন্ট',

  /* ---- media panel ---- */
  'Import media': 'মিডিয়া আমদানি',
  'Add to timeline': 'টাইমলাইনে যোগ করুন',
  'Delete from library': 'লাইব্রেরি থেকে মুছুন',
  'Drop files to import': 'আমদানির জন্য ফাইল ছেড়ে দিন',
  'Import video, photos or music to start editing': 'এডিটিং শুরুতে ভিডিও, ছবি বা মিউজিক আমদানি করুন',
  'Try demo project': 'ডেমো প্রজেক্ট দেখুন',
  'Browse media': 'মিডিয়া দেখুন',
  'Your media library is empty': 'আপনার মিডিয়া লাইব্রেরি খালি',
  'Double-click to add': 'যোগ করতে ডাবল-ক্লিক করুন',
  'to the timeline': 'টাইমলাইনে',

  /* ---- text panel ---- */
  'Add text': 'টেক্সট যোগ করুন',
  'Title presets': 'টাইটেল প্রিসেট',
  'Browse all titles': 'সব টাইটেল দেখুন',
  Add: 'যোগ করুন',
  'at playhead': 'প্লেহেডে',
  Favorites: 'প্রিয়',
  Used: 'ব্যবহৃত',
  All: 'সব',
  Recent: 'সাম্প্রতিক',

  /* ---- effects / sticker / sound ---- */
  'Browse all effects': 'সব এফেক্ট দেখুন',
  'Browse all emoji': 'সব ইমোজি দেখুন',
  'Clear search': 'সার্চ মুছুন',
  'Clear filters': 'ফিল্টার মুছুন',
  Sound: 'সাউন্ড',
  'Sound browser': 'সাউন্ড ব্রাউজার',

  /* ---- shortcuts dialog + printable sheet ---- */
  'Edit at the speed of thought.': 'চিন্তার গতিতে এডিট করুন।',
  'Fixed bindings': 'নির্দিষ্ট বাইন্ডিং',
  'Custom bindings are stored on this device only.': 'কাস্টম বাইন্ডিং শুধু এই ডিভাইসে সংরক্ষিত।',
  'Reset all': 'সব রিসেট',
  'Print sheet': 'শিট প্রিন্ট করুন',
  'Print — a one-page sheet of every binding': 'প্রিন্ট — প্রতিটি বাইন্ডিংয়ের এক পাতার শিট',
  'All shortcuts back to their shipped bindings': 'সব শর্টকাট আবার আসল বাইন্ডিংয়ে ফিরে গেল',
  'Keyboard shortcuts — printable sheet': 'কীবোর্ড শর্টকাট — প্রিন্টযোগ্য শিট',
  'Customizable actions': 'কাস্টমাইজযোগ্য অ্যাকশন',
  Action: 'অ্যাকশন',
  'Current binding': 'বর্তমান বাইন্ডিং',
  Keys: 'কী',
  Rebind: 'রিবাইন্ড',
  'Rebind — press the new key combination': 'রিবাইন্ড — নতুন কী সমন্বয় চাপুন',
  'Press keys…': 'কী চাপুন…',
  custom: 'কাস্টম',
  'Panel navigation': 'প্যানেল নেভিগেশন',

  /* ---- command palette ---- */
  'Command palette': 'কমান্ড প্যালেট',
  'Command palette search': 'কমান্ড প্যালেট সার্চ',

  /* ---- a11y + announcements ---- */
  'Selection cleared': 'নির্বাচন মুছে গেছে',
  'Select tool': 'সিলেক্ট টুল',
  'Project saved to this device': 'প্রজেক্ট এই ডিভাইসে সেভ হয়েছে',
  'Autosave retrying': 'অটোসেভ আবার চেষ্টা করছে',
  'Export finished': 'এক্সপোর্ট শেষ',
}

/** translate an English chrome string into Bangla (pass-through if missing) */
export function bnLabel(en: string): string {
  return BN[en] ?? en
}

/**
 * `const l = useLabel()` → `l('Import media')`.
 * Returns the identity function for `en` so no code path changes shape.
 */
export function useLabel(): (en: string) => string {
  const locale = useLocale()
  return locale === 'bn' ? bnLabel : (en: string) => en
}

export default bnLabel
