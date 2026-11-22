import { useEffect, useState, type DragEvent, type ReactNode } from 'react'
import { useData } from '../../controllers/DataController'
import { indexById, itemsOf, staffBoardOf, todayISO, upcomingEvents } from '../../controllers/selectors'
import {
  computeSchedule,
  fitToEnd,
  fmtMin,
  insertBreakAtMiddle,
  shuffleOrder,
  type DraftItem,
} from '../../controllers/timetable'
import type { LiveEvent } from '../../models/types'
import { Page } from '../AppShell'
import { useAction, useConfirm, useToast } from '../feedback'
import { Button, Card, EmptyState, Icon, IconButton, RoleBadge, Select, StatusBadge, TextField, cx, type CSSVars } from '../rb/core'
import { formatMd } from '../format'
import { roleColor } from '../roleStyle'
import { navigate, useLocation } from '../router'

const newKey = () => `new-${Math.random().toString(36).slice(2)}`

/** タイムテーブル（出演順・転換・開催時間）。幹部は編集、メンバーは閲覧 */
export function TimetablePage() {
  const { snapshot, isAdmin } = useData()
  const { query } = useLocation()
  const today = todayISO()
  const upcoming = upcomingEvents(snapshot, today)
  const past = snapshot.events.filter((e) => !upcoming.includes(e) && e.status !== 'cancelled').sort((a, b) => b.date.localeCompare(a.date))
  const choices = [...upcoming, ...past]
  const event = choices.find((e) => e.id === query.get('event')) ?? choices[0]
  const [version, setVersion] = useState(0)

  if (!event) {
    return (
      <Page eyebrow="Timetable" title="タイムテーブル" subtitle="出演順・転換・開催時間を組み立てます。">
        <Card>
          <EmptyState
            icon="calendar"
            title="イベントがありません"
            message={isAdmin ? '先にイベントを登録してください。' : '幹部がイベントを登録すると、ここにタイムテーブルが出ます。'}
            action={
              isAdmin ? (
                <Button variant="primary" icon="plus" onClick={() => navigate('/events?new=1')}>
                  イベントを登録
                </Button>
              ) : undefined
            }
          />
        </Card>
      </Page>
    )
  }

  return (
    <TimetableEditor
      key={`${event.id}:${version}`}
      event={event}
      choices={choices}
      onSaved={() => setVersion((v) => v + 1)}
    />
  )
}

function toDraft(snapshotItems: ReturnType<typeof itemsOf>): DraftItem[] {
  return snapshotItems.map((i) => ({ key: i.id, id: i.id, kind: i.kind, name: i.name, minutes: i.minutes, locked: i.locked, note: i.note }))
}

function TimetableEditor({ event, choices, onSaved }: { event: LiveEvent; choices: LiveEvent[]; onSaved: () => void }) {
  const { snapshot, isAdmin, me, actions } = useData()
  const { run, pending } = useAction()
  const confirm = useConfirm()
  const toast = useToast()
  const today = todayISO()

  const initial = {
    items: toDraft(itemsOf(snapshot, event.id)),
    startTime: event.startTime ?? '18:00',
    targetEndTime: event.targetEndTime ?? '',
    changeover: event.changeoverMinutes,
  }
  const [items, setItems] = useState<DraftItem[]>(initial.items)
  const [startTime, setStartTime] = useState(initial.startTime)
  const [targetEndTime, setTargetEndTime] = useState(initial.targetEndTime)
  const [changeover, setChangeover] = useState(initial.changeover)
  const [newName, setNewName] = useState('')
  const [newMinutes, setNewMinutes] = useState('25')
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [fitMessage, setFitMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const dirty =
    JSON.stringify({ items: items.map(({ key, ...rest }) => (void key, rest)), startTime, targetEndTime, changeover }) !==
    JSON.stringify({ items: initial.items.map(({ key, ...rest }) => (void key, rest)), startTime: initial.startTime, targetEndTime: initial.targetEndTime, changeover: initial.changeover })

  // 未保存のまま閉じようとしたら確認する
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const schedule = computeSchedule(startTime, items, changeover, targetEndTime || null)
  const members = indexById(snapshot.members)
  const roles = snapshot.roles
  const board = staffBoardOf(snapshot, event)
  const staffIds = (roleId: string, itemId: string | null) =>
    board.cells
      .filter((c) => c.roleId === roleId && c.itemId === itemId)
      .map((c) => board.state[c.key]?.memberId)
      .filter((id): id is string => Boolean(id))
  const staffNames = (roleId: string, itemId: string | null) => staffIds(roleId, itemId).map((id) => members.get(id)?.name ?? '?')

  const update = (key: string, patch: Partial<DraftItem>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)))
  const move = (from: number, to: number) =>
    setItems((list) => {
      if (to < 0 || to >= list.length || from === to) return list
      const next = [...list]
      const [it] = next.splice(from, 1)
      next.splice(to, 0, it)
      return next
    })

  const switchEvent = async (id: string) => {
    if (dirty) {
      const ok = await confirm({
        title: '保存していない変更があります',
        message: 'このまま別のイベントに切り替えると、タイムテーブルの変更は失われます。',
        confirmLabel: '変更を捨てて切り替える',
        danger: true,
      })
      if (!ok) return
    }
    navigate(`/timetable?event=${id}`, { replace: true })
  }

  const addAct = () => {
    const minutes = Math.floor(Number(newMinutes))
    if (!newName.trim()) {
      toast.error('出演者名を入力してください')
      return
    }
    if (!(minutes >= 1 && minutes <= 600)) {
      toast.error('演奏時間は1〜600分で入力してください')
      return
    }
    setItems((list) => [...list, { key: newKey(), id: null, kind: 'act', name: newName.trim(), minutes, locked: false, note: null }])
    setNewName('')
  }

  const autoFit = () => {
    if (!targetEndTime) {
      setFitMessage({ ok: false, text: '終演予定を入力すると、自動で収まるよう調整できます' })
      return
    }
    const r = fitToEnd(startTime, targetEndTime, items, changeover)
    setItems(r.items)
    setChangeover(r.changeoverMinutes)
    setFitMessage({ ok: r.ok, text: r.message })
  }

  const save = async () => {
    const bad = items.find((i) => !i.name.trim() || !(i.minutes >= 1 && i.minutes <= 600))
    if (bad) {
      toast.error('保存できませんでした', '名前が空か、時間が1〜600分の範囲外の項目があります')
      return
    }
    const ok = await run(
      () =>
        actions.saveTimetable(
          event.id,
          {
            startTime,
            targetEndTime: targetEndTime || null,
            changeoverMinutes: changeover,
            items: items.map((i) => ({ id: i.id, kind: i.kind, name: i.name.trim(), minutes: i.minutes, locked: i.locked, note: i.note })),
          },
          `タイムテーブルを保存（${items.length}項目・終演 ${fmtMin(schedule.end)}）`,
        ),
      { title: 'タイムテーブルを保存しました', message: `${event.title}・終演 ${fmtMin(schedule.end)}` },
    )
    if (ok) onSaved()
  }

  const onDrop = (to: number) => (e: DragEvent) => {
    e.preventDefault()
    if (dragFrom != null) move(dragFrom, to)
    setDragFrom(null)
    setDragOver(null)
  }

  const diff = schedule.diff
  const eventRoles = roles.filter((r) => r.scope === 'event')
  const actRoles = roles.filter((r) => r.scope === 'act')
  const total = Math.max(1, schedule.end - schedule.start)

  const header = (
    <div className="as-event">
      <Select
        aria-label="対象イベント"
        value={event.id}
        onChange={(e) => void switchEvent(e.target.value)}
        options={choices.map((e) => ({ value: e.id, label: `${formatMd(e.date, false)} ${e.title}${e.date < today ? '（終了）' : ''}` }))}
      />
    </div>
  )

  let ordinal = 0
  const rows: ReactNode[] = []
  schedule.rows.forEach((row, index) => {
    const it = row.item
    const isAct = it.kind === 'act'
    if (isAct) ordinal++
    const mine = isAct && Boolean(it.id) && actRoles.some((r) => staffIds(r.id, it.id).includes(me.id))
    rows.push(
      <li
        key={it.key}
        className={cx('tt-row', !isAct && 'is-break', it.locked && 'is-locked', dragOver === index && 'is-drop', dragFrom === index && 'is-dragging', mine && 'is-mine')}
        style={{ '--i': index } as CSSVars}
        draggable={isAdmin}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', String(index))
          setDragFrom(index)
        }}
        onDragEnd={() => {
          setDragFrom(null)
          setDragOver(null)
        }}
        onDragOver={(e) => {
          if (!isAdmin) return
          e.preventDefault()
          if (dragOver !== index) setDragOver(index)
        }}
        onDrop={onDrop(index)}
      >
        <div className="tt-time rb-mono">
          <span>{fmtMin(row.start)}</span>
          <span className="rb-muted">{fmtMin(row.end)}</span>
        </div>
        <div className="tt-order">{isAct ? <span className="tt-num">{ordinal}</span> : <Icon name="coffee" size={16} />}</div>
        <div className="tt-main">
          {isAdmin ? (
            <div className="tt-edit">
              <Icon name="grip" size={16} className="tt-grip" />
              <input
                className="tt-input tt-input--name"
                value={it.name}
                aria-label={isAct ? `${ordinal}番目の出演者名` : '休憩の名前'}
                onChange={(e) => update(it.key, { name: e.target.value })}
              />
              <label className="tt-minutes">
                <input
                  className="tt-input tt-input--num rb-mono"
                  type="number"
                  min={1}
                  max={600}
                  value={it.minutes}
                  aria-label={`${it.name}の時間（分）`}
                  onChange={(e) => update(it.key, { minutes: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                />
                <span className="rb-muted rb-small">分</span>
              </label>
            </div>
          ) : (
            <div className="tt-view">
              <b>{it.name}</b>
              <span className="rb-mono rb-muted">{it.minutes}分</span>
            </div>
          )}
          {isAct && actRoles.length > 0 && it.id && (
            <div className="tt-staff">
              {actRoles.map((r) => {
                const names = staffNames(r.id, it.id)
                return (
                  <span key={r.id} className="tt-staffitem">
                    <RoleBadge name={r.name} icon={r.icon} color={roleColor(roles, r.id)} size="sm" />
                    <span className={names.length ? '' : 'rb-muted'}>{names.join('・') || '未定'}</span>
                  </span>
                )
              })}
            </div>
          )}
        </div>
        {isAdmin && (
          <div className="tt-actions">
            <IconButton icon="arrow-up" size="sm" label={`${it.name}を前へ`} disabled={index === 0} onClick={() => move(index, index - 1)} />
            <IconButton icon="arrow-down" size="sm" label={`${it.name}を後ろへ`} disabled={index === items.length - 1} onClick={() => move(index, index + 1)} />
            <IconButton
              icon={it.locked ? 'lock' : 'unlock'}
              size="sm"
              variant={it.locked ? 'secondary' : 'ghost'}
              label={it.locked ? `${it.name}の固定を解除` : `${it.name}を固定（並べ替え・自動調整で変えない）`}
              aria-pressed={it.locked}
              onClick={() => update(it.key, { locked: !it.locked })}
            />
            <IconButton icon="trash" size="sm" variant="danger" label={`${it.name}を削除`} onClick={() => setItems((l) => l.filter((x) => x.key !== it.key))} />
          </div>
        )}
      </li>,
    )
    if (row.changeover) {
      rows.push(
        <li key={`${it.key}-co`} className="tt-change">
          <span className="rb-mono">{fmtMin(row.changeover.start)}</span>
          <span className="tt-change__line" />
          <span className="rb-eyebrow">
            <Icon name="shuffle" size={12} />
            転換 {changeover}分
          </span>
          <span className="tt-change__line" />
          <span className="rb-mono">{fmtMin(row.changeover.end)}</span>
        </li>,
      )
    }
  })

  return (
    <Page
      eyebrow={isAdmin ? 'Admin · Timetable' : 'Timetable'}
      title="タイムテーブル"
      subtitle={isAdmin ? '出演順・演奏時間・転換を組み、終演予定に合わせて自動で調整します。ドラッグか矢印で順番を入れ替えられます。' : '出演順と時間、各出演の裏方を確認できます。'}
      actions={header}
    >
      <div className="tt-summary">
        <div className="tt-stat">
          <span className="rb-eyebrow">Doors</span>
          <b className="rb-mono">{event.openTime ?? '—'}</b>
          <span className="rb-small rb-muted">開場</span>
        </div>
        <div className="tt-stat">
          <span className="rb-eyebrow">Start</span>
          <b className="rb-mono">{fmtMin(schedule.start)}</b>
          <span className="rb-small rb-muted">開演</span>
        </div>
        <div className="tt-stat">
          <span className="rb-eyebrow">End</span>
          <b className="rb-mono">{fmtMin(schedule.end)}</b>
          <span className="rb-small rb-muted">終演（計算）</span>
        </div>
        <div className="tt-stat">
          <span className="rb-eyebrow">Acts</span>
          <b className="rb-mono">{schedule.acts}組</b>
          <span className="rb-small rb-muted">
            演奏 {schedule.play}分・転換 {schedule.changeover}分{schedule.breaks ? `・休憩 ${schedule.breaks}分` : ''}
          </span>
        </div>
        <div className="tt-stat">
          <span className="rb-eyebrow">Target</span>
          <b className="rb-mono">{targetEndTime || '—'}</b>
          {diff == null ? (
            <span className="rb-small rb-muted">終演予定なし</span>
          ) : diff > 0 ? (
            <StatusBadge status="cancelled" size="sm">
              {diff}分オーバー
            </StatusBadge>
          ) : diff < 0 ? (
            <StatusBadge status="confirmed" size="sm">
              {-diff}分の余裕
            </StatusBadge>
          ) : (
            <StatusBadge status="confirmed" size="sm">
              ぴったり
            </StatusBadge>
          )}
        </div>
      </div>

      {schedule.rows.length > 0 && (
        <div className="tt-bar" role="img" aria-label={`${fmtMin(schedule.start)}から${fmtMin(schedule.end)}までのタイムライン`}>
          {schedule.rows.map((row) => (
            <span key={row.item.key} className="tt-bar__seg-wrap" style={{ width: `${((row.end - row.start + (row.changeover ? changeover : 0)) / total) * 100}%` }}>
              <span
                className={cx('tt-bar__seg', row.item.kind === 'break' && 'is-break')}
                style={{ flexGrow: row.end - row.start }}
                title={`${row.item.name} ${fmtMin(row.start)}–${fmtMin(row.end)}`}
              />
              {row.changeover && <span className="tt-bar__co" style={{ flexGrow: changeover }} title={`転換 ${changeover}分`} />}
            </span>
          ))}
        </div>
      )}

      <div className={isAdmin ? 'tt-layout' : 'tt-layout tt-layout--full'}>
        <div className="tt-main-col">
          {eventRoles.length > 0 && (
            <Card eyebrow="Crew" title="ライブ全体の裏方">
              <div className="tt-crew">
                {eventRoles.map((r) => {
                  const names = staffNames(r.id, null)
                  return (
                    <span key={r.id} className="tt-staffitem">
                      <RoleBadge name={r.name} icon={r.icon} color={roleColor(roles, r.id)} />
                      <span className={names.length ? '' : 'rb-muted'}>{names.join('・') || '未定'}</span>
                    </span>
                  )
                })}
              </div>
            </Card>
          )}
          <Card
            eyebrow="Running order"
            title={`${event.title}（${formatMd(event.date)}）`}
            actions={
              isAdmin ? (
                <Button size="sm" variant="ghost" iconRight="chevron-right" onClick={() => navigate(`/assign?event=${event.id}`)}>
                  裏方を割り振る
                </Button>
              ) : undefined
            }
          >
            {rows.length === 0 ? (
              <EmptyState
                icon="note"
                title="まだ出演がありません"
                message={isAdmin ? '右の「出演を追加」から出演者と演奏時間を入れてください。' : '幹部が出演順を登録すると、ここに表示されます。'}
              />
            ) : (
              <ol className="tt-list">{rows}</ol>
            )}
          </Card>
        </div>

        {isAdmin && (
          <aside className="tt-side">
            <Card eyebrow="Settings" title="時間の設定" glow={dirty}>
              <div className="mb-form">
                <div className="app-two">
                  <TextField label="開演" type="time" icon="clock" value={startTime} onChange={(e) => setStartTime(e.target.value || '18:00')} />
                  <TextField label="終演予定" type="time" icon="clock" value={targetEndTime} onChange={(e) => setTargetEndTime(e.target.value)} />
                </div>
                <TextField
                  label="転換（分）"
                  type="number"
                  min={0}
                  max={120}
                  icon="shuffle"
                  value={changeover}
                  onChange={(e) => setChangeover(Math.max(0, Math.min(120, Math.floor(Number(e.target.value) || 0))))}
                  help="出演と出演の間に入ります（休憩の前後には入りません）"
                />
                <Button variant="primary" icon="stopwatch" onClick={autoFit} disabled={!items.length}>
                  終演予定に合わせて自動調整
                </Button>
                {fitMessage && (
                  <p className={fitMessage.ok ? 'tt-fit is-ok' : 'tt-fit'} role="status">
                    <Icon name={fitMessage.ok ? 'check' : 'alert'} size={14} />
                    {fitMessage.text}
                  </p>
                )}
                <div className="tt-tools">
                  <Button size="sm" icon="shuffle" disabled={items.filter((i) => i.kind === 'act' && !i.locked).length < 2} onClick={() => setItems((l) => shuffleOrder(l))}>
                    出演順をシャッフル
                  </Button>
                  <Button size="sm" icon="coffee" onClick={() => setItems((l) => insertBreakAtMiddle(l))}>
                    休憩を真ん中に入れる
                  </Button>
                </div>
                <p className="rb-muted rb-small">
                  <Icon name="lock" size={12} /> 固定した出演（トリなど）は、シャッフルと自動調整で位置・時間が変わりません。
                </p>
              </div>
            </Card>

            <Card eyebrow="Add" title="出演を追加">
              <form
                className="mb-form"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault()
                  addAct()
                }}
              >
                <TextField label="出演者名" icon="note" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="例：Midnight Echo" />
                <TextField label="演奏時間（分）" type="number" min={1} max={600} icon="clock" value={newMinutes} onChange={(e) => setNewMinutes(e.target.value)} />
                <div className="tt-tools">
                  <Button type="submit" icon="plus">
                    出演を追加
                  </Button>
                  <Button
                    variant="ghost"
                    icon="coffee"
                    onClick={() => setItems((l) => [...l, { key: newKey(), id: null, kind: 'break', name: '休憩', minutes: 15, locked: false, note: null }])}
                  >
                    休憩を追加
                  </Button>
                </div>
              </form>
            </Card>

            <div className={cx('tt-savebar', dirty && 'is-dirty')}>
              <span className="rb-small">{dirty ? '保存していない変更があります' : '保存済みです'}</span>
              <div className="tt-tools">
                <Button
                  variant="ghost"
                  disabled={!dirty || pending}
                  onClick={() => {
                    setItems(initial.items)
                    setStartTime(initial.startTime)
                    setTargetEndTime(initial.targetEndTime)
                    setChangeover(initial.changeover)
                    setFitMessage(null)
                  }}
                >
                  変更を破棄
                </Button>
                <Button variant="primary" icon="check" disabled={!dirty} loading={pending} onClick={() => void save()}>
                  保存する
                </Button>
              </div>
            </div>
          </aside>
        )}
      </div>
    </Page>
  )
}
