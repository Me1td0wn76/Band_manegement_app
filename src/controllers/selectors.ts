import type { AppSnapshot, EventStatus, LiveEvent, StaffRole, TimetableItem } from '../models/types'
import { buildCells, findIssues, stateFromAssignments, DEFAULT_STAFF_RULES, type StaffCandidate } from './staffAssign'
import { computeSchedule, fmtMin } from './timetable'

/** 表示上の状態。本番当日の募集中・確定イベントは LIVE */
export type DisplayStatus = EventStatus | 'live'

/** ローカル日付の YYYY-MM-DD */
export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const monthOf = (date: string) => date.slice(0, 7)

export function indexById<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((x) => [x.id, x]))
}

export function displayStatus(event: LiveEvent, today = todayISO()): DisplayStatus {
  if (event.date === today && (event.status === 'open' || event.status === 'confirmed')) return 'live'
  return event.status
}

/** 今日以降で、終了・中止していないイベント */
export function isUpcoming(event: LiveEvent, today = todayISO()): boolean {
  return event.date >= today && event.status !== 'done' && event.status !== 'cancelled'
}

export function upcomingEvents(snapshot: AppSnapshot, today = todayISO()): LiveEvent[] {
  return snapshot.events
    .filter((e) => isUpcoming(e, today))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''))
}

export function itemsOf(snapshot: AppSnapshot, eventId: string): TimetableItem[] {
  return snapshot.items.filter((i) => i.eventId === eventId).sort((a, b) => a.sortOrder - b.sortOrder)
}

export const actsOf = (snapshot: AppSnapshot, eventId: string) => itemsOf(snapshot, eventId).filter((i) => i.kind === 'act')

export function scheduleOf(snapshot: AppSnapshot, event: LiveEvent) {
  return computeSchedule(event.startTime, itemsOf(snapshot, event.id), event.changeoverMinutes, event.targetEndTime)
}

/** "18:00–21:15"（出演がなければ開演時刻だけ） */
export function timeRangeOf(snapshot: AppSnapshot, event: LiveEvent): string {
  if (!event.startTime) return '時間未定'
  const s = scheduleOf(snapshot, event)
  return s.rows.length ? `${fmtMin(s.start)}–${fmtMin(s.end)}` : `${event.startTime}〜`
}

export function slotsOf(snapshot: AppSnapshot, eventId: string, role: StaffRole): number {
  return snapshot.roleSlots.find((s) => s.eventId === eventId && s.roleId === role.id)?.slots ?? role.defaultSlots
}

export function excludedOf(snapshot: AppSnapshot, eventId: string): Set<string> {
  return new Set(snapshot.exclusions.filter((x) => x.eventId === eventId).map((x) => x.memberId))
}

/**
 * その月の担当回数。中止イベントは数えない。`excludeEventId` のイベントは除く（割り振り中の分を二重に数えないため）。
 */
export function monthlyLoad(snapshot: AppSnapshot, month: string, excludeEventId?: string): Map<string, number> {
  const events = indexById(snapshot.events)
  const load = new Map<string, number>()
  for (const a of snapshot.assignments) {
    if (a.eventId === excludeEventId) continue
    const ev = events.get(a.eventId)
    if (!ev || ev.status === 'cancelled' || monthOf(ev.date) !== month) continue
    load.set(a.memberId, (load.get(a.memberId) ?? 0) + 1)
  }
  return load
}

/** 割り振りの候補者（有効なメンバー） */
export function candidatesFor(snapshot: AppSnapshot, event: LiveEvent): StaffCandidate[] {
  const load = monthlyLoad(snapshot, monthOf(event.date), event.id)
  const excluded = excludedOf(snapshot, event.id)
  return snapshot.members
    .filter((m) => m.active)
    .map((m) => ({ id: m.id, name: m.name, isAdmin: m.appRole === 'admin', load: load.get(m.id) ?? 0, excluded: excluded.has(m.id) }))
}

/** イベントの枠と、保存済みの割り当て */
export function staffBoardOf(snapshot: AppSnapshot, event: LiveEvent) {
  const acts = actsOf(snapshot, event.id)
  const cells = buildCells(snapshot.roles, (roleId) => slotsOf(snapshot, event.id, snapshot.roles.find((r) => r.id === roleId)!), acts)
  const state = stateFromAssignments(
    cells,
    snapshot.assignments.filter((a) => a.eventId === event.id),
  )
  return { acts, cells, state }
}

export function staffStats(snapshot: AppSnapshot, event: LiveEvent) {
  const { cells, state } = staffBoardOf(snapshot, event)
  const candidates = new Map(candidatesFor(snapshot, event).map((c) => [c.id, c]))
  const issues = findIssues(cells, state, indexById(snapshot.roles), candidates, DEFAULT_STAFF_RULES)
  return {
    total: cells.length,
    filled: cells.filter((c) => state[c.key]?.memberId).length,
    issues: issues.size,
    confirmed: Boolean(event.staffConfirmedAt),
  }
}

/** 今後のイベントで、まだ誰も入っていない枠の数 */
export function openSlotCount(snapshot: AppSnapshot, today = todayISO()): number {
  return upcomingEvents(snapshot, today).reduce((sum, e) => {
    const st = staffStats(snapshot, e)
    return sum + (st.total - st.filled)
  }, 0)
}

/** 割り振りが必要な（空き・問題がある）今後のイベントの数 */
export function staffTodoCount(snapshot: AppSnapshot, today = todayISO()): number {
  return upcomingEvents(snapshot, today).filter((e) => {
    const st = staffStats(snapshot, e)
    return st.filled < st.total || st.issues > 0
  }).length
}

export interface Duty {
  id: string
  event: LiveEvent
  role: StaffRole
  item: TimetableItem | null
  /** "18:30–19:00" または "全体" */
  time: string
  confirmed: boolean
}

/** メンバーの今後の担当 */
export function dutiesOf(snapshot: AppSnapshot, memberId: string, today = todayISO()): Duty[] {
  const events = indexById(snapshot.events)
  const roles = indexById(snapshot.roles)
  const items = indexById(snapshot.items)
  const schedules = new Map<string, ReturnType<typeof scheduleOf>>()
  return snapshot.assignments
    .filter((a) => a.memberId === memberId)
    .map((a) => {
      const event = events.get(a.eventId)
      const role = roles.get(a.roleId)
      if (!event || !role || !isUpcoming(event, today)) return null
      const item = a.itemId ? (items.get(a.itemId) ?? null) : null
      let time = '全体'
      if (item) {
        if (!schedules.has(event.id)) schedules.set(event.id, scheduleOf(snapshot, event))
        const row = schedules.get(event.id)!.rows.find((r) => r.item.id === item.id)
        time = row ? `${fmtMin(row.start)}–${fmtMin(row.end)}` : ''
      }
      return { id: a.id, event, role, item, time, confirmed: Boolean(event.staffConfirmedAt) }
    })
    .filter((d): d is Duty => d !== null)
    .sort((a, b) => a.event.date.localeCompare(b.event.date) || a.time.localeCompare(b.time))
}
