/**
 * Riffboard のデータ表示コンポーネント（EventTable / MemberCard / BandCard）。
 */
import { useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import type { Part } from '../../models/types'
import type { DisplayStatus } from '../../controllers/selectors'
import { Avatar, Button, DateStub, EmptyState, Icon, IconButton, RoleBadge, StatusBadge, VuMeter, cx, prefersReduced, type CSSVars } from './core'

/* ---------------------------------------------------------------- EventTable */
export interface EventRow {
  id: string
  date: string
  time: string | null
  openTime: string | null
  title: string
  venue: string | null
  bands: string[]
  status: DisplayStatus
  capacity: number | null
  sold: number
}

type SortKey = 'date' | 'title' | 'sold' | 'status'

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
    k === 'date' ? `${e.date} ${e.time ?? ''}` : k === 'sold' ? (e.capacity ? e.sold / e.capacity : -1) : e[k] ?? ''
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
            <th scope="col">出演バンド</th>
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
                <div className="rb-cell-sub">{ev.openTime ? `開場 ${ev.openTime}` : '開場 —'}</div>
              </td>
              <td>
                <span className="rb-cell-venue">
                  <Icon name="pin" size={14} />
                  {ev.venue ?? '未定'}
                </span>
              </td>
              <td>
                <div className="rb-cell-bands">
                  {ev.bands.length ? (
                    ev.bands.map((b) => (
                      <span key={b} className="rb-chip-mini">
                        {b}
                      </span>
                    ))
                  ) : (
                    <span className="rb-cell-sub">—</span>
                  )}
                </div>
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

/* ---------------------------------------------------------------- MemberCard */
export interface MemberCardData {
  id: string
  name: string
  kana: string | null
  email: string
  parts: Part[]
  bands: string[]
  isAdmin: boolean
  invited: boolean
  inactive: boolean
  load: number
  isMe: boolean
}

export function MemberCard({
  member: m,
  onEdit,
  onClick,
  className,
  style,
}: {
  member: MemberCardData
  onEdit?: (m: MemberCardData) => void
  onClick?: (m: MemberCardData) => void
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
      className={cx('rb-member', m.isAdmin && 'rb-member--admin', onClick && 'is-clickable', m.inactive && 'is-inactive', className)}
      style={style as CSSProperties}
      onPointerMove={move}
      onPointerLeave={leave}
      onClick={onClick ? () => onClick(m) : undefined}
    >
      <span className="rb-member__shine" aria-hidden="true" />
      <span className="rb-member__pass">{m.isAdmin ? 'ALL ACCESS' : m.invited ? 'GUEST' : 'BACKSTAGE'}</span>
      <div className="rb-member__top">
        <Avatar name={m.name} size={56} role={m.parts[0]} online={m.isMe} />
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
      <div className="rb-member__roles">
        {m.parts.map((r) => (
          <RoleBadge key={r} role={r} size="sm" long />
        ))}
      </div>
      <dl className="rb-member__meta">
        <div>
          <dt>バンド</dt>
          <dd>{m.bands.length ? m.bands.join(' / ') : '—'}</dd>
        </div>
        <div>
          <dt>メール</dt>
          <dd className="rb-mono">{m.email || '—'}</dd>
        </div>
        <div>
          <dt>出演</dt>
          <dd className="rb-mono">今月 {m.load} 回</dd>
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

/* ---------------------------------------------------------------- BandCard */
const KNOBS = ['GAIN', 'BASS', 'MID', 'TREB', 'VOL']

/** バンド名から決まるノブの角度（装飾） */
function knobsFor(name: string): number[] {
  let h = 7
  for (const c of name) h = (h * 33 + c.charCodeAt(0)) >>> 0
  return KNOBS.map((_, i) => 40 + ((h >> (i * 5)) % 55))
}

export interface BandCardData {
  id: string
  name: string
  genre: string | null
  active: boolean
  members: { id: string; name: string; part: Part }[]
  nextEvent: string | null
}

export function BandCard({
  band: b,
  onEdit,
  onClick,
  className,
  style,
}: {
  band: BandCardData
  onEdit?: (b: BandCardData) => void
  onClick?: (b: BandCardData) => void
  className?: string
  style?: CSSVars
}) {
  const knobs = knobsFor(b.name)
  return (
    <article className={cx('rb-band', onClick && 'is-clickable', className)} style={style as CSSProperties} onClick={onClick ? () => onClick(b) : undefined}>
      <div className="rb-band__grille">
        <span className="rb-band__plate">{b.name}</span>
      </div>
      <div className="rb-band__panel" aria-hidden="true">
        <div className="rb-band__knobs">
          {KNOBS.map((k, i) => (
            <span key={k} className="rb-knob" style={{ '--i': i, '--rot': knobs[i] } as CSSVars}>
              <span className="rb-knob__cap" />
              <span className="rb-knob__lbl">{k}</span>
            </span>
          ))}
        </div>
        <span className={cx('rb-band__power', !b.active && 'is-off')} />
      </div>
      <div className="rb-band__body">
        <div className="rb-band__meta">
          <span className="rb-eyebrow">{b.genre || 'BAND'}</span>
          <span className="rb-mono">{b.members.length}人</span>
        </div>
        {b.members.length ? (
          <ul className="rb-band__members">
            {b.members.map((m, i) => (
              <li key={m.id} style={{ '--i': i } as CSSVars}>
                <Avatar name={m.name} size={28} />
                <span className="rb-band__mname">{m.name}</span>
                <RoleBadge role={m.part} size="sm" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rb-muted rb-small">メンバーが未登録です</p>
        )}
        <div className="rb-band__next">
          {b.nextEvent ? (
            <span className="rb-band__nexttext">
              <Icon name="calendar" size={16} />
              次回 {b.nextEvent}
            </span>
          ) : (
            <span className="rb-band__nexttext rb-muted">次回の出演予定はありません</span>
          )}
          {onEdit && (
            <IconButton
              icon="edit"
              label={`${b.name}を編集`}
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onEdit(b)
              }}
            />
          )}
        </div>
      </div>
    </article>
  )
}
