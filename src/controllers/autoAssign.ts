import type { Part } from '../models/types'

export interface AssignRules {
  /** 担当パートを優先：メンバーの登録パートに合う枠から埋める */
  preferRole: boolean
  /** 出演回数を平準化：今月の出演が少ない人を優先する */
  balance: boolean
  /** 兼任を許可：1人が複数の枠に入れる */
  allowDouble: boolean
  /** バンドの編成メンバーを優先する */
  preferBand: boolean
}

export const DEFAULT_RULES: AssignRules = { preferRole: true, balance: true, allowDouble: false, preferBand: true }

export interface AssignSlot {
  id: string
  part: Part
}

export interface AssignCandidate {
  id: string
  parts: Part[]
  /** 今月の出演数 */
  load: number
  /** このバンドの編成メンバーか */
  regular: boolean
}

export type Assignment = Record<string, string | null>

/**
 * 役割の自動割り振り（Riffboard の RoleAssigner と同じ規則）。
 *
 * ランダムな貪欲法を何度も試して、いちばん良い案を残す：
 *  1. 埋まった枠が多い
 *  2. （編成優先なら）編成メンバーが自分のパートに入っている
 *  3. （パート優先なら）担当パートが合う人が入っている
 *  4. （平準化なら）出演数の合計が少ない
 * ロックした枠はそのまま残す。結果は毎回少し変わる。
 */
export function autoAssign(
  slots: AssignSlot[],
  members: AssignCandidate[],
  current: Assignment,
  locked: Record<string, boolean>,
  rules: AssignRules = DEFAULT_RULES,
  trials = 160,
  random: () => number = Math.random,
): Assignment {
  const plays = (m: AssignCandidate, s: AssignSlot) => m.parts.includes(s.part)
  const open = slots.filter((s) => !locked[s.id])
  const base: Record<string, number> = {}
  for (const s of slots) {
    const id = current[s.id]
    if (locked[s.id] && id) base[id] = (base[id] ?? 0) + 1
  }
  const shuffle = <T>(a: T[]): T[] => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  const playersOf = (s: AssignSlot) => members.filter((m) => plays(m, s)).length

  let best: Assignment | null = null
  let bestScore = -Infinity
  for (let t = 0; t < trials; t++) {
    const next: Assignment = { ...current }
    const used: Record<string, number> = { ...base }
    let fit = 0
    let regularFit = 0
    let load = 0
    // 弾ける人が少ないパートから埋める
    const order = shuffle(open.slice()).sort((a, b) => playersOf(a) - playersOf(b))
    for (const s of order) {
      const free = members.filter((m) => rules.allowDouble || !used[m.id])
      let pool = free
      if (rules.preferRole) {
        const fitting = free.filter((m) => plays(m, s))
        if (fitting.length) pool = fitting
      }
      if (rules.preferBand) {
        const regulars = pool.filter((m) => m.regular && plays(m, s))
        if (regulars.length) pool = regulars
      }
      if (!pool.length) {
        next[s.id] = null
        continue
      }
      shuffle(pool)
      if (rules.balance) pool.sort((a, b) => a.load + (used[a.id] ?? 0) * 2 - (b.load + (used[b.id] ?? 0) * 2))
      const k = rules.balance ? Math.min(pool.length, t % 3 === 0 ? 1 : 2) : pool.length
      const pick = pool[Math.floor(random() * k)]
      next[s.id] = pick.id
      used[pick.id] = (used[pick.id] ?? 0) + 1
      if (plays(pick, s)) fit++
      if (pick.regular && plays(pick, s)) regularFit++
      load += pick.load + (used[pick.id] - 1) * 3
    }
    const filled = open.filter((s) => next[s.id]).length
    const score =
      filled * 1000 +
      (rules.preferBand ? regularFit * 200 : 0) +
      (rules.preferRole ? fit * 100 : 0) -
      (rules.balance ? load : 0) +
      random() * 0.5
    if (score > bestScore) {
      bestScore = score
      best = next
    }
  }
  return best ?? { ...current }
}
