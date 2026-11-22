import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { repository } from '../models/repositories'
import type {
  ActivityInput,
  AppSnapshot,
  AssignmentRow,
  EventInput,
  LiveEvent,
  Member,
  MemberCreateInput,
  MemberUpdateInput,
  ProfileUpdateInput,
  RoleInput,
  StaffRole,
  TimetableInput,
} from '../models/types'
import { useAuth } from './AuthController'

type DataState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; snapshot: AppSnapshot }

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  return '不明なエラーが発生しました。時間をおいてもう一度お試しください'
}

/**
 * 画面から呼ぶ操作。保存 → 活動ログの記録 → 再読込 までをまとめて行う（Controller）。
 */
function createActions(reload: () => Promise<void>, me: () => Member | undefined) {
  const run = async <T,>(fn: () => Promise<T>, log?: ActivityInput | ((result: T) => ActivityInput)): Promise<T> => {
    const result = await fn()
    if (log) {
      try {
        await repository.logActivity(typeof log === 'function' ? log(result) : log)
      } catch {
        // ログの記録に失敗しても操作自体は成功として扱う
      }
    }
    await reload()
    return result
  }

  return {
    // ---- アカウント ----
    changePassword: (password: string) => run(() => repository.changePassword(password)),
    completeOnboarding: (password: string) =>
      run(() => repository.completeOnboarding(password), { kind: 'onboarding', text: '初期登録を完了しました' }),
    updateMyProfile: (input: ProfileUpdateInput) =>
      run(() => repository.updateMyProfile(input), { kind: 'profile', text: 'プロフィールを更新' }),

    // ---- メンバー ----
    createMember: (input: MemberCreateInput) =>
      run(() => repository.createMember(input), { kind: 'member', text: `${input.name} をメンバーに登録` }),
    updateMember: (id: string, input: MemberUpdateInput) =>
      run(() => repository.updateMember(id, input), { kind: 'member', text: `${input.name} の登録内容を更新` }),
    resetMemberPassword: (member: Member, password: string) =>
      run(() => repository.resetMemberPassword(member.id, password), { kind: 'member', text: `${member.name} のパスワードを再設定` }),
    deleteMember: (member: Member) =>
      run(() => repository.deleteMember(member.id), { kind: 'member', text: `${member.name} を削除` }),

    // ---- イベント・タイムテーブル ----
    createEvent: (input: EventInput) =>
      run(
        () => repository.createEvent(input),
        (id) => ({ kind: 'event', text: `イベント「${input.title}」を登録`, eventId: id }),
      ),
    updateEvent: (id: string, input: EventInput) =>
      run(() => repository.updateEvent(id, input), { kind: 'event', text: `イベント「${input.title}」を更新`, eventId: id }),
    deleteEvent: (event: LiveEvent) =>
      run(() => repository.deleteEvent(event.id), { kind: 'event', text: `イベント「${event.title}」を削除` }),
    saveTimetable: (eventId: string, input: TimetableInput, text: string) =>
      run(() => repository.saveTimetable(eventId, input), { kind: 'timetable', text, eventId }),

    // ---- 役割 ----
    createRole: (input: RoleInput) => run(() => repository.createRole(input), { kind: 'role', text: `役割「${input.name}」を追加` }),
    updateRole: (id: string, input: RoleInput) =>
      run(() => repository.updateRole(id, input), { kind: 'role', text: `役割「${input.name}」を更新` }),
    deleteRole: (role: StaffRole) => run(() => repository.deleteRole(role.id), { kind: 'role', text: `役割「${role.name}」を削除` }),
    setRoleSlots: (eventId: string, role: StaffRole, slots: number) =>
      run(() => repository.setRoleSlots(eventId, role.id, slots), {
        kind: 'assign',
        text: `${role.name} の人数を${slots}人に変更`,
        eventId,
      }),

    // ---- 裏方の割り振り ----
    saveAssignments: (eventId: string, rows: AssignmentRow[], text: string) =>
      run(() => repository.saveAssignments(eventId, rows), { kind: 'assign', text, eventId }),
    confirmAssignments: (eventId: string) =>
      run(() => repository.confirmAssignments(eventId), { kind: 'assign', text: '裏方の割り振りを確定', eventId }),

    // ---- 参加可否 ----
    setExclusion: (event: LiveEvent, member: Member, excluded: boolean, reason?: string | null) => {
      const self = me()?.id === member.id
      const who = self ? '' : `${member.name} の `
      return run(() => repository.setExclusion(event.id, member.id, excluded, reason), {
        kind: 'availability',
        text: excluded ? `${who}${event.title} を参加不可に登録` : `${who}${event.title} の参加不可を取り消し`,
        eventId: event.id,
      })
    },
  }
}

export type DataActions = ReturnType<typeof createActions>

interface DataValue {
  state: DataState
  reload(): Promise<void>
  actions: DataActions
}

const DataContext = createContext<DataValue | null>(null)

/**
 * アプリ全体のデータを保持するコントローラー。
 * 数十人規模を想定しているため、全データをまとめて読み込み、更新後に再読込する。
 */
export function DataProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [state, setState] = useState<DataState>({ status: 'loading' })
  const requestId = useRef(0)
  const snapshotRef = useRef<AppSnapshot | null>(null)

  const reload = useCallback(async () => {
    const id = ++requestId.current
    try {
      const snapshot = await repository.loadAll()
      if (id === requestId.current) {
        snapshotRef.current = snapshot
        setState({ status: 'ready', snapshot })
      }
    } catch (e) {
      if (id === requestId.current) {
        // 既に表示中のデータがあれば保持し、初回のみエラー画面にする
        setState((prev) => (prev.status === 'ready' ? prev : { status: 'error', error: errorMessage(e) }))
        throw e
      }
    }
  }, [])

  useEffect(() => {
    reload().catch(() => {})
    // 他のメンバーの更新を拾うため、タブに戻ってきたら再読込
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload().catch(() => {})
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reload])

  const actions = createActions(reload, () => snapshotRef.current?.members.find((m) => m.id === userId))

  return <DataContext value={{ state, reload, actions }}>{children}</DataContext>
}

export function useDataState(): DataValue {
  const ctx = use(DataContext)
  if (!ctx) throw new Error('useDataState は DataProvider の内側で使ってください')
  return ctx
}

export interface ReadyData {
  snapshot: AppSnapshot
  me: Member
  /** 幹部（管理者） */
  isAdmin: boolean
  actions: DataActions
  reload(): Promise<void>
}

/** 読み込み完了後のページで使う。ログイン中のメンバー情報も返す */
export function useData(): ReadyData {
  const { state, actions, reload } = useDataState()
  const { state: auth } = useAuth()
  if (state.status !== 'ready') throw new Error('データが読み込まれていません')
  if (auth.status !== 'signedIn') throw new Error('ログインしていません')
  const me = state.snapshot.members.find((m) => m.id === auth.userId)
  if (!me) throw new Error('ログイン中のメンバー情報が見つかりません')
  return { snapshot: state.snapshot, me, isAdmin: me.appRole === 'admin' && me.active, actions, reload }
}
