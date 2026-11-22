import { useState, type ReactNode } from 'react'
import { useAuth } from '../../controllers/AuthController'
import { useData } from '../../controllers/DataController'
import { LocalRepository, repository } from '../../models/repositories'
import { Icon, Logo, type IconName } from '../components/Icon'
import { useConfirm } from '../components/Feedback'
import { Avatar, Badge } from '../components/ui'
import { APP_ROLE } from '../format'
import { Link, navigate, useLocation } from '../router'

interface NavItem {
  to: string
  label: string
  icon: IconName
  adminOnly?: boolean
}

const NAV: NavItem[] = [
  { to: '/dashboard', label: 'ダッシュボード', icon: 'dashboard', adminOnly: true },
  { to: '/me', label: 'マイページ', icon: 'user' },
  { to: '/events', label: 'イベント', icon: 'calendar' },
  { to: '/members', label: 'メンバー', icon: 'users' },
  { to: '/bands', label: 'バンド', icon: 'music' },
  { to: '/assign', label: '役割の割り振り', icon: 'shuffle', adminOnly: true },
]

export function AppShell({ children }: { children: ReactNode }) {
  const { me, isAdmin, reload } = useData()
  const { signOut } = useAuth()
  const confirm = useConfirm()
  const { path } = useLocation()
  const [open, setOpen] = useState(false)
  // 画面遷移したらモバイルのメニューを閉じる
  const close = () => setOpen(false)
  // 次にログインした人が前の人の画面から始まらないよう、トップに戻してからログアウト
  const logout = () => {
    void signOut().then(() => navigate('/', { replace: true }))
  }

  const items = NAV.filter((n) => !n.adminOnly || isAdmin)

  const resetDemo = async () => {
    const ok = await confirm({
      title: 'デモデータを初期化',
      message: 'このブラウザに保存されたデモデータをすべて初期状態に戻します。よろしいですか？',
      confirmLabel: '初期化する',
      danger: true,
    })
    if (!ok || !(repository instanceof LocalRepository)) return
    await repository.resetDemo()
    await reload()
  }

  return (
    <div className="app">
      <header className="topbar">
        <button type="button" className="icon-btn topbar-menu" aria-label="メニューを開く" onClick={() => setOpen(true)}>
          <Icon name="menu" size={20} />
        </button>
        <span className="brand-mini">
          <Logo size={24} />
          Band Manager
        </span>
      </header>

      <div className={`sidebar-backdrop${open ? ' is-open' : ''}`} onClick={close} />

      <aside className={`sidebar${open ? ' is-open' : ''}`} aria-label="メインメニュー">
        <div className="brand">
          <Logo />
          <div>
            <div className="brand-name">Band Manager</div>
            <div className="brand-sub">バンド・イベント管理</div>
          </div>
        </div>

        <nav className="nav">
          {items.map((item) => {
            const active = path === item.to || path.startsWith(`${item.to}/`)
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={close}
                className={`nav-item${active ? ' is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon name={item.icon} size={18} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          {repository.mode === 'demo' && (
            <div className="demo-box">
              <span className="demo-label">デモモード</span>
              <p>データはこのブラウザにのみ保存されます。</p>
              <button type="button" className="demo-reset" onClick={resetDemo}>
                デモデータを初期化
              </button>
            </div>
          )}
          <Link to="/account" className="user-card" onClick={close}>
            <Avatar name={me.name} size={34} />
            <span className="user-meta">
              <span className="user-name">{me.name}</span>
              <Badge tone={APP_ROLE[me.appRole].tone}>{APP_ROLE[me.appRole].label}</Badge>
            </span>
          </Link>
          <div className="sidebar-links">
            <Link to="/account" className="sidebar-link" onClick={close}>
              <Icon name="key" size={15} />
              アカウント
            </Link>
            <button type="button" className="sidebar-link" onClick={logout}>
              <Icon name="logout" size={15} />
              ログアウト
            </button>
          </div>
        </div>
      </aside>

      <main className="main" id="main">
        {children}
      </main>
    </div>
  )
}
