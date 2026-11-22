import type {
  AppSnapshot,
  AssignmentDraft,
  AssignmentMode,
  BandInput,
  EventInput,
  MemberCreateInput,
  MemberUpdateInput,
  ProfileUpdateInput,
  RoleInput,
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

  // ---- 読み込み ----
  loadAll(): Promise<AppSnapshot>

  // ---- メンバー ----
  createMember(input: MemberCreateInput): Promise<void>
  updateMember(id: string, input: MemberUpdateInput): Promise<void>
  resetMemberPassword(id: string, password: string): Promise<void>
  deleteMember(id: string): Promise<void>
  updateMyProfile(input: ProfileUpdateInput): Promise<void>

  // ---- バンド ----
  createBand(input: BandInput): Promise<void>
  updateBand(id: string, input: BandInput): Promise<void>
  deleteBand(id: string): Promise<void>

  // ---- イベント ----
  createEvent(input: EventInput): Promise<string>
  updateEvent(id: string, input: EventInput): Promise<void>
  deleteEvent(id: string): Promise<void>
  setEventRoleSlot(eventId: string, roleId: string, slots: number): Promise<void>

  // ---- 役割マスタ ----
  createRole(input: RoleInput): Promise<void>
  updateRole(id: string, input: RoleInput): Promise<void>
  deleteRole(id: string): Promise<void>

  // ---- 割り当て ----
  addAssignment(draft: AssignmentDraft): Promise<void>
  removeAssignment(id: string): Promise<void>
  setAssignmentLocked(id: string, locked: boolean): Promise<void>
  /** 自動割り振り結果を保存。regenerate はロックされていない既存割り当てを置き換える */
  applyAutoAssignments(eventIds: string[], drafts: AssignmentDraft[], mode: AssignmentMode): Promise<number>

  // ---- 参加不可 ----
  setExclusion(eventId: string, memberId: string, excluded: boolean, reason?: string | null): Promise<void>
}
