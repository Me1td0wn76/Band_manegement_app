import { useData } from '../../controllers/DataController'
import { gigsOf, slotsOf, todayISO, indexById } from '../../controllers/selectors'
import { PART_LONG } from '../../models/slots'
import { Page } from '../AppShell'
import { Button, Card, DateStub, EmptyState, Equalizer, Icon, RoleBadge, StatusBadge, type CSSVars } from '../rb/core'
import { daysUntil, formatDoors, formatMd } from '../format'
import { navigate } from '../router'
import { PermissionTable } from './permissions'

/** メンバー視点のマイページ（自分の出演予定と担当パート、権限） */
export function MyPage() {
  const { snapshot, me, isAdmin } = useData()
  const today = todayISO()
  const gigs = gigsOf(snapshot, me.id, today)
  const next = gigs[0]
  const members = indexById(snapshot.members)
  const admins = snapshot.members.filter((m) => m.active && m.appRole === 'admin').map((m) => m.name)
  const lineup = next ? slotsOf(snapshot, next.event.id, next.band.id) : []
  const days = next ? daysUntil(next.event.date) : 0

  return (
    <Page
      eyebrow={`${isAdmin ? 'Admin' : 'Member'} · マイページ`}
      title={`こんにちは、${me.name.split(/\s+/)[0]}さん`}
      subtitle="自分の出演予定と担当パートを確認できます。"
      actions={
        isAdmin ? (
          <Button variant="ghost" icon="dashboard" onClick={() => navigate('/dashboard')}>
            ダッシュボードへ
          </Button>
        ) : (
          <>
            <span className="mv-lockhint">
              <Icon name="lock" size={14} />
              登録・割り振りは管理者のみ
            </span>
            <Button icon="lock" disabled>
              イベントを登録
            </Button>
          </>
        )
      }
    >
      <div className="mv-grid">
        <Card eyebrow="My gigs" title="あなたの出演予定" style={{ '--i': 1 } as CSSVars}>
          {gigs.length === 0 ? (
            <EmptyState
              icon="calendar"
              title="まだ出演予定はありません"
              message="管理者が役割を割り振ると、ここに担当パートと一緒に表示されます。"
            />
          ) : (
            <ul className="mv-gigs">
              {gigs.map((g, i) => (
                <li key={g.slot.id} style={{ '--i': i } as CSSVars}>
                  <DateStub date={g.event.date} />
                  <div className="mv-gig">
                    <div className="mv-gig__t">{g.event.title}</div>
                    <div className="rb-muted mv-gig__m">
                      <Icon name="pin" size={13} />
                      {g.event.venue ?? '会場未定'}・{g.event.openTime ? `${g.event.openTime}入り` : formatDoors(g.event)}
                    </div>
                  </div>
                  <div className="mv-gig__r">
                    <span className="rb-mono">{g.band.name}</span>
                    <RoleBadge role={g.slot.part} long size="sm" />
                  </div>
                  {g.confirmed ? (
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

        <Card eyebrow={days === 0 && next ? 'Live today' : 'Next gig'} title="次の出演" glow={Boolean(next)} style={{ '--i': 2 } as CSSVars}>
          {next ? (
            <div className="mv-reh">
              <span className="mv-reh__eq">
                <Equalizer bars={6} size={30} />
              </span>
              <div className="mv-reh__d">
                {formatMd(next.event.date)} {next.event.startTime ?? ''}
              </div>
              <div className="rb-muted">
                {next.event.venue ?? '会場未定'} ・ {next.band.name}
              </div>
              <div className="mv-reh__set">
                <Icon name="note" size={14} />
                担当：{next.slot.label}（{PART_LONG[next.slot.part]}）
              </div>
              <div className="mv-reh__set">
                <Icon name="users" size={14} />
                {lineup.map((s) => `${s.label} ${s.memberId ? (members.get(s.memberId)?.name ?? '?') : '未定'}`).join('／')}
              </div>
              <Button variant="primary" icon="calendar" block onClick={() => navigate('/events')}>
                イベント一覧を見る
              </Button>
            </div>
          ) : (
            <p className="rb-muted rb-small">次の出演はまだ決まっていません。</p>
          )}
        </Card>
      </div>

      <Card
        eyebrow="Permissions"
        title="権限"
        actions={<StatusBadge status={isAdmin ? 'admin' : 'member'} />}
        style={{ '--i': 3 } as CSSVars}
      >
        <PermissionTable youAreAdmin={isAdmin} />
        <p className="rb-muted rb-small app-gap-top">
          権限を変更したい場合は、管理者（{admins.join('・') || '未設定'}）に依頼してください。
        </p>
      </Card>
    </Page>
  )
}
