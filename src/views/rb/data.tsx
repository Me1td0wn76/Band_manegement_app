/**
 * Riffboard のデータ表示コンポーネント（EventTable / MemberCard）。
 */
import { useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import type { DisplayStatus } from '../../controllers/selectors'
import { Avatar, Button, DateStub, EmptyState, Icon, IconButton, StatusBadge, VuMeter, cx, prefersReduced, type CSSVars } from './core'

/* ---------------------------------------------------------------- EventTable */
export interface EventRow {
  id: string
  date: string
  time: string | null
  /** "18:00–21:15" */
  range: string
  title: string
  venue: string | null
  acts: string[]
  status: DisplayStatus
  capacity: number | null
  sold: number
  /** 裏方の割り当て状況 */
  staff: { filled: number; total: number; issues: number }
}

type SortKey = 'date' | 'title' | 'sold' | 'status' | 'staff'

export function EventTable({
  events,
  onEdit,
  onDelete,
  onRowClick,
  sortable = true,
  emptyTitle = 'イベントがまだありません',
  emptyMessage = '「イベントを登録」から最初のライブを追加しましょう。',
  emptyAction,
  className,
}: {
  events: EventRow[]
  onEdit?: (ev: EventRow) => void
  onDelete?: (ev: EventRow) => void
  onRowClick?: (ev: EventRow) => void
  sortable?: boolean
  emptyTitle?: string
  emptyMessage?: string
  emptyAction?: ReactNode
  className?: string
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: 1 })
  const val = (e: EventRow, k: SortKey): string | number =>
    k === 'date'
      ? `${e.date} ${e.time ?? ''}`
      : k === 'sold'
        ? e.capacity
          ? e.sold / e.capacity
          : -1
        : k === 'staff'
          ? e.staff.total
            ? e.staff.filled / e.staff.total
            : -1
          : e[k]
  const rows = sortable
    ? events.slice().sort((a, b) => {
        const av = val(a, sort.key)
        const bv = val(b, sort.key)
        return av > bv ? sort.dir : av < bv ? -sort.dir : 0
      })
    : events
  if (!rows.length) return <EmptyState icon="calendar" title={emptyTitle} message={emptyMessage} action={emptyAction} />
  const th = (key: SortKey, label: string) => {
    const on = sort.key === key
    if (!sortable) return <th scope="col">{label}</th>
    return (
      <th scope="col" aria-sort={on ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className="rb-th" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
          {label}
          <Icon name="chevron-down" size={14} strokeWidth={2.2} className={cx('rb-th__arrow', on && 'is-on', on && sort.dir < 0 && 'is-desc')} />
        </button>
      </th>
    )
  }
  return (
    <div className={cx('rb-table-wrap', className)}>
      <table className="rb-table">
        <thead>
          <tr>
            {th('date', '日付')}
            {th('title', 'イベント')}
            <th scope="col">会場</th>
            <th scope="col">出演</th>
            {th('staff', '裏方')}
            {th('sold', '集客')}
            {th('status', '状態')}
            {(onEdit || onDelete) && (
              <th scope="col" className="rb-table__actions">
                <span className="rb-sr">操作</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((ev, i) => (
            <tr
              key={ev.id}
              className={cx('rb-row', ev.status === 'live' && 'is-live', onRowClick && 'is-clickable')}
              style={{ '--i': i } as CSSVars}
              onClick={onRowClick ? () => onRowClick(ev) : undefined}
            >
              <td>
                <DateStub date={ev.date} time={ev.time} />
              </td>
              <td>
                <div className="rb-cell-title">{ev.title}</div>
                <div className="rb-cell-sub">{ev.range}</div>
              </td>
              <td>
                <span className="rb-cell-venue">
                  <Icon name="pin" size={14} />
                  {ev.venue ?? '未定'}
                </span>
              </td>
              <td>
                <div className="rb-cell-bands">
                  {ev.acts.length ? (
                    <>
                      {ev.acts.slice(0, 3).map((b, k) => (
                        <span key={`${b}${k}`} className="rb-chip-mini">
                          {b}
                        </span>
                      ))}
                      {ev.acts.length > 3 && <span className="rb-cell-sub">ほか{ev.acts.length - 3}組</span>}
                    </>
                  ) : (
                    <span className="rb-cell-sub">未定</span>
                  )}
                </div>
              </td>
              <td>
                {ev.staff.total ? (
                  <div className="rb-cap">
                    <VuMeter level={ev.staff.filled / ev.staff.total} segments={10} size="sm" ariaLabel={`${ev.title}の裏方の割り当て`} />
                    <span className="rb-mono">
                      {ev.staff.filled}/{ev.staff.total}
                    </span>
                    {ev.staff.issues > 0 && (
                      <StatusBadge status="conflict" size="sm">
                        要確認 {ev.staff.issues}
                      </StatusBadge>
                    )}
                  </div>
                ) : (
                  <span className="rb-cell-sub">—</span>
                )}
              </td>
              <td>
                {ev.capacity ? (
                  <div className="rb-cap">
                    <VuMeter
                      level={Math.min(1, ev.sold / ev.capacity)}
                      segments={10}
                      size="sm"
                      ariaLabel={`${ev.title}の集客`}
                      live={ev.status === 'live'}
                    />
                    <span className="rb-mono">
                      {ev.sold}/{ev.capacity}
                    </span>
                  </div>
                ) : (
                  <span className="rb-cell-sub">—</span>
                )}
              </td>
              <td>
                <StatusBadge status={ev.status} />
              </td>
              {(onEdit || onDelete) && (
                <td className="rb-table__actions">
                  {onEdit && (
                    <IconButton
                      icon="edit"
                      label={`${ev.title}を編集`}
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        onEdit(ev)
                      }}
                    />
                  )}
                  {onDelete && (
                    <IconButton
                      icon="trash"
                      label={`${ev.title}を削除`}
                      size="sm"
                      variant="danger"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(ev)
                      }}
                    />
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ---------------------------------------------------------------- MemberCard（バックステージパス） */
export interface MemberCardData {
  id: string
  name: string
  kana: string | null
  email: string
  isAdmin: boolean
  invited: boolean
  inactive: boolean
  /** 今月の担当回数 */
  load: number
  /** 次の担当（例："12/02 定期ライブ・照明"） */
  next: string | null
  isMe: boolean
}

export function MemberCard({
  member: m,
  onEdit,
  className,
  style,
}: {
  member: MemberCardData
  onEdit?: (m: MemberCardData) => void
  className?: string
  style?: CSSVars
}) {
  const ref = useRef<HTMLElement>(null)
  const move = (e: PointerEvent<HTMLElement>) => {
    if (prefersReduced() || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    const s = ref.current.style
    s.setProperty('--rx', `${(-y * 7).toFixed(2)}deg`)
    s.setProperty('--ry', `${(x * 9).toFixed(2)}deg`)
    s.setProperty('--mx', `${((x + 0.5) * 100).toFixed(1)}%`)
    s.setProperty('--my', `${((y + 0.5) * 100).toFixed(1)}%`)
  }
  const leave = () => {
    ref.current?.style.setProperty('--rx', '0deg')
    ref.current?.style.setProperty('--ry', '0deg')
  }
  return (
    <article
      ref={ref}
      className={cx('rb-member', m.isAdmin && 'rb-member--admin', m.inactive && 'is-inactive', className)}
      style={style as CSSProperties}
      onPointerMove={move}
      onPointerLeave={leave}
    >
      <span className="rb-member__shine" aria-hidden="true" />
      <span className="rb-member__pass">{m.isAdmin ? 'ALL ACCESS' : m.invited ? 'GUEST' : 'CREW'}</span>
      <div className="rb-member__top">
        <Avatar name={m.name} size={56} online={m.isMe} badge={m.isAdmin ? { icon: 'crown', color: 'var(--amber)' } : undefined} />
        {m.inactive ? (
          <StatusBadge status="inactive" size="sm" />
        ) : m.isAdmin ? (
          <StatusBadge status="admin" size="sm" />
        ) : m.invited ? (
          <StatusBadge status="invited" size="sm" />
        ) : null}
      </div>
      <div>
        <h3 className="rb-member__name">
          {m.name}
          {m.isMe && <span className="rb-me">あなた</span>}
        </h3>
        {m.kana && <div className="rb-member__kana">{m.kana}</div>}
      </div>
      <dl className="rb-member__meta">
        <div>
          <dt>メール</dt>
          <dd className="rb-mono">{m.email || '—'}</dd>
        </div>
        <div>
          <dt>担当</dt>
          <dd className="rb-mono">今月 {m.load} 回</dd>
        </div>
        <div>
          <dt>次回</dt>
          <dd>{m.next ?? '—'}</dd>
        </div>
      </dl>
      {onEdit && (
        <div className="rb-member__actions">
          <Button
            size="sm"
            variant="ghost"
            icon="edit"
            onClick={(e) => {
              e.stopPropagation()
              onEdit(m)
            }}
          >
            編集
          </Button>
        </div>
      )}
    </article>
  )
}
