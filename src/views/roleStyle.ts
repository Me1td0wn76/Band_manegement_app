import type { RoleIcon, RoleScope, StaffRole } from '../models/types'

/** 役割の識別色（Riffboard のパート色トークンを順番に使う。必ず名前と一緒に出す） */
const TOKENS = ['--role-gt', '--role-ba', '--role-key', '--role-dr', '--role-vo']

export function roleColor(roles: StaffRole[], roleId: string): string {
  const i = Math.max(0, roles.findIndex((r) => r.id === roleId))
  return `var(${TOKENS[i % TOKENS.length]})`
}

export const ROLE_ICON_LABEL: Record<RoleIcon, string> = {
  camera: 'カメラ',
  spotlight: '照明',
  megaphone: 'メガホン',
  stopwatch: 'ストップウォッチ',
  sliders: 'ミキサー',
  mic: 'マイク',
  note: '音符',
  users: '人',
  bolt: '稲妻',
  knob: 'ノブ',
}

export const SCOPE_LABEL: Record<RoleScope, { short: string; long: string }> = {
  event: { short: '全体', long: 'ライブ全体で固定' },
  act: { short: '出演ごと', long: '出演ごとに交代' },
}
