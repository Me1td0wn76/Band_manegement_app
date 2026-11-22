/**
 * Riffboard の RoleAssigner（ステージ図の上でパートの枠にメンバーを割り振る）。
 * 変更はその都度 onSave で保存する。元に戻すはこの画面を開いている間だけ使える。
 */
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { autoAssign, DEFAULT_RULES, type AssignRules, type Assignment } from '../../controllers/autoAssign'
import type { Part } from '../../models/types'
import { Avatar, Button, Card, Equalizer, Icon, StatusBadge, Toggle, VuMeter, cx, prefersReduced, type CSSVars } from './core'
import { ROLE_META } from './icons'

export interface AssignerSlot {
  id: string
  part: Part
  label: string
}

export interface AssignerMember {
  id: string
  name: string
  parts: Part[]
  load: number
  regular: boolean
}

export interface AssignerState {
  assignment: Assignment
  locked: Record<string, boolean>
}

export interface HistoryItem {
  id: string
  time: string
  text: string
}

const POS: Record<Part, [number, number][]> = {
  dr: [[50, 24]],
  key: [[17, 36]],
  ba: [[83, 38]],
  gt: [
    [22, 68],
    [78, 68],
  ],
  vo: [[50, 72]],
}

interface Props {
  title: string
  subtitle?: string
  slots: AssignerSlot[]
  members: AssignerMember[]
  value: Assignment
  locked: Record<string, boolean>
  confirmed: boolean
  history: HistoryItem[]
  /** 保存に成功したら true */
  onSave: (next: AssignerState, text: string) => Promise<boolean>
  onConfirm: () => Promise<void>
  onRemoveSlot?: (slotId: string) => void
  sideExtra?: ReactNode
  readOnly?: boolean
}

export function RoleAssigner({
  title,
  subtitle,
  slots,
  members,
  value,
  locked: savedLocked,
  confirmed,
  history,
  onSave,
  onConfirm,
  onRemoveSlot,
  sideExtra,
  readOnly = false,
}: Props) {
  // 保存待ちの間も画面がすぐ変わるよう、手元の状態を優先して表示する
  const [local, setLocal] = useState<AssignerState | null>(null)
  const [rules, setRules] = useState<AssignRules>(DEFAULT_RULES)
  const [undoStack, setUndoStack] = useState<AssignerState[]>([])
  const [rolling, setRolling] = useState<Record<string, string> | null>(null)
  const [pending, setPending] = useState<Assignment | null>(null)
  const [landed, setLanded] = useState<Record<string, number>>({})
  const [picker, setPicker] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const timers = useRef<number[]>([])
  const root = useRef<HTMLDivElement>(null)

  const cur: Assignment = Object.fromEntries(
    slots.map((s) => [s.id, local && s.id in local.assignment ? local.assignment[s.id] : (value[s.id] ?? null)]),
  )
  const locked: Record<string, boolean> = Object.fromEntries(
    slots.map((s) => [s.id, local && s.id in local.locked ? local.locked[s.id] : Boolean(savedLocked[s.id])]),
  )

  const byId = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members])
  const slotById = useMemo(() => Object.fromEntries(slots.map((s) => [s.id, s])), [slots])
  const positions = useMemo(() => {
    const seen: Partial<Record<Part, number>> = {}
    return Object.fromEntries(
      slots.map((s) => {
        const list = POS[s.part] ?? [[50, 50]]
        const k = seen[s.part] ?? 0
        seen[s.part] = k + 1
        // 3人目以降の同じパートは少しずらして重ならないようにする
        const [x, y] = list[k % list.length]
        const shift = Math.floor(k / list.length) * 9
        return [s.id, [Math.min(92, x + shift), Math.max(14, y - shift)] as [number, number]]
      }),
    )
  }, [slots])

  useEffect(() => {
    const list = timers.current
    return () => list.forEach((t) => (clearTimeout(t), clearInterval(t)))
  }, [])
  useEffect(() => {
    if (!picker) return
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (root.current && !target.closest(`[data-slot="${picker}"]`)) setPicker(null)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setPicker(null)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [picker])

  const shown = pending ?? cur
  const counts: Record<string, number> = {}
  Object.values(shown).forEach((id) => id && (counts[id] = (counts[id] ?? 0) + 1))
  const isConflict = (sid: string) => !!shown[sid] && !rules.allowDouble && (counts[shown[sid]!] ?? 0) > 1
  const isOffRole = (s: AssignerSlot) => {
    const m = shown[s.id] ? byId[shown[s.id]!] : undefined
    return !!m && !m.parts.includes(s.part)
  }
  const filled = slots.filter((s) => shown[s.id]).length
  const conflicts = slots.filter((s) => isConflict(s.id)).length
  const slotOf = (mid: string) => slots.filter((s) => shown[s.id] === mid).map((s) => s.label)

  const commit = async (next: AssignerState, text: string, pushUndo = true) => {
    const prev: AssignerState = { assignment: cur, locked }
    setLocal(next)
    if (pushUndo) setUndoStack((u) => [prev, ...u].slice(0, 30))
    setSaving(true)
    const ok = await onSave(next, text)
    setSaving(false)
    if (!ok) {
      // 保存に失敗したら保存済みの状態に戻す
      setLocal(null)
      if (pushUndo) setUndoStack((u) => u.slice(1))
    }
  }
  const bump = (sid: string) => setLanded((l) => ({ ...l, [sid]: (l[sid] ?? 0) + 1 }))

  const setSlot = (sid: string, mid: string | null) => {
    const s = slotById[sid]
    const a = cur[sid] ? byId[cur[sid]!] : undefined
    const b = mid ? byId[mid] : undefined
    void commit({ assignment: { ...cur, [sid]: mid }, locked }, `手動: ${s.label} ${a ? a.name : '空き'} → ${b ? b.name : '空き'}`)
    bump(sid)
    setPicker(null)
  }
  const swap = (from: string, to: string) => {
    if (from === to) return
    void commit(
      { assignment: { ...cur, [from]: cur[to] ?? null, [to]: cur[from] ?? null }, locked },
      `入れ替え: ${slotById[from].label} ⇄ ${slotById[to].label}`,
    )
    bump(from)
    bump(to)
  }
  const toggleLock = (sid: string) => {
    const on = !locked[sid]
    void commit({ assignment: cur, locked: { ...locked, [sid]: on } }, `${slotById[sid].label}${on ? ' をロック' : ' のロックを解除'}`)
  }
  const undo = () => {
    const [last, ...rest] = undoStack
    if (!last) return
    setUndoStack(rest)
    void commit(last, '元に戻す', false)
  }

  const runAuto = () => {
    if (rolling || readOnly) return
    setPicker(null)
    const next = autoAssign(slots, members, cur, locked, rules)
    const targets = slots.filter((s) => !locked[s.id])
    const keep = slots.length - targets.length
    const text = `自動割り振り: ${targets.length}枠${keep ? `（ロック ${keep}枠を維持）` : ''}`
    if (prefersReduced() || !targets.length) {
      void commit({ assignment: next, locked }, text)
      return
    }
    const pick = (sid: string) => {
      const pool = members.filter((m) => m.parts.includes(slotById[sid].part))
      const src = pool.length ? pool : members
      return src.length ? src[Math.floor(Math.random() * src.length)].name : '—'
    }
    setRolling(Object.fromEntries(targets.map((s) => [s.id, pick(s.id)])))
    setPending({ ...cur })
    const iv = window.setInterval(() => {
      setRolling((r) => (r ? Object.fromEntries(Object.keys(r).map((k) => [k, pick(k)])) : r))
    }, 75)
    timers.current.push(iv)
    targets.forEach((s, i) => {
      timers.current.push(
        window.setTimeout(() => {
          setRolling((r) => {
            if (!r) return r
            const n = { ...r }
            delete n[s.id]
            return n
          })
          setPending((p) => ({ ...(p ?? {}), [s.id]: next[s.id] ?? null }))
          bump(s.id)
        }, 650 + i * 230),
      )
    })
    timers.current.push(
      window.setTimeout(
        () => {
          clearInterval(iv)
          setRolling(null)
          setPending(null)
          void commit({ assignment: next, locked }, text)
        },
        650 + targets.length * 230 + 120,
      ),
    )
  }

  const dragStart = (payload: { slot?: string; member?: string }) => (e: DragEvent) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', JSON.stringify(payload))
    setDragging(payload.member ?? payload.slot ?? null)
  }
  const drop = (sid: string) => (e: DragEvent) => {
    e.preventDefault()
    setOver(null)
    setDragging(null)
    if (readOnly) return
    try {
      const p = JSON.parse(e.dataTransfer.getData('text/plain')) as { slot?: string; member?: string }
      if (p.slot) swap(p.slot, sid)
      else if (p.member) setSlot(sid, p.member)
    } catch {
      // 他のアプリからのドロップは無視
    }
  }

  const busy = !!rolling || saving

  const renderSlot = (s: AssignerSlot, idx: number) => {
    const [x, y] = positions[s.id]
    const m = shown[s.id] ? byId[shown[s.id]!] : undefined
    const reel = rolling?.[s.id]
    const meta = ROLE_META[s.part] ?? ROLE_META.gt
    const conflict = isConflict(s.id)
    const off = isOffRole(s)
    const candidates = members
      .slice()
      .sort(
        (a, b) =>
          Number(b.parts.includes(s.part)) - Number(a.parts.includes(s.part)) ||
          Number(b.regular) - Number(a.regular) ||
          a.load - b.load,
      )
    return (
      <div
        key={s.id}
        data-slot={s.id}
        className={cx(
          'rb-slot',
          !m && !reel && 'is-empty',
          locked[s.id] && 'is-locked',
          over === s.id && 'is-drop',
          conflict && 'is-conflict',
          confirmed && m && 'is-confirmed',
          reel && 'is-rolling',
          y > 55 && 'is-low',
        )}
        style={{ '--x': `${x}%`, '--y': `${y}%`, '--i': idx, '--rb-role': `var(--role-${s.part})` } as CSSVars}
        onDragOver={(e) => {
          e.preventDefault()
          if (over !== s.id) setOver(s.id)
        }}
        onDragLeave={() => over === s.id && setOver(null)}
        onDrop={drop(s.id)}
      >
        {!readOnly && (
          <button
            type="button"
            className="rb-slot__lock"
            aria-pressed={!!locked[s.id]}
            aria-label={`${s.label}${locked[s.id] ? 'のロックを解除' : 'をロック'}`}
            title={locked[s.id] ? '自動割り振りで変更しない' : 'ロックすると自動割り振りで変更されません'}
            disabled={busy}
            onClick={() => toggleLock(s.id)}
          >
            <Icon name={locked[s.id] ? 'lock' : 'unlock'} size={14} strokeWidth={2} />
          </button>
        )}
        <button
          key={`b${landed[s.id] ?? 0}`}
          type="button"
          className={cx('rb-slot__btn', Boolean(landed[s.id]) && 'is-landed')}
          draggable={!!m && !busy && !readOnly}
          onDragStart={dragStart({ slot: s.id })}
          onDragEnd={() => setDragging(null)}
          aria-haspopup={readOnly ? undefined : 'listbox'}
          aria-expanded={readOnly ? undefined : picker === s.id}
          onClick={() => !busy && !readOnly && setPicker((p) => (p === s.id ? null : s.id))}
        >
          <span className="rb-slot__role">
            <Icon name={meta.icon} size={14} className="rb-slot__roleic" />
            {s.label}
          </span>
          <span className="rb-slot__who">
            {reel ? (
              <span className="rb-slot__spin">
                <Equalizer bars={5} size={18} />
              </span>
            ) : m ? (
              <Avatar name={m.name} size={38} />
            ) : (
              <span className="rb-slot__plus">
                <Icon name="plus" size={18} />
              </span>
            )}
          </span>
          <span className="rb-slot__name">
            {reel ? (
              <span className="rb-slot__reel" key={reel}>
                {reel}
              </span>
            ) : m ? (
              m.name
            ) : (
              '未割り当て'
            )}
          </span>
          {(conflict || off) && !reel && (
            <span className={cx('rb-slot__flag', conflict ? 'is-red' : 'is-amber')}>
              <Icon name="alert" size={12} strokeWidth={2.2} />
              {conflict ? '重複' : 'パート外'}
            </span>
          )}
        </button>
        {picker === s.id && (
          <div className="rb-picker" role="listbox" aria-label={`${s.label}に割り当てるメンバー`}>
            <div className="rb-picker__head rb-eyebrow">{meta.long}を選ぶ</div>
            {candidates.map((mm) => {
              const fit = mm.parts.includes(s.part)
              const where = slotOf(mm.id)
              return (
                <button
                  key={mm.id}
                  type="button"
                  role="option"
                  aria-selected={shown[s.id] === mm.id}
                  className={cx('rb-picker__item', !fit && 'is-off', shown[s.id] === mm.id && 'is-current')}
                  onClick={() => setSlot(s.id, mm.id)}
                >
                  <Avatar name={mm.name} size={26} />
                  <span className="rb-picker__name">
                    {mm.name}
                    <span className="rb-picker__sub">
                      {fit ? mm.parts.map((r) => ROLE_META[r].short).join(' · ') : 'パート外'}
                      {mm.regular ? ' ／ 編成メンバー' : ''}
                      {where.length ? ` ／ 割当中: ${where.join(', ')}` : ''}
                    </span>
                  </span>
                  <span className="rb-picker__load">今月{mm.load}回</span>
                </button>
              )
            })}
            {shown[s.id] && (
              <button type="button" className="rb-picker__item rb-picker__clear" onClick={() => setSlot(s.id, null)}>
                <Icon name="x" size={16} />
                空きにする
              </button>
            )}
            {onRemoveSlot && (
              <button
                type="button"
                className="rb-picker__item rb-picker__clear rb-picker__remove"
                onClick={() => {
                  setPicker(null)
                  onRemoveSlot(s.id)
                }}
              >
                <Icon name="trash" size={16} />
                この枠を削除
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div ref={root} className="rb-assign">
      <div className="rb-assign__head">
        <div>
          <div className="rb-eyebrow">Role assign</div>
          <h2 className="rb-assign__title">{title}</h2>
          {subtitle && <p className="rb-assign__sub">{subtitle}</p>}
        </div>
        <div className="rb-assign__summary">
          <span className="rb-mono">
            {filled}/{slots.length} 枠
          </span>
          <VuMeter level={slots.length ? filled / slots.length : 0} segments={Math.max(4, slots.length * 2)} size="sm" ariaLabel="割り当て済みの枠" />
          {conflicts > 0 && <StatusBadge status="conflict">{conflicts}枠が重複</StatusBadge>}
          {confirmed && <StatusBadge status="confirmed">確定済み</StatusBadge>}
        </div>
        {!readOnly && (
          <div className="rb-assign__actions">
            <Button variant="ghost" icon="undo" disabled={!undoStack.length || busy} onClick={undo}>
              元に戻す
            </Button>
            <Button
              variant="secondary"
              icon="check"
              disabled={busy || conflicts > 0 || !filled || confirmed}
              onClick={() => void onConfirm()}
            >
              確定
            </Button>
            <Button variant="primary" icon="shuffle" loading={!!rolling} disabled={saving || !slots.length} onClick={runAuto}>
              自動割り振り
            </Button>
          </div>
        )}
      </div>

      <div className="rb-assign__main">
        <div className="rb-stage">
          <div className="rb-stage__fx" aria-hidden="true">
            <span className="rb-stage__light" style={{ '--i': 0 } as CSSVars} />
            <span className="rb-stage__light" style={{ '--i': 1 } as CSSVars} />
            <span className="rb-stage__light" style={{ '--i': 2 } as CSSVars} />
            <span className="rb-stage__riser" />
          </div>
          {slots.map(renderSlot)}
          <div className="rb-stage__edge" aria-hidden="true">
            <span>客席</span>
            <span className="rb-stage__edge-en">Audience</span>
          </div>
        </div>
        {!readOnly && (
          <Card eyebrow="Backstage" title="控えのメンバー" actions={<span className="rb-mono rb-muted">ドラッグで配置</span>}>
            <ul className="rb-bench">
              {members.map((mm, i) => {
                const where = slotOf(mm.id)
                return (
                  <li
                    key={mm.id}
                    className={cx('rb-bench__item', dragging === mm.id && 'is-dragging')}
                    style={{ '--i': i } as CSSVars}
                    draggable={!busy}
                    onDragStart={dragStart({ member: mm.id })}
                    onDragEnd={() => setDragging(null)}
                  >
                    <Icon name="grip" size={16} className="rb-bench__grip" />
                    <Avatar name={mm.name} size={28} />
                    <span className="rb-bench__name">
                      {mm.name}
                      {mm.regular && <span className="rb-chip-mini rb-bench__reg">編成</span>}
                    </span>
                    <span className="rb-bench__roles">
                      {mm.parts.map((r) => (
                        <Icon key={r} name={ROLE_META[r].icon} size={14} title={ROLE_META[r].long} style={{ color: `var(--role-${r})` }} />
                      ))}
                    </span>
                    {where.length > 0 && <span className="rb-bench__slot">{where.join(', ')}</span>}
                  </li>
                )
              })}
            </ul>
          </Card>
        )}
      </div>

      <div className="rb-assign__side">
        {!readOnly && (
          <Card eyebrow="Rules" title="割り振りルール">
            <div className="rb-assign__rules">
              <Toggle
                checked={rules.preferBand}
                onChange={(v) => setRules((r) => ({ ...r, preferBand: v }))}
                label="バンドの編成を優先"
                description="バンドに登録されたメンバーを、そのパートの枠に入れます"
              />
              <Toggle
                checked={rules.preferRole}
                onChange={(v) => setRules((r) => ({ ...r, preferRole: v }))}
                label="担当パートを優先"
                description="メンバーの登録パートに合う枠から埋めます"
              />
              <Toggle
                checked={rules.balance}
                onChange={(v) => setRules((r) => ({ ...r, balance: v }))}
                label="出演回数を平準化"
                description="今月の出演が少ない人を優先します"
              />
              <Toggle
                checked={rules.allowDouble}
                onChange={(v) => setRules((r) => ({ ...r, allowDouble: v }))}
                label="兼任を許可"
                description="1人が複数の枠に入れるようにします"
              />
            </div>
          </Card>
        )}
        {sideExtra}
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
