import type { Part } from '../../models/types'

// Riffboard icon set — 24px grid, 1.75 stroke, round caps.（Riffboard デザインシステムのアイコン）
// Each value is the inner markup of a <svg viewBox="0 0 24 24">.
export const ICONS = {
  guitar:
    '<path d="M14 10l6.5-6.5"/><path d="M18.6 2.2l3.2 3.2"/><path d="M12.2 9.3c-1.5-1.5-3.7-1.2-4.6.5-.4.7-1.1 1.2-1.9 1.3-1.8.3-3.1 1.8-3.1 3.6 0 2.9 2.8 5.7 5.7 5.7 1.8 0 3.3-1.3 3.6-3.1.1-.8.6-1.5 1.3-1.9 1.7-.9 2-3.1.5-4.6z"/><circle cx="8.6" cy="15.4" r="1.5"/>',
  bass:
    '<path d="M12.6 11.4l8.2-8.2"/><path d="M18.2 1.9l1 1M20.1 3.8l1 1"/><path d="M10.9 10.5c-1.3-1.3-3.3-1-4.1.6-.3.6-.9 1-1.6 1.1-1.6.3-2.7 1.6-2.7 3.2 0 2.6 2.4 5 5 5 1.6 0 2.9-1.1 3.2-2.7.1-.7.5-1.3 1.1-1.6 1.6-.8 1.9-2.8.6-4.1z"/><path d="M5.6 16.6l2.6-2.6"/>',
  drums:
    '<ellipse cx="12" cy="11.5" rx="8" ry="3"/><path d="M4 11.5v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/><path d="M8 14.2v5.6M16 14.2v5.6"/><path d="M5 3l6.2 7M19 3l-6.2 7"/>',
  mic:
    '<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5v4M8.5 21.5h7"/>',
  keys:
    '<rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M6.2 5.5v7h2.3v-7M10.85 5.5v7h2.3v-7M15.5 5.5v7h2.3v-7"/><path d="M7.35 12.5v6M12 12.5v6M16.65 12.5v6"/>',
  dashboard:
    '<rect x="3" y="3" width="7.5" height="9" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="5" rx="1.5"/><rect x="13.5" y="11" width="7.5" height="10" rx="1.5"/><rect x="3" y="15" width="7.5" height="6" rx="1.5"/>',
  calendar:
    '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><path d="M7.5 13.5h3M7.5 16.5h6"/>',
  table:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14.5h18M9 9v11"/>',
  users:
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.4 3.4-5.5 6.5-5.5s5.7 2.1 6.5 5.5"/><path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c1.8.8 3 2.6 3.5 5.2"/>',
  'user-plus':
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.4 3.4-5.5 6.5-5.5s5.7 2.1 6.5 5.5"/><path d="M19 8v6M16 11h6"/>',
  amp:
    '<rect x="3" y="3.5" width="18" height="17" rx="2"/><circle cx="12" cy="14" r="4.2"/><circle cx="12" cy="14" r="1.2"/><path d="M6.5 7h.01M9.5 7h.01M14 7h3.5"/>',
  shuffle:
    '<path d="M3 7h3.5c2 0 3.2 1 4.3 2.7l2.4 4.6c1.1 1.7 2.3 2.7 4.3 2.7H21"/><path d="M3 17h3.5c1.4 0 2.4-.5 3.3-1.4M14.2 8.4c.9-.9 1.9-1.4 3.3-1.4H21"/><path d="M18 4l3 3-3 3M18 14l3 3-3 3"/>',
  bolt: '<path d="M13 2.5L4.5 13.5H11l-1 8 8.5-11.5H12l1-7.5z"/>',
  knob:
    '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 7.5V3.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  trash:
    '<path d="M4 7h16M9.5 7V4.5h5V7"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v5.5M14 11v5.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  logout:
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  eye:
    '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off':
    '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.8 0 3.4-.5 4.8-1.3"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/>',
  key:
    '<circle cx="7.5" cy="15.5" r="4"/><path d="M10.5 12.5L20 3M16.5 6.5l3 3M14 9l2 2"/>',
  lock:
    '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5M12 14.5v2"/>',
  unlock:
    '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 7.6-1.7M12 14.5v2"/>',
  crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin:
    '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  note:
    '<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  'chevron-down': '<path d="M6 9l6 6 6-6"/>',
  'chevron-right': '<path d="M9 6l6 6-6 6"/>',
  'arrow-up': '<path d="M12 19V5M6 11l6-6 6 6"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  grip:
    '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/>',
  alert:
    '<path d="M12 3.5l9.5 16.5h-19L12 3.5z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5h.01"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  cable:
    '<path d="M4 20v-3.5a3 3 0 0 1 3-3h4a3 3 0 0 0 3-3V8"/><rect x="11.5" y="3" width="5" height="5" rx="1"/><path d="M13 3V1.5M15 3V1.5M2.5 20h3"/>',
} as const

export type IconName = keyof typeof ICONS

export const ROLE_META: Record<Part, { short: string; long: string; icon: IconName }> = {
  vo: { short: 'Vo', long: 'ボーカル', icon: 'mic' },
  gt: { short: 'Gt', long: 'ギター', icon: 'guitar' },
  ba: { short: 'Ba', long: 'ベース', icon: 'bass' },
  dr: { short: 'Dr', long: 'ドラム', icon: 'drums' },
  key: { short: 'Key', long: 'キーボード', icon: 'keys' },
}

// The Riffboard mark: a pick with a waveform cut through it.
export const MARK_PICK = 'M32 61C19 50 5 33 5 19 5 8.5 17 3 32 3s27 5.5 27 16c0 14-14 31-27 42z'
export const MARK_WAVE = 'M11 23h5l3-7 5 15 5-20 5 22 5-17 4 10 3-3h7'
