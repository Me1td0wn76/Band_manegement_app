import { useState } from 'react'
import { useData } from '../../controllers/DataController'
import { bandsOfEvent, eventFill, todayISO } from '../../controllers/selectors'
import type { BandEvent, EventStatus } from '../../models/types'
import { useAction, useConfirm } from '../components/Feedback'
import { Badge, Button, Card, EmptyState, IconButton, Input, Meter, PageHeader, Select, Tabs } from '../components/ui'
import { Icon } from '../components/Icon'
import { EVENT_STATUS, downloadCsv, formatDate, formatTimeRange } from '../format'
import { Link, navigate, useLocation } from '../router'
import { EventFormModal } from './EventFormModal'

type Period = 'upcoming' | 'past' | 'all'

export function EventsPage() {
  const { snapshot, isAdmin, actions } = useData()
  const { query } = useLocation()
  const confirm = useConfirm()
  const { run } = useAction()
  const today = todayISO()

  const [period, setPeriod] = useState<Period>('upcoming')
  const [status, setStatus] = useState<EventStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [sortAsc, setSortAsc] = useState<boolean | null>(null)
  const [editing, setEditing] = useState<BandEvent | 'new' | null>(isAdmin && query.get('new') ? 'new' : null)

  const closeModal = () => {
    setEditing(null)
    if (query.get('new')) navigate('/events', { replace: true })
  }

  const counts = {
    upcoming: snapshot.events.filter((e) => e.date >= today).length,
    past: snapshot.events.filter((e) => e.date < today).length,
    all: snapshot.events.length,
  }

  const keyword = search.trim().toLowerCase()
  // 今後は日付の昇順、過去は降順が既定。見出しクリックで切り替え
  const asc = sortAsc ?? period !== 'past'
  const rows = snapshot.events
    .filter((e) => (period === 'upcoming' ? e.date >= today : period === 'past' ? e.date < today : true))
    .filter((e) => status === 'all' || e.status === status)
    .filter((e) => !keyword || [e.title, e.venue ?? '', e.description ?? ''].some((s) => s.toLowerCase().includes(keyword)))
    .map((e) => ({ event: e, bands: bandsOfEvent(snapshot, e.id), ...eventFill(snapshot, e.id) }))
    .sort((a, b) => {
      const c = a.event.date.localeCompare(b.event.date) || (a.event.startTime ?? '').localeCompare(b.event.startTime ?? '')
      return asc ? c : -c
    })

  const remove = async (event: BandEvent) => {
    const ok = await confirm({
      title: 'イベントを削除',
      message: `「${event.title}」を削除します。役割の割り当てや参加可否の登録も削除されます。`,
      confirmLabel: '削除する',
      danger: true,
    })
    if (ok) await run(() => actions.deleteEvent(event.id), 'イベントを削除しました')
  }

  const exportCsv = () => {
    downloadCsv(`events-${today}.csv`, [
      ['日付', '開始', '終了', 'イベント名', '会場', '出演バンド', '役割（充足/必要）', 'ステータス'],
      ...rows.map(({ event, bands, filled, required }) => [
        event.date,
        event.startTime ?? '',
        event.endTime ?? '',
        event.title,
        event.venue ?? '',
        bands.map((b) => b.name).join(' / '),
        `${filled}/${required}`,
        EVENT_STATUS[event.status].label,
      ]),
    ])
  }

  return (
    <>
      <PageHeader
        title="イベント"
        description="イベントの一覧です。行をクリックすると詳細と役割の割り当てを確認できます。"
        actions={
          <>
            <Button icon="download" onClick={exportCsv} disabled={rows.length === 0}>
              CSV出力
            </Button>
            {isAdmin && (
              <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
                イベント登録
              </Button>
            )}
          </>
        }
      />

      <Card padded={false}>
        <div className="toolbar">
          <Tabs
            value={period}
            onChange={(p) => {
              setPeriod(p)
              setSortAsc(null)
            }}
            tabs={[
              { value: 'upcoming', label: '今後', count: counts.upcoming },
              { value: 'past', label: '過去', count: counts.past },
              { value: 'all', label: 'すべて', count: counts.all },
            ]}
          />
          <div className="toolbar-filters">
            <label className="search">
              <Icon name="search" size={16} />
              <Input
                type="search"
                placeholder="イベント名・会場で検索"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="イベントを検索"
              />
            </label>
            <Select value={status} onChange={(e) => setStatus(e.target.value as EventStatus | 'all')} aria-label="ステータスで絞り込み">
              <option value="all">すべてのステータス</option>
              {(Object.keys(EVENT_STATUS) as EventStatus[]).map((s) => (
                <option key={s} value={s}>
                  {EVENT_STATUS[s].label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon="calendar" title="該当するイベントはありません">
            {isAdmin && snapshot.events.length === 0 && (
              <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
                最初のイベントを登録
              </Button>
            )}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th aria-sort={asc ? 'ascending' : 'descending'}>
                    <button type="button" className="th-sort" onClick={() => setSortAsc(!asc)}>
                      日付 <span aria-hidden="true">{asc ? '↑' : '↓'}</span>
                    </button>
                  </th>
                  <th>時間</th>
                  <th>イベント名</th>
                  <th>会場</th>
                  <th>出演バンド</th>
                  <th>役割の充足</th>
                  <th>ステータス</th>
                  {isAdmin && <th className="th-actions">操作</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ event, bands, filled, required }) => (
                  <tr key={event.id} className="row-link" onClick={() => navigate(`/events/${event.id}`)}>
                    <td className="nowrap">{formatDate(event.date)}</td>
                    <td className="nowrap muted">{formatTimeRange(event.startTime, event.endTime)}</td>
                    <td>
                      <Link to={`/events/${event.id}`} className="strong-link" onClick={(e) => e.stopPropagation()}>
                        {event.title}
                      </Link>
                    </td>
                    <td className="muted">{event.venue ?? '—'}</td>
                    <td>
                      {bands.length === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        <span className="tag-list">
                          {bands.map((b) => (
                            <span key={b.id} className="tag">
                              {b.name}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td>
                      <Meter value={filled} max={required} label={`役割の充足 ${filled}/${required}`} />
                    </td>
                    <td>
                      <Badge tone={EVENT_STATUS[event.status].tone}>{EVENT_STATUS[event.status].label}</Badge>
                    </td>
                    {isAdmin && (
                      <td className="td-actions" onClick={(e) => e.stopPropagation()}>
                        <IconButton icon="edit" label={`${event.title}を編集`} onClick={() => setEditing(event)} />
                        <IconButton icon="trash" tone="danger" label={`${event.title}を削除`} onClick={() => remove(event)} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <EventFormModal
          event={editing === 'new' ? undefined : editing}
          onClose={closeModal}
          onSaved={(id) => {
            if (editing === 'new' && id) navigate(`/events/${id}`)
          }}
        />
      )}
    </>
  )
}
