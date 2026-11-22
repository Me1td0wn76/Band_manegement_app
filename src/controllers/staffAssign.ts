import type { Assignment, AssignmentRow, StaffRole, TimetableItem } from '../models/types'

/**
 * 裏方の割り振り（枠の組み立て・自動割り振り・問題の検出）。画面に依存しない純粋な関数だけを置く。
 *
 * 枠（Cell）は「役割 × 出演（全体の役割は null） × 何人目」。
 */

export interface Cell {
  key: string
  roleId: string
  itemId: string | null
  index: number
}

export interface CellValue {
  memberId: string | null
  locked: boolean
}

export type CellState = Record<string, CellValue>

export const cellKey = (roleId: string, itemId: string | null, index: number) => `${roleId}|${itemId ?? '-'}|${index}`

export function buildCells(roles: StaffRole[], slotsOf: (roleId: string) => number, acts: TimetableItem[]): Cell[] {
  const cells: Cell[] = []
  for (const r of roles.filter((x) => x.scope === 'event')) {
    for (let i = 0; i < slotsOf(r.id); i++) cells.push({ key: cellKey(r.id, null, i), roleId: r.id, itemId: null, index: i })
  }
  for (const act of acts) {
    for (const r of roles.filter((x) => x.scope === 'act')) {
      for (let i = 0; i < slotsOf(r.id); i++) cells.push({ key: cellKey(r.id, act.id, i), roleId: r.id, itemId: act.id, index: i })
    }
  }
  return cells
}

/** 保存済みの割り当てを枠に並べる（人数を減らした場合、あふれた割り当ては表示されない） */
export function stateFromAssignments(cells: Cell[], assignments: Assignment[]): CellState {
  const groups = new Map<string, Assignment[]>()
  for (const a of assignments) {
    const g = `${a.roleId}|${a.itemId ?? '-'}`
    groups.set(g, [...(groups.get(g) ?? []), a])
  }
  const state: CellState = {}
  for (const c of cells) {
    const a = groups.get(`${c.roleId}|${c.itemId ?? '-'}`)?.[c.index]
    state[c.key] = { memberId: a?.memberId ?? null, locked: a?.locked ?? false }
  }
  return state
}

export function rowsFromState(cells: Cell[], state: CellState): AssignmentRow[] {
  return cells
    .filter((c) => state[c.key]?.memberId)
    .map((c) => ({ roleId: c.roleId, itemId: c.itemId, memberId: state[c.key].memberId!, locked: state[c.key].locked }))
}

export interface StaffRules {
  /** 担当回数を平準化：今月の担当が少ない人を優先 */
  balance: boolean
  /** 連続を避ける：前の出演でも担当した人は後回し */
  avoidBackToBack: boolean
  /** 兼任を許可：全体の役割の人が出演ごとの役割も持てる／同じ出演で複数の役割を持てる */
  allowDouble: boolean
}

export const DEFAULT_STAFF_RULES: StaffRules = { balance: true, avoidBackToBack: true, allowDouble: false }

export interface StaffCandidate {
  id: string
  name: string
  isAdmin: boolean
  /** 今月の担当回数（このイベントを除く） */
  load: number
  /** このイベントに参加できない */
  excluded: boolean
}

export type Issue = 'excluded' | 'double' | 'adminOnly' | 'missing'

export const ISSUE_LABEL: Record<Issue, string> = {
  excluded: '参加不可',
  double: '重複',
  adminOnly: '幹部のみ',
  missing: '無効',
}

/** 枠ごとの問題（参加不可・重複・幹部のみ違反・無効なメンバー） */
export function findIssues(
  cells: Cell[],
  state: CellState,
  rolesById: Map<string, StaffRole>,
  candidates: Map<string, StaffCandidate>,
  rules: StaffRules,
): Map<string, Issue[]> {
  const eventHolders = new Map<string, number>()
  const total = new Map<string, number>()
  const perAct = new Map<string, number>()
  for (const c of cells) {
    const m = state[c.key]?.memberId
    if (!m) continue
    total.set(m, (total.get(m) ?? 0) + 1)
    if (!c.itemId) eventHolders.set(m, (eventHolders.get(m) ?? 0) + 1)
    else perAct.set(`${c.itemId}|${m}`, (perAct.get(`${c.itemId}|${m}`) ?? 0) + 1)
  }
  const result = new Map<string, Issue[]>()
  for (const c of cells) {
    const m = state[c.key]?.memberId
    if (!m) continue
    const issues: Issue[] = []
    const cand = candidates.get(m)
    if (!cand) issues.push('missing')
    else {
      if (cand.excluded) issues.push('excluded')
      if (rolesById.get(c.roleId)?.adminOnly && !cand.isAdmin) issues.push('adminOnly')
    }
    if (!rules.allowDouble) {
      const holdsEvent = eventHolders.get(m) ?? 0
      const double = c.itemId
        ? holdsEvent > 0 || (perAct.get(`${c.itemId}|${m}`) ?? 0) > 1
        : (total.get(m) ?? 0) > 1
      if (double) issues.push('double')
    }
    if (issues.length) result.set(c.key, issues)
  }
  return result
}

/**
 * 自動割り振り。ロックした枠は残し、ランダムな貪欲法を何度も試して一番よい案を選ぶ。
 * よい案：空き枠が少ない → このイベントでの担当が偏らない → 連続担当が少ない → 今月の担当が少ない人に寄せる
 */
export function autoAssignStaff(
  cells: Cell[],
  rolesById: Map<string, StaffRole>,
  actOrder: string[],
  current: CellState,
  candidates: StaffCandidate[],
  rules: StaffRules = DEFAULT_STAFF_RULES,
  trials = 120,
  random: () => number = Math.random,
): { state: CellState; unfilled: number } {
  const lockedCells = cells.filter((c) => current[c.key]?.locked && current[c.key]?.memberId)
  const openCells = cells.filter((c) => !(current[c.key]?.locked && current[c.key]?.memberId))
  const actIndex = new Map(actOrder.map((id, i) => [id, i]))
  // 全体の役割（幹部のみを先に）→ 出演順に出演ごとの役割
  const ordered = [...openCells].sort((a, b) => {
    if (!a.itemId !== !b.itemId) return a.itemId ? 1 : -1
    if (!a.itemId && !b.itemId) return Number(rolesById.get(b.roleId)?.adminOnly) - Number(rolesById.get(a.roleId)?.adminOnly)
    return (actIndex.get(a.itemId!) ?? 0) - (actIndex.get(b.itemId!) ?? 0)
  })
  const available = candidates.filter((c) => !c.excluded)

  let best: CellState | null = null
  let bestScore = Infinity
  let bestUnfilled = 0

  for (let t = 0; t < trials; t++) {
    const next: CellState = {}
    const count = new Map<string, number>()
    const eventBusy = new Set<string>()
    const actBusy = new Map<string, Set<string>>()
    const groupBusy = new Map<string, Set<string>>()
    const take = (c: Cell, m: string) => {
      count.set(m, (count.get(m) ?? 0) + 1)
      if (!c.itemId) eventBusy.add(m)
      else actBusy.set(c.itemId, new Set([...(actBusy.get(c.itemId) ?? []), m]))
      const g = `${c.roleId}|${c.itemId ?? '-'}`
      groupBusy.set(g, new Set([...(groupBusy.get(g) ?? []), m]))
    }
    for (const c of lockedCells) {
      next[c.key] = { ...current[c.key] }
      take(c, current[c.key].memberId!)
    }

    let unfilled = 0
    let backToBack = 0
    const noise = new Map(available.map((m) => [m.id, random()]))
    for (const c of ordered) {
      const role = rolesById.get(c.roleId)
      const g = `${c.roleId}|${c.itemId ?? '-'}`
      const prevAct = c.itemId ? actOrder[(actIndex.get(c.itemId) ?? 0) - 1] : undefined
      let pool = available.filter((m) => (!role?.adminOnly || m.isAdmin) && !groupBusy.get(g)?.has(m.id))
      if (!rules.allowDouble) {
        pool = c.itemId
          ? pool.filter((m) => !eventBusy.has(m.id) && !actBusy.get(c.itemId!)?.has(m.id))
          : pool.filter((m) => !count.get(m.id))
      }
      if (!pool.length) {
        next[c.key] = { memberId: null, locked: false }
        unfilled++
        continue
      }
      const score = (m: StaffCandidate) =>
        (count.get(m.id) ?? 0) * 3 +
        (rules.balance ? m.load : 0) +
        (rules.avoidBackToBack && prevAct && actBusy.get(prevAct)?.has(m.id) ? 4 : 0) +
        (noise.get(m.id) ?? 0) * 1.5 +
        random() * 0.8
      let pick = pool[0]
      let ps = score(pick)
      for (const m of pool.slice(1)) {
        const s = score(m)
        if (s < ps) {
          pick = m
          ps = s
        }
      }
      if (rules.avoidBackToBack && prevAct && actBusy.get(prevAct)?.has(pick.id)) backToBack++
      next[c.key] = { memberId: pick.id, locked: false }
      take(c, pick.id)
    }

    const loads = available.map((m) => m.id)
    const spread = loads.reduce((s, id) => s + (count.get(id) ?? 0) ** 2, 0)
    const monthly = rules.balance ? available.reduce((s, m) => s + m.load * (count.get(m.id) ?? 0), 0) * 0.5 : 0
    const total = unfilled * 1000 + spread * 2 + backToBack * 6 + monthly
    if (total < bestScore) {
      bestScore = total
      best = next
      bestUnfilled = unfilled
    }
  }
  return { state: best ?? { ...current }, unfilled: bestUnfilled }
}
