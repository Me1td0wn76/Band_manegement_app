import type {
  ActivityInput,
  AppSnapshot,
  AssignmentRow,
  EventInput,
  MemberCreateInput,
  MemberUpdateInput,
  ProfileUpdateInput,
  RoleInput,
  TimetableInput,
} from '../types'

export type RepositoryMode = 'supabase' | 'demo'

/**
 * データアクセスの抽象。Supabase 実装とデモ（ブラウザ保存）実装を差し替えられる。
 */
export interface Repository {
  readonly mode: RepositoryMode

  // ---- 認証 ----
  getCurrentUserId(): Promise<string | null>
  onAuthStateChange(listener: (userId: string | null) => void): () => void
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
  changePassword(newPassword: string): Promise<void>
  /** 初回ログイン時の初期登録（パスワードの再設定） */
  completeOnboarding(newPassword: string): Promise<void>

  // ---- 読み込み ----
  loadAll(): Promise<AppSnapshot>

  // ---- メンバー ----
  createMember(input: MemberCreateInput): Promise<string>
  updateMember(id: string, input: MemberUpdateInput): Promise<void>
  resetMemberPassword(id: string, password: string): Promise<void>
  deleteMember(id: string): Promise<void>
  updateMyProfile(input: ProfileUpdateInput): Promise<void>

  // ---- イベント・タイムテーブル ----
  createEvent(input: EventInput): Promise<string>
  updateEvent(id: string, input: EventInput): Promise<void>
  deleteEvent(id: string): Promise<void>
  /** 出演順・演奏時間・転換・開演・終演予定をまとめて保存する */
  saveTimetable(eventId: string, input: TimetableInput): Promise<void>

  // ---- 役割マスタ ----
  createRole(input: RoleInput): Promise<void>
  updateRole(id: string, input: RoleInput): Promise<void>
  deleteRole(id: string): Promise<void>
  setRoleSlots(eventId: string, roleId: string, slots: number): Promise<void>

  // ---- 裏方の割り振り ----
  /** イベントの割り当てを丸ごと置き換える（確定は解除される） */
  saveAssignments(eventId: string, rows: AssignmentRow[]): Promise<void>
  confirmAssignments(eventId: string): Promise<void>

  // ---- 参加可否 ----
  setExclusion(eventId: string, memberId: string, excluded: boolean, reason?: string | null): Promise<void>

  // ---- 活動ログ ----
  logActivity(input: ActivityInput): Promise<void>
}
