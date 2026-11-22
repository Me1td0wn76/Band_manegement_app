import type { ReactNode } from 'react'
import { AuthProvider, useAuth } from './controllers/AuthController'
import { DataProvider, useDataState } from './controllers/DataController'
import { FeedbackProvider } from './views/components/Feedback'
import { Logo } from './views/components/Icon'
import { Alert, Button, EmptyState } from './views/components/ui'
import { AppShell } from './views/layout/AppShell'
import { AccountPage, PasswordForm } from './views/pages/AccountPage'
import { AssignmentPage } from './views/pages/AssignmentPage'
import { BandsPage } from './views/pages/BandsPage'
import { DashboardPage } from './views/pages/DashboardPage'
import { EventDetailPage } from './views/pages/EventDetailPage'
import { EventsPage } from './views/pages/EventsPage'
import { LoginPage } from './views/pages/LoginPage'
import { MemberDetailPage } from './views/pages/MemberDetailPage'
import { MembersPage } from './views/pages/MembersPage'
import { MyPage } from './views/pages/MyPage'
import { Forbidden, NotFound } from './views/pages/NotFound'
import { Redirect, matchPath, useLocation } from './views/router'

export default function App() {
  return (
    <FeedbackProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </FeedbackProvider>
  )
}

function FullScreen({ children }: { children: ReactNode }) {
  return <div className="fullscreen">{children}</div>
}

function Loading() {
  return (
    <FullScreen>
      <div className="loading">
        <Logo size={36} />
        <span className="spinner spinner-lg" aria-label="読み込み中" />
      </div>
    </FullScreen>
  )
}

/** ログイン状態で画面を切り替える */
function AuthGate() {
  const { state } = useAuth()
  if (state.status === 'loading') return <Loading />
  if (state.status === 'signedOut') return <LoginPage />
  // ユーザーが変わったらデータを読み込み直す
  return (
    <DataProvider key={state.userId}>
      <DataGate userId={state.userId} />
    </DataProvider>
  )
}

/** データの読み込み状況・アカウント状態で画面を切り替える */
function DataGate({ userId }: { userId: string }) {
  const { state, reload } = useDataState()
  const { signOut } = useAuth()

  if (state.status === 'loading') return <Loading />
  if (state.status === 'error') {
    return (
      <FullScreen>
        <div className="card narrow-card">
          <EmptyState icon="alert" title="データを読み込めませんでした">
            <p className="muted small">{state.error}</p>
            <div className="button-row">
              <Button onClick={() => signOut()}>ログアウト</Button>
              <Button variant="primary" icon="refresh" onClick={() => reload().catch(() => {})}>
                再読み込み
              </Button>
            </div>
          </EmptyState>
        </div>
      </FullScreen>
    )
  }

  const me = state.snapshot.members.find((m) => m.id === userId)
  if (!me || !me.active) {
    return (
      <FullScreen>
        <div className="card narrow-card">
          <EmptyState icon="lock" title={me ? 'このアカウントは無効化されています' : 'メンバー情報が見つかりません'}>
            <p className="muted small">管理者に連絡してください。</p>
            <Button onClick={() => signOut()}>ログアウト</Button>
          </EmptyState>
        </div>
      </FullScreen>
    )
  }

  if (me.mustChangePassword) {
    return (
      <FullScreen>
        <div className="card narrow-card padded">
          <div className="brand brand-center">
            <Logo size={32} />
          </div>
          <h1 className="narrow-title">パスワードを変更してください</h1>
          <Alert tone="info">初回ログインのため、管理者が設定した初期パスワードを新しいパスワードに変更してください。</Alert>
          <PasswordForm submitLabel="変更して始める" />
          <button type="button" className="text-link center-link" onClick={() => signOut()}>
            ログアウト
          </button>
        </div>
      </FullScreen>
    )
  }

  return (
    <AppShell>
      <Routes isAdmin={me.appRole === 'admin'} />
    </AppShell>
  )
}

interface RouteDef {
  path: string
  adminOnly?: boolean
  render: (params: Record<string, string>) => ReactNode
}

const ROUTES: RouteDef[] = [
  { path: '/dashboard', adminOnly: true, render: () => <DashboardPage /> },
  { path: '/me', render: () => <MyPage /> },
  { path: '/events', render: () => <EventsPage /> },
  { path: '/events/:id', render: (p) => <EventDetailPage key={p.id} id={p.id} /> },
  { path: '/members', render: () => <MembersPage /> },
  { path: '/members/:id', render: (p) => <MemberDetailPage key={p.id} id={p.id} /> },
  { path: '/bands', render: () => <BandsPage /> },
  { path: '/assign', adminOnly: true, render: () => <AssignmentPage /> },
  { path: '/account', render: () => <AccountPage /> },
]

function Routes({ isAdmin }: { isAdmin: boolean }) {
  const { path } = useLocation()

  if (path === '/') {
    // 管理者はダッシュボード、メンバーはマイページをトップにする
    return <Redirect to={isAdmin ? '/dashboard' : '/me'} />
  }

  for (const route of ROUTES) {
    const params = matchPath(route.path, path)
    if (!params) continue
    if (route.adminOnly && !isAdmin) return <Forbidden />
    return route.render(params)
  }
  return <NotFound />
}
