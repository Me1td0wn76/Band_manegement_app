import type {
  ActivityInput,
  AppSnapshot,
  BandInput,
  EventInput,
  MemberCreateInput,
  MemberUpdateInput,
  OnboardingInput,
  Part,
  ProfileUpdateInput,
  SlotAssignment,
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
  /** 初回ログイン時の初期登録（パスワードの再設定とパートの登録） */
  completeOnboarding(input: OnboardingInput): Promise<void>

  // ---- 読み込み ----
  loadAll(): Promise<AppSnapshot>

  // ---- メンバー ----
  createMember(input: MemberCreateInput): Promise<string>
  updateMember(id: string, input: MemberUpdateInput): Promise<void>
  resetMemberPassword(id: string, password: string): Promise<void>
  deleteMember(id: string): Promise<void>
  updateMyProfile(input: ProfileUpdateInput): Promise<void>

  // ---- バンド ----
  createBand(input: BandInput): Promise<string>
  updateBand(id: string, input: BandInput): Promise<void>
  deleteBand(id: string): Promise<void>

  // ---- イベント ----
  createEvent(input: EventInput): Promise<string>
  updateEvent(id: string, input: EventInput): Promise<void>
  deleteEvent(id: string): Promise<void>

  // ---- 役割の割り振り ----
  /** 枠の割り当て・ロックを保存する（確定は解除される） */
  saveAssignment(eventId: string, bandId: string, slots: SlotAssignment[]): Promise<void>
  addSlot(eventId: string, bandId: string, part: Part, label: string): Promise<void>
  removeSlot(slotId: string): Promise<void>
  confirmAssignment(eventId: string, bandId: string): Promise<void>

  // ---- 活動ログ ----
  logActivity(input: ActivityInput): Promise<void>
}
