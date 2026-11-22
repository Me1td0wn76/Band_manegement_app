import { useState, type FormEvent } from 'react'
import { useAuth } from '../../controllers/AuthController'
import { errorMessage } from '../../controllers/DataController'
import { DEMO_ACCOUNTS, repository } from '../../models/repositories'
import { Icon, Logo } from '../components/Icon'
import { Alert, Button, Field, Input } from '../components/ui'

export function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError('メールアドレスとパスワードを入力してください')
      return
    }
    setPending(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
    } catch (err) {
      setError(errorMessage(err))
      setPending(false)
    }
  }

  return (
    <div className="login">
      <section className="login-hero" aria-hidden="true">
        <div className="login-hero-inner">
          <div className="brand brand-lg">
            <Logo size={40} />
            <span className="brand-name">Band Manager</span>
          </div>
          <p className="login-tagline">
            ライブの準備を、
            <br />
            もっと公平に、もっと速く。
          </p>
          <ul className="login-points">
            <li>
              <Icon name="calendar" size={16} />
              イベントと出演バンドを一覧で管理
            </li>
            <li>
              <Icon name="shuffle" size={16} />
              PA・受付などの役割を負担に応じて自動で割り振り
            </li>
            <li>
              <Icon name="users" size={16} />
              メンバーとバンド編成をひとまとめに
            </li>
          </ul>
        </div>
      </section>

      <section className="login-panel">
        <form className="login-form" onSubmit={submit} noValidate>
          <div className="login-mobile-brand">
            <Logo size={32} />
            <span>Band Manager</span>
          </div>
          <h1>ログイン</h1>
          <p className="login-lead">管理者から受け取ったメールアドレスとパスワードを入力してください。</p>

          {error && <Alert tone="danger">{error}</Alert>}

          <Field label="メールアドレス">
            {(id) => (
              <Input
                id={id}
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
              />
            )}
          </Field>
          <Field label="パスワード">
            {(id) => (
              <div className="input-with-action">
                <Input
                  id={id}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="input-action"
                  aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} size={16} />
                </button>
              </div>
            )}
          </Field>

          <Button type="submit" variant="primary" loading={pending} className="btn-block">
            ログイン
          </Button>

          {repository.mode === 'demo' && (
            <div className="demo-accounts">
              <p className="demo-accounts-title">
                <span className="demo-label">デモモード</span>
                Supabase 未設定のため、ブラウザ内のデモデータで動作しています。
              </p>
              <div className="demo-accounts-list">
                {DEMO_ACCOUNTS.map((a) => (
                  <button
                    key={a.email}
                    type="button"
                    className="demo-account"
                    onClick={() => {
                      setEmail(a.email)
                      setPassword(a.password)
                      setError(null)
                    }}
                  >
                    <span className="demo-account-label">{a.label}</span>
                    <span className="demo-account-cred">
                      {a.email} / {a.password}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
      </section>
    </div>
  )
}
