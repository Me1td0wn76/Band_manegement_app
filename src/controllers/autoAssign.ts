import type { AppSnapshot, AssignmentDraft, AssignmentMode } from '../models/types'
import { excludedOf, indexById, performersOf, slotsForEvent } from './selectors'

export interface AutoAssignOptions {
  /** regenerate: ロックされていない割り当てを作り直す / fill: 既存を残して不足分のみ埋める */
  mode: AssignmentMode
  /** 出演バンドのメンバーはできるだけ避ける（足りなければ割り当てる） */
  avoidPerformers: boolean
  /** 1イベントで1人が担当できる役割数の上限 */
  maxRolesPerEvent: number
  /** 同点時の並び順を決める乱数シード（再生成で別案を出す） */
  seed: number
}

export interface ProposedAssignment extends AssignmentDraft {
  /** 既存の割り当て（保存時に変更されない） */
  kept: boolean
  /** 出演者を割り当てた場合 true */
  performer: boolean
}

export interface Shortage {
  eventId: string
  roleId: string
  missing: number
}

export interface AutoAssignResult {
  proposals: ProposedAssignment[]
  shortages: Shortage[]
  /** 割り振り前の担当回数（対象イベントの作り直し分を除く） */
  loadBefore: Map<string, number>
  loadAfter: Map<string, number>
}

export const DEFAULT_OPTIONS: AutoAssignOptions = {
  mode: 'regenerate',
  avoidPerformers: true,
  maxRolesPerEvent: 1,
  seed: 1,
}

/** 再現性のある簡易乱数 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const inc = (map: Map<string, number>, key: string, by = 1) => map.set(key, (map.get(key) ?? 0) + by)

/**
 * 役割の自動割り振り。
 *
 * 方針（貪欲法）:
 * 1. ロック済み（fill モードでは既存すべて）の割り当ては保持する
 * 2. 参加不可のメンバー・1イベントの上限に達したメンバーは候補から外す
 * 3. 担当回数の少ない人 → その役割の経験が少ない人 → ランダム の順で選ぶ
 * 4. 出演者を避ける設定なら、非出演者で埋まらない分だけ出演者から選ぶ
 */
export function autoAssign(snapshot: AppSnapshot, eventIds: string[], options: AutoAssignOptions): AutoAssignResult {
  const rand = mulberry32(options.seed)
  const eventsById = indexById(snapshot.events)
  const targets = eventIds
    .map((id) => eventsById.get(id))
    .filter((e): e is NonNullable<typeof e> => Boolean(e) && e!.status !== 'cancelled')
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''))
  const targetIds = new Set(targets.map((e) => e.id))
  const activeMembers = snapshot.members.filter((m) => m.active)

  // 対象外イベントの割り当てを「これまでの負担」として数える
  const load = new Map<string, number>()
  const roleLoad = new Map<string, number>() // key: memberId|roleId
  for (const a of snapshot.assignments) {
    const ev = eventsById.get(a.eventId)
    if (!ev || ev.status === 'cancelled' || targetIds.has(a.eventId)) continue
    inc(load, a.memberId)
    inc(roleLoad, `${a.memberId}|${a.roleId}`)
  }

  const proposals: ProposedAssignment[] = []
  const shortages: Shortage[] = []

  // 保持する割り当てを先に負担に加える（後続イベントの公平性のため）
  const keptByEvent = new Map<string, typeof snapshot.assignments>()
  for (const ev of targets) {
    const kept = snapshot.assignments.filter(
      (a) => a.eventId === ev.id && (options.mode === 'fill' || a.locked),
    )
    keptByEvent.set(ev.id, kept)
    for (const a of kept) {
      inc(load, a.memberId)
      inc(roleLoad, `${a.memberId}|${a.roleId}`)
    }
  }
  const loadBefore = new Map(load)

  for (const ev of targets) {
    const kept = keptByEvent.get(ev.id) ?? []
    const excluded = excludedOf(snapshot, ev.id)
    const performers = performersOf(snapshot, ev.id)
    const perEvent = new Map<string, number>()
    const inRole = new Set<string>()
    for (const a of kept) {
      inc(perEvent, a.memberId)
      inRole.add(`${a.memberId}|${a.roleId}`)
      proposals.push({
        eventId: ev.id,
        roleId: a.roleId,
        memberId: a.memberId,
        kept: true,
        performer: performers.has(a.memberId),
      })
    }

    // イベントごとに同点時の順序をシャッフル
    const tieBreak = new Map(activeMembers.map((m) => [m.id, rand()]))

    // 必要人数の多い役割から埋める（同数なら表示順）
    const slotList = slotsForEvent(snapshot, ev.id)
      .filter((s) => s.slots > 0)
      .sort((a, b) => b.slots - a.slots || a.role.sortOrder - b.role.sortOrder)

    for (const { role, slots } of slotList) {
      let need = slots - kept.filter((a) => a.roleId === role.id).length
      if (need <= 0) continue

      const eligible = activeMembers.filter(
        (m) =>
          !excluded.has(m.id) &&
          (perEvent.get(m.id) ?? 0) < options.maxRolesPerEvent &&
          !inRole.has(`${m.id}|${role.id}`),
      )
      const score = (id: string) =>
        [load.get(id) ?? 0, roleLoad.get(`${id}|${role.id}`) ?? 0, perEvent.get(id) ?? 0, tieBreak.get(id) ?? 0]
      const byFairness = (a: { id: string }, b: { id: string }) => {
        const sa = score(a.id)
        const sb = score(b.id)
        for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i] - sb[i]
        return 0
      }

      const pools = options.avoidPerformers
        ? [eligible.filter((m) => !performers.has(m.id)), eligible.filter((m) => performers.has(m.id))]
        : [eligible]

      for (const pool of pools) {
        const sorted = [...pool].sort(byFairness)
        for (const m of sorted) {
          if (need <= 0) break
          proposals.push({ eventId: ev.id, roleId: role.id, memberId: m.id, kept: false, performer: performers.has(m.id) })
          inc(load, m.id)
          inc(roleLoad, `${m.id}|${role.id}`)
          inc(perEvent, m.id)
          inRole.add(`${m.id}|${role.id}`)
          need--
        }
      }

      if (need > 0) shortages.push({ eventId: ev.id, roleId: role.id, missing: need })
    }
  }

  return { proposals, shortages, loadBefore, loadAfter: load }
}

/** 提案の担当回数を再計算（プレビューで手動差し替えした後に使う） */
export function recomputeLoad(loadBefore: Map<string, number>, proposals: ProposedAssignment[]): Map<string, number> {
  const load = new Map(loadBefore)
  for (const p of proposals) if (!p.kept) inc(load, p.memberId)
  return load
}
