import { useState, type FormEvent } from 'react'
import { useData } from '../../controllers/DataController'
import { slotsOf, todayISO } from '../../controllers/selectors'
import type { EventInput, EventStatus, LiveEvent } from '../../models/types'
import { Page } from '../AppShell'
import { eventTicker, toEventRow } from '../eventRows'
import { useAction, useConfirm } from '../feedback'
import { Button, Card, Icon, RoleBadge, Select, Tabs, TextArea, TextField } from '../rb/core'
import { EventTable } from '../rb/data'
import { downloadCsv, formatMd } from '../format'
import { SCOPE_LABEL, roleColor } from '../roleStyle'
import { navigate, useLocation } from '../router'

type Tab = 'upcoming' | 'all' | 'draft' | 'open' | 'confirmed' | 'closed'

interface Form {
  title: string
  date: string
  openTime: string
  startTime: string
  targetEndTime: string
  changeover: string
  venue: string
  capacity: string
  sold: string
  status: EventStatus
  description: string
  slots: Record<string, number>
}

const STATUS_OPTIONS: { value: EventStatus; label: string }[] = [
  { value: 'draft', label: '下書き' },
  { value: 'open', label: '募集中' },
  { value: 'confirmed', label: '確定' },
  { value: 'done', label: '終了' },
  { value: 'cancelled', label: '中止' },
]

export function EventsPage() {
  const { snapshot, isAdmin, actions } = useData()
  const { query } = useLocation()
  const { run, pending } = useAction()
  const confirm = useConfirm()
  const today = todayISO()

  const blank = (): Form => ({
    title: '',
    date: today,
    openTime: '17:30',
    startTime: '18:00',
    targetEndTime: '21:00',
    changeover: '10',
    venue: '',
    capacity: '',
    sold: '0',
    status: 'draft',
    description: '',
    slots: Object.fromEntries(snapshot.roles.map((r) => [r.id, r.defaultSlots])),
  })
  const toForm = (e: LiveEvent): Form => ({
    title: e.title,
    date: e.date,
    openTime: e.openTime ?? '',
    startTime: e.startTime ?? '',
    targetEndTime: e.targetEndTime ?? '',
    changeover: String(e.changeoverMinutes),
    venue: e.venue ?? '',
    capacity: e.capacity == null ? '' : String(e.capacity),
    sold: String(e.sold),
    status: e.status,
    description: e.description ?? '',
    slots: Object.fromEntries(snapshot.roles.map((r) => [r.id, slotsOf(snapshot, e.id, r)])),
  })

  const editTarget = isAdmin ? snapshot.events.find((e) => e.id === query.get('edit')) : undefined
  const [formOpen, setFormOpen] = useState(isAdmin && (query.get('new') === '1' || Boolean(editTarget)))
  const [editing, setEditing] = useState<string | null>(editTarget?.id ?? null)
  const [form, setForm] = useState<Form>(() => (editTarget ? toForm(editTarget) : blank()))
  const [err, setErr] = useState<Partial<Record<'title' | 'venue' | 'date' | 'time' | 'end', string>>>({})
  const [tab, setTab] = useState<Tab>('upcoming')
  const [q, setQ] = useState('')

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const closeForm = () => {
    setFormOpen(false)
    setEditing(null)
    setErr({})
    if (query.get('new') || query.get('edit')) navigate('/events', { replace: true })
  }

  const save = async (status?: EventStatus) => {
    const er: typeof err = {}
    if (!form.title.trim()) er.title = 'イベント名を入力してください'
    if (!form.venue.trim()) er.venue = '会場を入力してください'
    if (!form.date) er.date = '日付を入力してください'
    if (form.openTime && form.startTime && form.openTime > form.startTime) er.time = '開演は開場より後にしてください'
    if (form.startTime && form.targetEndTime && form.targetEndTime <= form.startTime) er.end = '終演予定は開演より後にしてください'
    setErr(er)
    if (Object.keys(er).length) return
    const input: EventInput = {
      title: form.title.trim(),
      date: form.date,
      openTime: form.openTime || null,
      startTime: form.startTime || null,
      targetEndTime: form.targetEndTime || null,
      changeoverMinutes: Math.max(0, Math.min(120, Math.floor(Number(form.changeover) || 0))),
      venue: form.venue.trim(),
      capacity: form.capacity === '' ? null : Math.max(0, Math.floor(Number(form.capacity) || 0)),
      sold: Math.max(0, Math.floor(Number(form.sold) || 0)),
      description: form.description.trim() || null,
      status: status ?? form.status,
      roleSlots: snapshot.roles.map((r) => ({ roleId: r.id, slots: Math.max(0, Math.min(20, form.slots[r.id] ?? 0)) })),
    }
    let createdId = ''
    const ok = await run(
      async () => {
        if (editing) await actions.updateEvent(editing, input)
        else createdId = await actions.createEvent(input)
      },
      {
        title: editing ? 'イベントを更新しました' : 'イベントを登録しました',
        message: `${input.title}・${formatMd(input.date, false)}${input.startTime ? ` ${input.startTime}` : ''}`,
      },
    )
    if (ok) {
      const wasNew = !editing
      setForm(blank())
      closeForm()
      // 新しいイベントはそのままタイムテーブル作りへ
      if (wasNew && createdId) navigate(`/timetable?event=${createdId}`)
    }
  }

  const startEdit = (id: string) => {
    const ev = snapshot.events.find((e) => e.id === id)
    if (!ev) return
    setForm(toForm(ev))
    setEditing(id)
    setErr({})
    setFormOpen(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const remove = async (id: string) => {
    const ev = snapshot.events.find((e) => e.id === id)
    if (!ev) return
    const ok = await confirm({
      eyebrow: 'Delete event',
      title: 'イベントを削除',
      message: `『${ev.title}（${formatMd(ev.date, false)}）』と、そのタイムテーブル・裏方の割り振り・参加可否が削除されます。この操作は元に戻せません。`,
      confirmLabel: '削除する',
      danger: true,
    })
    if (ok) await run(() => actions.deleteEvent(ev), { title: 'イベントを削除しました', message: ev.title })
  }

  const matches = (e: LiveEvent, t: Tab) => {
    switch (t) {
      case 'upcoming':
        return e.date >= today && e.status !== 'done' && e.status !== 'cancelled'
      case 'closed':
        return e.status === 'done' || e.status === 'cancelled'
      case 'all':
        return true
      default:
        return e.status === t
    }
  }
  const keyword = q.trim().toLowerCase()
  const rows = snapshot.events
    .filter((e) => matches(e, tab))
    .map((e) => toEventRow(snapshot, e, today))
    .filter((r) => !keyword || [r.title, r.venue ?? '', ...r.acts].join(' ').toLowerCase().includes(keyword))
  const count = (t: Tab) => snapshot.events.filter((e) => matches(e, t)).length

  const exportCsv = () =>
    downloadCsv(`events-${today}.csv`, [
      ['日付', '時間', 'イベント', '会場', '出演', '裏方（割当/枠）', '集客', '定員', '状態'],
      ...rows.map((r) => {
        const ev = snapshot.events.find((e) => e.id === r.id)
        return [
          r.date,
          r.range,
          r.title,
          r.venue ?? '',
          r.acts.join(' / '),
          `${r.staff.filled}/${r.staff.total}`,
          r.sold,
          r.capacity ?? '',
          STATUS_OPTIONS.find((s) => s.value === ev?.status)?.label ?? '',
        ]
      }),
    ])

  const ticker = eventTicker(snapshot)

  return (
    <Page
      eyebrow={isAdmin ? 'Admin · Events' : 'Member · Events'}
      title={isAdmin ? 'イベント管理' : 'イベント'}
      subtitle={
        isAdmin
          ? 'イベントを登録・編集し、表で時間・裏方・集客を確認します。行をクリックするとタイムテーブルを開きます。'
          : 'イベントの日程と時間、裏方の状況を表で確認できます。行をクリックするとタイムテーブルを開きます。'
      }
      ticker={ticker.length ? ticker : undefined}
      actions={
        <>
          <Button icon="table" onClick={exportCsv} disabled={rows.length === 0}>
            CSV書き出し
          </Button>
          {isAdmin && (
            <Button
              variant="primary"
              icon={formOpen ? 'x' : 'plus'}
              onClick={() => {
                if (formOpen) closeForm()
                else {
                  setForm(blank())
                  setEditing(null)
                  setFormOpen(true)
                }
              }}
            >
              {formOpen ? '閉じる' : 'イベントを登録'}
            </Button>
          )}
        </>
      }
    >
      {isAdmin && (
        <div className={`ev-drawer${formOpen ? ' is-open' : ''}`}>
          <div className="ev-drawer__inner">
            <Card glow eyebrow={editing ? 'Edit event' : 'New event'} title={editing ? 'イベントを編集' : '新しいイベントを登録'}>
              <form
                className="ev-form"
                noValidate
                onSubmit={(e: FormEvent) => {
                  e.preventDefault()
                  void save()
                }}
              >
                <TextField
                  className="ev-span2"
                  label="イベント名"
                  required
                  icon="note"
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  error={err.title}
                  placeholder="例：定期ライブ vol.13"
                />
                <Select
                  label="状態"
                  value={form.status}
                  onChange={(e) => set('status', e.target.value as EventStatus)}
                  options={editing ? STATUS_OPTIONS : STATUS_OPTIONS.slice(0, 3)}
                />
                <TextField label="日付" required type="date" icon="calendar" value={form.date} onChange={(e) => set('date', e.target.value)} error={err.date} />
                <TextField label="開場" type="time" icon="clock" value={form.openTime} onChange={(e) => set('openTime', e.target.value)} />
                <TextField label="開演" type="time" icon="clock" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} error={err.time} />
                <TextField
                  label="終演予定"
                  type="time"
                  icon="stopwatch"
                  value={form.targetEndTime}
                  onChange={(e) => set('targetEndTime', e.target.value)}
                  error={err.end}
                  help="タイムテーブルの自動調整の目標"
                />
                <TextField
                  label="転換（分）"
                  type="number"
                  min={0}
                  max={120}
                  icon="shuffle"
                  value={form.changeover}
                  onChange={(e) => set('changeover', e.target.value)}
                />
                <TextField
                  label="会場"
                  required
                  icon="pin"
                  value={form.venue}
                  onChange={(e) => set('venue', e.target.value)}
                  error={err.venue}
                  placeholder="例：ライブハウス SOUND BOX"
                />
                <TextField label="定員" type="number" min={0} icon="users" value={form.capacity} onChange={(e) => set('capacity', e.target.value)} placeholder="0" />
                <TextField label="集客（予約・販売数）" type="number" min={0} icon="bolt" value={form.sold} onChange={(e) => set('sold', e.target.value)} />
                <TextArea className="ev-span2" label="メモ" value={form.description} onChange={(v) => set('description', v)} rows={2} placeholder="入り時間、注意事項など" />
                {snapshot.roles.length > 0 && (
                  <div className="ev-span3 rb-field">
                    <span className="rb-field__label">裏方の人数（出演ごとの役割は1出演あたり）</span>
                    <div className="ev-slots">
                      {snapshot.roles.map((r) => (
                        <label key={r.id} className="ev-slot">
                          <RoleBadge name={r.name} icon={r.icon} color={roleColor(snapshot.roles, r.id)} size="sm" />
                          <span className="rb-muted rb-small">{SCOPE_LABEL[r.scope].short}</span>
                          <input
                            type="number"
                            min={0}
                            max={20}
                            className="tt-input tt-input--num rb-mono"
                            value={form.slots[r.id] ?? 0}
                            aria-label={`${r.name}の人数`}
                            onChange={(e) => set('slots', { ...form.slots, [r.id]: Math.max(0, Math.min(20, Math.floor(Number(e.target.value) || 0))) })}
                          />
                          <span className="rb-muted rb-small">人</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div className="ev-span3 ev-foot">
                  <span className="rb-muted rb-small">
                    <Icon name="info" size={14} style={{ display: 'inline', verticalAlign: '-2px' }} />{' '}
                    {editing ? '出演順と演奏時間は「タイムテーブル」で編集します。' : '登録すると、タイムテーブルの画面に移って出演順を組めます。'}
                  </span>
                  <div className="ev-btns">
                    <Button variant="ghost" onClick={closeForm}>
                      キャンセル
                    </Button>
                    {!editing && (
                      <Button icon="edit" loading={pending} onClick={() => void save('draft')}>
                        下書きで保存
                      </Button>
                    )}
                    <Button type="submit" variant="primary" icon="check" loading={pending}>
                      {editing ? '更新する' : 'イベントを登録'}
                    </Button>
                  </div>
                </div>
              </form>
            </Card>
          </div>
        </div>
      )}

      <div className="ev-toolbar">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'upcoming', label: '今後', count: count('upcoming') },
            { id: 'all', label: 'すべて', count: count('all') },
            { id: 'draft', label: '下書き', count: count('draft') },
            { id: 'open', label: '募集中', count: count('open') },
            { id: 'confirmed', label: '確定', count: count('confirmed') },
            { id: 'closed', label: '終了・中止', count: count('closed') },
          ]}
        />
        <TextField
          className="ev-search"
          icon="search"
          placeholder="イベント・会場・出演者で検索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="イベントを検索"
        />
      </div>

      <EventTable
        key={tab + keyword}
        events={rows}
        onEdit={isAdmin ? (ev) => startEdit(ev.id) : undefined}
        onDelete={isAdmin ? (ev) => void remove(ev.id) : undefined}
        onRowClick={(ev) => navigate(`/timetable?event=${ev.id}`)}
        emptyTitle={snapshot.events.length ? '条件に合うイベントはありません' : 'イベントがまだありません'}
        emptyMessage={
          snapshot.events.length
            ? 'タブや検索の条件を変えてみてください。'
            : isAdmin
              ? '「イベントを登録」から最初のライブを追加しましょう。'
              : '幹部がイベントを登録すると、ここに表示されます。'
        }
        emptyAction={
          isAdmin && !snapshot.events.length ? (
            <Button variant="primary" icon="plus" onClick={() => setFormOpen(true)}>
              イベントを登録
            </Button>
          ) : undefined
        }
      />
    </Page>
  )
}
