import { useState } from 'react'
import { useData } from '../../controllers/DataController'
import {
  assignmentsForEvent,
  bandsOfEvent,
  candidatesFor,
  eventFill,
  excludedOf,
  indexById,
  memberLoad,
  performersOf,
  slotsForEvent,
} from '../../controllers/selectors'
import { useAction, useConfirm } from '../components/Feedback'
import { Icon } from '../components/Icon'
import { Alert, Avatar, Badge, Button, Card, Checkbox, EmptyState, IconButton, Meter, PageHeader, Select } from '../components/ui'
import { EVENT_STATUS, formatDate, formatTimeRange, relativeDay } from '../format'
import { Link, navigate } from '../router'
import { EventFormModal } from './EventFormModal'
import { NotFound } from './NotFound'

export function EventDetailPage({ id }: { id: string }) {
  const { snapshot, me, isAdmin, actions } = useData()
  const { run, pending } = useAction()
  const confirm = useConfirm()
  const [editing, setEditing] = useState(false)
  const [exclusionTarget, setExclusionTarget] = useState('')

  const event = snapshot.events.find((e) => e.id === id)
  if (!event) return <NotFound message="イベントが見つかりません。削除された可能性があります。" />

  const members = indexById(snapshot.members)
  const bands = bandsOfEvent(snapshot, event.id)
  const assignments = assignmentsForEvent(snapshot, event.id)
  const slotList = slotsForEvent(snapshot, event.id)
  const fill = eventFill(snapshot, event.id)
  const excluded = excludedOf(snapshot, event.id)
  const performers = performersOf(snapshot, event.id)
  const load = memberLoad(snapshot)
  const exclusions = snapshot.exclusions.filter((x) => x.eventId === event.id)
  const visibleSlots = slotList.filter(({ role, slots }) => isAdmin || slots > 0 || assignments.some((a) => a.roleId === role.id))

  const remove = async () => {
    const ok = await confirm({
      title: 'イベントを削除',
      message: `「${event.title}」を削除します。役割の割り当てや参加可否の登録も削除されます。`,
      confirmLabel: '削除する',
      danger: true,
    })
    if (ok && (await run(() => actions.deleteEvent(event.id), 'イベントを削除しました'))) navigate('/events')
  }

  const iAmExcluded = excluded.has(me.id)

  return (
    <>
      <PageHeader
        back={{ to: '/events', label: 'イベント一覧' }}
        title={
          <span className="title-with-badge">
            {event.title}
            <Badge tone={EVENT_STATUS[event.status].tone}>{EVENT_STATUS[event.status].label}</Badge>
          </span>
        }
        description={`${formatDate(event.date)}・${relativeDay(event.date)}`}
        actions={
          isAdmin && (
            <>
              <Button icon="trash" variant="ghost" onClick={remove}>
                削除
              </Button>
              <Button icon="edit" onClick={() => setEditing(true)}>
                編集
              </Button>
              <Button
                variant="primary"
                icon="shuffle"
                disabled={event.status === 'cancelled'}
                onClick={() => navigate(`/assign?events=${event.id}`)}
              >
                自動割り振り
              </Button>
            </>
          )
        }
      />

      <div className="grid-detail">
        <Card
          title="役割の割り当て"
          actions={<Meter value={fill.filled} max={fill.required} label={`役割の充足 ${fill.filled}/${fill.required}`} />}
          padded={false}
        >
          {isAdmin && (
            <p className="card-lead muted small legend-row">
              <span>
                <Icon name="lock" size={13} /> ロック中の割り当ては、自動割り振りを作り直しても保持されます。手動で追加した割り当ては自動でロックされます。
              </span>
            </p>
          )}
          {visibleSlots.length === 0 ? (
            <EmptyState icon="shuffle" title="このイベントに必要な役割はありません" />
          ) : (
            <ul className="role-rows">
              {visibleSlots.map(({ role, slots }) => {
                const assigned = assignments.filter((a) => a.roleId === role.id)
                const enough = assigned.length >= slots
                const candidates = isAdmin
                  ? candidatesFor(snapshot, event.id, role.id, assignments, load).filter((c) => !c.alreadyInRole)
                  : []
                return (
                  <li key={role.id} className={`role-row${slots === 0 && assigned.length === 0 ? ' is-muted' : ''}`}>
                    <div className="role-head">
                      <div>
                        <span className="role-name">{role.name}</span>
                        {role.description && <span className="muted small role-desc">{role.description}</span>}
                      </div>
                      <div className="role-count">
                        {slots === 0 && assigned.length === 0 ? (
                          <span className="muted small">不要</span>
                        ) : (
                          <Badge tone={enough ? 'good' : 'warn'} icon={enough ? 'check' : 'alert'}>
                            {assigned.length}/{slots}人
                          </Badge>
                        )}
                        {isAdmin && (
                          <span className="stepper" aria-label={`${role.name}の必要人数`}>
                            <button
                              type="button"
                              aria-label="必要人数を減らす"
                              disabled={slots <= 0 || pending}
                              onClick={() => run(() => actions.setEventRoleSlot(event.id, role.id, slots - 1))}
                            >
                              −
                            </button>
                            <span>{slots}</span>
                            <button
                              type="button"
                              aria-label="必要人数を増やす"
                              disabled={slots >= 50 || pending}
                              onClick={() => run(() => actions.setEventRoleSlot(event.id, role.id, slots + 1))}
                            >
                              ＋
                            </button>
                          </span>
                        )}
                      </div>
                    </div>

                    {(assigned.length > 0 || isAdmin) && (
                      <div className="role-members">
                        {assigned.map((a) => {
                          const m = members.get(a.memberId)
                          if (!m) return null
                          return (
                            <span key={a.id} className={`member-chip${a.memberId === me.id ? ' is-me' : ''}`}>
                              <Avatar name={m.name} size={22} />
                              <Link to={`/members/${m.id}`} className="member-chip-name">
                                {m.name}
                              </Link>
                              <Badge tone={a.source === 'auto' ? 'info' : 'neutral'}>{a.source === 'auto' ? '自動' : '手動'}</Badge>
                              {excluded.has(m.id) && <Badge tone="warn">参加不可</Badge>}
                              {!m.active && <Badge tone="danger">無効</Badge>}
                              {isAdmin && (
                                <>
                                  <IconButton
                                    icon={a.locked ? 'lock' : 'unlock'}
                                    tone={a.locked ? 'accent' : 'default'}
                                    label={a.locked ? 'ロックを解除' : 'ロックする（自動割り振りで保持）'}
                                    disabled={pending}
                                    onClick={() => run(() => actions.setAssignmentLocked(a.id, !a.locked))}
                                  />
                                  <IconButton
                                    icon="x"
                                    tone="danger"
                                    label={`${m.name}を${role.name}から外す`}
                                    disabled={pending}
                                    onClick={() => run(() => actions.removeAssignment(a.id), `${m.name}さんを${role.name}から外しました`)}
                                  />
                                </>
                              )}
                            </span>
                          )
                        })}
                        {isAdmin && (
                          <Select
                            className="add-select"
                            value=""
                            disabled={pending}
                            aria-label={`${role.name}にメンバーを追加`}
                            onChange={(e) => {
                              const memberId = e.target.value
                              const m = members.get(memberId)
                              if (memberId && m) {
                                void run(
                                  () => actions.addAssignment({ eventId: event.id, roleId: role.id, memberId }),
                                  `${m.name}さんを${role.name}に割り当てました`,
                                )
                              }
                            }}
                          >
                            <option value="">＋ メンバーを追加</option>
                            {candidates.map((c) => {
                              const notes = [
                                `担当${c.load}回`,
                                c.performer && '出演',
                                c.rolesInEvent > 0 && '他の役割あり',
                                c.excluded && '参加不可',
                              ].filter(Boolean)
                              return (
                                <option key={c.member.id} value={c.member.id}>
                                  {c.member.name}（{notes.join('・')}）
                                </option>
                              )
                            })}
                          </Select>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <div className="stack">
          <Card title="概要">
            <dl className="kv">
              <dt>日付</dt>
              <dd>{formatDate(event.date)}</dd>
              <dt>時間</dt>
              <dd>{formatTimeRange(event.startTime, event.endTime)}</dd>
              <dt>会場</dt>
              <dd>{event.venue ?? '—'}</dd>
              {event.description && (
                <>
                  <dt>メモ</dt>
                  <dd className="pre-wrap">{event.description}</dd>
                </>
              )}
            </dl>
          </Card>

          <Card title={`出演バンド（${bands.length}）`}>
            {bands.length === 0 ? (
              <p className="muted small">出演バンドは未設定です。</p>
            ) : (
              <ol className="lineup">
                {bands.map((b, i) => {
                  const bandMembers = snapshot.bandMembers.filter((bm) => bm.bandId === b.id)
                  return (
                    <li key={b.id}>
                      <span className="order-num">{i + 1}</span>
                      <div>
                        <div className="lineup-name">{b.name}</div>
                        <div className="muted small">
                          {bandMembers
                            .map((bm) => `${members.get(bm.memberId)?.name ?? '?'}${bm.part ? `(${bm.part})` : ''}`)
                            .join('、') || 'メンバー未登録'}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
            {performers.size > 0 && (
              <p className="muted small top-gap">出演者 {performers.size}人は、自動割り振りでできるだけ役割から外されます。</p>
            )}
          </Card>

          <Card title={`参加不可（${exclusions.length}）`}>
            {!isAdmin && event.status === 'scheduled' && (
              <div className="bottom-gap">
                <Checkbox
                  checked={iAmExcluded}
                  disabled={pending}
                  onChange={(checked) =>
                    run(() => actions.setExclusion(event.id, me.id, checked), checked ? '参加不可にしました' : '参加不可を取り消しました')
                  }
                >
                  このイベントに参加できない
                </Checkbox>
              </div>
            )}
            {exclusions.length === 0 ? (
              <p className="muted small">参加不可のメンバーはいません。</p>
            ) : (
              <ul className="simple-list">
                {exclusions.map((x) => {
                  const m = members.get(x.memberId)
                  return (
                    <li key={x.memberId}>
                      <span>
                        {m?.name ?? '不明'}
                        {x.reason && <span className="muted small">（{x.reason}）</span>}
                      </span>
                      {isAdmin && (
                        <IconButton
                          icon="x"
                          label="参加不可を取り消す"
                          disabled={pending}
                          onClick={() => run(() => actions.setExclusion(event.id, x.memberId, false))}
                        />
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            {isAdmin && (
              <div className="inline-form top-gap">
                <Select value={exclusionTarget} onChange={(e) => setExclusionTarget(e.target.value)} aria-label="参加不可にするメンバー">
                  <option value="">メンバーを選択</option>
                  {snapshot.members
                    .filter((m) => m.active && !excluded.has(m.id))
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </Select>
                <Button
                  size="sm"
                  disabled={!exclusionTarget || pending}
                  onClick={async () => {
                    if (await run(() => actions.setExclusion(event.id, exclusionTarget, true), '参加不可に登録しました')) {
                      setExclusionTarget('')
                    }
                  }}
                >
                  追加
                </Button>
              </div>
            )}
            {isAdmin && assignments.some((a) => excluded.has(a.memberId)) && (
              <div className="top-gap">
                <Alert tone="warn">参加不可のメンバーに役割が割り当てられています。</Alert>
              </div>
            )}
          </Card>
        </div>
      </div>

      {editing && <EventFormModal event={event} onClose={() => setEditing(false)} />}
    </>
  )
}
