/**
 * 裏方の割り振りボード（Riffboard の RoleAssigner の動きを、裏方の役割表に置き換えたもの）。
 * ・ライブ全体の役割（PA・タイムキーパー・SNS など）
 * ・出演ごとの役割（照明・撮影など）をタイムテーブルの行 × 役割の列で
 * 変更はその都度 onSave で保存する。元に戻すはこの画面を開いている間だけ使える。
 */
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  autoAssignStaff,
  DEFAULT_STAFF_RULES,
  findIssues,
  ISSUE_LABEL,
  type Cell,
  type CellState,
  type Issue,
  type StaffCandidate,
  type StaffRules,
} from '../../controllers/staffAssign'
import type { StaffRole } from '../../models/types'
import { Avatar, Button, Card, Equalizer, Icon, RoleBadge, StatusBadge, Toggle, VuMeter, cx, prefersReduced, type CSSVars } from './core'

export interface BoardAct {
  id: string
  name: string
  time: string
}

export interface HistoryItem {
  id: string
  time: string
  text: string
}

interface Props {
  title: string
  subtitle?: string
  roles: StaffRole[]
  colorOf: (roleId: string) => string
  acts: BoardAct[]
  cells: Cell[]
  value: CellState
  candidates: StaffCandidate[]
  confirmed: boolean
  history: HistoryItem[]
  slotsOf: (roleId: string) => number
  /** 保存に成功したら true */
  onSave: (next: CellState, text: string) => Promise<boolean>
  onConfirm: () => Promise<void>
  onSetSlots: (role: StaffRole, slots: number) => void
}

const EMPTY = { memberId: null, locked: false }

export function StaffBoard({
  title,
  subtitle,
  roles,
  colorOf,
  acts,
  cells,
  value,
  candidates,
  confirmed,
  history,
  slotsOf,
  onSave,
  onConfirm,
  onSetSlots,
}: Props) {
  const [local, setLocal] = useState<CellState | null>(null)
  const [rules, setRules] = useState<StaffRules>(DEFAULT_STAFF_RULES)
  const [undoStack, setUndoStack] = useState<CellState[]>([])
  const [rolling, setRolling] = useState<Record<string, string> | null>(null)
  const [pending, setPending] = useState<CellState | null>(null)
  const [landed, setLanded] = useState<Record<string, number>>({})
  const [picker, setPicker] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const timers = useRef<number[]>([])

  const cur: CellState = Object.fromEntries(cells.map((c) => [c.key, local?.[c.key] ?? value[c.key] ?? EMPTY]))
  const shown = pending ?? cur
  const rolesById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles])
  const byId = useMemo(() => new Map(candidates.map((m) => [m.id, m])), [candidates])
  const cellByKey = useMemo(() => new Map(cells.map((c) => [c.key, c])), [cells])
  const issues = findIssues(cells, shown, rolesById, byId, rules)
  const filled = cells.filter((c) => shown[c.key]?.memberId).length
  const eventRoles = roles.filter((r) => r.scope === 'event')
  const actRoles = roles.filter((r) => r.scope === 'act')

  const countIn = (state: CellState, mid: string) => cells.filter((c) => state[c.key]?.memberId === mid).length
  const placesOf = (mid: string) =>
    cells
      .filter((c) => shown[c.key]?.memberId === mid)
      .map((c) => {
        const r = rolesById.get(c.roleId)?.name ?? ''
        const a = c.itemId ? acts.find((x) => x.id === c.itemId)?.name : null
        return a ? `${a}・${r}` : r
      })
  const labelOf = (c: Cell) => {
    const r = rolesById.get(c.roleId)?.name ?? ''
    const a = c.itemId ? acts.find((x) => x.id === c.itemId)?.name : null
    const n = slotsOf(c.roleId) > 1 ? ` ${c.index + 1}` : ''
    return a ? `${a}・${r}${n}` : `${r}${n}`
  }

  useEffect(() => {
    const list = timers.current
    return () => list.forEach((t) => (clearTimeout(t), clearInterval(t)))
  }, [])
  useEffect(() => {
    if (!picker) return
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(`[data-cell="${CSS.escape(picker)}"]`)) setPicker(null)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setPicker(null)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [picker])

  const commit = async (next: CellState, text: string, pushUndo = true) => {
    setLocal(next)
    if (pushUndo) setUndoStack((u) => [cur, ...u].slice(0, 30))
    setSaving(true)
    const ok = await onSave(next, text)
    setSaving(false)
    if (!ok) {
      setLocal(null)
      if (pushUndo) setUndoStack((u) => u.slice(1))
    }
  }
  const bump = (key: string) => setLanded((l) => ({ ...l, [key]: (l[key] ?? 0) + 1 }))

  const setCell = (key: string, mid: string | null) => {
    const c = cellByKey.get(key)!
    const a = cur[key]?.memberId ? byId.get(cur[key].memberId!)?.name : null
    const b = mid ? byId.get(mid)?.name : null
    void commit({ ...cur, [key]: { memberId: mid, locked: mid ? cur[key]?.locked ?? false : false } }, `手動: ${labelOf(c)} ${a ?? '空き'} → ${b ?? '空き'}`)
    bump(key)
    setPicker(null)
  }
  const swap = (from: string, to: string) => {
    if (from === to) return
    void commit({ ...cur, [from]: { ...cur[to] }, [to]: { ...cur[from] } }, `入れ替え: ${labelOf(cellByKey.get(from)!)} ⇄ ${labelOf(cellByKey.get(to)!)}`)
    bump(from)
    bump(to)
  }
  const toggleLock = (key: string) => {
    const on = !cur[key].locked
    void commit({ ...cur, [key]: { ...cur[key], locked: on } }, `${labelOf(cellByKey.get(key)!)}${on ? ' をロック' : ' のロックを解除'}`)
  }
  const undo = () => {
    const [last, ...rest] = undoStack
    if (!last) return
    setUndoStack(rest)
    void commit(last, '元に戻す', false)
  }

  const runAuto = () => {
    if (rolling) return
    setPicker(null)
    const { state: next, unfilled } = autoAssignStaff(
      cells,
      rolesById,
      acts.map((a) => a.id),
      cur,
      candidates,
      rules,
    )
    const targets = cells.filter((c) => !(cur[c.key]?.locked && cur[c.key]?.memberId))
    const keep = cells.length - targets.length
    const text = `自動割り振り: ${targets.length}枠${keep ? `（ロック ${keep}枠を維持）` : ''}${unfilled ? `・${unfilled}枠は候補不足` : ''}`
    if (prefersReduced() || !targets.length) {
      void commit(next, text)
      return
    }
    const names = candidates.filter((c) => !c.excluded).map((c) => c.name)
    const pick = () => (names.length ? names[Math.floor(Math.random() * names.length)] : '—')
    setRolling(Object.fromEntries(targets.map((c) => [c.key, pick()])))
    setPending({ ...cur })
    const iv = window.setInterval(() => setRolling((r) => (r ? Object.fromEntries(Object.keys(r).map((k) => [k, pick()])) : r)), 75)
    timers.current.push(iv)
    // 枠が多くても2拍半ほどで着地しきるよう間隔を詰める
    const step = Math.min(230, 1600 / targets.length)
    targets.forEach((c, i) => {
      timers.current.push(
        window.setTimeout(() => {
          setRolling((r) => {
            if (!r) return r
            const n = { ...r }
            delete n[c.key]
            return n
          })
          setPending((p) => ({ ...(p ?? {}), [c.key]: next[c.key] ?? EMPTY }))
          bump(c.key)
        }, 600 + i * step),
      )
    })
    timers.current.push(
      window.setTimeout(() => {
        clearInterval(iv)
        setRolling(null)
        setPending(null)
        void commit(next, text)
      }, 600 + targets.length * step + 150),
    )
  }

  const dragStart = (payload: { cell?: string; member?: string }) => (e: DragEvent) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', JSON.stringify(payload))
    setDragging(payload.member ?? payload.cell ?? null)
  }
  const drop = (key: string) => (e: DragEvent) => {
    e.preventDefault()
    setOver(null)
    setDragging(null)
    try {
      const p = JSON.parse(e.dataTransfer.getData('text/plain')) as { cell?: string; member?: string }
      if (p.cell) swap(p.cell, key)
      else if (p.member) {
        const role = rolesById.get(cellByKey.get(key)!.roleId)
        if (role?.adminOnly && !byId.get(p.member)?.isAdmin) return
        setCell(key, p.member)
      }
    } catch {
      // 他のアプリからのドロップは無視
    }
  }

  const busy = !!rolling || saving
  const blocking = issues.size

  const renderCell = (c: Cell) => {
    const v = shown[c.key] ?? EMPTY
    const m = v.memberId ? byId.get(v.memberId) : undefined
    const reel = rolling?.[c.key]
    const role = rolesById.get(c.roleId)!
    const flags: Issue[] = reel ? [] : (issues.get(c.key) ?? [])
    const sorted = candidates
      .map((mm) => {
        const busyHere = c.itemId
          ? cells.some((x) => x.key !== c.key && (x.itemId === c.itemId || !x.itemId) && shown[x.key]?.memberId === mm.id)
          : cells.some((x) => x.key !== c.key && shown[x.key]?.memberId === mm.id)
        const blocked = role.adminOnly && !mm.isAdmin
        return { mm, busyHere, blocked, count: countIn(shown, mm.id) }
      })
      .sort(
        (a, b) =>
          Number(a.blocked) - Number(b.blocked) ||
          Number(a.mm.excluded) - Number(b.mm.excluded) ||
          Number(a.busyHere) - Number(b.busyHere) ||
          a.count - b.count ||
          a.mm.load - b.mm.load,
      )
    return (
      <div
        key={c.key}
        data-cell={c.key}
        className={cx('sb-cell', picker === c.key && 'is-open')}
        onDragOver={(e) => {
          e.preventDefault()
          if (over !== c.key) setOver(c.key)
        }}
        onDragLeave={() => over === c.key && setOver(null)}
        onDrop={drop(c.key)}
      >
        <button
          key={`b${landed[c.key] ?? 0}`}
          type="button"
          className={cx(
            'sb-slot',
            !m && !reel && 'is-empty',
            v.locked && m && 'is-locked',
            over === c.key && 'is-drop',
            flags.length > 0 && 'is-conflict',
            confirmed && m && 'is-confirmed',
            reel && 'is-rolling',
            Boolean(landed[c.key]) && 'is-landed',
          )}
          style={{ '--rb-role': colorOf(c.roleId) } as CSSVars}
          draggable={!!m && !busy}
          onDragStart={dragStart({ cell: c.key })}
          onDragEnd={() => setDragging(null)}
          aria-haspopup="listbox"
          aria-expanded={picker === c.key}
          aria-label={`${labelOf(c)}：${m ? m.name : '未割り当て'}`}
          onClick={() => !busy && setPicker((p) => (p === c.key ? null : c.key))}
        >
          {reel ? (
            <>
              <Equalizer bars={4} size={16} />
              <span className="sb-slot__name sb-slot__reel" key={reel}>
                {reel}
              </span>
            </>
          ) : m ? (
            <>
              <Avatar name={m.name} size={24} />
              <span className="sb-slot__name">{m.name}</span>
            </>
          ) : (
            <>
              <span className="sb-slot__plus">
                <Icon name="plus" size={14} />
              </span>
              <span className="sb-slot__name">未割り当て</span>
            </>
          )}
          {flags.length > 0 && (
            <span className="sb-slot__flag">
              <Icon name="alert" size={11} strokeWidth={2.2} />
              {flags.map((f) => ISSUE_LABEL[f]).join('・')}
            </span>
          )}
        </button>
        {m && !reel && (
          <button
            type="button"
            className="sb-lock"
            aria-pressed={v.locked}
            aria-label={`${labelOf(c)}${v.locked ? 'のロックを解除' : 'をロック'}`}
            title={v.locked ? '自動割り振りで変更しない' : 'ロックすると自動割り振りで変更されません'}
            disabled={busy}
            onClick={() => toggleLock(c.key)}
          >
            <Icon name={v.locked ? 'lock' : 'unlock'} size={13} strokeWidth={2} />
          </button>
        )}
        {picker === c.key && (
          <div className="rb-picker sb-picker" role="listbox" aria-label={`${labelOf(c)}に割り当てるメンバー`}>
            <div className="rb-picker__head rb-eyebrow">{labelOf(c)}</div>
            {sorted.map(({ mm, busyHere, blocked, count }) => (
              <button
                key={mm.id}
                type="button"
                role="option"
                aria-selected={v.memberId === mm.id}
                disabled={blocked}
                className={cx('rb-picker__item', (blocked || mm.excluded || busyHere) && 'is-off', v.memberId === mm.id && 'is-current')}
                onClick={() => setCell(c.key, mm.id)}
              >
                <Avatar name={mm.name} size={26} badge={mm.isAdmin ? { icon: 'crown', color: 'var(--amber)' } : undefined} />
                <span className="rb-picker__name">
                  {mm.name}
                  <span className="rb-picker__sub">
                    {[
                      blocked && '幹部のみ',
                      mm.excluded && '参加不可',
                      busyHere && `担当中: ${placesOf(mm.id).join(', ')}`,
                      !busyHere && count > 0 && `この日${count}枠`,
                    ]
                      .filter(Boolean)
                      .join(' ／ ') || '空いています'}
                  </span>
                </span>
                <span className="rb-picker__load">今月{mm.load}回</span>
              </button>
            ))}
            {v.memberId && (
              <button type="button" className="rb-picker__item rb-picker__clear" onClick={() => setCell(c.key, null)}>
                <Icon name="x" size={16} />
                空きにする
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  const stepper = (role: StaffRole) => (
    <span className="sb-stepper" aria-label={`${role.name}の人数`}>
      <button type="button" aria-label={`${role.name}の人数を減らす`} disabled={busy || slotsOf(role.id) <= 0} onClick={() => onSetSlots(role, slotsOf(role.id) - 1)}>
        −
      </button>
      <span className="rb-mono">{slotsOf(role.id)}人</span>
      <button type="button" aria-label={`${role.name}の人数を増やす`} disabled={busy || slotsOf(role.id) >= 20} onClick={() => onSetSlots(role, slotsOf(role.id) + 1)}>
        ＋
      </button>
    </span>
  )

  return (
    <div className="rb-assign sb">
      <div className="rb-assign__head">
        <div>
          <div className="rb-eyebrow">Staff assign</div>
          <h2 className="rb-assign__title">{title}</h2>
          {subtitle && <p className="rb-assign__sub">{subtitle}</p>}
        </div>
        <div className="rb-assign__summary">
          <span className="rb-mono">
            {filled}/{cells.length} 枠
          </span>
          <VuMeter level={cells.length ? filled / cells.length : 0} segments={Math.min(24, Math.max(8, cells.length))} size="sm" ariaLabel="割り当て済みの枠" />
          {blocking > 0 && <StatusBadge status="conflict">{blocking}枠を確認</StatusBadge>}
          {confirmed && <StatusBadge status="confirmed">確定済み</StatusBadge>}
        </div>
        <div className="rb-assign__actions">
          <Button variant="ghost" icon="undo" disabled={!undoStack.length || busy} onClick={undo}>
            元に戻す
          </Button>
          <Button variant="secondary" icon="check" disabled={busy || blocking > 0 || !filled || confirmed} onClick={() => void onConfirm()}>
            確定
          </Button>
          <Button variant="primary" icon="shuffle" loading={!!rolling} disabled={saving || !cells.length} onClick={runAuto}>
            自動割り振り
          </Button>
        </div>
      </div>

      <div className="rb-assign__main">
        <Card eyebrow="Whole show" title="ライブ全体の役割">
          {eventRoles.length === 0 ? (
            <p className="rb-muted rb-small">ライブ全体で固定する役割はありません。</p>
          ) : (
            <div className="sb-event">
              {eventRoles.map((r) => (
                <div key={r.id} className="sb-eventrole">
                  <div className="sb-rolehead">
                    <RoleBadge name={r.name} icon={r.icon} color={colorOf(r.id)} />
                    {r.adminOnly && (
                      <span className="sb-adminonly">
                        <Icon name="crown" size={12} />
                        幹部のみ
                      </span>
                    )}
                    {stepper(r)}
                  </div>
                  <div className="sb-cells">
                    {cells.filter((c) => c.roleId === r.id && !c.itemId).map(renderCell)}
                    {slotsOf(r.id) === 0 && <span className="rb-muted rb-small">このライブでは不要</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card eyebrow="Per act" title="出演ごとの役割" padded={false}>
          {acts.length === 0 || actRoles.length === 0 ? (
            <p className="rb-muted rb-small sb-pad">
              {acts.length === 0 ? 'タイムテーブルに出演がありません。先にタイムテーブルで出演を登録してください。' : '出演ごとに交代する役割はありません。'}
            </p>
          ) : (
            <div className="rb-table-wrap sb-tablewrap">
              <table className="sb-table">
                <thead>
                  <tr>
                    <th scope="col">時間</th>
                    <th scope="col">出演</th>
                    {actRoles.map((r) => (
                      <th key={r.id} scope="col">
                        <div className="sb-colhead">
                          <RoleBadge name={r.name} icon={r.icon} color={colorOf(r.id)} size="sm" />
                          {r.adminOnly && <Icon name="crown" size={12} title="幹部のみ" />}
                          {stepper(r)}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {acts.map((a, i) => (
                    <tr key={a.id} style={{ '--i': i } as CSSVars}>
                      <td className="rb-mono sb-time">{a.time}</td>
                      <th scope="row" className="sb-actname">
                        {a.name}
                      </th>
                      {actRoles.map((r) => (
                        <td key={r.id}>
                          <div className="sb-cells">{cells.filter((c) => c.roleId === r.id && c.itemId === a.id).map(renderCell)}</div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card eyebrow="Backstage" title="控えのメンバー" actions={<span className="rb-mono rb-muted">ドラッグで配置</span>}>
          <ul className="rb-bench">
            {candidates.map((mm, i) => {
              const n = countIn(shown, mm.id)
              return (
                <li
                  key={mm.id}
                  className={cx('rb-bench__item', dragging === mm.id && 'is-dragging', mm.excluded && 'is-excluded')}
                  style={{ '--i': i } as CSSVars}
                  draggable={!busy}
                  onDragStart={dragStart({ member: mm.id })}
                  onDragEnd={() => setDragging(null)}
                >
                  <Icon name="grip" size={16} className="rb-bench__grip" />
                  <Avatar name={mm.name} size={28} badge={mm.isAdmin ? { icon: 'crown', color: 'var(--amber)' } : undefined} />
                  <span className="rb-bench__name">
                    {mm.name}
                    {mm.excluded && <span className="rb-chip-mini rb-bench__reg">参加不可</span>}
                  </span>
                  <span className="rb-mono rb-muted sb-load">今月{mm.load}</span>
                  {n > 0 && <span className="rb-bench__slot">{n}枠</span>}
                </li>
              )
            })}
          </ul>
        </Card>
      </div>

      <div className="rb-assign__side">
        <Card eyebrow="Rules" title="割り振りルール">
          <div className="rb-assign__rules">
            <Toggle
              checked={rules.balance}
              onChange={(v) => setRules((r) => ({ ...r, balance: v }))}
              label="担当回数を平準化"
              description="今月の担当が少ない人を優先します"
            />
            <Toggle
              checked={rules.avoidBackToBack}
              onChange={(v) => setRules((r) => ({ ...r, avoidBackToBack: v }))}
              label="連続担当を避ける"
              description="直前の出演でも担当した人は後回しにします"
            />
            <Toggle
              checked={rules.allowDouble}
              onChange={(v) => setRules((r) => ({ ...r, allowDouble: v }))}
              label="兼任を許可"
              description="全体の役割の人や、同じ出演で別の役割の人も選べるようにします"
            />
          </div>
          <p className="rb-muted rb-small sb-note">
            <Icon name="info" size={13} /> 参加不可のメンバーは自動割り振りの候補から外れます。「幹部のみ」の役割は幹部だけが担当できます。
          </p>
        </Card>
        <Card eyebrow="Log" title="履歴">
          {history.length ? (
            <ol className="rb-history">
              {history.map((h) => (
                <li key={h.id}>
                  <time className="rb-mono">{h.time}</time>
                  <span>{h.text}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="rb-muted rb-small">まだ変更はありません。自動割り振りか、枠をクリックして手動で配置します。</p>
          )}
        </Card>
      </div>
    </div>
  )
}
