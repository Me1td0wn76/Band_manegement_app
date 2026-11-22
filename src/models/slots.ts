import type { Part, SlotTemplate } from './types'

export const PART_SHORT: Record<Part, string> = { vo: 'Vo', gt: 'Gt', ba: 'Ba', dr: 'Dr', key: 'Key' }
export const PART_LONG: Record<Part, string> = { vo: 'ボーカル', gt: 'ギター', ba: 'ベース', dr: 'ドラム', key: 'キーボード' }

/** ステージ図の奥から手前の順 */
const STAGE_ORDER: Part[] = ['dr', 'key', 'ba', 'gt', 'vo']
/** バンドの編成が未登録のときの標準編成 */
const DEFAULT_PARTS: Part[] = ['dr', 'key', 'ba', 'gt', 'vo', 'gt']

/**
 * パートの並びから枠のひな形を作る。同じパートが複数あれば「Gt 1」「Gt 2」と番号を振る。
 */
export function slotTemplates(parts: Part[]): SlotTemplate[] {
  const list = (parts.length ? parts : DEFAULT_PARTS)
    .slice()
    .sort((a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b))
  const total = new Map<Part, number>()
  for (const p of list) total.set(p, (total.get(p) ?? 0) + 1)
  const seen = new Map<Part, number>()
  return list.map((part) => {
    const n = (seen.get(part) ?? 0) + 1
    seen.set(part, n)
    return { part, label: (total.get(part) ?? 0) > 1 ? `${PART_SHORT[part]} ${n}` : PART_SHORT[part] }
  })
}

/** 既存の枠に同じパートを足すときのラベル */
export function nextSlotLabel(existing: { part: Part; label: string }[], part: Part): string {
  const same = existing.filter((s) => s.part === part).length
  return same === 0 ? PART_SHORT[part] : `${PART_SHORT[part]} ${same + 1}`
}
