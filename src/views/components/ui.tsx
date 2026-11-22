import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { Icon, type IconName } from './Icon'

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ')

// ---------------- Button ----------------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md'
  icon?: IconName
  loading?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span className="spinner" aria-hidden="true" /> : icon && <Icon name={icon} size={size === 'sm' ? 15 : 17} />}
      {children}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName
  label: string
  tone?: 'default' | 'danger' | 'accent'
}

export function IconButton({ icon, label, tone = 'default', className, type = 'button', ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      className={cx('icon-btn', tone !== 'default' && `icon-btn-${tone}`, className)}
      aria-label={label}
      title={label}
      {...props}
    >
      <Icon name={icon} size={16} />
    </button>
  )
}

// ---------------- 表示系 ----------------

export type Tone = 'neutral' | 'accent' | 'good' | 'warn' | 'danger' | 'info'

export function Badge({ tone = 'neutral', children, icon }: { tone?: Tone; children: ReactNode; icon?: IconName }) {
  return (
    <span className={`badge badge-${tone}`}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  )
}

export function Card({
  title,
  actions,
  children,
  className,
  padded = true,
}: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  padded?: boolean
}) {
  return (
    <section className={cx('card', className)}>
      {(title || actions) && (
        <header className="card-header">
          {title && <h2 className="card-title">{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      <div className={cx(padded && 'card-body')}>{children}</div>
    </section>
  )
}

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  back?: { to: string; label: string }
}) {
  return (
    <header className="page-header">
      <div className="page-header-text">
        {back && (
          <a className="back-link" href={`#${back.to}`}>
            <Icon name="back" size={14} />
            {back.label}
          </a>
        )}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

export function EmptyState({ icon = 'sparkle', title, children }: { icon?: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <p className="empty-title">{title}</p>
      {children && <div className="empty-body">{children}</div>}
    </div>
  )
}

export function StatTile({ label, value, sub, icon }: { label: string; value: ReactNode; sub?: ReactNode; icon: IconName }) {
  return (
    <div className="stat">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <span className="stat-icon">
          <Icon name={icon} size={16} />
        </span>
      </div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

/** 充足率メーター（単一系列なので色は1色、数値はテキスト色で併記） */
export function Meter({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100)
  const done = max > 0 && value >= max
  return (
    <div className="meter" title={label ?? `${value} / ${max}`}>
      <div className="meter-track" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
        <div className={cx('meter-fill', done && 'meter-fill-done')} style={{ width: `${pct}%` }} />
      </div>
      <span className="meter-text">
        {max === 0 ? '—' : `${value}/${max}`}
      </span>
    </div>
  )
}

export function Alert({ tone = 'info', children, icon = 'alert' }: { tone?: Tone; children: ReactNode; icon?: IconName }) {
  return (
    <div className={`alert alert-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={icon} size={16} />
      <div>{children}</div>
    </div>
  )
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: string; count?: number }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={t.value === value}
          className={cx('tab', t.value === value && 'tab-active')}
          onClick={() => onChange(t.value)}
        >
          {t.label}
          {t.count !== undefined && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initial = name.trim().charAt(0) || '?'
  // 名前から安定した色相を決める（識別用の装飾。名前テキストを必ず併記する）
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  const hue = hash % 360
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.42, ['--avatar-hue' as string]: hue }}
      aria-hidden="true"
    >
      {initial}
    </span>
  )
}

// ---------------- フォーム ----------------

interface FieldProps {
  label: string
  hint?: ReactNode
  error?: string | null
  required?: boolean
  children: (id: string) => ReactNode
  className?: string
}

export function Field({ label, hint, error, required, children, className }: FieldProps) {
  const id = useId()
  return (
    <div className={cx('field', className)}>
      <label htmlFor={id} className="field-label">
        {label}
        {required && <span className="required">必須</span>}
      </label>
      {children(id)}
      {error ? <p className="field-error">{error}</p> : hint && <p className="field-hint">{hint}</p>}
    </div>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx('input', props.className)} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx('input', 'select', props.className)} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cx('input', 'textarea', props.className)} />
}

export function Checkbox({
  checked,
  onChange,
  children,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <label className={cx('checkbox', disabled && 'checkbox-disabled')}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  )
}

// ---------------- Modal ----------------

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  onSubmit?: () => void
  size?: 'sm' | 'md' | 'lg'
}

/** マウント中は開いているモーダル。表示するかどうかは親が条件レンダリングで決める */
export function Modal({ title, onClose, children, footer, onSubmit, size = 'md' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => dialog?.close()
  }, [])

  const content = (
    <>
      <header className="modal-header">
        <h2 id={titleId}>{title}</h2>
        <IconButton icon="x" label="閉じる" onClick={onClose} />
      </header>
      <div className="modal-body">{children}</div>
      {footer && <footer className="modal-footer">{footer}</footer>}
    </>
  )

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit?.()
  }

  return (
    <dialog
      ref={ref}
      className={`modal modal-${size}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onMouseDown={(e) => {
        // 背景（ダイアログ外）のクリックで閉じる
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {onSubmit ? (
        <form className="modal-inner" onSubmit={handleSubmit} noValidate>
          {content}
        </form>
      ) : (
        <div className="modal-inner">{content}</div>
      )}
    </dialog>
  )
}
