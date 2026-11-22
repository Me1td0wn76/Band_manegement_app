import type { ItemKind } from '../models/types'

/**
 * タイムテーブルの計算（出演順・転換・開催時間）。画面に依存しない純粋な関数だけを置く。
 */

export interface DraftItem {
  /** 保存済みの項目は DB の ID、新しい項目は "new-" で始まる仮の ID */
  key: string
  id: string | null
  kind: ItemKind
  name: string
  minutes: number
  locked: boolean
  note: string | null
}

export const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** 分 → "HH:MM"（日付をまたいでも 24 時間表記で回す） */
export const fmtMin = (min: number): string => {
  const v = ((Math.round(min) % 1440) + 1440) % 1440
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`
}

export interface ScheduleRow<T> {
  item: T
  index: number
  start: number
  end: number
  /** この項目の後ろに入る転換（次も出演のときだけ） */
  changeover: { start: number; end: number } | null
}

export interface Schedule<T> {
  rows: ScheduleRow<T>[]
  start: number
  end: number
  /** 演奏の合計（分） */
  play: number
  /** 転換の合計（分） */
  changeover: number
  /** 休憩の合計（分） */
  breaks: number
  acts: number
  /** 終演予定との差（正ならオーバー）。終演予定がなければ null */
  diff: number | null
}

export const DEFAULT_START = '18:00'

/** 転換は「出演 → 出演」の間にだけ入る（休憩の前後には入れない） */
export function computeSchedule<T extends { kind: ItemKind; minutes: number }>(
  startTime: string | null,
  items: T[],
  changeoverMinutes: number,
  targetEndTime?: string | null,
): Schedule<T> {
  const start = toMin(startTime ?? DEFAULT_START)
  let t = start
  let play = 0
  let changeover = 0
  let breaks = 0
  const rows = items.map((item, index) => {
    const s = t
    t += item.minutes
    if (item.kind === 'act') play += item.minutes
    else breaks += item.minutes
    const next = items[index + 1]
    let co: ScheduleRow<T>['changeover'] = null
    if (item.kind === 'act' && next?.kind === 'act' && changeoverMinutes > 0) {
      co = { start: t, end: t + changeoverMinutes }
      t += changeoverMinutes
      changeover += changeoverMinutes
    }
    return { item, index, start: s, end: s + item.minutes, changeover: co }
  })
  let diff: number | null = null
  if (targetEndTime) {
    let target = toMin(targetEndTime)
    if (target < start) target += 1440
    diff = t - target
  }
  return { rows, start, end: t, play, changeover, breaks, acts: items.filter((i) => i.kind === 'act').length, diff }
}

export function changeoverCount(items: { kind: ItemKind }[]): number {
  let n = 0
  for (let i = 0; i < items.length - 1; i++) if (items[i].kind === 'act' && items[i + 1].kind === 'act') n++
  return n
}

export interface FitOptions {
  minChangeover: number
  maxChangeover: number
  minAct: number
}

export const DEFAULT_FIT: FitOptions = { minChangeover: 5, maxChangeover: 20, minAct: 10 }

export interface FitResult {
  items: DraftItem[]
  changeoverMinutes: number
  ok: boolean
  message: string
}

/**
 * 終演予定に収まるよう自動で調整する。
 * 1. まず転換時間だけで合わせる（5〜20分の範囲）
 * 2. 足りなければ転換を範囲の端に固定し、固定していない出演の演奏時間を同じ割合で伸び縮みさせる
 * 固定（ロック）した出演と休憩の時間は変えない。
 */
export function fitToEnd(
  startTime: string | null,
  targetEndTime: string,
  items: DraftItem[],
  changeoverMinutes: number,
  opts: FitOptions = DEFAULT_FIT,
): FitResult {
  const start = toMin(startTime ?? DEFAULT_START)
  let target = toMin(targetEndTime) - start
  if (target <= 0) target += 1440
  const k = changeoverCount(items)
  const breaks = items.filter((i) => i.kind === 'break').reduce((s, i) => s + i.minutes, 0)
  const fixed = items.filter((i) => i.kind === 'act' && i.locked).reduce((s, i) => s + i.minutes, 0)
  const flex = items.filter((i) => i.kind === 'act' && !i.locked)
  const flexTotal = flex.reduce((s, i) => s + i.minutes, 0)
  const avail = target - breaks - fixed

  // 1. 転換だけで合わせる
  if (k > 0) {
    const c = (avail - flexTotal) / k
    if (Number.isInteger(c) && c >= opts.minChangeover && c <= opts.maxChangeover) {
      return { items, changeoverMinutes: c, ok: true, message: `転換を${c}分にして、終演 ${targetEndTime} に合わせました` }
    }
    const floor = Math.floor(c)
    if (floor >= opts.minChangeover && floor <= opts.maxChangeover) {
      // 端数は最後の固定していない出演で吸収する
      const rest = avail - flexTotal - floor * k
      const last = [...items].reverse().find((i) => i.kind === 'act' && !i.locked)
      if (last && rest >= 0) {
        return {
          items: items.map((i) => (i === last ? { ...i, minutes: i.minutes + rest } : i)),
          changeoverMinutes: floor,
          ok: true,
          message: `転換を${floor}分にして、終演 ${targetEndTime} に合わせました${rest ? `（「${last.name}」を${rest}分延長）` : ''}`,
        }
      }
    }
  }

  // 2. 演奏時間を同じ割合で調整する
  const c2 = k > 0 ? Math.min(opts.maxChangeover, Math.max(opts.minChangeover, Math.floor((avail - flexTotal) / k))) : changeoverMinutes
  const playAvail = avail - k * (k > 0 ? c2 : 0)
  if (flex.length === 0 || flexTotal === 0) {
    const over = -(playAvail - 0)
    return {
      items,
      changeoverMinutes: c2,
      ok: false,
      message: over > 0 ? `固定した出演と休憩だけで ${over}分オーバーします。固定を外すか終演予定を見直してください` : '調整できる出演がありません。固定を外してください',
    }
  }
  const minTotal = flex.length * opts.minAct
  const goal = Math.max(playAvail, minTotal)
  const scale = goal / flexTotal
  const sized = new Map(flex.map((i) => [i.key, Math.max(opts.minAct, Math.floor(i.minutes * scale))]))
  let remainder = goal - [...sized.values()].reduce((s, v) => s + v, 0)
  for (const i of flex) {
    if (remainder <= 0) break
    sized.set(i.key, (sized.get(i.key) ?? 0) + 1)
    remainder--
  }
  const next = items.map((i) => (sized.has(i.key) ? { ...i, minutes: sized.get(i.key)! } : i))
  if (playAvail < minTotal) {
    return {
      items: next,
      changeoverMinutes: c2,
      ok: false,
      message: `演奏を最短${opts.minAct}分まで縮めても ${minTotal - playAvail}分オーバーします。出演数か終演予定を見直してください`,
    }
  }
  const direction = scale < 1 ? '短く' : '長く'
  return {
    items: next,
    changeoverMinutes: c2,
    ok: true,
    message: `転換を${c2}分にし、固定していない出演の演奏時間を${direction}して終演 ${targetEndTime} に合わせました`,
  }
}

/** 固定していない項目の出演順をシャッフルする（くじ引き）。固定した項目は位置を変えない */
export function shuffleOrder<T extends { locked: boolean; kind: ItemKind }>(items: T[], random: () => number = Math.random): T[] {
  const movable = items.filter((i) => !i.locked && i.kind === 'act')
  for (let i = movable.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[movable[i], movable[j]] = [movable[j], movable[i]]
  }
  let k = 0
  return items.map((i) => (!i.locked && i.kind === 'act' ? movable[k++] : i))
}

/** 休憩を真ん中（出演の半分が終わったところ）に入れる */
export function insertBreakAtMiddle(items: DraftItem[], minutes = 15): DraftItem[] {
  const acts = items.filter((i) => i.kind === 'act')
  const half = Math.ceil(acts.length / 2)
  const after = acts[half - 1]
  const pos = after ? items.indexOf(after) + 1 : items.length
  const brk: DraftItem = {
    key: `new-${Math.random().toString(36).slice(2)}`,
    id: null,
    kind: 'break',
    name: '休憩',
    minutes,
    locked: false,
    note: null,
  }
  return [...items.slice(0, pos), brk, ...items.slice(pos)]
}
