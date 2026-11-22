import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { repository } from '../models/repositories'
import { PART_SHORT } from '../models/slots'
import type {
  ActivityInput,
  AppSnapshot,
  BandInput,
  EventInput,
  Member,
  MemberCreateInput,
  MemberUpdateInput,
  OnboardingInput,
  Part,
  ProfileUpdateInput,
  Slot,
  SlotAssignment,
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
function createActions(reload: () => Promise<void>) {
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
    completeOnboarding: (input: OnboardingInput) =>
      run(() => repository.completeOnboarding(input), { kind: 'onboarding', text: '初期登録を完了しました' }),
    updateMyProfile: (input: ProfileUpdateInput) =>
      run(() => repository.updateMyProfile(input), { kind: 'profile', text: 'プロフィールを更新' }),

    // ---- メンバー ----
    createMember: (input: MemberCreateInput) =>
      run(() => repository.createMember(input), { kind: 'member', text: `${input.name} をメンバーに登録` }),
    updateMember: (id: string, input: MemberUpdateInput) =>
      run(() => repository.updateMember(id, input), { kind: 'member', text: `${input.name} の登録内容を更新` }),
    resetMemberPassword: (member: Member, password: string) =>
      run(() => repository.resetMemberPassword(member.id, password), {
        kind: 'member',
        text: `${member.name} のパスワードを再設定`,
      }),
    deleteMember: (member: Member) =>
      run(() => repository.deleteMember(member.id), { kind: 'member', text: `${member.name} を削除` }),

    // ---- バンド ----
    createBand: (input: BandInput) =>
      run(
        () => repository.createBand(input),
        (id) => ({ kind: 'band', text: `バンド「${input.name}」を登録`, bandId: id }),
      ),
    updateBand: (id: string, input: BandInput) =>
      run(() => repository.updateBand(id, input), { kind: 'band', text: `バンド「${input.name}」を更新`, bandId: id }),
    deleteBand: (id: string, name: string) =>
      run(() => repository.deleteBand(id), { kind: 'band', text: `バンド「${name}」を削除` }),

    // ---- イベント ----
    createEvent: (input: EventInput) =>
      run(
        () => repository.createEvent(input),
        (id) => ({ kind: 'event', text: `イベント「${input.title}」を登録`, eventId: id }),
      ),
    updateEvent: (id: string, input: EventInput) =>
      run(() => repository.updateEvent(id, input), { kind: 'event', text: `イベント「${input.title}」を更新`, eventId: id }),
    deleteEvent: (id: string, title: string) =>
      run(() => repository.deleteEvent(id), { kind: 'event', text: `イベント「${title}」を削除` }),

    // ---- 役割の割り振り ----
    saveAssignment: (eventId: string, bandId: string, slots: SlotAssignment[], text: string) =>
      run(() => repository.saveAssignment(eventId, bandId, slots), { kind: 'assign', text, eventId, bandId }),
    addSlot: (eventId: string, bandId: string, part: Part, label: string) =>
      run(() => repository.addSlot(eventId, bandId, part, label), {
        kind: 'assign',
        text: `枠を追加: ${label}（${PART_SHORT[part]}）`,
        eventId,
        bandId,
      }),
    removeSlot: (slot: Slot) =>
      run(() => repository.removeSlot(slot.id), {
        kind: 'assign',
        text: `枠を削除: ${slot.label}`,
        eventId: slot.eventId,
        bandId: slot.bandId,
      }),
    confirmAssignment: (eventId: string, bandId: string) =>
      run(() => repository.confirmAssignment(eventId, bandId), { kind: 'assign', text: '割り振りを確定', eventId, bandId }),
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
export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataState>({ status: 'loading' })
  const requestId = useRef(0)

  const reload = useCallback(async () => {
    const id = ++requestId.current
    try {
      const snapshot = await repository.loadAll()
      if (id === requestId.current) setState({ status: 'ready', snapshot })
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

  const actions = createActions(reload)

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
