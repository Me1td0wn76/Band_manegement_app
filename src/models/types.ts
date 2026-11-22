// ドメインモデル定義（MVC の Model 層）
// 裏方（撮影・照明・SNS・タイムキーパー・PA など）の管理と、ライブのタイムテーブル作成を扱う。

/** admin = 幹部（管理者）。PA など「幹部のみ」の役割を担当できる */
export type AppRole = 'admin' | 'member'

/** 保存されるイベントの状態。本番当日は表示上 LIVE になる */
export type EventStatus = 'draft' | 'open' | 'confirmed' | 'done' | 'cancelled'
export const EVENT_STATUSES: EventStatus[] = ['draft', 'open', 'confirmed', 'done', 'cancelled']

/** 役割の単位：ライブ全体で固定 / 出演ごとに交代 */
export type RoleScope = 'event' | 'act'

/** タイムテーブルの項目：出演 / 休憩 */
export type ItemKind = 'act' | 'break'

export const ROLE_ICONS = ['camera', 'spotlight', 'megaphone', 'stopwatch', 'sliders', 'mic', 'note', 'users', 'bolt', 'knob'] as const
export type RoleIcon = (typeof ROLE_ICONS)[number]

/** 裏方メンバー */
export interface Member {
  id: string
  name: string
  /** ローマ字表記 */
  kana: string | null
  email: string
  /** 幹部のみ閲覧するメモ */
  note: string | null
  appRole: AppRole
  active: boolean
  /** 初期登録（パスワードの再設定）が済んでいない＝招待中 */
  mustChangePassword: boolean
  createdAt: string
}

/** 裏方の役割（撮影・照明・SNS・タイムキーパー・PA など） */
export interface StaffRole {
  id: string
  name: string
  description: string | null
  icon: RoleIcon
  scope: RoleScope
  /** 新しいイベントでの必要人数（出演ごとの役割は1出演あたり） */
  defaultSlots: number
  /** 幹部（管理者）のみ担当できる */
  adminOnly: boolean
  sortOrder: number
}

export interface LiveEvent {
  id: string
  title: string
  /** YYYY-MM-DD */
  date: string
  /** 開場 HH:MM */
  openTime: string | null
  /** 開演 HH:MM（タイムテーブルの起点） */
  startTime: string | null
  /** 終演予定 HH:MM（自動調整の目標） */
  targetEndTime: string | null
  /** 出演と出演の間の転換時間（分） */
  changeoverMinutes: number
  venue: string | null
  /** 定員 */
  capacity: number | null
  /** 集客（予約・販売数） */
  sold: number
  description: string | null
  status: EventStatus
  /** 裏方の割り振りを確定した日時 */
  staffConfirmedAt: string | null
  createdAt: string
}

/** タイムテーブルの1項目（出演者は名前と演奏時間だけを持つ） */
export interface TimetableItem {
  id: string
  eventId: string
  kind: ItemKind
  name: string
  minutes: number
  sortOrder: number
  /** true の項目は並べ替え・自動調整で位置と時間を変えない */
  locked: boolean
  note: string | null
}

/** イベントごとの役割の必要人数 */
export interface EventRoleSlot {
  eventId: string
  roleId: string
  slots: number
}

/** 裏方の割り当て。itemId は「出演ごと」の役割のときの出演項目 */
export interface Assignment {
  id: string
  eventId: string
  roleId: string
  itemId: string | null
  memberId: string
  /** true の割り当ては自動割り振りで変えない */
  locked: boolean
  createdAt: string
}

/** 参加できない日（自動割り振りの対象外） */
export interface Exclusion {
  eventId: string
  memberId: string
  reason: string | null
}

export type ActivityKind = 'event' | 'timetable' | 'member' | 'role' | 'assign' | 'onboarding' | 'profile' | 'availability'

export interface Activity {
  id: string
  actorId: string | null
  kind: ActivityKind
  text: string
  eventId: string | null
  createdAt: string
}

export interface AppSnapshot {
  members: Member[]
  roles: StaffRole[]
  events: LiveEvent[]
  items: TimetableItem[]
  roleSlots: EventRoleSlot[]
  assignments: Assignment[]
  exclusions: Exclusion[]
  activities: Activity[]
}

// ---- 入力型 ----

export interface MemberCreateInput {
  name: string
  kana: string | null
  email: string
  /** 初期パスワード */
  password: string
  appRole: AppRole
  note: string | null
}

export interface MemberUpdateInput {
  name: string
  kana: string | null
  email: string
  appRole: AppRole
  active: boolean
  note: string | null
}

export interface ProfileUpdateInput {
  name: string
  kana: string | null
}

export interface EventInput {
  title: string
  date: string
  openTime: string | null
  startTime: string | null
  targetEndTime: string | null
  changeoverMinutes: number
  venue: string | null
  capacity: number | null
  sold: number
  description: string | null
  status: EventStatus
  roleSlots: { roleId: string; slots: number }[]
}

export interface TimetableItemInput {
  /** 保存済みの項目の ID。新しい項目は null */
  id: string | null
  kind: ItemKind
  name: string
  minutes: number
  locked: boolean
  note: string | null
}

export interface TimetableInput {
  startTime: string | null
  targetEndTime: string | null
  changeoverMinutes: number
  items: TimetableItemInput[]
}

export interface RoleInput {
  name: string
  description: string | null
  icon: RoleIcon
  scope: RoleScope
  defaultSlots: number
  adminOnly: boolean
  sortOrder: number
}

export interface AssignmentRow {
  roleId: string
  itemId: string | null
  memberId: string
  locked: boolean
}

export interface ActivityInput {
  kind: ActivityKind
  text: string
  eventId?: string | null
}
