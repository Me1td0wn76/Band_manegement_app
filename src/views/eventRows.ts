import { actsOf, displayStatus, staffStats, timeRangeOf, todayISO, upcomingEvents } from '../controllers/selectors'
import type { AppSnapshot, LiveEvent } from '../models/types'
import { formatMd } from './format'
import type { EventRow } from './rb/data'

export function toEventRow(snapshot: AppSnapshot, e: LiveEvent, today = todayISO()): EventRow {
  const st = staffStats(snapshot, e)
  return {
    id: e.id,
    date: e.date,
    time: e.startTime,
    range: `${e.openTime ? `開場 ${e.openTime} / ` : ''}${timeRangeOf(snapshot, e)}`,
    title: e.title,
    venue: e.venue,
    acts: actsOf(snapshot, e.id).map((a) => a.name),
    status: displayStatus(e, today),
    capacity: e.capacity,
    sold: e.sold,
    staff: { filled: st.filled, total: st.total, issues: st.issues },
  }
}

export function eventTicker(snapshot: AppSnapshot): string[] {
  return upcomingEvents(snapshot)
    .slice(0, 5)
    .map((e) => `${formatMd(e.date, false)} ${e.title}${e.venue ? ` @ ${e.venue}` : ''} ${timeRangeOf(snapshot, e)}`)
}
