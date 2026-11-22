import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { repository } from '../models/repositories'
import type { Repository } from '../models/repositories'
import type { AppSnapshot, Member } from '../models/types'
import { useAuth } from './AuthController'

/** Repository のうち、データを書き換える操作 */
type MutationKeys =
  | 'createMember'
  | 'updateMember'
  | 'resetMemberPassword'
  | 'deleteMember'
  | 'updateMyProfile'
  | 'createBand'
  | 'updateBand'
  | 'deleteBand'
  | 'createEvent'
  | 'updateEvent'
  | 'deleteEvent'
  | 'setEventRoleSlot'
  | 'createRole'
  | 'updateRole'
  | 'deleteRole'
  | 'addAssignment'
  | 'removeAssignment'
  | 'setAssignmentLocked'
  | 'applyAutoAssignments'
  | 'setExclusion'
  | 'changePassword'

export type DataActions = Pick<Repository, MutationKeys>

const MUTATIONS: MutationKeys[] = [
  'createMember',
  'updateMember',
  'resetMemberPassword',
  'deleteMember',
  'updateMyProfile',
  'createBand',
  'updateBand',
  'deleteBand',
  'createEvent',
  'updateEvent',
  'deleteEvent',
  'setEventRoleSlot',
  'createRole',
  'updateRole',
  'deleteRole',
  'addAssignment',
  'removeAssignment',
  'setAssignmentLocked',
  'applyAutoAssignments',
  'setExclusion',
  'changePassword',
]

type DataState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; snapshot: AppSnapshot }

interface DataValue {
  state: DataState
  reload(): Promise<void>
  actions: DataActions
}

const DataContext = createContext<DataValue | null>(null)

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  return '不明なエラーが発生しました'
}

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

  const actions = Object.fromEntries(
    MUTATIONS.map((key) => [
      key,
      async (...args: unknown[]) => {
        const fn = repository[key] as (...a: unknown[]) => Promise<unknown>
        const result = await fn.apply(repository, args)
        await reload()
        return result
      },
    ]),
  ) as unknown as DataActions

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
