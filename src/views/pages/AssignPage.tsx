import type { ReactNode } from 'react'
import { useData } from '../../controllers/DataController'
import { candidatesFor, scheduleOf, slotsOf, staffBoardOf, todayISO, upcomingEvents } from '../../controllers/selectors'
import { rowsFromState, type CellState } from '../../controllers/staffAssign'
import { fmtMin } from '../../controllers/timetable'
import type { LiveEvent } from '../../models/types'
import { Page } from '../AppShell'
import { useAction } from '../feedback'
import { Button, Card, EmptyState, Select } from '../rb/core'
import { StaffBoard } from '../rb/StaffBoard'
import { formatLogTime, formatMd } from '../format'
import { roleColor } from '../roleStyle'
import { navigate, useLocation } from '../router'

/** 裏方の割り振り（幹部のみ） */
export function AssignPage() {
  const { snapshot, actions } = useData()
  const { query } = useLocation()
  const { run } = useAction()
  const today = todayISO()

  const upcoming = upcomingEvents(snapshot, today)
  const past = snapshot.events.filter((e) => !upcoming.includes(e) && e.status !== 'cancelled').sort((a, b) => b.date.localeCompare(a.date))
  const choices: LiveEvent[] = [...upcoming, ...past]
  const event = choices.find((e) => e.id === query.get('event')) ?? choices[0]

  const page = (body: ReactNode, actionsNode?: ReactNode) => (
    <Page
      eyebrow="Admin · Staff"
      title="裏方の割り振り"
      subtitle="撮影・照明・SNS・タイムキーパー・PA などをルールに沿って自動で割り振り、必要なところだけ手で直します。ロックした枠は自動割り振りで変わりません。"
      actions={actionsNode}
    >
      {body}
    </Page>
  )

  if (!event) {
    return page(
      <Card>
        <EmptyState
          icon="calendar"
          title="割り振るイベントがありません"
          message="先にイベントを登録し、タイムテーブルで出演を入れてください。"
          action={
            <Button variant="primary" icon="plus" onClick={() => navigate('/events?new=1')}>
              イベントを登録
            </Button>
          }
        />
      </Card>,
    )
  }

  const { acts, cells, state } = staffBoardOf(snapshot, event)
  const schedule = scheduleOf(snapshot, event)
  const timeOf = (id: string) => {
    const row = schedule.rows.find((r) => r.item.id === id)
    return row ? `${fmtMin(row.start)}–${fmtMin(row.end)}` : ''
  }
  const candidates = candidatesFor(snapshot, event).sort(
    (a, b) => Number(a.excluded) - Number(b.excluded) || a.load - b.load || a.name.localeCompare(b.name, 'ja'),
  )
  const history = snapshot.activities
    .filter((a) => a.kind === 'assign' && a.eventId === event.id)
    .slice(0, 30)
    .map((a) => ({ id: a.id, time: formatLogTime(a.createdAt), text: a.text }))

  const save = (next: CellState, text: string) => run(() => actions.saveAssignments(event.id, rowsFromState(cells, next), text))

  return page(
    <>
      {acts.length === 0 && (
        <Card>
          <EmptyState
            icon="note"
            title="タイムテーブルに出演がありません"
            message="出演ごとの役割（照明・撮影など）は、タイムテーブルに出演を入れると割り振れます。ライブ全体の役割は今すぐ割り振れます。"
            action={
              <Button icon="table" onClick={() => navigate(`/timetable?event=${event.id}`)}>
                タイムテーブルを開く
              </Button>
            }
          />
        </Card>
      )}
      <StaffBoard
        key={event.id}
        title={event.title}
        subtitle={`${formatMd(event.date)} ${schedule.rows.length ? `${fmtMin(schedule.start)}–${fmtMin(schedule.end)}` : (event.startTime ?? '')} · ${event.venue ?? '会場未定'}`}
        roles={snapshot.roles}
        colorOf={(id) => roleColor(snapshot.roles, id)}
        acts={acts.map((a) => ({ id: a.id, name: a.name, time: timeOf(a.id) }))}
        cells={cells}
        value={state}
        candidates={candidates}
        confirmed={Boolean(event.staffConfirmedAt)}
        history={history}
        slotsOf={(roleId) => slotsOf(snapshot, event.id, snapshot.roles.find((r) => r.id === roleId)!)}
        onSave={save}
        onConfirm={async () => {
          await run(() => actions.confirmAssignments(event.id), {
            title: '裏方の割り振りを確定しました',
            message: 'メンバーのマイページとタイムテーブルに担当が表示されます',
          })
        }}
        onSetSlots={(role, n) => void run(() => actions.setRoleSlots(event.id, role, n))}
      />
    </>,
    <div className="as-event">
      <Select
        aria-label="対象イベント"
        value={event.id}
        onChange={(e) => navigate(`/assign?event=${e.target.value}`, { replace: true })}
        options={choices.map((e) => ({ value: e.id, label: `${formatMd(e.date, false)} ${e.title}${e.date < today ? '（終了）' : ''}` }))}
      />
    </div>,
  )
}
