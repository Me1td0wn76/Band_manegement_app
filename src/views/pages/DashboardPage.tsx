import { useEffect, useState } from 'react'
import { useData } from '../../controllers/DataController'
import {
  bandsOfEvent,
  displayStatus,
  indexById,
  monthOf,
  openSlotCount,
  slotStats,
  todayISO,
  upcomingEvents,
} from '../../controllers/selectors'
import type { ActivityKind, AppSnapshot, BandEvent } from '../../models/types'
import { Page } from '../AppShell'
import { Avatar, Button, Card, EmptyState, Icon, StatCard, StatusBadge, VuMeter, type CSSVars } from '../rb/core'
import { EventTable, type EventRow } from '../rb/data'
import type { IconName } from '../rb/icons'
import { daysUntil, formatAgo, formatDoors, formatMd } from '../format'
import { navigate } from '../router'

const KIND_ICON: Record<ActivityKind, IconName> = {
  event: 'calendar',
  member: 'user-plus',
  band: 'amp',
  assign: 'shuffle',
  onboarding: 'check',
  profile: 'edit',
}

export function toEventRow(snapshot: AppSnapshot, e: BandEvent, today = todayISO()): EventRow {
  return {
    id: e.id,
    date: e.date,
    time: e.startTime,
    openTime: e.openTime,
    title: e.title,
    venue: e.venue,
    bands: bandsOfEvent(snapshot, e.id).map((b) => b.name),
    status: displayStatus(e, today),
    capacity: e.capacity,
    sold: e.sold,
  }
}

export function eventTicker(snapshot: AppSnapshot): string[] {
  return upcomingEvents(snapshot)
    .slice(0, 5)
    .map((e) => `${formatMd(e.date, false)} ${e.title}${e.venue ? ` @ ${e.venue}` : ''}${e.startTime ? ` ${e.startTime}` : ''}`)
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

export function DashboardPage() {
  const { snapshot, me } = useData()
  const today = todayISO()
  const month = monthOf(today)
  const lastMonth = monthOf(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().slice(0, 10))
  const members = indexById(snapshot.members)
  const events = indexById(snapshot.events)
  const bands = indexById(snapshot.bands)

  const upcoming = upcomingEvents(snapshot, today)
  const next = upcoming[0]
  const countable = snapshot.events.filter((e) => e.status !== 'cancelled')
  const eventsThisMonth = countable.filter((e) => monthOf(e.date) === month).length
  const eventsLastMonth = countable.filter((e) => monthOf(e.date) === lastMonth).length
  const activeMembers = snapshot.members.filter((m) => m.active)
  const admins = activeMembers.filter((m) => m.appRole === 'admin').length
  const joinedThisMonth = activeMembers.filter((m) => monthOf(m.createdAt.slice(0, 10)) === month).length

  const assignRows = upcoming
    .flatMap((ev) => bandsOfEvent(snapshot, ev.id).map((band) => ({ ev, band, ...slotStats(snapshot, ev.id, band.id) })))
    .slice(0, 6)

  const days = next ? daysUntil(next.date) : 0
  const subtitle = next
    ? days === 0
      ? `おかえりなさい、${me.name.split(/\s+/)[0]}さん。今日は「${next.title}」の本番です。`
      : `おかえりなさい、${me.name.split(/\s+/)[0]}さん。次のライブまで あと${days}日です。`
    : `おかえりなさい、${me.name.split(/\s+/)[0]}さん。予定されているライブはまだありません。`

  const nextTarget = next ? new Date(`${next.date}T${next.startTime ?? '00:00'}:00`).getTime() : 0
  const nextBands = next ? bandsOfEvent(snapshot, next.id) : []
  const now = new Date()

  return (
    <Page
      eyebrow={`Admin · ${now.getFullYear()}年${now.getMonth() + 1}月`}
      title="ダッシュボード"
      subtitle={subtitle}
      ticker={upcoming.length ? eventTicker(snapshot) : undefined}
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
        <StatCard
          label="Events"
          sublabel="今月のイベント"
          value={eventsThisMonth}
          unit="本"
          icon="calendar"
          delta={eventsThisMonth - eventsLastMonth}
        />
        <StatCard
          label="Members"
          sublabel={`登録メンバー（管理者 ${admins}）`}
          value={activeMembers.length}
          unit="人"
          icon="users"
          delta={joinedThisMonth}
          deltaLabel="今月の登録"
          style={{ '--i': 1 } as CSSVars}
        />
        <StatCard
          label="Bands"
          sublabel="活動中のバンド"
          value={snapshot.bands.filter((b) => b.active).length}
          unit="組"
          icon="amp"
          style={{ '--i': 2 } as CSSVars}
        />
        <StatCard
          label="Open slots"
          sublabel="未割り当ての枠"
          value={openSlotCount(snapshot, today)}
          unit="枠"
          icon="shuffle"
          style={{ '--i': 3 } as CSSVars}
        />
      </div>

      <div className="db-grid">
        {next ? (
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
                    {formatMd(next.date)} {formatDoors(next)}
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
                    <Icon name="amp" size={16} />
                  </dt>
                  <dd>{nextBands.map((b) => b.name).join('、') || '出演バンド未定'}</dd>
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
                  割り振りを開く
                </Button>
                <Button variant="ghost" icon="edit" onClick={() => navigate(`/events?edit=${next.id}`)}>
                  編集
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
          eyebrow="Assign status"
          title="割り振り状況"
          actions={
            <Button size="sm" variant="ghost" iconRight="chevron-right" onClick={() => navigate('/assign')}>
              開く
            </Button>
          }
          style={{ '--i': 3 } as CSSVars}
        >
          {assignRows.length === 0 ? (
            <p className="rb-muted rb-small">割り振りが必要な出演はありません。</p>
          ) : (
            <ul className="db-assign">
              {assignRows.map((a, i) => (
                <li key={`${a.ev.id}:${a.band.id}`} style={{ '--i': i } as CSSVars}>
                  <button type="button" className="db-assign__link" onClick={() => navigate(`/assign?event=${a.ev.id}&band=${a.band.id}`)}>
                    <div className="db-assign__top">
                      <span className="rb-mono rb-muted">{formatMd(a.ev.date, false)}</span>
                      <b>{a.band.name}</b>
                      {a.conflicts > 0 ? (
                        <StatusBadge status="conflict" size="sm">
                          重複 {a.conflicts}
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
                      <VuMeter
                        level={a.total ? a.filled / a.total : 0}
                        segments={Math.max(6, a.total * 3)}
                        size="sm"
                        ariaLabel={`${a.band.name}の割り当て`}
                      />
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
                const context = [a.eventId && events.get(a.eventId)?.title, a.bandId && bands.get(a.bandId)?.name]
                  .filter(Boolean)
                  .join('・')
                return (
                  <li key={a.id} style={{ '--i': i } as CSSVars}>
                    <Avatar name={who ?? '?'} size={30} />
                    <div>
                      <b>{who ?? '削除されたメンバー'}</b> {a.text}
                      {a.kind === 'assign' && context && <span className="rb-muted">（{context}）</span>}
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
          onRowClick={(ev) => navigate(`/assign?event=${ev.id}`)}
          emptyTitle="今後のイベントはありません"
          emptyAction={
            <Button variant="primary" icon="plus" onClick={() => navigate('/events?new=1')}>
              イベントを登録
            </Button>
          }
        />
      </section>
    </Page>
  )
}
