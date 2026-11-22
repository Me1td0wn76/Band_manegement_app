import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../controllers/AuthController'
import { useData } from '../controllers/DataController'
import { assignTodoCount, todayISO, upcomingEvents } from '../controllers/selectors'
import { LocalRepository, repository } from '../models/repositories'
import { useConfirm } from './feedback'
import { Avatar, Icon, IconButton, Logo, StatusBadge, Topbar, cx, type CSSVars } from './rb/core'
import type { IconName } from './rb/icons'
import { Link, navigate, useLocation } from './router'
import { useTheme } from './theme'

interface NavItem {
  to: string
  label: string
  icon: IconName
  adminOnly?: boolean
  badge?: number | null
}

export function AppShell({ children }: { children: ReactNode }) {
  const { snapshot, me, isAdmin, reload } = useData()
  const { signOut } = useAuth()
  const confirm = useConfirm()
  const { path } = useLocation()
  const [theme, setTheme] = useTheme()
  const [open, setOpen] = useState(false)
  const nav = useRef<HTMLElement>(null)
  const [ind, setInd] = useState<{ top: number; height: number } | null>(null)

  const today = todayISO()
  const soon = upcomingEvents(snapshot, today).filter((e) => e.date <= addDays(today, 7)).length
  const todo = isAdmin ? assignTodoCount(snapshot, today) : 0

  const items: NavItem[] = [
    { to: '/dashboard', label: 'ダッシュボード', icon: 'dashboard' },
    { to: '/events', label: 'イベント', icon: 'calendar', badge: soon || null },
    { to: '/bands', label: 'バンド', icon: 'amp' },
    { to: '/members', label: 'メンバー', icon: 'users' },
    { to: '/assign', label: '役割の割り振り', icon: 'shuffle', adminOnly: true, badge: todo || null },
    { to: '/permissions', label: '権限設定', icon: 'crown', adminOnly: true },
  ]
  // 管理者だけの項目はメンバーには表示しない（無効表示ではなく非表示）
  const visible = items.filter((i) => !i.adminOnly || isAdmin)
  const main = visible.filter((i) => !i.adminOnly)
  const admin = visible.filter((i) => i.adminOnly)
  const active = visible.find((i) => path === i.to || path.startsWith(`${i.to}/`))?.to

  // ナビの指標をアクティブな項目へ滑らせる
  const measure = useCallback(() => {
    const el = nav.current?.querySelector<HTMLElement>(`[data-nav="${active}"]`)
    setInd(el ? { top: el.offsetTop, height: el.offsetHeight } : null)
  }, [active])
  useLayoutEffect(() => {
    measure()
    const t = setTimeout(measure, 300)
    return () => clearTimeout(t)
  }, [measure, visible.length])

  const close = () => setOpen(false)
  const logout = () => {
    void signOut().then(() => navigate('/', { replace: true }))
  }
  const resetDemo = async () => {
    const ok = await confirm({
      title: 'デモデータを初期化',
      message: 'このブラウザに保存されたデモデータ（イベント・メンバー・割り振り）がすべて初期状態に戻ります。この操作は元に戻せません。',
      confirmLabel: '初期化する',
      danger: true,
    })
    if (!ok || !(repository instanceof LocalRepository)) return
    await repository.resetDemo()
    await reload()
  }

  const item = (it: NavItem, i: number) => (
    <Link
      key={it.to}
      to={it.to}
      data-nav={it.to}
      className="rb-nav"
      aria-current={it.to === active ? 'page' : undefined}
      style={{ '--i': i } as CSSVars}
      onClick={close}
    >
      <Icon name={it.icon} size={18} />
      <span className="rb-nav__label">{it.label}</span>
      {it.badge != null && <span className="rb-nav__badge">{it.badge}</span>}
    </Link>
  )

  return (
    <div className="rb-shell">
      <header className="app-mobilebar">
        <IconButton icon="menu" label="メニューを開く" onClick={() => setOpen(true)} />
        <Logo size={26} />
      </header>
      <div className={cx('app-backdrop', open && 'is-open')} onClick={close} aria-hidden="true" />

      <aside className={cx('rb-sidebar', 'app-sidebar', open && 'is-open')}>
        <div className="rb-sidebar__brand">
          <Link to="/dashboard" onClick={close} aria-label="ダッシュボードへ">
            <Logo size={30} />
          </Link>
        </div>
        <nav ref={nav} className="rb-sidebar__nav" aria-label="メインメニュー">
          <span
            className="rb-sidebar__ind"
            style={ind ? { transform: `translateY(${ind.top}px)`, height: ind.height } : { opacity: 0 }}
          />
          <div className="rb-eyebrow rb-sidebar__sec">Menu</div>
          {main.map(item)}
          {admin.length > 0 && (
            <div className="rb-eyebrow rb-sidebar__sec">
              <Icon name="crown" size={12} strokeWidth={2.2} />
              Admin
            </div>
          )}
          {admin.map((it, i) => item(it, main.length + i))}
        </nav>

        {repository.mode === 'demo' && (
          <div className="app-demo">
            <span className="rb-eyebrow">
              <Icon name="info" size={12} />
              Demo
            </span>
            <p className="rb-small rb-muted">Supabase が未設定のため、このブラウザ内のデモデータで動いています。</p>
            <button type="button" className="app-link" onClick={resetDemo}>
              デモデータを初期化
            </button>
          </div>
        )}

        <button
          type="button"
          className="app-theme"
          onClick={() => setTheme(theme === 'stage' ? 'rehearsal' : 'stage')}
          aria-label={theme === 'stage' ? '昼のスタジオ表示に切り替える' : '夜のライブハウス表示に切り替える'}
        >
          <Icon name="knob" size={16} />
          <span className="rb-eyebrow">{theme === 'stage' ? 'Stage' : 'Rehearsal'}</span>
          <span className="rb-small rb-muted">{theme === 'stage' ? '夜のライブハウス' : '昼のスタジオ'}</span>
        </button>

        <div className="rb-sidebar__user">
          <Avatar name={me.name} size={36} role={me.parts[0]} online />
          <div className="rb-sidebar__who">
            <Link to="/account" className="rb-sidebar__name app-userlink" onClick={close}>
              {me.name}
            </Link>
            <StatusBadge status={isAdmin ? 'admin' : 'member'} size="sm" />
          </div>
          <IconButton icon="logout" label="ログアウト" size="sm" onClick={logout} />
        </div>
      </aside>

      <main className="rb-shell__main" id="main">
        {children}
      </main>
    </div>
  )
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** 各画面の見出し（Topbar）と本文 */
export function Page({
  eyebrow,
  title,
  subtitle,
  actions,
  ticker,
  children,
}: {
  eyebrow?: ReactNode
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  ticker?: string[]
  children: ReactNode
}) {
  return (
    <>
      <Topbar eyebrow={eyebrow} title={title} subtitle={subtitle} actions={actions} ticker={ticker} />
      <div className="rb-shell__content">{children}</div>
    </>
  )
}
