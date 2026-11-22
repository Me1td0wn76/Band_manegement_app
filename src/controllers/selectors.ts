import { slotTemplates } from '../models/slots'
import type { AppSnapshot, Band, BandEvent, EventStatus, Slot, SlotTemplate } from '../models/types'

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

export function displayStatus(event: BandEvent, today = todayISO()): DisplayStatus {
  if (event.date === today && (event.status === 'open' || event.status === 'confirmed')) return 'live'
  return event.status
}

/** 今日以降で、終了・中止していないイベント */
export function isUpcoming(event: BandEvent, today = todayISO()): boolean {
  return event.date >= today && event.status !== 'done' && event.status !== 'cancelled'
}

export function upcomingEvents(snapshot: AppSnapshot, today = todayISO()): BandEvent[] {
  return snapshot.events
    .filter((e) => isUpcoming(e, today))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''))
}

export function bandsOfEvent(snapshot: AppSnapshot, eventId: string): Band[] {
  const bands = indexById(snapshot.bands)
  return snapshot.eventBands
    .filter((eb) => eb.eventId === eventId)
    .sort((a, b) => a.order - b.order)
    .map((eb) => bands.get(eb.bandId))
    .filter((b): b is Band => Boolean(b))
}

export function slotsOf(snapshot: AppSnapshot, eventId: string, bandId: string): Slot[] {
  return snapshot.slots
    .filter((s) => s.eventId === eventId && s.bandId === bandId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

export function eventBandOf(snapshot: AppSnapshot, eventId: string, bandId: string) {
  return snapshot.eventBands.find((eb) => eb.eventId === eventId && eb.bandId === bandId)
}

/** 同じバンドの中で同じ人が複数の枠に入っている枠の数 */
export function conflictCount(slots: Pick<Slot, 'memberId'>[]): number {
  const counts = new Map<string, number>()
  for (const s of slots) if (s.memberId) counts.set(s.memberId, (counts.get(s.memberId) ?? 0) + 1)
  return slots.filter((s) => s.memberId && (counts.get(s.memberId) ?? 0) > 1).length
}

export function slotStats(snapshot: AppSnapshot, eventId: string, bandId: string) {
  const slots = slotsOf(snapshot, eventId, bandId)
  return {
    total: slots.length,
    filled: slots.filter((s) => s.memberId).length,
    conflicts: conflictCount(slots),
    confirmed: Boolean(eventBandOf(snapshot, eventId, bandId)?.confirmedAt),
  }
}

/**
 * その月の出演数（割り当てられた枠の数）。中止イベントは数えない。
 * `exclude` のイベント×バンドは除く（割り振り中の枠を二重に数えないため）。
 */
export function monthlyLoad(
  snapshot: AppSnapshot,
  month: string,
  exclude?: { eventId: string; bandId: string },
): Map<string, number> {
  const events = indexById(snapshot.events)
  const load = new Map<string, number>()
  for (const s of snapshot.slots) {
    if (!s.memberId) continue
    if (exclude && s.eventId === exclude.eventId && s.bandId === exclude.bandId) continue
    const ev = events.get(s.eventId)
    if (!ev || ev.status === 'cancelled' || monthOf(ev.date) !== month) continue
    load.set(s.memberId, (load.get(s.memberId) ?? 0) + 1)
  }
  return load
}

export function bandNamesOf(snapshot: AppSnapshot, memberId: string): string[] {
  const bands = indexById(snapshot.bands)
  return snapshot.bandMembers
    .filter((bm) => bm.memberId === memberId)
    .map((bm) => bands.get(bm.bandId)?.name)
    .filter((n): n is string => Boolean(n))
}

export function lineupOf(snapshot: AppSnapshot, bandId: string) {
  const members = indexById(snapshot.members)
  return snapshot.bandMembers
    .filter((bm) => bm.bandId === bandId)
    .map((bm) => ({ ...bm, member: members.get(bm.memberId) }))
    .filter((x): x is typeof x & { member: NonNullable<typeof x.member> } => Boolean(x.member))
}

/** バンドを出演させるときの枠のひな形（編成のパートから作る） */
export function slotTemplatesForBand(snapshot: AppSnapshot, bandId: string): SlotTemplate[] {
  return slotTemplates(snapshot.bandMembers.filter((bm) => bm.bandId === bandId).map((bm) => bm.part))
}

/** メンバーが割り当てられている今後の出演 */
export function gigsOf(snapshot: AppSnapshot, memberId: string, today = todayISO()) {
  const events = indexById(snapshot.events)
  const bands = indexById(snapshot.bands)
  return snapshot.slots
    .filter((s) => s.memberId === memberId)
    .map((slot) => ({
      slot,
      event: events.get(slot.eventId),
      band: bands.get(slot.bandId),
      confirmed: Boolean(eventBandOf(snapshot, slot.eventId, slot.bandId)?.confirmedAt),
    }))
    .filter((g): g is typeof g & { event: BandEvent; band: Band } => Boolean(g.event && g.band) && isUpcoming(g.event!, today))
    .sort((a, b) => a.event.date.localeCompare(b.event.date) || (a.event.startTime ?? '').localeCompare(b.event.startTime ?? ''))
}

/** 今後のイベントで、まだ誰も入っていない枠の数 */
export function openSlotCount(snapshot: AppSnapshot, today = todayISO()): number {
  const upcoming = new Set(upcomingEvents(snapshot, today).map((e) => e.id))
  return snapshot.slots.filter((s) => upcoming.has(s.eventId) && !s.memberId).length
}

/** 割り振りが必要な（空き・重複がある）今後のイベント×バンドの数 */
export function assignTodoCount(snapshot: AppSnapshot, today = todayISO()): number {
  let n = 0
  for (const ev of upcomingEvents(snapshot, today)) {
    for (const band of bandsOfEvent(snapshot, ev.id)) {
      const st = slotStats(snapshot, ev.id, band.id)
      if (st.filled < st.total || st.conflicts > 0) n++
    }
  }
  return n
}
