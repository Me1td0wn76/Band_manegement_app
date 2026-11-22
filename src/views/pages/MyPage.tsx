import { useData } from '../../controllers/DataController'
import { bandsOfMember, excludedOf, indexById, isUpcoming, memberLoad, todayISO } from '../../controllers/selectors'
import { useAction } from '../components/Feedback'
import { Badge, Card, Checkbox, EmptyState, PageHeader, StatTile } from '../components/ui'
import { formatShortDate, formatTimeRange, relativeDay } from '../format'
import { Link } from '../router'

export function MyPage() {
  const { snapshot, me, actions } = useData()
  const { run, pending } = useAction()
  const today = todayISO()
  const events = indexById(snapshot.events)
  const roles = indexById(snapshot.roles)

  const myAssignments = snapshot.assignments
    .filter((a) => a.memberId === me.id)
    .map((a) => ({ assignment: a, event: events.get(a.eventId), role: roles.get(a.roleId) }))
    .filter((x) => x.event && x.role && isUpcoming(x.event, today))
    .sort((a, b) => a.event!.date.localeCompare(b.event!.date))

  const upcomingEvents = snapshot.events.filter((e) => isUpcoming(e, today))
  const myBands = bandsOfMember(snapshot, me.id)
  const totalLoad = memberLoad(snapshot).get(me.id) ?? 0

  return (
    <>
      <PageHeader title={`こんにちは、${me.name}さん`} description="あなたの担当予定と参加可否を確認できます。" />

      <div className="stat-grid stat-grid-3">
        <StatTile icon="clock" label="今後の担当" value={myAssignments.length} sub="件" />
        <StatTile icon="shuffle" label="これまでの担当回数" value={totalLoad} sub="中止イベントを除く" />
        <StatTile icon="music" label="所属バンド" value={myBands.length} sub={myBands.map((b) => b.band.name).join('、') || '—'} />
      </div>

      <div className="grid-2">
        <Card title="あなたの担当予定" padded={false}>
          {myAssignments.length === 0 ? (
            <EmptyState icon="check" title="今後の担当はありません" />
          ) : (
            <ul className="assignment-list">
              {myAssignments.map(({ assignment, event, role }) => (
                <li key={assignment.id} className="assignment-item">
                  <div className="date-chip">
                    <span>{formatShortDate(event!.date)}</span>
                    <span className="muted small">{relativeDay(event!.date)}</span>
                  </div>
                  <div className="assignment-main">
                    <Link to={`/events/${event!.id}`} className="strong-link">
                      {event!.title}
                    </Link>
                    <div className="muted small">
                      {formatTimeRange(event!.startTime, event!.endTime)}
                      {event!.venue ? `・${event!.venue}` : ''}
                    </div>
                  </div>
                  <Badge tone="accent">{role!.name}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="参加可否の登録">
          <p className="muted small card-lead">
            参加できないイベントにチェックを入れると、自動割り振りの対象から外れます。
          </p>
          {upcomingEvents.length === 0 ? (
            <EmptyState icon="calendar" title="今後のイベントはありません" />
          ) : (
            <ul className="check-list">
              {upcomingEvents.map((event) => {
                const excluded = excludedOf(snapshot, event.id).has(me.id)
                return (
                  <li key={event.id} className="check-row">
                    <Checkbox
                      checked={excluded}
                      disabled={pending}
                      onChange={(checked) =>
                        run(
                          () => actions.setExclusion(event.id, me.id, checked),
                          checked ? `「${event.title}」を参加不可にしました` : `「${event.title}」の参加不可を取り消しました`,
                        )
                      }
                    >
                      <span className="check-text">
                        <span>{event.title}</span>
                        <span className="muted small">{formatShortDate(event.date)}</span>
                      </span>
                    </Checkbox>
                    {excluded && <Badge tone="warn">参加不可</Badge>}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card title="所属バンド">
          {myBands.length === 0 ? (
            <EmptyState icon="music" title="所属しているバンドはありません" />
          ) : (
            <ul className="chip-list">
              {myBands.map(({ band, part }) => (
                <li key={band.id} className="band-chip">
                  <span className="band-chip-name">{band.name}</span>
                  {part && <span className="band-chip-part">{part}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
