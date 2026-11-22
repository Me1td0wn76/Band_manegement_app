// ドメインモデル定義（MVC の Model 層）

export type AppRole = 'admin' | 'member'

/** 担当パート（Vo / Gt / Ba / Dr / Key） */
export type Part = 'vo' | 'gt' | 'ba' | 'dr' | 'key'
export const PARTS: Part[] = ['vo', 'gt', 'ba', 'dr', 'key']

/** 保存されるイベントの状態。本番当日は表示上 LIVE になる */
export type EventStatus = 'draft' | 'open' | 'confirmed' | 'done' | 'cancelled'
export const EVENT_STATUSES: EventStatus[] = ['draft', 'open', 'confirmed', 'done', 'cancelled']

export interface Member {
  id: string
  name: string
  /** ローマ字表記 */
  kana: string | null
  email: string
  parts: Part[]
  /** 管理者のみ閲覧するメモ */
  note: string | null
  appRole: AppRole
  active: boolean
  /** 初期登録（パスワードの再設定・パート登録）が済んでいない＝招待中 */
  mustChangePassword: boolean
  createdAt: string
}

export interface Band {
  id: string
  name: string
  genre: string | null
  /** false なら休止中（割り振りの対象外） */
  active: boolean
  createdAt: string
}

export interface BandMember {
  bandId: string
  memberId: string
  part: Part
}

export interface BandEvent {
  id: string
  title: string
  /** YYYY-MM-DD */
  date: string
  /** 開場 HH:MM */
  openTime: string | null
  /** 開演 HH:MM */
  startTime: string | null
  venue: string | null
  /** 定員 */
  capacity: number | null
  /** 集客（予約・販売数） */
  sold: number
  description: string | null
  status: EventStatus
  createdAt: string
}

/** イベントへのバンドの出演。割り振りの確定状態を持つ */
export interface EventBand {
  eventId: string
  bandId: string
  order: number
  confirmedAt: string | null
}

/** 役割の枠（イベント × バンド × パート）。memberId が割り当て */
export interface Slot {
  id: string
  eventId: string
  bandId: string
  part: Part
  label: string
  sortOrder: number
  memberId: string | null
  /** true の枠は自動割り振りで変更しない */
  locked: boolean
}

export type ActivityKind = 'event' | 'member' | 'band' | 'assign' | 'onboarding' | 'profile'

export interface Activity {
  id: string
  actorId: string | null
  kind: ActivityKind
  text: string
  eventId: string | null
  bandId: string | null
  createdAt: string
}

export interface AppSnapshot {
  members: Member[]
  bands: Band[]
  bandMembers: BandMember[]
  events: BandEvent[]
  eventBands: EventBand[]
  slots: Slot[]
  activities: Activity[]
}

// ---- 入力型 ----

export interface MemberCreateInput {
  name: string
  kana: string | null
  email: string
  /** 初期パスワード */
  password: string
  parts: Part[]
  appRole: AppRole
  note: string | null
  bandIds: string[]
}

export interface MemberUpdateInput {
  name: string
  kana: string | null
  email: string
  parts: Part[]
  appRole: AppRole
  active: boolean
  note: string | null
}

export interface ProfileUpdateInput {
  name: string
  kana: string | null
  parts: Part[]
}

export interface OnboardingInput {
  password: string
  parts: Part[]
}

export interface BandInput {
  name: string
  genre: string | null
  active: boolean
  members: { memberId: string; part: Part }[]
}

export interface SlotTemplate {
  part: Part
  label: string
}

export interface EventInput {
  title: string
  date: string
  openTime: string | null
  startTime: string | null
  venue: string | null
  capacity: number | null
  sold: number
  description: string | null
  status: EventStatus
  /** 出演順。新しく追加されたバンドには slots の枠を作る */
  bands: { bandId: string; slots: SlotTemplate[] }[]
}

export interface SlotAssignment {
  id: string
  memberId: string | null
  locked: boolean
}

export interface ActivityInput {
  kind: ActivityKind
  text: string
  eventId?: string | null
  bandId?: string | null
}
