import { useData } from '../../controllers/DataController'
import {
  bandsOfEvent,
  eventBandOf,
  lineupOf,
  monthOf,
  monthlyLoad,
  slotStats,
  slotsOf,
  todayISO,
  upcomingEvents,
} from '../../controllers/selectors'
import { PART_LONG, nextSlotLabel } from '../../models/slots'
import { PARTS, type BandEvent } from '../../models/types'
import { Page } from '../AppShell'
import { useAction, useConfirm } from '../feedback'
import { Button, Card, EmptyState, Icon, Select, Tabs } from '../rb/core'
import { ROLE_META } from '../rb/icons'
import { RoleAssigner, type AssignerState } from '../rb/RoleAssigner'
import { formatDoors, formatLogTime, formatMd } from '../format'
import { navigate, useLocation } from '../router'

export function AssignPage() {
  const { snapshot, actions } = useData()
  const { query } = useLocation()
  const { run } = useAction()
  const confirm = useConfirm()
  const today = todayISO()

  // 対象イベント：今後のもの（日付順）→ 過去のもの（新しい順）。中止は除く
  const upcoming = upcomingEvents(snapshot, today)
  const past = snapshot.events
    .filter((e) => !upcoming.includes(e) && e.status !== 'cancelled')
    .sort((a, b) => b.date.localeCompare(a.date))
  const choices: BandEvent[] = [...upcoming, ...past]
  const event = choices.find((e) => e.id === query.get('event')) ?? choices[0]

  const go = (eventId: string, bandId?: string) =>
    navigate(`/assign?event=${eventId}${bandId ? `&band=${bandId}` : ''}`, { replace: true })

  if (!event) {
    return (
      <Page eyebrow="Admin · Assign" title="役割の割り振り" subtitle="イベントの出演バンドごとに、パートの枠へメンバーを割り振ります。">
        <Card>
          <EmptyState
            icon="calendar"
            title="割り振るイベントがありません"
            message="先にイベントを登録し、出演バンドを選んでください。"
            action={
              <Button variant="primary" icon="plus" onClick={() => navigate('/events?new=1')}>
                イベントを登録
              </Button>
            }
          />
        </Card>
      </Page>
    )
  }

  const bands = bandsOfEvent(snapshot, event.id)
  const band = bands.find((b) => b.id === query.get('band')) ?? bands[0]

  const eventSelect = (
    <div className="as-event">
      <Select
        aria-label="対象イベント"
        value={event.id}
        onChange={(e) => go(e.target.value)}
        options={choices.map((e) => ({
          value: e.id,
          label: `${formatMd(e.date, false)} ${e.title}${e.date < today ? '（終了）' : ''}`,
        }))}
      />
    </div>
  )

  const page = (body: React.ReactNode) => (
    <Page
      eyebrow="Admin · Assign"
      title="役割の割り振り"
      subtitle="ルールに沿って自動で割り振り、必要なところだけ手で直します。ロックした枠は自動割り振りで変わりません。"
      actions={eventSelect}
    >
      {body}
    </Page>
  )

  if (!band) {
    return page(
      <Card>
        <EmptyState
          icon="amp"
          title="出演バンドが未設定です"
          message={`「${event.title}」に出演バンドを追加すると、バンドごとにパートの枠ができます。`}
          action={
            <Button variant="primary" icon="edit" onClick={() => navigate(`/events?edit=${event.id}`)}>
              イベントを編集
            </Button>
          }
        />
      </Card>,
    )
  }

  const slots = slotsOf(snapshot, event.id, band.id)
  const regulars = new Set(lineupOf(snapshot, band.id).map((l) => l.memberId))
  const load = monthlyLoad(snapshot, monthOf(event.date), { eventId: event.id, bandId: band.id })
  const members = snapshot.members
    .filter((m) => m.active)
    .map((m) => ({ id: m.id, name: m.name, parts: m.parts, load: load.get(m.id) ?? 0, regular: regulars.has(m.id) }))
    .sort((a, b) => Number(b.regular) - Number(a.regular) || a.name.localeCompare(b.name, 'ja'))
  const confirmed = Boolean(eventBandOf(snapshot, event.id, band.id)?.confirmedAt)
  const history = snapshot.activities
    .filter((a) => a.kind === 'assign' && a.eventId === event.id && a.bandId === band.id)
    .slice(0, 30)
    .map((a) => ({ id: a.id, time: formatLogTime(a.createdAt), text: a.text }))

  const save = (next: AssignerState, text: string) =>
    run(() =>
      actions.saveAssignment(
        event.id,
        band.id,
        slots.map((s) => ({ id: s.id, memberId: next.assignment[s.id] ?? null, locked: Boolean(next.locked[s.id]) })),
        text,
      ),
    )

  const removeSlot = async (slotId: string) => {
    const slot = slots.find((s) => s.id === slotId)
    if (!slot) return
    const who = slot.memberId ? snapshot.members.find((m) => m.id === slot.memberId)?.name : null
    const ok = await confirm({
      eyebrow: 'Remove slot',
      title: '枠を削除',
      message: `『${slot.label}』の枠を削除します。${who ? `${who}さんの割り当ても外れます。` : ''}`,
      confirmLabel: '削除する',
      danger: true,
    })
    if (ok) await run(() => actions.removeSlot(slot), { title: '枠を削除しました', message: slot.label })
  }

  const addSlot = (part: (typeof PARTS)[number]) =>
    run(() => actions.addSlot(event.id, band.id, part, nextSlotLabel(slots, part)), {
      title: '枠を追加しました',
      message: `${band.name}・${PART_LONG[part]}`,
    })

  return page(
    <>
      <Tabs
        value={band.id}
        onChange={(id) => go(event.id, id)}
        tabs={bands.map((b) => {
          const st = slotStats(snapshot, event.id, b.id)
          return { id: b.id, label: b.name, icon: 'amp' as const, count: st.conflicts || undefined }
        })}
      />
      <RoleAssigner
        key={`${event.id}:${band.id}`}
        title={band.name}
        subtitle={`${formatMd(event.date)} ${event.startTime ?? ''} · ${event.venue ?? '会場未定'}（${formatDoors(event)}）`}
        slots={slots.map((s) => ({ id: s.id, part: s.part, label: s.label }))}
        members={members}
        value={Object.fromEntries(slots.map((s) => [s.id, s.memberId]))}
        locked={Object.fromEntries(slots.map((s) => [s.id, s.locked]))}
        confirmed={confirmed}
        history={history}
        onSave={save}
        onConfirm={async () => {
          await run(() => actions.confirmAssignment(event.id, band.id), {
            title: '割り振りを確定しました',
            message: 'メンバーのマイページに担当パートが表示されます',
          })
        }}
        onRemoveSlot={(id) => void removeSlot(id)}
        sideExtra={
          <Card eyebrow="Slots" title="枠の構成">
            <p className="rb-muted rb-small as-note">
              パートの枠を足せます。枠をクリックすると、空きにしたり削除したりできます。
            </p>
            <div className="as-addslots">
              {PARTS.map((p) => (
                <button key={p} type="button" className="rb-chip rb-chip--role as-addslot" style={{ ['--rb-role' as string]: `var(--role-${p})` }} onClick={() => void addSlot(p)}>
                  <Icon name="plus" size={14} />
                  <Icon name={ROLE_META[p].icon} size={16} className="rb-chip__icon" />
                  <span>{ROLE_META[p].short}</span>
                </button>
              ))}
            </div>
          </Card>
        }
      />
    </>,
  )
}
