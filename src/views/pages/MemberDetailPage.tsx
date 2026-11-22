import { useState } from 'react'
import { useData } from '../../controllers/DataController'
import { bandsOfMember, indexById, todayISO } from '../../controllers/selectors'
import { Avatar, Badge, Button, Card, EmptyState, PageHeader } from '../components/ui'
import { APP_ROLE, EVENT_STATUS, formatDate } from '../format'
import { Link, navigate } from '../router'
import { MemberEditModal, ResetPasswordModal } from './MemberModals'
import { NotFound } from './NotFound'

export function MemberDetailPage({ id }: { id: string }) {
  const { snapshot, me, isAdmin } = useData()
  const [modal, setModal] = useState<'edit' | 'password' | null>(null)
  const member = snapshot.members.find((m) => m.id === id)
  if (!member) return <NotFound message="メンバーが見つかりません。削除された可能性があります。" />

  const today = todayISO()
  const events = indexById(snapshot.events)
  const roles = indexById(snapshot.roles)
  const bands = bandsOfMember(snapshot, member.id)
  const history = snapshot.assignments
    .filter((a) => a.memberId === member.id)
    .map((a) => ({ assignment: a, event: events.get(a.eventId), role: roles.get(a.roleId) }))
    .filter((x): x is typeof x & { event: NonNullable<typeof x.event>; role: NonNullable<typeof x.role> } =>
      Boolean(x.event && x.role),
    )
    .sort((a, b) => b.event.date.localeCompare(a.event.date))
  const counted = history.filter((h) => h.event.status !== 'cancelled')
  const byRole = snapshot.roles
    .map((r) => ({ role: r, count: counted.filter((h) => h.role.id === r.id).length }))
    .filter((x) => x.count > 0)
  const unavailable = snapshot.exclusions
    .filter((x) => x.memberId === member.id)
    .map((x) => ({ ...x, event: events.get(x.eventId) }))
    .filter((x) => x.event && x.event.date >= today)

  return (
    <>
      <PageHeader
        back={{ to: '/members', label: 'メンバー一覧' }}
        title={
          <span className="title-with-badge">
            <Avatar name={member.name} size={40} />
            {member.name}
            <Badge tone={APP_ROLE[member.appRole].tone}>{APP_ROLE[member.appRole].label}</Badge>
            {!member.active && <Badge tone="danger">無効</Badge>}
          </span>
        }
        actions={
          isAdmin ? (
            <>
              <Button icon="key" onClick={() => setModal('password')}>
                パスワード再設定
              </Button>
              <Button icon="edit" variant="primary" onClick={() => setModal('edit')}>
                編集
              </Button>
            </>
          ) : (
            member.id === me.id && (
              <Button icon="edit" onClick={() => navigate('/account')}>
                プロフィールを編集
              </Button>
            )
          )
        }
      />

      <div className="grid-detail">
        <Card title={`担当履歴（${history.length}）`} padded={false}>
          {history.length === 0 ? (
            <EmptyState icon="shuffle" title="まだ担当した役割はありません" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>日付</th>
                    <th>イベント</th>
                    <th>役割</th>
                    <th>割り当て</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(({ assignment, event, role }) => (
                    <tr key={assignment.id} className={event.date < today ? 'is-past' : undefined}>
                      <td className="nowrap">{formatDate(event.date)}</td>
                      <td>
                        <Link to={`/events/${event.id}`} className="strong-link">
                          {event.title}
                        </Link>
                        {event.status !== 'scheduled' && (
                          <>
                            {' '}
                            <Badge tone={EVENT_STATUS[event.status].tone}>{EVENT_STATUS[event.status].label}</Badge>
                          </>
                        )}
                      </td>
                      <td>{role.name}</td>
                      <td>
                        <Badge tone={assignment.source === 'auto' ? 'info' : 'neutral'}>
                          {assignment.source === 'auto' ? '自動' : '手動'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="stack">
          <Card title="プロフィール">
            <dl className="kv">
              <dt>メール</dt>
              <dd className="break">{member.email}</dd>
              <dt>パート</dt>
              <dd>{member.part ?? '—'}</dd>
              <dt>担当回数</dt>
              <dd>{counted.length}回（中止を除く）</dd>
              {byRole.length > 0 && (
                <>
                  <dt>役割別</dt>
                  <dd>{byRole.map((x) => `${x.role.name} ${x.count}`).join('・')}</dd>
                </>
              )}
              {isAdmin && member.note && (
                <>
                  <dt>メモ</dt>
                  <dd className="pre-wrap">{member.note}</dd>
                </>
              )}
            </dl>
          </Card>
          <Card title="所属バンド">
            {bands.length === 0 ? (
              <p className="muted small">所属しているバンドはありません。</p>
            ) : (
              <ul className="chip-list">
                {bands.map(({ band, part }) => (
                  <li key={band.id} className="band-chip">
                    <span className="band-chip-name">{band.name}</span>
                    {part && <span className="band-chip-part">{part}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="参加不可の予定">
            {unavailable.length === 0 ? (
              <p className="muted small">登録はありません。</p>
            ) : (
              <ul className="simple-list">
                {unavailable.map((x) => (
                  <li key={x.eventId}>
                    <Link to={`/events/${x.eventId}`}>{x.event!.title}</Link>
                    <span className="muted small">{formatDate(x.event!.date, false)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {modal === 'edit' && <MemberEditModal member={member} onClose={() => setModal(null)} />}
      {modal === 'password' && <ResetPasswordModal member={member} onClose={() => setModal(null)} />}
    </>
  )
}
