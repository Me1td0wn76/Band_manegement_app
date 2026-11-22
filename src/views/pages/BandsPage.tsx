import { useState } from 'react'
import { useData } from '../../controllers/DataController'
import { indexById, isUpcoming, todayISO } from '../../controllers/selectors'
import type { Band } from '../../models/types'
import { useAction, useConfirm } from '../components/Feedback'
import { Icon } from '../components/Icon'
import { Avatar, Button, EmptyState, Field, IconButton, Input, Modal, PageHeader, Select, Textarea } from '../components/ui'
import { PART_SUGGESTIONS, formatShortDate } from '../format'
import { Link } from '../router'

interface Row {
  key: number
  memberId: string
  part: string
}

function BandFormModal({ band, onClose }: { band?: Band; onClose: () => void }) {
  const { snapshot, actions } = useData()
  const { run, pending } = useAction()
  const [name, setName] = useState(band?.name ?? '')
  const [description, setDescription] = useState(band?.description ?? '')
  const [rows, setRows] = useState<Row[]>(() =>
    band
      ? snapshot.bandMembers.filter((bm) => bm.bandId === band.id).map((bm, i) => ({ key: i, ...bm }))
      : [{ key: 0, memberId: '', part: '' }],
  )
  const [nextKey, setNextKey] = useState(rows.length + 1)
  const [errors, setErrors] = useState<{ name?: string; members?: string }>({})

  const activeMembers = snapshot.members.filter(
    (m) => m.active || rows.some((r) => r.memberId === m.id),
  )

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r
        const next = { ...r, ...patch }
        // メンバーを選んだ時、パートが空ならメンバーの担当パートを入れる
        if (patch.memberId && !r.part) next.part = snapshot.members.find((m) => m.id === patch.memberId)?.part ?? ''
        return next
      }),
    )

  const addRow = () => {
    setRows((rs) => [...rs, { key: nextKey, memberId: '', part: '' }])
    setNextKey((k) => k + 1)
  }

  const submit = async () => {
    const errs: typeof errors = {}
    if (!name.trim()) errs.name = 'バンド名を入力してください'
    const filled = rows.filter((r) => r.memberId)
    if (new Set(filled.map((r) => r.memberId)).size !== filled.length) errs.members = '同じメンバーが重複しています'
    setErrors(errs)
    if (Object.keys(errs).length) return
    const input = {
      name: name.trim(),
      description: description.trim() || null,
      members: filled.map((r) => ({ memberId: r.memberId, part: r.part.trim() })),
    }
    const ok = await run(
      () => (band ? actions.updateBand(band.id, input) : actions.createBand(input)),
      band ? 'バンドを更新しました' : 'バンドを登録しました',
    )
    if (ok) onClose()
  }

  return (
    <Modal
      title={band ? 'バンドを編集' : 'バンドを登録'}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>キャンセル</Button>
          <Button type="submit" variant="primary" loading={pending}>
            {band ? '保存' : '登録'}
          </Button>
        </>
      }
    >
      <div className="form-stack">
        <Field label="バンド名" error={errors.name} required>
          {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} autoFocus />}
        </Field>
        <Field label="説明">
          {(id) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />}
        </Field>
        <fieldset className="fieldset">
          <legend>メンバー編成</legend>
          {errors.members && <p className="field-error">{errors.members}</p>}
          <datalist id="band-part-suggestions">
            {PART_SUGGESTIONS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <ul className="band-rows">
            {rows.map((r) => (
              <li key={r.key} className="band-row">
                <Select value={r.memberId} onChange={(e) => update(r.key, { memberId: e.target.value })} aria-label="メンバー">
                  <option value="">メンバーを選択</option>
                  {activeMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.part ? `（${m.part}）` : ''}
                    </option>
                  ))}
                </Select>
                <Input
                  value={r.part}
                  list="band-part-suggestions"
                  placeholder="パート"
                  aria-label="パート"
                  onChange={(e) => update(r.key, { part: e.target.value })}
                />
                <IconButton
                  icon="x"
                  label="この行を削除"
                  tone="danger"
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                />
              </li>
            ))}
          </ul>
          <Button size="sm" icon="plus" onClick={addRow}>
            メンバーを追加
          </Button>
        </fieldset>
      </div>
    </Modal>
  )
}

export function BandsPage() {
  const { snapshot, isAdmin, actions, me } = useData()
  const confirm = useConfirm()
  const { run } = useAction()
  const [editing, setEditing] = useState<Band | 'new' | null>(null)
  const [search, setSearch] = useState('')
  const today = todayISO()
  const members = indexById(snapshot.members)
  const events = indexById(snapshot.events)
  const keyword = search.trim().toLowerCase()

  const cards = snapshot.bands
    .map((band) => {
      const lineup = snapshot.bandMembers
        .filter((bm) => bm.bandId === band.id)
        .map((bm) => ({ ...bm, member: members.get(bm.memberId) }))
      const upcoming = snapshot.eventBands
        .filter((eb) => eb.bandId === band.id)
        .map((eb) => events.get(eb.eventId))
        .filter((e): e is NonNullable<typeof e> => Boolean(e) && isUpcoming(e!, today))
        .sort((a, b) => a.date.localeCompare(b.date))
      return { band, lineup, upcoming }
    })
    .filter(
      ({ band, lineup }) =>
        !keyword ||
        band.name.toLowerCase().includes(keyword) ||
        lineup.some((l) => l.member?.name.toLowerCase().includes(keyword)),
    )

  const remove = async (band: Band) => {
    const ok = await confirm({
      title: 'バンドを削除',
      message: `「${band.name}」を削除します。メンバー編成とイベントの出演情報も削除されます。`,
      confirmLabel: '削除する',
      danger: true,
    })
    if (ok) await run(() => actions.deleteBand(band.id), 'バンドを削除しました')
  }

  return (
    <>
      <PageHeader
        title="バンド"
        description="バンドとメンバー編成の一覧です。"
        actions={
          isAdmin && (
            <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
              バンド登録
            </Button>
          )
        }
      />

      <div className="toolbar toolbar-plain">
        <label className="search">
          <Icon name="search" size={16} />
          <Input
            type="search"
            placeholder="バンド名・メンバー名で検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="バンドを検索"
          />
        </label>
      </div>

      {cards.length === 0 ? (
        <div className="card">
          <EmptyState icon="music" title={snapshot.bands.length ? '該当するバンドはありません' : 'バンドが登録されていません'}>
            {isAdmin && snapshot.bands.length === 0 && (
              <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
                最初のバンドを登録
              </Button>
            )}
          </EmptyState>
        </div>
      ) : (
        <div className="band-grid">
          {cards.map(({ band, lineup, upcoming }) => (
            <article key={band.id} className={`card band-card${lineup.some((l) => l.memberId === me.id) ? ' is-mine' : ''}`}>
              <header className="band-card-head">
                <div>
                  <h2 className="band-card-name">{band.name}</h2>
                  {band.description && <p className="muted small">{band.description}</p>}
                </div>
                {isAdmin && (
                  <div className="band-card-actions">
                    <IconButton icon="edit" label={`${band.name}を編集`} onClick={() => setEditing(band)} />
                    <IconButton icon="trash" tone="danger" label={`${band.name}を削除`} onClick={() => remove(band)} />
                  </div>
                )}
              </header>
              {lineup.length === 0 ? (
                <p className="muted small">メンバー未登録</p>
              ) : (
                <ul className="lineup-members">
                  {lineup.map((l) => (
                    <li key={l.memberId}>
                      <Avatar name={l.member?.name ?? '?'} size={26} />
                      <Link to={`/members/${l.memberId}`} className="lineup-member-name">
                        {l.member?.name ?? '不明'}
                      </Link>
                      <span className="part-tag">{l.part || '—'}</span>
                    </li>
                  ))}
                </ul>
              )}
              <footer className="band-card-foot">
                <Icon name="calendar" size={14} />
                {upcoming.length === 0 ? (
                  <span className="muted small">今後の出演予定なし</span>
                ) : (
                  <span className="small">
                    次回{' '}
                    <Link to={`/events/${upcoming[0].id}`} className="strong-link">
                      {upcoming[0].title}
                    </Link>{' '}
                    <span className="muted">{formatShortDate(upcoming[0].date)}</span>
                    {upcoming.length > 1 && <span className="muted">　ほか{upcoming.length - 1}件</span>}
                  </span>
                )}
              </footer>
            </article>
          ))}
        </div>
      )}

      {editing && <BandFormModal band={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  )
}
