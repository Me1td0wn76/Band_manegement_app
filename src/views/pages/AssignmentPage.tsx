import { useState } from 'react'
import {
  DEFAULT_OPTIONS,
  autoAssign,
  recomputeLoad,
  type AutoAssignOptions,
  type AutoAssignResult,
  type ProposedAssignment,
} from '../../controllers/autoAssign'
import { useData } from '../../controllers/DataController'
import { candidatesFor, eventFill, indexById, isUpcoming, memberLoad, todayISO } from '../../controllers/selectors'
import type { AssignmentMode, Role } from '../../models/types'
import { useAction, useConfirm } from '../components/Feedback'
import { Icon } from '../components/Icon'
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  IconButton,
  Input,
  Meter,
  Modal,
  PageHeader,
  Select,
  Tabs,
  Textarea,
} from '../components/ui'
import { formatDateTime, formatShortDate } from '../format'
import { Link, navigate, useLocation } from '../router'

type Tab = 'auto' | 'load' | 'roles' | 'history'
const TABS: Tab[] = ['auto', 'load', 'roles', 'history']

export function AssignmentPage() {
  const { query } = useLocation()
  const queryTab = query.get('tab') as Tab | null
  const tab: Tab = queryTab && TABS.includes(queryTab) ? queryTab : 'auto'
  const setTab = (t: Tab) => navigate(t === 'auto' ? '/assign' : `/assign?tab=${t}`, { replace: true })

  return (
    <>
      <PageHeader
        title="役割の割り振り"
        description="PA・受付などの役割を、担当回数が偏らないように自動で割り振ります。結果はプレビューで確認・修正してから保存できます。"
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'auto', label: '自動割り振り' },
          { value: 'load', label: '負担状況' },
          { value: 'roles', label: '役割マスタ' },
          { value: 'history', label: '実行履歴' },
        ]}
      />
      <div className="tab-panel">
        {tab === 'auto' && <AutoAssignPanel initialEventIds={(query.get('events') ?? '').split(',').filter(Boolean)} />}
        {tab === 'load' && <LoadPanel />}
        {tab === 'roles' && <RolesPanel />}
        {tab === 'history' && <HistoryPanel />}
      </div>
    </>
  )
}

// ======================= 自動割り振り =======================

function AutoAssignPanel({ initialEventIds }: { initialEventIds: string[] }) {
  const { snapshot, actions } = useData()
  const { run, pending } = useAction()
  const confirm = useConfirm()
  const today = todayISO()
  const targets = snapshot.events.filter((e) => isUpcoming(e, today))

  const [selected, setSelected] = useState<string[]>(() => {
    const fromQuery = initialEventIds.filter((id) => targets.some((e) => e.id === id))
    return fromQuery.length ? fromQuery : targets.map((e) => e.id)
  })
  const [options, setOptions] = useState<AutoAssignOptions>(DEFAULT_OPTIONS)
  const [result, setResult] = useState<AutoAssignResult | null>(null)
  const [proposals, setProposals] = useState<ProposedAssignment[]>([])

  const events = indexById(snapshot.events)
  const roles = indexById(snapshot.roles)
  const members = indexById(snapshot.members)

  // 設定を変えたらプレビューは破棄（古い結果を保存しないため）
  const changeOptions = (patch: Partial<AutoAssignOptions>) => {
    setOptions((o) => ({ ...o, ...patch }))
    setResult(null)
  }
  const toggleEvent = (id: string, checked: boolean) => {
    setSelected((s) => (checked ? [...s, id] : s.filter((x) => x !== id)))
    setResult(null)
  }

  const generate = (seed = options.seed) => {
    const r = autoAssign(snapshot, selected, { ...options, seed })
    setOptions((o) => ({ ...o, seed }))
    setResult(r)
    setProposals(r.proposals)
  }

  const replaceProposal = (index: number, memberId: string) =>
    setProposals((ps) => ps.map((p, i) => (i === index ? { ...p, memberId } : p)))
  const removeProposal = (index: number) => setProposals((ps) => ps.filter((_, i) => i !== index))

  const newOnes = proposals.filter((p) => !p.kept)
  const replaced = snapshot.assignments.filter((a) => selected.includes(a.eventId) && !a.locked).length

  const commit = async () => {
    if (options.mode === 'regenerate' && replaced > 0) {
      const ok = await confirm({
        title: '割り振りを保存',
        message: `ロックされていない既存の割り当て ${replaced}件を削除し、新しい割り当て ${newOnes.length}件を保存します。`,
        confirmLabel: '保存する',
      })
      if (!ok) return
    }
    const ok = await run(
      () =>
        actions.applyAutoAssignments(
          selected,
          newOnes.map(({ eventId, roleId, memberId }) => ({ eventId, roleId, memberId })),
          options.mode,
        ),
      `${newOnes.length}件の割り当てを保存しました`,
    )
    if (ok) setResult(null)
  }

  if (targets.length === 0) {
    return (
      <Card>
        <EmptyState icon="calendar" title="割り振り対象の今後のイベントがありません">
          <Button variant="primary" icon="plus" onClick={() => navigate('/events?new=1')}>
            イベントを登録
          </Button>
        </EmptyState>
      </Card>
    )
  }

  const loadAfter = result ? recomputeLoad(result.loadBefore, proposals) : null
  const shortageCount =
    result?.shortages.reduce((s, x) => s + x.missing, 0) ?? 0
  // 手動で外した分も不足として数え直す
  const removedCount = result ? result.proposals.filter((p) => !p.kept).length - newOnes.length : 0

  return (
    <div className="assign-layout">
      <div className="stack">
        <Card
          title="1. 対象イベント"
          actions={
            <span className="link-group">
              <button type="button" className="text-link" onClick={() => (setSelected(targets.map((e) => e.id)), setResult(null))}>
                すべて選択
              </button>
              <button type="button" className="text-link" onClick={() => (setSelected([]), setResult(null))}>
                解除
              </button>
            </span>
          }
        >
          <ul className="check-list">
            {targets.map((e) => {
              const fill = eventFill(snapshot, e.id)
              return (
                <li key={e.id} className="check-row">
                  <Checkbox checked={selected.includes(e.id)} onChange={(c) => toggleEvent(e.id, c)}>
                    <span className="check-text">
                      <span>{e.title}</span>
                      <span className="muted small">{formatShortDate(e.date)}</span>
                    </span>
                  </Checkbox>
                  <Meter value={fill.filled} max={fill.required} label={`役割の充足 ${fill.filled}/${fill.required}`} />
                </li>
              )
            })}
          </ul>
        </Card>

        <Card title="2. 割り振りの設定">
          <div className="form-stack">
            <fieldset className="radio-group">
              <legend className="field-label">割り振り方法</legend>
              {(
                [
                  ['regenerate', '作り直す', 'ロック中の割り当てだけ残して、残りを作り直します'],
                  ['fill', '不足分のみ埋める', '既存の割り当てはすべて残し、空いている枠だけ埋めます'],
                ] as [AssignmentMode, string, string][]
              ).map(([value, label, hint]) => (
                <label key={value} className={`radio-card${options.mode === value ? ' is-selected' : ''}`}>
                  <input
                    type="radio"
                    name="mode"
                    value={value}
                    checked={options.mode === value}
                    onChange={() => changeOptions({ mode: value })}
                  />
                  <span>
                    <span className="radio-title">{label}</span>
                    <span className="muted small">{hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <Checkbox checked={options.avoidPerformers} onChange={(c) => changeOptions({ avoidPerformers: c })}>
              出演するバンドのメンバーはできるだけ避ける
            </Checkbox>
            <Field label="1イベントで1人が担当する役割の上限">
              {(id) => (
                <Select
                  id={id}
                  value={options.maxRolesPerEvent}
                  onChange={(e) => changeOptions({ maxRolesPerEvent: Number(e.target.value) })}
                >
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n}つまで
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <p className="muted small">
              参加不可のメンバー・無効のメンバーは対象外です。担当回数の少ない人、その役割の経験が少ない人から順に割り当てます。
            </p>
            <Button variant="primary" icon="sparkle" disabled={selected.length === 0} onClick={() => generate()}>
              プレビューを作成
            </Button>
          </div>
        </Card>
      </div>

      <Card
        title="3. プレビュー"
        className="preview-card"
        actions={
          result && (
            <>
              <Button size="sm" icon="refresh" onClick={() => generate(options.seed + 1)}>
                別の案
              </Button>
              <Button size="sm" variant="primary" icon="check" loading={pending} onClick={commit}>
                確定して保存
              </Button>
            </>
          )
        }
      >
        {!result ? (
          <EmptyState icon="shuffle" title="プレビューはまだありません">
            <p className="muted small">対象イベントと設定を選んで「プレビューを作成」を押してください。</p>
          </EmptyState>
        ) : (
          <div className="form-stack">
            <div className="summary-row">
              <span className="summary-item">
                <strong>{newOnes.length}</strong> 件を新規割り当て
              </span>
              <span className="summary-item">
                <strong>{proposals.length - newOnes.length}</strong> 件を保持
              </span>
              <span className={`summary-item${shortageCount + removedCount > 0 ? ' is-warn' : ''}`}>
                <strong>{shortageCount + removedCount}</strong> 枠が不足
              </span>
            </div>
            {result.shortages.length > 0 && (
              <Alert tone="warn">
                候補者が足りない役割があります：
                {result.shortages
                  .map((s) => `${events.get(s.eventId)?.title ?? ''}の${roles.get(s.roleId)?.name ?? ''}（${s.missing}人）`)
                  .join('、')}
                。参加不可の登録や上限設定を見直すか、保存後に手動で追加してください。
              </Alert>
            )}

            {selected
              .map((id) => events.get(id))
              .filter((e): e is NonNullable<typeof e> => Boolean(e))
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((ev) => {
                const evProposals = proposals.map((p, index) => ({ p, index })).filter(({ p }) => p.eventId === ev.id)
                const roleIds = snapshot.roles.map((r) => r.id).filter((rid) => evProposals.some(({ p }) => p.roleId === rid))
                return (
                  <section key={ev.id} className="preview-event">
                    <h3 className="preview-event-title">
                      <span>{ev.title}</span>
                      <span className="muted small">{formatShortDate(ev.date)}</span>
                    </h3>
                    {roleIds.length === 0 ? (
                      <p className="muted small">割り当てる役割はありません。</p>
                    ) : (
                      <table className="table table-compact">
                        <tbody>
                          {roleIds.map((rid) => (
                            <tr key={rid}>
                              <th scope="row" className="preview-role">
                                {roles.get(rid)?.name}
                              </th>
                              <td>
                                <div className="preview-members">
                                  {evProposals
                                    .filter(({ p }) => p.roleId === rid)
                                    .map(({ p, index }) =>
                                      p.kept ? (
                                        <span key={index} className="member-chip is-kept">
                                          <Icon name="lock" size={12} />
                                          {members.get(p.memberId)?.name}
                                          <Badge tone="neutral">保持</Badge>
                                        </span>
                                      ) : (
                                        <ProposalSelect
                                          key={index}
                                          proposal={p}
                                          eventProposals={evProposals.map(({ p }) => p)}
                                          loadAfter={loadAfter!}
                                          onChange={(memberId) => replaceProposal(index, memberId)}
                                          onRemove={() => removeProposal(index)}
                                        />
                                      ),
                                    )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </section>
                )
              })}

            <details className="details">
              <summary>担当回数の変化を見る</summary>
              <div className="table-wrap">
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th>メンバー</th>
                      <th className="num">割り振り前</th>
                      <th className="num">割り振り後</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.members
                      .filter((m) => m.active)
                      .map((m) => ({ m, before: result.loadBefore.get(m.id) ?? 0, after: loadAfter!.get(m.id) ?? 0 }))
                      .sort((a, b) => b.after - a.after || a.m.name.localeCompare(b.m.name, 'ja'))
                      .map(({ m, before, after }) => (
                        <tr key={m.id}>
                          <td>{m.name}</td>
                          <td className="num">{before}</td>
                          <td className="num">
                            {after}
                            {after > before && <span className="delta"> +{after - before}</span>}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        )}
      </Card>
    </div>
  )
}

function ProposalSelect({
  proposal,
  eventProposals,
  loadAfter,
  onChange,
  onRemove,
}: {
  proposal: ProposedAssignment
  eventProposals: ProposedAssignment[]
  loadAfter: Map<string, number>
  onChange: (memberId: string) => void
  onRemove: () => void
}) {
  const { snapshot } = useData()
  // 自分自身を除いた割り当て状況で候補を出す
  const others = eventProposals.filter((p) => p !== proposal)
  const candidates = candidatesFor(snapshot, proposal.eventId, proposal.roleId, others, loadAfter).filter(
    (c) => !c.alreadyInRole,
  )
  const current = candidates.find((c) => c.member.id === proposal.memberId)
  return (
    <span className={`proposal${current?.performer ? ' is-performer' : ''}`}>
      <Select
        value={proposal.memberId}
        onChange={(e) => onChange(e.target.value)}
        aria-label="割り当てるメンバー"
        className="select-sm"
      >
        {candidates.map((c) => {
          const notes = [
            `計${c.load}回`,
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
      {current?.performer && <Badge tone="info">出演</Badge>}
      {current?.excluded && <Badge tone="warn">参加不可</Badge>}
      <IconButton icon="x" label="この割り当てを外す" tone="danger" onClick={onRemove} />
    </span>
  )
}

// ======================= 負担状況 =======================

function LoadPanel() {
  const { snapshot } = useData()
  const [period, setPeriod] = useState<'all' | 'upcoming'>('all')
  const today = todayISO()
  const events = indexById(snapshot.events)
  const counted = snapshot.assignments.filter((a) => {
    const ev = events.get(a.eventId)
    return ev && ev.status !== 'cancelled' && (period === 'all' || ev.date >= today)
  })
  const total = memberLoad(snapshot, { upcomingOnly: period === 'upcoming' })
  const active = snapshot.members.filter((m) => m.active)
  const rows = active
    .map((m) => ({
      member: m,
      total: total.get(m.id) ?? 0,
      perRole: new Map(snapshot.roles.map((r) => [r.id, counted.filter((a) => a.memberId === m.id && a.roleId === r.id).length])),
    }))
    .sort((a, b) => b.total - a.total || a.member.name.localeCompare(b.member.name, 'ja'))
  const max = Math.max(1, ...rows.map((r) => r.total))
  const avg = rows.length ? rows.reduce((s, r) => s + r.total, 0) / rows.length : 0

  return (
    <Card
      padded={false}
      title="メンバーごとの担当回数"
      actions={
        <Select value={period} onChange={(e) => setPeriod(e.target.value as 'all' | 'upcoming')} aria-label="集計期間" className="select-sm">
          <option value="all">全期間（中止を除く）</option>
          <option value="upcoming">今後の予定のみ</option>
        </Select>
      }
    >
      <p className="card-lead muted small">平均 {avg.toFixed(1)} 回。自動割り振りは、この回数が少ない人を優先します。</p>
      {rows.length === 0 ? (
        <EmptyState icon="users" title="有効なメンバーがいません" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>メンバー</th>
                {snapshot.roles.map((r) => (
                  <th key={r.id} className="num">
                    {r.name}
                  </th>
                ))}
                <th className="load-col">合計</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ member, total, perRole }) => (
                <tr key={member.id}>
                  <td>
                    <Link to={`/members/${member.id}`} className="strong-link">
                      {member.name}
                    </Link>
                    {member.part && <span className="muted small"> {member.part}</span>}
                  </td>
                  {snapshot.roles.map((r) => (
                    <td key={r.id} className={`num${perRole.get(r.id) ? '' : ' muted'}`}>
                      {perRole.get(r.id) || '·'}
                    </td>
                  ))}
                  <td className="load-col">
                    <span className="inline-bar" title={`${member.name}: ${total}回`}>
                      <span className="bar-track">
                        <span className="bar-fill" style={{ width: `${(total / max) * 100}%` }} />
                      </span>
                      <span className="bar-value">{total}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

// ======================= 役割マスタ =======================

function RoleFormModal({ role, onClose }: { role?: Role; onClose: () => void }) {
  const { snapshot, actions } = useData()
  const { run, pending } = useAction()
  const [name, setName] = useState(role?.name ?? '')
  const [description, setDescription] = useState(role?.description ?? '')
  const [defaultSlots, setDefaultSlots] = useState(role?.defaultSlots ?? 1)
  const [sortOrder, setSortOrder] = useState(role?.sortOrder ?? Math.max(0, ...snapshot.roles.map((r) => r.sortOrder)) + 1)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!name.trim()) {
      setError('役割名を入力してください')
      return
    }
    setError(null)
    const input = {
      name: name.trim(),
      description: description.trim() || null,
      defaultSlots: Math.max(0, Math.min(50, defaultSlots)),
      sortOrder,
    }
    const ok = await run(
      () => (role ? actions.updateRole(role.id, input) : actions.createRole(input)),
      role ? '役割を更新しました' : '役割を追加しました',
    )
    if (ok) onClose()
  }

  return (
    <Modal
      title={role ? '役割を編集' : '役割を追加'}
      onClose={onClose}
      onSubmit={submit}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>キャンセル</Button>
          <Button type="submit" variant="primary" loading={pending}>
            {role ? '保存' : '追加'}
          </Button>
        </>
      }
    >
      <div className="form-stack">
        <Field label="役割名" error={error} required>
          {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="PA" autoFocus />}
        </Field>
        <Field label="説明">
          {(id) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />}
        </Field>
        <div className="form-grid">
          <Field label="既定の人数" hint="新しく登録するイベントに適用">
            {(id) => (
              <Input id={id} type="number" min={0} max={50} value={defaultSlots} onChange={(e) => setDefaultSlots(Number(e.target.value) || 0)} />
            )}
          </Field>
          <Field label="表示順">
            {(id) => <Input id={id} type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value) || 0)} />}
          </Field>
        </div>
      </div>
    </Modal>
  )
}

function RolesPanel() {
  const { snapshot, actions } = useData()
  const { run } = useAction()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<Role | 'new' | null>(null)

  const remove = async (role: Role) => {
    const used = snapshot.assignments.filter((a) => a.roleId === role.id).length
    const ok = await confirm({
      title: '役割を削除',
      message: `「${role.name}」を削除します。${used ? `この役割の割り当て ${used}件も削除されます。` : ''}`,
      confirmLabel: '削除する',
      danger: true,
    })
    if (ok) await run(() => actions.deleteRole(role.id), '役割を削除しました')
  }

  return (
    <Card
      title="役割マスタ"
      padded={false}
      actions={
        <Button size="sm" variant="primary" icon="plus" onClick={() => setEditing('new')}>
          役割を追加
        </Button>
      }
    >
      <p className="card-lead muted small">
        既定の人数は新しく登録するイベントに使われます。既存イベントの人数はイベント詳細で調整できます。
      </p>
      {snapshot.roles.length === 0 ? (
        <EmptyState icon="shuffle" title="役割が登録されていません" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="num">順</th>
                <th>役割名</th>
                <th>説明</th>
                <th className="num">既定の人数</th>
                <th className="num">割り当て数</th>
                <th className="th-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.roles.map((role) => (
                <tr key={role.id}>
                  <td className="num muted">{role.sortOrder}</td>
                  <td className="strong">{role.name}</td>
                  <td className="muted">{role.description ?? '—'}</td>
                  <td className="num">{role.defaultSlots}人</td>
                  <td className="num">{snapshot.assignments.filter((a) => a.roleId === role.id).length}</td>
                  <td className="td-actions">
                    <IconButton icon="edit" label={`${role.name}を編集`} onClick={() => setEditing(role)} />
                    <IconButton icon="trash" tone="danger" label={`${role.name}を削除`} onClick={() => remove(role)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <RoleFormModal role={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </Card>
  )
}

// ======================= 実行履歴 =======================

function HistoryPanel() {
  const { snapshot } = useData()
  const members = indexById(snapshot.members)
  const events = indexById(snapshot.events)
  return (
    <Card title="自動割り振りの実行履歴" padded={false}>
      {snapshot.runs.length === 0 ? (
        <EmptyState icon="shuffle" title="まだ実行されていません" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>実行日時</th>
                <th>実行者</th>
                <th>対象イベント</th>
                <th>方法</th>
                <th className="num">保存件数</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.runs.map((run) => (
                <tr key={run.id}>
                  <td className="nowrap">{formatDateTime(run.executedAt)}</td>
                  <td>{members.get(run.executedBy ?? '')?.name ?? '不明'}</td>
                  <td>
                    <span className="tag-list">
                      {run.eventIds.map((id) => {
                        const ev = events.get(id)
                        return ev ? (
                          <Link key={id} to={`/events/${id}`} className="tag">
                            {ev.title}
                          </Link>
                        ) : (
                          <span key={id} className="tag muted">
                            削除済み
                          </span>
                        )
                      })}
                    </span>
                  </td>
                  <td>
                    <Badge tone={run.mode === 'regenerate' ? 'accent' : 'info'}>
                      {run.mode === 'regenerate' ? '作り直し' : '不足分のみ'}
                    </Badge>
                  </td>
                  <td className="num">{run.assignedCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
