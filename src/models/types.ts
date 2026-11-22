// ドメインモデル定義（MVC の Model 層）

export type AppRole = 'admin' | 'member'
export type EventStatus = 'scheduled' | 'completed' | 'cancelled'
export type AssignmentSource = 'auto' | 'manual'
export type AssignmentMode = 'regenerate' | 'fill'

export interface Member {
  id: string
  name: string
  email: string
  /** 担当楽器・パート（Vo / Gt / Ba / Dr / Key など） */
  part: string | null
  note: string | null
  appRole: AppRole
  active: boolean
  /** 初期パスワードのままの場合 true（初回ログイン時に変更を求める） */
  mustChangePassword: boolean
  createdAt: string
}

export interface Band {
  id: string
  name: string
  description: string | null
  createdAt: string
}

export interface BandMember {
  bandId: string
  memberId: string
  part: string
}

export interface BandEvent {
  id: string
  title: string
  /** YYYY-MM-DD */
  date: string
  /** HH:MM */
  startTime: string | null
  endTime: string | null
  venue: string | null
  description: string | null
  status: EventStatus
  createdAt: string
}

export interface EventBand {
  eventId: string
  bandId: string
  order: number
}

/** 役割マスタ（PA・照明・受付など） */
export interface Role {
  id: string
  name: string
  description: string | null
  defaultSlots: number
  sortOrder: number
}

/** イベントごとの役割の必要人数 */
export interface EventRoleSlot {
  eventId: string
  roleId: string
  slots: number
}

export interface Assignment {
  id: string
  eventId: string
  roleId: string
  memberId: string
  source: AssignmentSource
  /** true の割り当ては自動割り振りの再実行でも保持される */
  locked: boolean
  createdAt: string
}

/** 参加不可（自動割り振りの対象外） */
export interface Exclusion {
  eventId: string
  memberId: string
  reason: string | null
}

export interface AssignmentRun {
  id: string
  executedBy: string | null
  executedAt: string
  eventIds: string[]
  assignedCount: number
  mode: AssignmentMode
}

export interface AppSnapshot {
  members: Member[]
  bands: Band[]
  bandMembers: BandMember[]
  events: BandEvent[]
  eventBands: EventBand[]
  roles: Role[]
  eventRoleSlots: EventRoleSlot[]
  assignments: Assignment[]
  exclusions: Exclusion[]
  runs: AssignmentRun[]
}

// ---- 入力型 ----

export interface MemberCreateInput {
  name: string
  email: string
  /** 初期パスワード */
  password: string
  part: string | null
  note: string | null
  appRole: AppRole
}

export interface MemberUpdateInput {
  name: string
  email: string
  part: string | null
  note: string | null
  appRole: AppRole
  active: boolean
}

export interface ProfileUpdateInput {
  name: string
  part: string | null
}

export interface BandInput {
  name: string
  description: string | null
  members: { memberId: string; part: string }[]
}

export interface EventInput {
  title: string
  date: string
  startTime: string | null
  endTime: string | null
  venue: string | null
  description: string | null
  status: EventStatus
  bandIds: string[]
  roleSlots: { roleId: string; slots: number }[]
}

export interface RoleInput {
  name: string
  description: string | null
  defaultSlots: number
  sortOrder: number
}

export interface AssignmentDraft {
  eventId: string
  roleId: string
  memberId: string
}
