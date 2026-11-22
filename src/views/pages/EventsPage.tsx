import { useState, type FormEvent } from 'react'
import { useData } from '../../controllers/DataController'
import { bandsOfEvent, slotTemplatesForBand, todayISO } from '../../controllers/selectors'
import type { BandEvent, EventInput, EventStatus } from '../../models/types'
import { Page } from '../AppShell'
import { useAction, useConfirm } from '../feedback'
import { Button, Card, ChipSelect, Icon, Select, Tabs, TextArea, TextField } from '../rb/core'
import { EventTable } from '../rb/data'
import { downloadCsv, formatMd } from '../format'
import { navigate, useLocation } from '../router'
import { eventTicker, toEventRow } from './DashboardPage'

type Tab = 'upcoming' | 'all' | 'draft' | 'open' | 'confirmed' | 'closed'

interface Form {
  title: string
  date: string
  openTime: string
  startTime: string
  venue: string
  capacity: string
  sold: string
  status: EventStatus
  description: string
  bandIds: string[]
}

const BLANK: Form = {
  title: '',
  date: '',
  openTime: '18:00',
  startTime: '18:30',
  venue: '',
  capacity: '',
  sold: '0',
  status: 'draft',
  description: '',
  bandIds: [],
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

  const toForm = (e: BandEvent): Form => ({
    title: e.title,
    date: e.date,
    openTime: e.openTime ?? '',
    startTime: e.startTime ?? '',
    venue: e.venue ?? '',
    capacity: e.capacity == null ? '' : String(e.capacity),
    sold: String(e.sold),
    status: e.status,
    description: e.description ?? '',
    bandIds: bandsOfEvent(snapshot, e.id).map((b) => b.id),
  })

  const editTarget = isAdmin ? snapshot.events.find((e) => e.id === query.get('edit')) : undefined
  const [formOpen, setFormOpen] = useState(isAdmin && (query.get('new') === '1' || Boolean(editTarget)))
  const [editing, setEditing] = useState<string | null>(editTarget?.id ?? null)
  const [form, setForm] = useState<Form>(editTarget ? toForm(editTarget) : { ...BLANK, date: today })
  const [err, setErr] = useState<Partial<Record<'title' | 'venue' | 'date' | 'time', string>>>({})
  const [tab, setTab] = useState<Tab>('upcoming')
  const [q, setQ] = useState('')

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const clearQuery = () => {
    if (query.get('new') || query.get('edit')) navigate('/events', { replace: true })
  }
  const closeForm = () => {
    setFormOpen(false)
    setEditing(null)
    setErr({})
    clearQuery()
  }

  const save = async (status?: EventStatus) => {
    const er: typeof err = {}
    if (!form.title.trim()) er.title = 'イベント名を入力してください'
    if (!form.venue.trim()) er.venue = '会場を入力してください'
    if (!form.date) er.date = '日付を入力してください'
    if (form.openTime && form.startTime && form.openTime > form.startTime) er.time = '開演は開場より後にしてください'
    setErr(er)
    if (Object.keys(er).length) return
    const input: EventInput = {
      title: form.title.trim(),
      date: form.date,
      openTime: form.openTime || null,
      startTime: form.startTime || null,
      venue: form.venue.trim(),
      capacity: form.capacity === '' ? null : Math.max(0, Math.floor(Number(form.capacity) || 0)),
      sold: Math.max(0, Math.floor(Number(form.sold) || 0)),
      description: form.description.trim() || null,
      status: status ?? form.status,
      bands: form.bandIds.map((bandId) => ({ bandId, slots: slotTemplatesForBand(snapshot, bandId) })),
    }
    const ok = await run(() => (editing ? actions.updateEvent(editing, input) : actions.createEvent(input)), {
      title: editing ? 'イベントを更新しました' : 'イベントを登録しました',
      message: `${input.title}・${formatMd(input.date, false)}${input.startTime ? ` ${input.startTime}` : ''}`,
    })
    if (ok) {
      setForm({ ...BLANK, date: today })
      closeForm()
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
      message: `『${ev.title}（${formatMd(ev.date, false)}）』と、その割り振りが削除されます。この操作は元に戻せません。`,
      confirmLabel: '削除する',
      danger: true,
    })
    if (ok) await run(() => actions.deleteEvent(ev.id, ev.title), { title: 'イベントを削除しました', message: ev.title })
  }

  const matches = (e: BandEvent, t: Tab) => {
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
    .filter((r) => !keyword || [r.title, r.venue ?? '', ...r.bands].join(' ').toLowerCase().includes(keyword))
  const count = (t: Tab) => snapshot.events.filter((e) => matches(e, t)).length

  const exportCsv = () =>
    downloadCsv(`events-${today}.csv`, [
      ['日付', '開場', '開演', 'イベント', '会場', '出演バンド', '集客', '定員', '状態'],
      ...rows.map((r) => {
        const ev = snapshot.events.find((e) => e.id === r.id)
        return [r.date, r.openTime ?? '', r.time ?? '', r.title, r.venue ?? '', r.bands.join(' / '), r.sold, r.capacity ?? '', ev ? STATUS_OPTIONS.find((s) => s.value === ev.status)?.label ?? '' : '']
      }),
    ])

  const bandOptions = snapshot.bands
    .filter((b) => b.active || form.bandIds.includes(b.id))
    .map((b) => ({ value: b.id, label: b.active ? b.name : `${b.name}（休止中）`, icon: 'amp' as const }))

  return (
    <Page
      eyebrow={isAdmin ? 'Admin · Events' : 'Member · Events'}
      title={isAdmin ? 'イベント管理' : 'イベント'}
      subtitle={isAdmin ? 'イベントを登録・編集し、表で状態と集客を確認します。' : 'イベントの日程・会場・出演バンドを表で確認できます。'}
      ticker={eventTicker(snapshot).length ? eventTicker(snapshot) : undefined}
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
                  setForm({ ...BLANK, date: today })
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
                <TextField
                  label="日付"
                  required
                  type="date"
                  icon="calendar"
                  value={form.date}
                  onChange={(e) => set('date', e.target.value)}
                  error={err.date}
                />
                <TextField label="開場" type="time" icon="clock" value={form.openTime} onChange={(e) => set('openTime', e.target.value)} />
                <TextField
                  label="開演"
                  type="time"
                  icon="clock"
                  value={form.startTime}
                  onChange={(e) => set('startTime', e.target.value)}
                  error={err.time}
                />
                <TextField
                  className="ev-span2"
                  label="会場"
                  required
                  icon="pin"
                  value={form.venue}
                  onChange={(e) => set('venue', e.target.value)}
                  error={err.venue}
                  placeholder="例：ライブハウス SOUND BOX"
                />
                <TextField
                  label="定員"
                  type="number"
                  min={0}
                  icon="users"
                  value={form.capacity}
                  onChange={(e) => set('capacity', e.target.value)}
                  placeholder="0"
                />
                <TextField
                  label="集客（予約・販売数）"
                  type="number"
                  min={0}
                  icon="bolt"
                  value={form.sold}
                  onChange={(e) => set('sold', e.target.value)}
                />
                <TextArea
                  className="ev-span2"
                  label="メモ"
                  value={form.description}
                  onChange={(v) => set('description', v)}
                  rows={2}
                  placeholder="入り時間、機材の持ち込みなど"
                />
                <ChipSelect
                  className="ev-span3"
                  label="出演バンド（選んだ順が出演順です）"
                  value={form.bandIds}
                  onChange={(v) => set('bandIds', v)}
                  options={bandOptions}
                />
                <div className="ev-span3 ev-foot">
                  <span className="rb-muted rb-small">
                    <Icon name="info" size={14} style={{ display: 'inline', verticalAlign: '-2px' }} />{' '}
                    {editing
                      ? '出演バンドを外すと、そのバンドの割り振りも削除されます。'
                      : '登録後、「役割の割り振り」で各バンドの担当を自動で割り振れます。'}
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
          placeholder="イベント・会場・バンドで検索"
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
        onRowClick={isAdmin ? (ev) => navigate(`/assign?event=${ev.id}`) : undefined}
        emptyTitle={snapshot.events.length ? '条件に合うイベントはありません' : 'イベントがまだありません'}
        emptyMessage={
          snapshot.events.length
            ? 'タブや検索の条件を変えてみてください。'
            : isAdmin
              ? '「イベントを登録」から最初のライブを追加しましょう。'
              : '管理者がイベントを登録すると、ここに表示されます。'
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
