/**
 * Riffboard デザインシステムのコンポーネント（React + TypeScript 版）。
 * 見た目と動きは styles/riffboard.css、値は styles/tokens.css に従う。
 */
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'
import type { Part } from '../../models/types'
import { ICONS, MARK_PICK, MARK_WAVE, ROLE_META, type IconName } from './icons'

/** CSS カスタムプロパティを style に渡すための型 */
export type CSSVars = CSSProperties & Record<`--${string}`, string | number | undefined>

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ')
export const prefersReduced = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

function hash(s: string): number {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0
  return Math.abs(h)
}

function initials(name: string): string {
  const t = name.trim()
  if (!t) return '?'
  const parts = t.split(/\s+/)
  if (/[^\x00-\x7F]/.test(t[0])) return t[0]
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase()
}

/* ---------------------------------------------------------------- Icon */
interface IconProps {
  name: IconName
  size?: number
  strokeWidth?: number
  title?: string
  className?: string
  style?: CSSProperties
}
export function Icon({ name, size = 20, strokeWidth = 1.75, title, className, style }: IconProps) {
  const body = ICONS[name] ?? ICONS.info
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx('rb-icon', className)}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      style={style}
      // アイコンの中身は icons.ts の固定文字列のみ（ユーザー入力は title だけで、エスケープ済み）
      dangerouslySetInnerHTML={{ __html: (title ? `<title>${esc(title)}</title>` : '') + body }}
    />
  )
}

/* ---------------------------------------------------------------- Logo */
export function Logo({ size = 32, showName = true, className }: { size?: number; showName?: boolean; className?: string }) {
  return (
    <span className={cx('rb-logo', className)} style={{ '--rb-logo-size': `${size}px` } as CSSVars}>
      <svg className="rb-logo__mark" viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
        <path className="rb-logo__pick" d={MARK_PICK} />
        <path className="rb-logo__wave" d={MARK_WAVE} />
      </svg>
      {showName && <span className="rb-logo__name">Riffboard</span>}
    </span>
  )
}

/* ---------------------------------------------------------------- Equalizer */
export function Equalizer({
  bars = 5,
  size = 16,
  playing = true,
  className,
  label,
}: {
  bars?: number
  size?: number
  playing?: boolean
  className?: string
  label?: string
}) {
  return (
    <span
      className={cx('rb-eq', !playing && 'is-paused', className)}
      style={{ '--rb-eq-h': `${size}px` } as CSSVars}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} style={{ '--i': i } as CSSVars} />
      ))}
    </span>
  )
}

/* ---------------------------------------------------------------- Button */
interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  icon?: IconName
  iconRight?: IconName
  loading?: boolean
  block?: boolean
  children?: ReactNode
}
export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  block = false,
  type = 'button',
  className,
  children,
  disabled,
  onPointerDown,
  ...rest
}: ButtonProps) {
  const ref = useRef<HTMLButtonElement>(null)
  const [ripples, setRipples] = useState<{ k: string; x: number; y: number }[]>([])
  const down = (e: PointerEvent<HTMLButtonElement>) => {
    if (!prefersReduced() && ref.current) {
      const r = ref.current.getBoundingClientRect()
      const k = Math.random().toString(36).slice(2)
      setRipples((rs) => rs.concat({ k, x: e.clientX - r.left, y: e.clientY - r.top }))
      setTimeout(() => setRipples((rs) => rs.filter((p) => p.k !== k)), 650)
    }
    onPointerDown?.(e)
  }
  const is = size === 'sm' ? 16 : 18
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx('rb-btn', `rb-btn--${variant}`, `rb-btn--${size}`, block && 'rb-btn--block', loading && 'is-loading', className)}
      onPointerDown={down}
      {...rest}
    >
      <span className="rb-btn__label">
        {loading ? <Equalizer bars={4} size={14} /> : icon ? <Icon name={icon} size={is} /> : null}
        {children != null && <span>{children}</span>}
        {iconRight && !loading && <Icon name={iconRight} size={is} />}
      </span>
      <svg className="rb-btn__string" viewBox="0 0 120 8" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 4 Q15 0 30 4 T60 4 T90 4 T120 4" />
      </svg>
      {ripples.map((p) => (
        <span key={p.k} className="rb-btn__ripple" style={{ left: p.x, top: p.y }} />
      ))}
    </button>
  )
}

/* ---------------------------------------------------------------- IconButton */
interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName
  label: string
  variant?: 'ghost' | 'secondary' | 'primary' | 'danger'
  size?: 'sm' | 'md'
}
export function IconButton({ icon, label, variant = 'ghost', size = 'md', className, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx('rb-iconbtn', `rb-iconbtn--${variant}`, `rb-iconbtn--${size}`, className)}
      {...rest}
    >
      <Icon name={icon} size={size === 'sm' ? 16 : 20} />
    </button>
  )
}

/* ---------------------------------------------------------------- TextField */
interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label?: string
  help?: ReactNode
  error?: string | null
  icon?: IconName
  className?: string
  trailing?: ReactNode
}
export function TextField({ label, type = 'text', help, error, icon, id, required, className, trailing, ...rest }: TextFieldProps) {
  const auto = useId()
  const fid = id ?? `rb${auto.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const [show, setShow] = useState(false)
  const [shaking, setShaking] = useState(false)
  useEffect(() => {
    if (!error) return
    setShaking(true)
    const t = setTimeout(() => setShaking(false), 450)
    return () => clearTimeout(t)
  }, [error])
  const isPw = type === 'password'
  const msg = error || help
  return (
    <div className={cx('rb-field', error && 'is-error', className)}>
      {label && (
        <label className="rb-field__label" htmlFor={fid}>
          {label}
          {required && (
            <span className="rb-field__req" aria-hidden="true">
              必須
            </span>
          )}
        </label>
      )}
      <div className={cx('rb-field__control', shaking && 'is-shaking')}>
        {icon && <Icon name={icon} size={18} className="rb-field__icon" />}
        <input
          id={fid}
          className="rb-field__input"
          type={isPw && show ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={msg ? `${fid}-msg` : undefined}
          required={required}
          {...rest}
        />
        {trailing}
        {isPw && (
          <button
            type="button"
            className="rb-field__reveal"
            aria-label={show ? 'パスワードを隠す' : 'パスワードを表示'}
            aria-pressed={show}
            onClick={() => setShow((s) => !s)}
          >
            <Icon name={show ? 'eye-off' : 'eye'} size={18} />
          </button>
        )}
        <span className="rb-field__string" aria-hidden="true" />
      </div>
      {msg && (
        <p id={`${fid}-msg`} className={cx('rb-field__msg', error && 'is-error')}>
          {error && <Icon name="alert" size={14} />}
          {msg}
        </p>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- Textarea（TextField と同じ見た目の複数行入力） */
export function TextArea({
  label,
  help,
  value,
  onChange,
  rows = 3,
  placeholder,
  className,
}: {
  label: string
  help?: ReactNode
  value: string
  onChange: (v: string) => void
  rows?: number
  placeholder?: string
  className?: string
}) {
  const fid = `rb${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  return (
    <div className={cx('rb-field', className)}>
      <label className="rb-field__label" htmlFor={fid}>
        {label}
      </label>
      <div className="rb-field__control rb-field__control--area">
        <textarea
          id={fid}
          className="rb-field__input rb-field__textarea"
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="rb-field__string" aria-hidden="true" />
      </div>
      {help && <p className="rb-field__msg">{help}</p>}
    </div>
  )
}

/* ---------------------------------------------------------------- Select */
export interface SelectOption {
  value: string
  label: string
}
interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> {
  label?: string
  options: (string | SelectOption)[]
  help?: ReactNode
  className?: string
}
export function Select({ label, options, help, id, required, className, ...rest }: SelectProps) {
  const auto = useId()
  const fid = id ?? `rb${auto.replace(/[^a-zA-Z0-9_-]/g, '')}`
  return (
    <div className={cx('rb-field', className)}>
      {label && (
        <label className="rb-field__label" htmlFor={fid}>
          {label}
          {required && (
            <span className="rb-field__req" aria-hidden="true">
              必須
            </span>
          )}
        </label>
      )}
      <div className="rb-field__control rb-select">
        <select id={fid} className="rb-field__input" required={required} aria-describedby={help ? `${fid}-msg` : undefined} {...rest}>
          {options.map((o) => {
            const v = typeof o === 'string' ? { value: o, label: o } : o
            return (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            )
          })}
        </select>
        <Icon name="chevron-down" size={18} className="rb-select__chev" />
        <span className="rb-field__string" aria-hidden="true" />
      </div>
      {help && (
        <p id={`${fid}-msg`} className="rb-field__msg">
          {help}
        </p>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- Toggle */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
}: {
  checked: boolean
  onChange?: (v: boolean) => void
  label?: string
  description?: ReactNode
  disabled?: boolean
  className?: string
}) {
  const lid = `rb${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const flip = () => {
    if (disabled) return
    onChange?.(!checked)
  }
  return (
    <div className={cx('rb-toggle', checked && 'is-on', disabled && 'is-disabled', className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={label ? lid : undefined}
        disabled={disabled}
        className="rb-toggle__track"
        onClick={flip}
      >
        <span className="rb-toggle__led" />
        <span className="rb-toggle__thumb" />
      </button>
      {(label || description) && (
        <span className="rb-toggle__text" onClick={flip}>
          {label && (
            <span id={lid} className="rb-toggle__label">
              {label}
            </span>
          )}
          {description && <span className="rb-toggle__desc">{description}</span>}
        </span>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- ChipSelect */
export interface ChipOption {
  value: string
  label?: string
  icon?: IconName
  role?: Part
}
export function ChipSelect({
  label,
  options,
  value,
  onChange,
  multiple = true,
  className,
}: {
  label?: string
  options: ChipOption[]
  value: string[]
  onChange: (next: string[]) => void
  multiple?: boolean
  className?: string
}) {
  const toggle = (v: string) => {
    const next = multiple ? (value.includes(v) ? value.filter((x) => x !== v) : value.concat(v)) : value.includes(v) ? [] : [v]
    onChange(next)
  }
  return (
    <div className={cx('rb-field', className)} role="group" aria-label={label}>
      {label && <span className="rb-field__label">{label}</span>}
      <div className="rb-chips">
        {options.map((o, i) => {
          const sel = value.includes(o.value)
          const meta = o.role ? ROLE_META[o.role] : null
          const iconName = o.icon ?? meta?.icon
          return (
            <button
              key={o.value}
              type="button"
              className={cx('rb-chip', o.role && 'rb-chip--role')}
              aria-pressed={sel}
              style={{ '--i': i, '--rb-role': o.role ? `var(--role-${o.role})` : undefined } as CSSVars}
              onClick={() => toggle(o.value)}
            >
              <span className="rb-chip__check">
                <Icon name="check" size={14} strokeWidth={2.4} />
              </span>
              {iconName && <Icon name={iconName} size={16} className="rb-chip__icon" />}
              <span>{o.label ?? meta?.long ?? o.value}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- RoleBadge */
export function RoleBadge({
  role,
  long = false,
  size = 'md',
  className,
}: {
  role: Part
  long?: boolean
  size?: 'sm' | 'md'
  className?: string
}) {
  const m = ROLE_META[role] ?? ROLE_META.gt
  return (
    <span className={cx('rb-role', `rb-role--${size}`, className)} style={{ '--rb-role': `var(--role-${role})` } as CSSVars} title={m.long}>
      <Icon name={m.icon} size={size === 'sm' ? 14 : 16} />
      <span>{long ? m.long : m.short}</span>
    </span>
  )
}

/* ---------------------------------------------------------------- StatusBadge */
export type BadgeStatus =
  | 'draft'
  | 'open'
  | 'confirmed'
  | 'live'
  | 'done'
  | 'cancelled'
  | 'admin'
  | 'member'
  | 'invited'
  | 'conflict'
  | 'inactive'
const STATUS: Record<BadgeStatus, { label: string; tone: string; icon?: IconName; dot?: boolean }> = {
  draft: { label: '下書き', tone: 'neutral', icon: 'edit' },
  open: { label: '募集中', tone: 'amber', dot: true },
  confirmed: { label: '確定', tone: 'cyan', icon: 'check' },
  live: { label: 'LIVE', tone: 'live', dot: true },
  done: { label: '終了', tone: 'neutral', icon: 'check' },
  cancelled: { label: '中止', tone: 'red', icon: 'x' },
  admin: { label: '管理者', tone: 'amber', icon: 'crown' },
  member: { label: 'メンバー', tone: 'neutral', icon: 'users' },
  invited: { label: '招待中', tone: 'neutral', icon: 'mail' },
  conflict: { label: '重複', tone: 'red', icon: 'alert' },
  inactive: { label: '無効', tone: 'red', icon: 'lock' },
}
export const STATUS_LABEL = (s: BadgeStatus) => STATUS[s].label
export function StatusBadge({
  status = 'draft',
  size = 'md',
  children,
  className,
}: {
  status?: BadgeStatus
  size?: 'sm' | 'md'
  children?: ReactNode
  className?: string
}) {
  const s = STATUS[status] ?? STATUS.draft
  return (
    <span className={cx('rb-status', `rb-status--${s.tone}`, `rb-status--${size}`, className)}>
      {s.dot ? <span className="rb-status__dot" aria-hidden="true" /> : s.icon ? <Icon name={s.icon} size={13} strokeWidth={2.2} /> : null}
      <span>{children ?? s.label}</span>
    </span>
  )
}

/* ---------------------------------------------------------------- Avatar */
const TINTS = ['amber', 'cyan', 'red'] as const
export function Avatar({
  name = '',
  size = 40,
  role,
  online,
  className,
}: {
  name?: string
  size?: number
  role?: Part
  online?: boolean
  className?: string
}) {
  const tint = TINTS[hash(name) % TINTS.length]
  const meta = role ? ROLE_META[role] : null
  return (
    <span className={cx('rb-avatar', `rb-avatar--${tint}`, className)} style={{ '--rb-av': `${size}px` } as CSSVars} title={name}>
      <svg className="rb-avatar__pick" viewBox="0 0 64 64" aria-hidden="true">
        <path d={MARK_PICK} />
      </svg>
      <span className="rb-avatar__txt">{initials(name)}</span>
      {meta && (
        <span className="rb-avatar__role" style={{ '--rb-role': `var(--role-${role})` } as CSSVars}>
          <Icon name={meta.icon} size={Math.max(10, Math.round(size * 0.28))} strokeWidth={2} />
        </span>
      )}
      {online && <span className="rb-avatar__on" role="img" aria-label="オンライン" />}
      <span className="rb-sr">{name}</span>
    </span>
  )
}

/* ---------------------------------------------------------------- Card */
interface CardProps {
  eyebrow?: ReactNode
  title?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  interactive?: boolean
  glow?: boolean
  padded?: boolean
  className?: string
  style?: CSSVars
}
export function Card({ eyebrow, title, actions, children, interactive, glow, padded = true, className, style }: CardProps) {
  return (
    <section className={cx('rb-card', interactive && 'rb-card--interactive', glow && 'rb-card--glow', className)} style={style}>
      {(eyebrow || title || actions) && (
        <header className="rb-card__head">
          <div>
            {eyebrow && <div className="rb-eyebrow">{eyebrow}</div>}
            {title && <h3 className="rb-card__title">{title}</h3>}
          </div>
          {actions && <div className="rb-card__actions">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'rb-card__body' : undefined}>{children}</div>
    </section>
  )
}

/* ---------------------------------------------------------------- VuMeter */
export function VuMeter({
  level = 0.6,
  segments = 12,
  live = false,
  label,
  ariaLabel,
  size = 'md',
  vertical = false,
  className,
}: {
  level?: number
  segments?: number
  live?: boolean
  label?: string
  ariaLabel?: string
  size?: 'sm' | 'md'
  vertical?: boolean
  className?: string
}) {
  const [jitter, setJitter] = useState<{ lv: number; peak: number } | null>(null)
  useEffect(() => {
    if (!live || prefersReduced()) return
    let raf = 0
    let last = 0
    const tick = (t: number) => {
      if (t - last > 95) {
        last = t
        const n = Math.max(0.02, Math.min(1, level + (Math.random() - 0.5) * 0.36))
        setJitter((p) => ({ lv: n, peak: p && p.peak > n ? Math.max(n, p.peak - 0.035) : n }))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [live, level])
  const lv = live && jitter ? jitter.lv : level
  const peak = live && jitter ? jitter.peak : level
  const lit = Math.round(lv * segments)
  const pk = Math.min(segments - 1, Math.max(0, Math.round(peak * segments) - 1))
  return (
    <span
      className={cx('rb-vu', `rb-vu--${size}`, vertical && 'rb-vu--v', className)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(level * 100)}
      aria-label={ariaLabel ?? label ?? 'レベル'}
    >
      {label && <span className="rb-vu__label">{label}</span>}
      <span className="rb-vu__segs">
        {Array.from({ length: segments }, (_, i) => {
          const f = i / segments
          const z = f < 0.6 ? 'low' : f < 0.85 ? 'mid' : 'high'
          return <span key={i} className={cx('rb-vu__seg', `is-${z}`, i < lit && 'is-lit', live && i === pk && 'is-peak')} />
        })}
      </span>
    </span>
  )
}

/* ---------------------------------------------------------------- StatCard */
function useCountUp(target: number, dur = 1400): number {
  const [v, setV] = useState(() => (prefersReduced() ? target : 0))
  useEffect(() => {
    if (prefersReduced()) {
      setV(target)
      return
    }
    let raf = 0
    let t0: number | null = null
    const step = (t: number) => {
      if (t0 == null) t0 = t
      const p = Math.min(1, (t - t0) / dur)
      setV(target * (1 - Math.pow(1 - p, 4)))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, dur])
  return v
}
export function StatCard({
  label,
  sublabel,
  value = 0,
  unit,
  decimals = 0,
  delta,
  deltaLabel = '先月比',
  icon,
  level,
  className,
  style,
}: {
  label: string
  sublabel?: string
  value?: number
  unit?: string
  decimals?: number
  delta?: number | null
  deltaLabel?: string
  icon?: IconName
  level?: number
  className?: string
  style?: CSSVars
}) {
  const v = useCountUp(value)
  return (
    <div className={cx('rb-stat', className)} style={style}>
      <div className="rb-stat__top">
        <span className="rb-eyebrow">{label}</span>
        {icon && (
          <span className="rb-stat__icon">
            <Icon name={icon} size={18} />
          </span>
        )}
      </div>
      <div className="rb-stat__value">
        <span className="rb-numeral">{v.toFixed(decimals)}</span>
        {unit && <span className="rb-stat__unit">{unit}</span>}
      </div>
      {sublabel && <div className="rb-stat__sub">{sublabel}</div>}
      <div className="rb-stat__foot">
        {delta != null && (
          <span className={cx('rb-stat__delta', delta >= 0 ? 'is-up' : 'is-down')}>
            <Icon name="arrow-up" size={14} strokeWidth={2.2} />
            {deltaLabel} {delta >= 0 ? '+' : '−'}
            {Math.abs(delta)}
          </span>
        )}
        {level != null && <VuMeter level={level} segments={14} size="sm" live ariaLabel={`${sublabel ?? label}のレベル`} />}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- Loader */
export function Loader({ label = '読み込み中', size = 72, className }: { label?: string; size?: number; className?: string }) {
  return (
    <div className={cx('rb-loader', className)} role="status" aria-live="polite">
      <span className="rb-loader__deck" style={{ width: size, height: size }}>
        <svg className="rb-loader__disc" viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
          <circle className="rb-loader__vinyl" cx="32" cy="32" r="30" />
          <circle className="rb-loader__groove" cx="32" cy="32" r="25" />
          <circle className="rb-loader__groove" cx="32" cy="32" r="20.5" />
          <circle className="rb-loader__groove" cx="32" cy="32" r="16" />
          <path className="rb-loader__shine" d="M14 20a22 22 0 0 1 12-9" />
          <circle className="rb-loader__label" cx="32" cy="32" r="9" />
          <circle className="rb-loader__hole" cx="32" cy="32" r="1.6" />
        </svg>
        <svg className="rb-loader__arm" viewBox="0 0 40 64" width={size * 0.5} height={size * 0.8} aria-hidden="true">
          <circle cx="30" cy="8" r="5" />
          <path d="M30 8 L30 40 L20 54" />
          <rect x="15" y="51" width="9" height="6" rx="1.5" transform="rotate(-35 19.5 54)" />
        </svg>
      </span>
      <span className="rb-loader__text">
        {label}
        <span className="rb-loader__dots" aria-hidden="true">
          <i>.</i>
          <i>.</i>
          <i>.</i>
        </span>
      </span>
    </div>
  )
}

/* ---------------------------------------------------------------- StringDivider */
export function StringDivider({
  strings = 1,
  height,
  autoPluck = false,
  className,
}: {
  strings?: number
  height?: number
  autoPluck?: boolean
  className?: string
}) {
  const H = height ?? (strings === 1 ? 24 : 18 + strings * 8)
  const ref = useRef<HTMLDivElement>(null)
  const paths = useRef<(SVGPathElement | null)[]>([])
  const st = useRef({ amps: [] as number[], pos: [] as number[], raf: 0, t: 0, lastY: null as number | null })
  const [w, setW] = useState(600)
  const wRef = useRef(w)
  useEffect(() => {
    wRef.current = w
  }, [w])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.getBoundingClientRect().width || 600)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => setW(entries[0].contentRect.width || 600))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const ys = useMemo(
    () => Array.from({ length: strings }, (_, i) => (strings === 1 ? H / 2 : 6 + (i * (H - 12)) / (strings - 1))),
    [strings, H],
  )
  const draw = useCallback(() => {
    const s = st.current
    let alive = false
    s.t += 1
    const W = wRef.current
    paths.current.forEach((p, i) => {
      if (!p) return
      const a = s.amps[i] ?? 0
      const disp = a * Math.sin(s.t * 1.1 + i * 0.7)
      s.amps[i] = a * 0.94
      if (Math.abs(s.amps[i]) > 0.06) alive = true
      const x = (s.pos[i] ?? 0.5) * W
      const y = ys[i]
      p.setAttribute('d', `M0 ${y} Q ${x} ${y + disp * 2} ${W} ${y}`)
      p.classList.toggle('is-ringing', Math.abs(a) > 0.5)
    })
    s.raf = alive ? requestAnimationFrame(draw) : 0
  }, [ys])
  const pluck = useCallback(
    (i: number, pos: number, amp: number) => {
      const s = st.current
      s.amps[i] = Math.max(s.amps[i] ?? 0, amp)
      s.pos[i] = pos
      if (!s.raf) s.raf = requestAnimationFrame(draw)
    },
    [draw],
  )
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (prefersReduced() || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const yy = e.clientY - r.top
    const pos = Math.min(0.92, Math.max(0.08, (e.clientX - r.left) / r.width))
    const s = st.current
    if (s.lastY != null) {
      const lastY = s.lastY
      ys.forEach((y, i) => {
        if ((lastY - y) * (yy - y) <= 0 && lastY !== yy) pluck(i, pos, Math.min(7, 2.5 + Math.abs(yy - lastY) * 0.6))
      })
    } else if (strings === 1) pluck(0, pos, 5)
    s.lastY = yy
  }
  useEffect(() => {
    if (!autoPluck || prefersReduced()) return
    const timers = ys.map((_, i) => setTimeout(() => pluck(i, 0.35 + i * 0.05, 6), 300 + i * 90))
    return () => timers.forEach(clearTimeout)
  }, [autoPluck, ys, pluck])
  useEffect(() => {
    const s = st.current
    return () => cancelAnimationFrame(s.raf)
  }, [])
  return (
    <div
      ref={ref}
      className={cx('rb-strings', className)}
      style={{ height: H }}
      role="separator"
      onPointerMove={onMove}
      onPointerLeave={() => (st.current.lastY = null)}
    >
      <svg width="100%" height={H} viewBox={`0 0 ${w} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        {ys.map((y, i) => (
          <path
            key={i}
            ref={(el) => {
              paths.current[i] = el
            }}
            className="rb-strings__s"
            d={`M0 ${y} Q ${w / 2} ${y} ${w} ${y}`}
            style={{ strokeWidth: strings === 1 ? 1.5 : 0.8 + (strings - 1 - i) * 0.32 }}
          />
        ))}
      </svg>
    </div>
  )
}

/* ---------------------------------------------------------------- Ticker */
export function Ticker({ items = [], label = 'NEXT', speed = 60, className }: { items?: string[]; label?: string; speed?: number; className?: string }) {
  const list = items.length ? items : ['—']
  const reps = Math.max(1, Math.ceil(6 / list.length))
  const group = Array.from({ length: reps }, () => list).flat()
  const chars = group.join('').length
  const dur = Math.max(14, (chars * 14) / (speed / 2))
  return (
    <div className={cx('rb-ticker', className)}>
      <span className="rb-ticker__tag">
        <span className="rb-ticker__led" aria-hidden="true" />
        {label}
      </span>
      <div className="rb-ticker__viewport">
        <span className="rb-sr">{list.join(' / ')}</span>
        <div className="rb-ticker__track" style={{ '--rb-ticker-dur': `${dur}s` } as CSSVars} aria-hidden="true">
          {[0, 1].map((k) => (
            <span key={k} className="rb-ticker__group">
              {group.map((t, i) => (
                <span key={i} className="rb-ticker__item">
                  {t}
                  <svg className="rb-ticker__sep" viewBox="0 0 64 64" width="10" height="10">
                    <path d={MARK_PICK} />
                  </svg>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- Tabs */
export interface TabItem<T extends string> {
  id: T
  label: string
  icon?: IconName
  count?: number
}
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: TabItem<T>[]
  value: T
  onChange: (id: T) => void
  className?: string
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const refs = useRef<Partial<Record<T, HTMLButtonElement | null>>>({})
  const [ind, setInd] = useState<{ left: number; width: number } | null>(null)
  const measure = useCallback(() => {
    const el = refs.current[value]
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth })
  }, [value])
  useLayoutEffect(() => {
    measure()
    if (typeof ResizeObserver === 'undefined' || !wrap.current) return
    const ro = new ResizeObserver(measure)
    ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [measure, tabs.length])
  const onKey = (e: ReactKeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === value)
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
      onChange(n.id)
      refs.current[n.id]?.focus()
    }
  }
  return (
    <div ref={wrap} className={cx('rb-tabs', className)} role="tablist" onKeyDown={onKey}>
      <span className="rb-tabs__ind" style={ind ? { transform: `translateX(${ind.left}px)`, width: ind.width } : { opacity: 0 }} />
      {tabs.map((t) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[t.id] = el
          }}
          type="button"
          role="tab"
          aria-selected={t.id === value}
          tabIndex={t.id === value ? 0 : -1}
          className={cx('rb-tab', t.id === value && 'is-active')}
          onClick={() => onChange(t.id)}
        >
          {t.icon && <Icon name={t.icon} size={16} />}
          <span>{t.label}</span>
          {t.count != null && <span className="rb-tab__count">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

/* ---------------------------------------------------------------- Topbar */
export function Topbar({
  eyebrow,
  title = '',
  subtitle,
  actions,
  ticker,
  className,
}: {
  eyebrow?: ReactNode
  title?: string
  subtitle?: ReactNode
  actions?: ReactNode
  ticker?: string[]
  className?: string
}) {
  const chars = Array.from(title)
  return (
    <header className={cx('rb-topbar', className)}>
      {ticker && <Ticker items={ticker} />}
      <div className="rb-topbar__row">
        <div>
          {eyebrow && <div className="rb-eyebrow">{eyebrow}</div>}
          <h1 className="rb-topbar__title" aria-label={title}>
            {chars.map((c, i) => (
              <span key={i} className="rb-ch" style={{ '--i': i } as CSSVars} aria-hidden="true">
                {c === ' ' ? ' ' : c}
              </span>
            ))}
          </h1>
          {subtitle && <p className="rb-topbar__sub">{subtitle}</p>}
        </div>
        {actions && <div className="rb-topbar__actions">{actions}</div>}
      </div>
    </header>
  )
}

/* ---------------------------------------------------------------- Modal */
/** マウント中は開いているモーダル。表示するかどうかは親が条件レンダリングで決める */
export function Modal({
  title,
  eyebrow,
  children,
  footer,
  onClose,
  size = 'md',
  className,
}: {
  title: string
  eyebrow?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  onClose: () => void
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current()
    window.addEventListener('keydown', k)
    const previous = document.activeElement as HTMLElement | null
    panel.current?.focus({ preventScroll: true })
    return () => {
      window.removeEventListener('keydown', k)
      previous?.focus?.({ preventScroll: true })
    }
  }, [])
  return (
    <div className={cx('rb-modal', className)} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} tabIndex={-1} className={cx('rb-modal__panel', `rb-modal__panel--${size}`)} role="dialog" aria-modal="true" aria-label={title}>
        <header className="rb-modal__head">
          <div>
            {eyebrow && <div className="rb-eyebrow">{eyebrow}</div>}
            <h2 className="rb-modal__title">{title}</h2>
          </div>
          <IconButton icon="x" label="閉じる" onClick={onClose} />
        </header>
        <div className="rb-modal__body">{children}</div>
        {footer && <footer className="rb-modal__foot">{footer}</footer>}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- Toast */
const TOAST_ICON: Record<string, IconName> = { success: 'check', error: 'alert', info: 'info', live: 'bolt' }
export function Toast({
  tone = 'info',
  title,
  message,
  onClose,
  duration = 5000,
  className,
  style,
}: {
  tone?: 'success' | 'error' | 'info' | 'live'
  title?: ReactNode
  message?: ReactNode
  onClose?: () => void
  duration?: number
  className?: string
  style?: CSSVars
}) {
  return (
    <div className={cx('rb-toast', `rb-toast--${tone}`, className)} role={tone === 'error' ? 'alert' : 'status'} style={style}>
      <span className="rb-toast__icon">
        <Icon name={TOAST_ICON[tone] ?? 'info'} size={16} strokeWidth={2.2} />
      </span>
      <div className="rb-toast__text">
        {title && <div className="rb-toast__title">{title}</div>}
        {message && <div className="rb-toast__msg">{message}</div>}
      </div>
      {onClose && <IconButton icon="x" label="閉じる" size="sm" onClick={onClose} />}
      {duration > 0 && <span className="rb-toast__timer" style={{ '--rb-toast-dur': `${duration}ms` } as CSSVars} />}
    </div>
  )
}

/* ---------------------------------------------------------------- EmptyState */
export function EmptyState({
  title = 'まだ何もありません',
  message,
  action,
  icon = 'cable',
  className,
}: {
  title?: string
  message?: ReactNode
  action?: ReactNode
  icon?: IconName
  className?: string
}) {
  return (
    <div className={cx('rb-empty', className)}>
      <span className="rb-empty__icon">
        <Icon name={icon} size={30} />
      </span>
      <svg className="rb-empty__line" viewBox="0 0 160 24" aria-hidden="true">
        <path d="M0 12 H62 L68 4 L74 20 L80 8 L86 14 L90 12 H160" />
      </svg>
      <h3 className="rb-empty__title">{title}</h3>
      {message && <p className="rb-empty__msg">{message}</p>}
      {action}
    </div>
  )
}

/* ---------------------------------------------------------------- StageBackdrop */
export function StageBackdrop({
  children,
  beams = 3,
  dust = 22,
  className,
  style,
}: {
  children?: ReactNode
  beams?: number
  dust?: number
  className?: string
  style?: CSSVars
}) {
  const motes = useMemo(
    () =>
      Array.from({ length: dust }, (_, i) => ({
        x: `${(i * 37) % 100}%`,
        y: `${(i * 53) % 40}%`,
        d: `${6 + ((i * 7) % 9)}s`,
        dl: `${-((i * 11) % 13)}s`,
        s: 2 + (i % 3),
      })),
    [dust],
  )
  return (
    <div className={cx('rb-stagebg', className)} style={style}>
      <div className="rb-stagebg__fx" aria-hidden="true">
        <div className="rb-stagebg__haze" />
        {Array.from({ length: beams }, (_, i) => (
          <span key={i} className="rb-beam" style={{ '--i': i, '--n': beams } as CSSVars} />
        ))}
        <div className="rb-stagebg__dust">
          {motes.map((m, i) => (
            <span key={i} style={{ left: m.x, bottom: m.y, width: m.s, height: m.s, animationDuration: m.d, animationDelay: m.dl }} />
          ))}
        </div>
        <div className="rb-stagebg__floor" />
      </div>
      <div className="rb-stagebg__content">{children}</div>
    </div>
  )
}

/* ---------------------------------------------------------------- DateStub（チケットの半券） */
const WEEK = '日月火水木金土'
export function DateStub({ date, time }: { date: string; time?: string | null }) {
  const d = new Date(`${date}T00:00:00`)
  const ok = !Number.isNaN(d.getTime())
  return (
    <span className="rb-datestub">
      <span className="rb-datestub__m">{ok ? `${String(d.getMonth() + 1).padStart(2, '0')}月` : '--'}</span>
      <span className="rb-datestub__d">{ok ? d.getDate() : '?'}</span>
      <span className="rb-datestub__w">
        {ok ? WEEK[d.getDay()] : ''}
        {time ? ` ${time}` : ''}
      </span>
    </span>
  )
}
