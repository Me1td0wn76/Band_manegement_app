import { createContext, use, useEffect, useState, type ReactNode } from 'react'
import { repository } from '../models/repositories'

type AuthState = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; userId: string }

interface AuthValue {
  state: AuthState
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
  changePassword(newPassword: string): Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

function toState(userId: string | null): AuthState {
  return userId ? { status: 'signedIn', userId } : { status: 'signedOut' }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    // 同じユーザーのトークン更新などでは state を変えない（再描画・再読込を避ける）
    const apply = (userId: string | null) =>
      setState((prev) =>
        prev.status === 'signedIn' && prev.userId === userId
          ? prev
          : prev.status === 'signedOut' && userId === null
            ? prev
            : toState(userId),
      )
    repository
      .getCurrentUserId()
      .then((id) => !cancelled && apply(id))
      .catch(() => !cancelled && apply(null))
    const unsubscribe = repository.onAuthStateChange((id) => apply(id))
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const value: AuthValue = {
    state,
    signIn: (email, password) => repository.signIn(email, password),
    signOut: () => repository.signOut(),
    changePassword: (pw) => repository.changePassword(pw),
  }

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthValue {
  const ctx = use(AuthContext)
  if (!ctx) throw new Error('useAuth は AuthProvider の内側で使ってください')
  return ctx
}
