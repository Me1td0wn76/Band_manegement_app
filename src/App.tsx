import { useState, type ReactNode } from 'react'
import { AuthProvider, useAuth } from './controllers/AuthController'
import { DataProvider, useDataState } from './controllers/DataController'
import type { Member } from './models/types'
import { AppShell } from './views/AppShell'
import { FeedbackProvider } from './views/feedback'
import { AccountPage } from './views/pages/AccountPage'
import { AssignPage } from './views/pages/AssignPage'
import { DashboardPage } from './views/pages/DashboardPage'
import { EventsPage } from './views/pages/EventsPage'
import { LoginPage } from './views/pages/LoginPage'
import { MembersPage } from './views/pages/MembersPage'
import { MyPage } from './views/pages/MyPage'
import { Forbidden, NotFound } from './views/pages/NotFound'
import { OnboardingPage } from './views/pages/OnboardingPage'
import { PermissionsPage } from './views/pages/PermissionsPage'
import { RolesPage } from './views/pages/RolesPage'
import { TimetablePage } from './views/pages/TimetablePage'
import { Button, Card, EmptyState, Loader, StageBackdrop } from './views/rb/core'
import { Redirect, matchPath, navigate, useLocation } from './views/router'

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
  return (
    <StageBackdrop beams={2} dust={10} className="app-stage">
      <div className="app-fullscreen">{children}</div>
    </StageBackdrop>
  )
}

/** ログイン状態で画面を切り替える */
function AuthGate() {
  const { state } = useAuth()
  if (state.status === 'loading') {
    return (
      <FullScreen>
        <Loader label="ステージを準備中" />
      </FullScreen>
    )
  }
  if (state.status === 'signedOut') return <LoginPage />
  // ユーザーが変わったらデータを読み込み直す
  return (
    <DataProvider key={state.userId} userId={state.userId}>
      <DataGate userId={state.userId} />
    </DataProvider>
  )
}

/** データの読み込み状況・アカウント状態で画面を切り替える */
function DataGate({ userId }: { userId: string }) {
  const { state, reload } = useDataState()
  const { signOut } = useAuth()
  const logout = () => {
    void signOut().then(() => navigate('/', { replace: true }))
  }

  if (state.status === 'loading') {
    return (
      <FullScreen>
        <Loader label="読み込み中" />
      </FullScreen>
    )
  }
  if (state.status === 'error') {
    return (
      <FullScreen>
        <Card className="app-narrow">
          <EmptyState
            icon="cable"
            title="データを読み込めませんでした"
            message={`${state.error}　通信状況を確かめて、もう一度お試しください。`}
            action={
              <div className="app-row">
                <Button variant="ghost" icon="logout" onClick={logout}>
                  ログアウト
                </Button>
                <Button variant="primary" icon="undo" onClick={() => reload().catch(() => {})}>
                  再読み込み
                </Button>
              </div>
            }
          />
        </Card>
      </FullScreen>
    )
  }

  const me = state.snapshot.members.find((m) => m.id === userId)
  if (!me || !me.active) {
    return (
      <FullScreen>
        <Card className="app-narrow">
          <EmptyState
            icon="lock"
            title={me ? 'このアカウントは無効になっています' : 'メンバー情報が見つかりません'}
            message="管理者に連絡して、アカウントを有効にしてもらってください。"
            action={
              <Button variant="primary" icon="logout" onClick={logout}>
                ログアウト
              </Button>
            }
          />
        </Card>
      </FullScreen>
    )
  }
  return <SignedIn me={me} />
}

/** 初期登録がまだなら先に初期登録画面を出す */
function SignedIn({ me }: { me: Member }) {
  const [onboarding, setOnboarding] = useState(me.mustChangePassword)
  if (onboarding) return <OnboardingPage onFinish={() => setOnboarding(false)} />
  return (
    <AppShell>
      <Routes isAdmin={me.appRole === 'admin'} />
    </AppShell>
  )
}

interface RouteDef {
  path: string
  adminOnly?: boolean
  render: (params: Record<string, string>, isAdmin: boolean) => ReactNode
}

const ROUTES: RouteDef[] = [
  // 幹部はダッシュボード、メンバーはマイページ（同じメニュー項目）
  { path: '/dashboard', render: (_, isAdmin) => (isAdmin ? <DashboardPage /> : <MyPage />) },
  { path: '/me', render: () => <MyPage /> },
  { path: '/events', render: () => <EventsPage /> },
  { path: '/timetable', render: () => <TimetablePage /> },
  { path: '/members', render: () => <MembersPage /> },
  { path: '/assign', adminOnly: true, render: () => <AssignPage /> },
  { path: '/roles', adminOnly: true, render: () => <RolesPage /> },
  { path: '/permissions', adminOnly: true, render: () => <PermissionsPage /> },
  { path: '/account', render: () => <AccountPage /> },
]

function Routes({ isAdmin }: { isAdmin: boolean }) {
  const { path } = useLocation()
  if (path === '/') return <Redirect to="/dashboard" />
  for (const route of ROUTES) {
    const params = matchPath(route.path, path)
    if (!params) continue
    if (route.adminOnly && !isAdmin) return <Forbidden />
    return route.render(params, isAdmin)
  }
  return <NotFound />
}
