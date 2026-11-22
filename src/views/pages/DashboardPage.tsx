import { useEffect, useState } from 'react'
import { useData } from '../../controllers/DataController'
import {
  actsOf,
  displayStatus,
  indexById,
  monthOf,
  openSlotCount,
  scheduleOf,
  staffStats,
  timeRangeOf,
  todayISO,
  upcomingEvents,
} from '../../controllers/selectors'
import { fmtMin } from '../../controllers/timetable'
import type { ActivityKind } from '../../models/types'
import { Page } from '../AppShell'
import { eventTicker, toEventRow } from '../eventRows'
import { Avatar, Button, Card, EmptyState, Icon, StatCard, StatusBadge, VuMeter, type CSSVars } from '../rb/core'
import { EventTable } from '../rb/data'
import type { IconName } from '../rb/icons'
import { daysUntil, formatAgo, formatMd } from '../format'
import { navigate } from '../router'

const KIND_ICON: Record<ActivityKind, IconName> = {
  event: 'calendar',
  timetable: 'table',
  member: 'user-plus',
  role: 'knob',
  assign: 'shuffle',
  onboarding: 'check',
  profile: 'edit',
  availability: 'x',
}

function useNow(): number {
  const [t, setT] = useState(() => Date.now())
  useEffect(() => {
    const iv = setInterval(() => setT(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [])
  return t
}

function Countdown({ target }: { target: number }) {
  const now = useNow()
  const s = Math.max(0, Math.floor((target - now) / 1000))
  const parts: [string, number][] = [
    ['日', Math.floor(s / 86400)],
    ['時間', Math.floor((s % 86400) / 3600)],
    ['分', Math.floor((s % 3600) / 60)],
    ['秒', s % 60],
  ]
  return (
    <div className="db-count" aria-label="開演までのカウントダウン">
      {parts.map(([u, v]) => (
        <div key={u} className="db-count__cell">
          <span className="db-count__num" key={v}>
            {String(v).padStart(2, '0')}
          </span>
          <span className="db-count__u">{u}</span>
        </div>
      ))}
    </div>
  )
}

/** 幹部（管理者）用ダッシュボード */
export function DashboardPage() {
  const { snapshot, me } = useData()
  const today = todayISO()
  const now = new Date()
  const month = monthOf(today)
  const lastMonth = monthOf(new Date(now.getFullYear(), now.getMonth() - 1, 15).toISOString().slice(0, 10))
  const members = indexById(snapshot.members)
  const events = indexById(snapshot.events)

  const upcoming = upcomingEvents(snapshot, today)
  const next = upcoming[0]
  const countable = snapshot.events.filter((e) => e.status !== 'cancelled')
  const eventsThisMonth = countable.filter((e) => monthOf(e.date) === month).length
  const eventsLastMonth = countable.filter((e) => monthOf(e.date) === lastMonth).length
  const crew = snapshot.members.filter((m) => m.active)
  const leads = crew.filter((m) => m.appRole === 'admin').length
  const joinedThisMonth = crew.filter((m) => monthOf(m.createdAt.slice(0, 10)) === month).length

  const statusRows = upcoming.slice(0, 6).map((ev) => ({ ev, ...staffStats(snapshot, ev) }))
  const first = me.name.split(/\s+/)[0]
  const days = next ? daysUntil(next.date) : 0
  const subtitle = next
    ? days === 0
      ? `おかえりなさい、${first}さん。今日は「${next.title}」の本番です。`
      : `おかえりなさい、${first}さん。次のライブまで あと${days}日です。`
    : `おかえりなさい、${first}さん。予定されているライブはまだありません。`

  const nextSchedule = next ? scheduleOf(snapshot, next) : null
  const nextTarget = next ? new Date(`${next.date}T${next.startTime ?? '00:00'}:00`).getTime() : 0
  const ticker = eventTicker(snapshot)

  return (
    <Page
      eyebrow={`Admin · ${now.getFullYear()}年${now.getMonth() + 1}月`}
      title="ダッシュボード"
      subtitle={subtitle}
      ticker={ticker.length ? ticker : undefined}
      actions={
        <>
          <Button icon="user-plus" onClick={() => navigate('/members')}>
            メンバーを登録
          </Button>
          <Button variant="primary" icon="plus" onClick={() => navigate('/events?new=1')}>
            イベントを登録
          </Button>
        </>
      }
    >
      <div className="db-stats">
        <StatCard label="Events" sublabel="今月のイベント" value={eventsThisMonth} unit="本" icon="calendar" delta={eventsThisMonth - eventsLastMonth} />
        <StatCard
          label="Crew"
          sublabel={`裏方メンバー（幹部 ${leads}）`}
          value={crew.length}
          unit="人"
          icon="users"
          delta={joinedThisMonth}
          deltaLabel="今月の登録"
          style={{ '--i': 1 } as CSSVars}
        />
        <StatCard label="Upcoming" sublabel="今後のライブ" value={upcoming.length} unit="本" icon="table" style={{ '--i': 2 } as CSSVars} />
        <StatCard label="Open slots" sublabel="未割り当ての裏方の枠" value={openSlotCount(snapshot, today)} unit="枠" icon="shuffle" style={{ '--i': 3 } as CSSVars} />
      </div>

      <div className="db-grid">
        {next && nextSchedule ? (
          <Card
            eyebrow={days === 0 ? 'Live today' : 'Next gig'}
            title={next.title}
            glow
            actions={<StatusBadge status={displayStatus(next, today)} />}
            style={{ '--i': 2 } as CSSVars}
          >
            <div className="db-next">
              <div className="rb-eyebrow">開演まで</div>
              <Countdown target={nextTarget} />
              <dl className="db-facts">
                <div>
                  <dt>
                    <Icon name="calendar" size={16} />
                  </dt>
                  <dd>
                    {formatMd(next.date)} {next.openTime ? `開場 ${next.openTime} / ` : ''}
                    {timeRangeOf(snapshot, next)}
                  </dd>
                </div>
                <div>
                  <dt>
                    <Icon name="pin" size={16} />
                  </dt>
                  <dd>{next.venue ?? '会場未定'}</dd>
                </div>
                <div>
                  <dt>
                    <Icon name="note" size={16} />
                  </dt>
                  <dd>
                    {actsOf(snapshot, next.id).length}組・転換 {next.changeoverMinutes}分
                    {nextSchedule.diff != null && nextSchedule.diff > 0 && <span className="app-danger-text">（終演予定を{nextSchedule.diff}分オーバー）</span>}
                  </dd>
                </div>
              </dl>
              {next.capacity ? (
                <div className="db-sold">
                  <span className="rb-eyebrow">Sold</span>
                  <VuMeter level={Math.min(1, next.sold / next.capacity)} segments={16} live ariaLabel="集客" />
                  <span className="rb-mono">
                    {next.sold} / {next.capacity}
                  </span>
                </div>
              ) : null}
              <div className="db-actions">
                <Button variant="primary" icon="shuffle" onClick={() => navigate(`/assign?event=${next.id}`)}>
                  裏方を割り振る
                </Button>
                <Button variant="ghost" icon="table" onClick={() => navigate(`/timetable?event=${next.id}`)}>
                  タイムテーブル
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <Card eyebrow="Next gig" title="次のライブ" style={{ '--i': 2 } as CSSVars}>
            <EmptyState
              icon="calendar"
              title="予定されているライブはありません"
              message="イベントを登録すると、ここに開演までのカウントダウンが出ます。"
              action={
                <Button variant="primary" icon="plus" onClick={() => navigate('/events?new=1')}>
                  イベントを登録
                </Button>
              }
            />
          </Card>
        )}

        <Card
          eyebrow="Staff status"
          title="裏方の割り振り状況"
          actions={
            <Button size="sm" variant="ghost" iconRight="chevron-right" onClick={() => navigate('/assign')}>
              開く
            </Button>
          }
          style={{ '--i': 3 } as CSSVars}
        >
          {statusRows.length === 0 ? (
            <p className="rb-muted rb-small">割り振りが必要なライブはありません。</p>
          ) : (
            <ul className="db-assign">
              {statusRows.map((a, i) => (
                <li key={a.ev.id} style={{ '--i': i } as CSSVars}>
                  <button type="button" className="db-assign__link" onClick={() => navigate(`/assign?event=${a.ev.id}`)}>
                    <div className="db-assign__top">
                      <span className="rb-mono rb-muted">{formatMd(a.ev.date, false)}</span>
                      <b>{a.ev.title}</b>
                      {a.issues > 0 ? (
                        <StatusBadge status="conflict" size="sm">
                          要確認 {a.issues}
                        </StatusBadge>
                      ) : a.confirmed ? (
                        <StatusBadge status="confirmed" size="sm">
                          確定
                        </StatusBadge>
                      ) : a.total > 0 && a.filled === a.total ? (
                        <StatusBadge status="confirmed" size="sm">
                          完了
                        </StatusBadge>
                      ) : null}
                    </div>
                    <div className="db-assign__bar">
                      <VuMeter level={a.total ? a.filled / a.total : 0} segments={Math.min(24, Math.max(8, a.total))} size="sm" ariaLabel={`${a.ev.title}の裏方の割り当て`} />
                      <span className="rb-mono">
                        {a.filled}/{a.total}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card eyebrow="Activity" title="最近の活動" style={{ '--i': 4 } as CSSVars}>
          {snapshot.activities.length === 0 ? (
            <p className="rb-muted rb-small">まだ活動はありません。</p>
          ) : (
            <ol className="db-feed">
              {snapshot.activities.slice(0, 6).map((a, i) => {
                const who = a.actorId ? members.get(a.actorId)?.name : undefined
                const ctx = a.eventId && (a.kind === 'assign' || a.kind === 'timetable') ? events.get(a.eventId)?.title : undefined
                return (
                  <li key={a.id} style={{ '--i': i } as CSSVars}>
                    <Avatar name={who ?? '?'} size={30} />
                    <div>
                      <b>{who ?? '削除されたメンバー'}</b> {a.text}
                      {ctx && <span className="rb-muted">（{ctx}）</span>}
                      <div className="rb-mono rb-muted db-when">
                        <Icon name={KIND_ICON[a.kind]} size={12} />
                        {formatAgo(a.createdAt)}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </Card>
      </div>

      <section className="db-section">
        <div className="db-section__head">
          <div>
            <div className="rb-eyebrow">Upcoming</div>
            <h2 className="db-h2">直近のイベント</h2>
          </div>
          <Button size="sm" variant="ghost" iconRight="chevron-right" onClick={() => navigate('/events')}>
            イベント管理へ
          </Button>
        </div>
        <EventTable
          events={upcoming.slice(0, 6).map((e) => toEventRow(snapshot, e, today))}
          sortable={false}
          onEdit={(ev) => navigate(`/events?edit=${ev.id}`)}
          onRowClick={(ev) => navigate(`/timetable?event=${ev.id}`)}
          emptyTitle="今後のイベントはありません"
          emptyAction={
            <Button variant="primary" icon="plus" onClick={() => navigate('/events?new=1')}>
              イベントを登録
            </Button>
          }
        />
      </section>
      {nextSchedule && <span className="rb-sr">終演予定 {fmtMin(nextSchedule.end)}</span>}
    </Page>
  )
}
