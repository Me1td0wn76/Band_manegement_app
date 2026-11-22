import { useData } from '../../controllers/DataController'
import { dutiesOf, excludedOf, indexById, staffBoardOf, timeRangeOf, todayISO, upcomingEvents } from '../../controllers/selectors'
import { Page } from '../AppShell'
import { useAction } from '../feedback'
import { Button, Card, DateStub, EmptyState, Equalizer, Icon, RoleBadge, StatusBadge, Toggle, type CSSVars } from '../rb/core'
import { daysUntil, formatMd } from '../format'
import { roleColor } from '../roleStyle'
import { navigate } from '../router'
import { PermissionTable } from './permissions'

/** メンバー視点のマイページ（自分の担当・参加可否・権限） */
export function MyPage() {
  const { snapshot, me, isAdmin, actions } = useData()
  const { run, pending } = useAction()
  const today = todayISO()
  const duties = dutiesOf(snapshot, me.id, today)
  const next = duties[0]
  const members = indexById(snapshot.members)
  const leads = snapshot.members.filter((m) => m.active && m.appRole === 'admin').map((m) => m.name)
  const upcoming = upcomingEvents(snapshot, today)
  const days = next ? daysUntil(next.event.date) : 0

  // 次の担当の日の裏方（全体の役割）
  const crewOfNext = next
    ? (() => {
        const { cells, state } = staffBoardOf(snapshot, next.event)
        return snapshot.roles
          .filter((r) => r.scope === 'event')
          .map((r) => ({
            role: r,
            names: cells
              .filter((c) => c.roleId === r.id)
              .map((c) => state[c.key]?.memberId)
              .filter((id): id is string => Boolean(id))
              .map((id) => members.get(id)?.name ?? '?'),
          }))
      })()
    : []

  return (
    <Page
      eyebrow={`${isAdmin ? 'Admin' : 'Member'} · マイページ`}
      title={`こんにちは、${me.name.split(/\s+/)[0]}さん`}
      subtitle="自分の担当予定と参加可否を確認できます。参加できない日を登録すると、自動割り振りの候補から外れます。"
      actions={
        isAdmin ? (
          <Button variant="ghost" icon="dashboard" onClick={() => navigate('/dashboard')}>
            ダッシュボードへ
          </Button>
        ) : (
          <>
            <span className="mv-lockhint">
              <Icon name="lock" size={14} />
              登録・割り振りは幹部のみ
            </span>
            <Button icon="lock" disabled>
              イベントを登録
            </Button>
          </>
        )
      }
    >
      <div className="mv-grid">
        <Card eyebrow="My duties" title="あなたの担当予定" style={{ '--i': 1 } as CSSVars}>
          {duties.length === 0 ? (
            <EmptyState icon="shuffle" title="まだ担当はありません" message="幹部が裏方を割り振ると、ここに役割と時間が表示されます。" />
          ) : (
            <ul className="mv-gigs">
              {duties.map((d, i) => (
                <li key={d.id} style={{ '--i': i } as CSSVars}>
                  <DateStub date={d.event.date} />
                  <div className="mv-gig">
                    <div className="mv-gig__t">{d.event.title}</div>
                    <div className="rb-muted mv-gig__m">
                      <Icon name="clock" size={13} />
                      {d.item ? `${d.time}・${d.item.name}` : `全体（${timeRangeOf(snapshot, d.event)}）`}
                    </div>
                  </div>
                  <div className="mv-gig__r">
                    <RoleBadge name={d.role.name} icon={d.role.icon} color={roleColor(snapshot.roles, d.role.id)} size="sm" />
                  </div>
                  {d.confirmed ? (
                    <StatusBadge status="confirmed" size="sm" />
                  ) : (
                    <StatusBadge status="open" size="sm">
                      調整中
                    </StatusBadge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card eyebrow={days === 0 && next ? 'On duty today' : 'Next duty'} title="次の担当" glow={Boolean(next)} style={{ '--i': 2 } as CSSVars}>
          {next ? (
            <div className="mv-reh">
              <span className="mv-reh__eq">
                <Equalizer bars={6} size={30} />
              </span>
              <div className="mv-reh__d">
                {formatMd(next.event.date)} {next.item ? next.time.split('–')[0] : (next.event.startTime ?? '')}
              </div>
              <div className="rb-muted">
                {next.event.venue ?? '会場未定'}
                {next.event.openTime ? `・開場 ${next.event.openTime}` : ''}
              </div>
              <div className="mv-reh__set">
                <Icon name={next.role.icon} size={14} />
                担当：{next.role.name}
                {next.item ? `（${next.item.name}・${next.time}）` : '（ライブ全体）'}
              </div>
              {crewOfNext.length > 0 && (
                <div className="mv-reh__set">
                  <Icon name="users" size={14} />
                  {crewOfNext.map((c) => `${c.role.name} ${c.names.join('・') || '未定'}`).join('／')}
                </div>
              )}
              <Button variant="primary" icon="table" block onClick={() => navigate(`/timetable?event=${next.event.id}`)}>
                タイムテーブルを見る
              </Button>
            </div>
          ) : (
            <p className="rb-muted rb-small">次の担当はまだ決まっていません。</p>
          )}
        </Card>
      </div>

      <Card eyebrow="Availability" title="参加可否" style={{ '--i': 3 } as CSSVars}>
        {upcoming.length === 0 ? (
          <p className="rb-muted rb-small">今後のライブはありません。</p>
        ) : (
          <ul className="mv-avail">
            {upcoming.map((ev, i) => {
              const out = excludedOf(snapshot, ev.id).has(me.id)
              return (
                <li key={ev.id} className={out ? 'is-out' : undefined} style={{ '--i': i } as CSSVars}>
                  <DateStub date={ev.date} time={ev.startTime} />
                  <div className="mv-gig">
                    <div className="mv-gig__t">{ev.title}</div>
                    <div className="rb-muted mv-gig__m">
                      <Icon name="pin" size={13} />
                      {ev.venue ?? '会場未定'}・{timeRangeOf(snapshot, ev)}
                    </div>
                  </div>
                  <Toggle
                    checked={out}
                    disabled={pending}
                    onChange={(v) =>
                      void run(() => actions.setExclusion(ev, me, v), v ? `「${ev.title}」を参加不可にしました` : `「${ev.title}」の参加不可を取り消しました`)
                    }
                    label="参加できない"
                  />
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card eyebrow="Permissions" title="権限" actions={<StatusBadge status={isAdmin ? 'admin' : 'member'} />} style={{ '--i': 4 } as CSSVars}>
        <PermissionTable youAreAdmin={isAdmin} />
        <p className="rb-muted rb-small app-gap-top">権限を変更したい場合は、幹部（{leads.join('・') || '未設定'}）に依頼してください。</p>
      </Card>
    </Page>
  )
}
