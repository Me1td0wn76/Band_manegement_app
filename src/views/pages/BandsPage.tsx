import { useRef, useState, type FormEvent } from 'react'
import { useData } from '../../controllers/DataController'
import { lineupOf, todayISO, upcomingEvents } from '../../controllers/selectors'
import { PART_LONG } from '../../models/slots'
import { PARTS, type Band, type Part } from '../../models/types'
import { Page } from '../AppShell'
import { useAction, useConfirm } from '../feedback'
import { Avatar, Button, Card, EmptyState, IconButton, Select, Tabs, TextField, Toggle, type CSSVars } from '../rb/core'
import { BandCard, type BandCardData } from '../rb/data'
import { GENRES, formatMd } from '../format'

type Tab = 'active' | 'rest'

interface Row {
  k: number
  memberId: string
  part: Part
}

export function BandsPage() {
  const { snapshot, isAdmin, actions } = useData()
  const { run, pending } = useAction()
  const confirm = useConfirm()
  const panel = useRef<HTMLElement>(null)
  const today = todayISO()

  const activeMembers = snapshot.members.filter((m) => m.active)
  const firstMember = activeMembers[0]
  const newRow = (k: number): Row => ({ k, memberId: firstMember?.id ?? '', part: firstMember?.parts[0] ?? 'vo' })

  const [tab, setTab] = useState<Tab>('active')
  const [editing, setEditing] = useState<Band | null>(null)
  const [name, setName] = useState('')
  const [genre, setGenre] = useState('Rock')
  const [rows, setRows] = useState<Row[]>(() => [newRow(1)])
  const [nextKey, setNextKey] = useState(2)
  const [active, setActive] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const reset = () => {
    setEditing(null)
    setName('')
    setGenre('Rock')
    setRows([newRow(nextKey)])
    setNextKey((k) => k + 1)
    setActive(true)
    setErr(null)
  }

  const startEdit = (band: Band) => {
    setEditing(band)
    setName(band.name)
    setGenre(band.genre ?? 'Rock')
    const lineup = lineupOf(snapshot, band.id)
    setRows(lineup.map((l, i) => ({ k: nextKey + i, memberId: l.memberId, part: l.part })))
    setNextKey((k) => k + lineup.length + 1)
    setActive(band.active)
    setErr(null)
    panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const setRow = (k: number, patch: Partial<Row>) =>
    setRows((rs) =>
      rs.map((r) => {
        if (r.k !== k) return r
        const next = { ...r, ...patch }
        // メンバーを変えたら、その人の登録パートを初期値にする
        if (patch.memberId) {
          const m = snapshot.members.find((x) => x.id === patch.memberId)
          if (m && m.parts.length && !m.parts.includes(next.part)) next.part = m.parts[0]
        }
        return next
      }),
    )

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setErr('バンド名を入力してください')
      return
    }
    const filled = rows.filter((r) => r.memberId)
    if (new Set(filled.map((r) => r.memberId)).size !== filled.length) {
      setErr('同じメンバーが2行に入っています。1人1行にしてください')
      return
    }
    setErr(null)
    const input = { name: name.trim(), genre, active, members: filled.map((r) => ({ memberId: r.memberId, part: r.part })) }
    const ok = await run(() => (editing ? actions.updateBand(editing.id, input) : actions.createBand(input)), {
      title: editing ? 'バンドを更新しました' : 'バンドを登録しました',
      message: `${input.name}・${input.members.length}人`,
    })
    if (ok) {
      setTab(active ? 'active' : 'rest')
      reset()
    }
  }

  const remove = async () => {
    if (!editing) return
    const ok = await confirm({
      eyebrow: 'Delete band',
      title: 'バンドを削除',
      message: `『${editing.name}』と、そのメンバー編成・イベントの出演情報・割り振りが削除されます。この操作は元に戻せません。休むだけなら「活動中」をオフにしてください。`,
      confirmLabel: '削除する',
      danger: true,
    })
    if (ok && (await run(() => actions.deleteBand(editing.id, editing.name), { title: 'バンドを削除しました', message: editing.name }))) reset()
  }

  const cards: BandCardData[] = snapshot.bands.map((b) => {
    const next = upcomingEvents(snapshot, today).find((e) => snapshot.eventBands.some((eb) => eb.eventId === e.id && eb.bandId === b.id))
    return {
      id: b.id,
      name: b.name,
      genre: b.genre,
      active: b.active,
      members: lineupOf(snapshot, b.id).map((l) => ({ id: l.memberId, name: l.member.name, part: l.part })),
      nextEvent: next ? `${formatMd(next.date, false)} ${next.title}` : null,
    }
  })
  const shown = cards.filter((b) => (tab === 'active' ? b.active : !b.active))
  const genreOptions = GENRES.includes(genre) ? GENRES : [genre, ...GENRES]
  const memberOptions = snapshot.members
    .filter((m) => m.active || rows.some((r) => r.memberId === m.id))
    .map((m) => ({ value: m.id, label: m.name }))

  return (
    <Page
      eyebrow={isAdmin ? 'Admin · Bands' : 'Member · Bands'}
      title={isAdmin ? 'バンド管理' : 'バンド'}
      subtitle={isAdmin ? 'バンドの登録と、メンバー・担当パートの管理を行います。' : 'バンドのメンバー編成と次の出演を確認できます。'}
    >
      <div className={isAdmin ? 'bd-layout' : 'bd-layout bd-layout--full'}>
        <div className="bd-main">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'active', label: '活動中', count: cards.filter((b) => b.active).length },
              { id: 'rest', label: '休止中', count: cards.filter((b) => !b.active).length },
            ]}
          />
          {shown.length === 0 ? (
            <Card className="app-full">
              <EmptyState
                icon="amp"
                title={tab === 'active' ? '活動中のバンドはありません' : '休止中のバンドはありません'}
                message={isAdmin && tab === 'active' ? '右の「バンドを登録」から追加できます。' : undefined}
              />
            </Card>
          ) : (
            <div className="bd-grid" key={tab}>
              {shown.map((b, i) => (
                <BandCard
                  key={b.id}
                  band={b}
                  onEdit={isAdmin ? () => startEdit(snapshot.bands.find((x) => x.id === b.id)!) : undefined}
                  style={{ '--i': i } as CSSVars}
                />
              ))}
            </div>
          )}
        </div>

        {isAdmin && (
          <aside ref={panel} className="bd-side">
            <Card
              eyebrow={editing ? 'Edit band' : 'New band'}
              title={editing ? 'バンドを編集' : 'バンドを登録'}
              glow
              actions={
                editing ? (
                  <IconButton icon="trash" label={`${editing.name}を削除`} variant="danger" size="sm" onClick={() => void remove()} />
                ) : undefined
              }
            >
              <form className="bd-form" onSubmit={submit} noValidate>
                <div className="bd-plate" aria-hidden="true">
                  <span>{name || 'BAND NAME'}</span>
                </div>
                <TextField
                  label="バンド名"
                  required
                  icon="amp"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  error={err}
                  placeholder="例：Midnight Echo"
                />
                <Select label="ジャンル" value={genre} onChange={(e) => setGenre(e.target.value)} options={genreOptions} />
                <div className="rb-field">
                  <span className="rb-field__label">メンバーと担当パート</span>
                  {rows.length === 0 ? (
                    <p className="rb-muted rb-small">メンバーがいません。「メンバーを追加」から編成を登録します。</p>
                  ) : (
                    <ul className="bd-rows">
                      {rows.map((r, i) => {
                        const m = snapshot.members.find((x) => x.id === r.memberId)
                        return (
                          <li key={r.k} style={{ '--i': i } as CSSVars}>
                            <Avatar name={m?.name ?? '?'} size={30} role={r.part} />
                            <select
                              className="bd-sel"
                              value={r.memberId}
                              onChange={(e) => setRow(r.k, { memberId: e.target.value })}
                              aria-label="メンバー"
                            >
                              {memberOptions.map((p) => (
                                <option key={p.value} value={p.value}>
                                  {p.label}
                                </option>
                              ))}
                            </select>
                            <select
                              className="bd-sel bd-sel--part"
                              value={r.part}
                              onChange={(e) => setRow(r.k, { part: e.target.value as Part })}
                              aria-label="担当パート"
                            >
                              {PARTS.map((p) => (
                                <option key={p} value={p}>
                                  {PART_LONG[p]}
                                </option>
                              ))}
                            </select>
                            <IconButton icon="x" label="この行を削除" size="sm" onClick={() => setRows(rows.filter((x) => x.k !== r.k))} />
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="plus"
                    disabled={!firstMember}
                    onClick={() => {
                      setRows(rows.concat(newRow(nextKey)))
                      setNextKey((k) => k + 1)
                    }}
                  >
                    メンバーを追加
                  </Button>
                </div>
                <Toggle checked={active} onChange={setActive} label="活動中" description="オフにすると「休止中」に移り、イベントの出演候補から外れます" />
                <Button type="submit" variant="primary" icon="check" block size="lg" loading={pending}>
                  {editing ? 'バンドを更新' : 'バンドを登録'}
                </Button>
                {editing && (
                  <Button variant="ghost" block onClick={reset}>
                    編集をやめる
                  </Button>
                )}
              </form>
            </Card>
          </aside>
        )}
      </div>
    </Page>
  )
}
