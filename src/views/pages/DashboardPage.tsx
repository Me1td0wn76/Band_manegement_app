import { useData } from '../../controllers/DataController'
import { bandsOfEvent, eventFill, indexById, isUpcoming, memberLoad, todayISO } from '../../controllers/selectors'
import { Badge, Button, Card, EmptyState, Meter, PageHeader, StatTile } from '../components/ui'
import { formatDateTime, formatShortDate, relativeDay } from '../format'
import { Link, navigate } from '../router'

export function DashboardPage() {
  const { snapshot } = useData()
  const today = todayISO()
  const members = indexById(snapshot.members)
  const eventsById = indexById(snapshot.events)

  const activeMembers = snapshot.members.filter((m) => m.active)
  const upcoming = snapshot.events.filter((e) => isUpcoming(e, today))
  const upcomingWithFill = upcoming.map((e) => ({ event: e, ...eventFill(snapshot, e.id) }))
  const openSlots = upcomingWithFill.reduce((sum, x) => sum + Math.max(0, x.required - x.filled), 0)
  const needsAttention = upcomingWithFill.filter((x) => x.filled < x.required)
  const initialPassword = activeMembers.filter((m) => m.mustChangePassword)

  const load = memberLoad(snapshot)
  const loadRows = activeMembers
    .map((m) => ({ member: m, count: load.get(m.id) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.member.name.localeCompare(b.member.name, 'ja'))
  const maxLoad = Math.max(1, ...loadRows.map((r) => r.count))
  const avgLoad = loadRows.length ? loadRows.reduce((s, r) => s + r.count, 0) / loadRows.length : 0

  return (
    <>
      <PageHeader
        title="ダッシュボード"
        description="メンバー・イベント・役割の割り振り状況をまとめて確認できます。"
        actions={
          <>
            <Button icon="calendar" onClick={() => navigate('/events?new=1')}>
              イベント登録
            </Button>
            <Button variant="primary" icon="shuffle" onClick={() => navigate('/assign')}>
              自動割り振り
            </Button>
          </>
        }
      />

      <div className="stat-grid">
        <StatTile
          icon="users"
          label="有効メンバー"
          value={activeMembers.length}
          sub={`登録 ${snapshot.members.length}人`}
        />
        <StatTile icon="music" label="バンド" value={snapshot.bands.length} sub={`編成 ${snapshot.bandMembers.length}枠`} />
        <StatTile
          icon="calendar"
          label="今後のイベント"
          value={upcoming.length}
          sub={upcoming[0] ? `次回 ${formatShortDate(upcoming[0].date)}` : '予定なし'}
        />
        <StatTile
          icon="alert"
          label="未充足の役割枠"
          value={openSlots}
          sub={needsAttention.length ? `${needsAttention.length}件のイベント` : 'すべて充足'}
        />
      </div>

      <div className="grid-dashboard">
        <Card
          title="今後のイベント"
          actions={
            <Link to="/events" className="text-link">
              すべて見る
            </Link>
          }
          padded={false}
        >
          {upcomingWithFill.length === 0 ? (
            <EmptyState icon="calendar" title="今後のイベントはありません" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>日付</th>
                    <th>イベント</th>
                    <th>出演</th>
                    <th>役割の充足</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingWithFill.slice(0, 6).map(({ event, required, filled }) => (
                    <tr key={event.id} className="row-link" onClick={() => navigate(`/events/${event.id}`)}>
                      <td className="nowrap">
                        <div>{formatShortDate(event.date)}</div>
                        <div className="muted small">{relativeDay(event.date)}</div>
                      </td>
                      <td>
                        <Link to={`/events/${event.id}`} className="strong-link" onClick={(e) => e.stopPropagation()}>
                          {event.title}
                        </Link>
                      </td>
                      <td className="muted">{bandsOfEvent(snapshot, event.id).length}バンド</td>
                      <td>
                        <Meter value={filled} max={required} label={`役割の充足 ${filled}/${required}`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="要対応">
          {needsAttention.length === 0 && initialPassword.length === 0 ? (
            <EmptyState icon="check" title="対応が必要な項目はありません" />
          ) : (
            <ul className="todo-list">
              {needsAttention.map(({ event, required, filled }) => (
                <li key={event.id} className="todo-item">
                  <div>
                    <div className="todo-title">{event.title}</div>
                    <div className="muted small">
                      {formatShortDate(event.date)}・役割が {required - filled} 枠不足
                    </div>
                  </div>
                  <Button size="sm" icon="shuffle" onClick={() => navigate(`/assign?events=${event.id}`)}>
                    割り振る
                  </Button>
                </li>
              ))}
              {initialPassword.length > 0 && (
                <li className="todo-item">
                  <div>
                    <div className="todo-title">初期パスワードのメンバー</div>
                    <div className="muted small">
                      {initialPassword.length}人がまだパスワードを変更していません
                    </div>
                  </div>
                  <Button size="sm" onClick={() => navigate('/members')}>
                    確認
                  </Button>
                </li>
              )}
            </ul>
          )}
        </Card>

        <Card title="担当回数" actions={<span className="muted small">中止を除く全期間・平均 {avgLoad.toFixed(1)} 回</span>}>
          {loadRows.length === 0 ? (
            <EmptyState icon="users" title="メンバーがいません" />
          ) : (
            <ul className="bar-list">
              {loadRows.map(({ member, count }) => (
                <li key={member.id} className="bar-row" title={`${member.name}: ${count}回`}>
                  <Link to={`/members/${member.id}`} className="bar-label">
                    {member.name}
                  </Link>
                  <span className="bar-track">
                    <span className="bar-fill" style={{ width: `${(count / maxLoad) * 100}%` }} />
                  </span>
                  <span className="bar-value">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="最近の自動割り振り"
          actions={
            <Link to="/assign?tab=history" className="text-link">
              履歴
            </Link>
          }
        >
          {snapshot.runs.length === 0 ? (
            <EmptyState icon="shuffle" title="まだ実行されていません" />
          ) : (
            <ul className="run-list">
              {snapshot.runs.slice(0, 5).map((run) => (
                <li key={run.id} className="run-item">
                  <div className="run-main">
                    <span>{run.eventIds.map((id) => eventsById.get(id)?.title ?? '削除済み').join('、')}</span>
                    <Badge tone={run.mode === 'regenerate' ? 'accent' : 'info'}>
                      {run.mode === 'regenerate' ? '作り直し' : '不足分'}
                    </Badge>
                  </div>
                  <div className="muted small">
                    {formatDateTime(run.executedAt)}・{members.get(run.executedBy ?? '')?.name ?? '不明'}・{run.assignedCount}件
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
