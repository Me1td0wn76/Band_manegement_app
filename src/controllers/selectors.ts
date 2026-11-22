import type { AppSnapshot, Assignment, BandEvent, Member, Role } from '../models/types'

/** ローカル日付の YYYY-MM-DD */
export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function isUpcoming(event: BandEvent, today = todayISO()): boolean {
  return event.date >= today && event.status === 'scheduled'
}

export function indexById<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((x) => [x.id, x]))
}

/** イベントの役割ごとの必要人数（未設定の役割は 0） */
export function slotsForEvent(snapshot: AppSnapshot, eventId: string): { role: Role; slots: number }[] {
  const map = new Map(
    snapshot.eventRoleSlots.filter((s) => s.eventId === eventId).map((s) => [s.roleId, s.slots] as const),
  )
  return snapshot.roles.map((role) => ({ role, slots: map.get(role.id) ?? 0 }))
}

export function assignmentsForEvent(snapshot: AppSnapshot, eventId: string): Assignment[] {
  return snapshot.assignments.filter((a) => a.eventId === eventId)
}

/** 充足状況（必要枠数と埋まっている枠数） */
export function eventFill(snapshot: AppSnapshot, eventId: string): { required: number; filled: number } {
  const assigned = assignmentsForEvent(snapshot, eventId)
  let required = 0
  let filled = 0
  for (const { role, slots } of slotsForEvent(snapshot, eventId)) {
    required += slots
    filled += Math.min(slots, assigned.filter((a) => a.roleId === role.id).length)
  }
  return { required, filled }
}

/** イベントに出演するバンドのメンバー */
export function performersOf(snapshot: AppSnapshot, eventId: string): Set<string> {
  const bandIds = new Set(snapshot.eventBands.filter((eb) => eb.eventId === eventId).map((eb) => eb.bandId))
  return new Set(snapshot.bandMembers.filter((bm) => bandIds.has(bm.bandId)).map((bm) => bm.memberId))
}

export function excludedOf(snapshot: AppSnapshot, eventId: string): Set<string> {
  return new Set(snapshot.exclusions.filter((x) => x.eventId === eventId).map((x) => x.memberId))
}

/** 中止イベントを除いた担当回数 */
export function memberLoad(snapshot: AppSnapshot, options: { upcomingOnly?: boolean } = {}): Map<string, number> {
  const today = todayISO()
  const events = indexById(snapshot.events)
  const load = new Map<string, number>()
  for (const a of snapshot.assignments) {
    const ev = events.get(a.eventId)
    if (!ev || ev.status === 'cancelled') continue
    if (options.upcomingOnly && ev.date < today) continue
    load.set(a.memberId, (load.get(a.memberId) ?? 0) + 1)
  }
  return load
}

export function bandsOfMember(snapshot: AppSnapshot, memberId: string) {
  const bands = indexById(snapshot.bands)
  return snapshot.bandMembers
    .filter((bm) => bm.memberId === memberId)
    .map((bm) => ({ band: bands.get(bm.bandId), part: bm.part }))
    .filter((x): x is { band: NonNullable<typeof x.band>; part: string } => Boolean(x.band))
}

export function bandsOfEvent(snapshot: AppSnapshot, eventId: string) {
  const bands = indexById(snapshot.bands)
  return snapshot.eventBands
    .filter((eb) => eb.eventId === eventId)
    .sort((a, b) => a.order - b.order)
    .map((eb) => bands.get(eb.bandId))
    .filter((b): b is NonNullable<typeof b> => Boolean(b))
}

export interface CandidateInfo {
  member: Member
  load: number
  excluded: boolean
  performer: boolean
  /** 同じイベントで既に担当している役割数 */
  rolesInEvent: number
  alreadyInRole: boolean
}

/**
 * ある役割に割り当てる候補者と注意情報。手動編集や割り振りプレビューの差し替えで使う。
 * `current` には現在（または提案中）のイベント内の割り当てを渡す。
 */
export function candidatesFor(
  snapshot: AppSnapshot,
  eventId: string,
  roleId: string,
  current: { roleId: string; memberId: string }[],
  load = memberLoad(snapshot),
): CandidateInfo[] {
  const excluded = excludedOf(snapshot, eventId)
  const performers = performersOf(snapshot, eventId)
  return snapshot.members
    .filter((m) => m.active)
    .map((member) => {
      const mine = current.filter((c) => c.memberId === member.id)
      return {
        member,
        load: load.get(member.id) ?? 0,
        excluded: excluded.has(member.id),
        performer: performers.has(member.id),
        rolesInEvent: mine.length,
        alreadyInRole: mine.some((c) => c.roleId === roleId),
      }
    })
    .sort((a, b) => {
      const score = (c: CandidateInfo) => (c.excluded ? 100 : 0) + (c.rolesInEvent > 0 ? 10 : 0) + (c.performer ? 1 : 0)
      return score(a) - score(b) || a.load - b.load || a.member.name.localeCompare(b.member.name, 'ja')
    })
}
