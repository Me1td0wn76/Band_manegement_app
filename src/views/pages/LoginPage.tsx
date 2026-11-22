import { useState, type FormEvent } from 'react'
import { useAuth } from '../../controllers/AuthController'
import { errorMessage } from '../../controllers/DataController'
import { DEMO_ACCOUNTS, repository } from '../../models/repositories'
import { Button, Icon, Logo, StageBackdrop, StringDivider, TextField, Ticker, type CSSVars } from '../rb/core'
import { EMAIL_PATTERN } from '../format'

const LINES: [text: string, accent: boolean][] = [
  ['今夜も、', false],
  ['最高の段取りで。', true],
]

const TICKER = ['EVENTS · イベントを登録して表で管理', 'BANDS · バンドとパートの編成', 'ASSIGN · 役割をステージ図で自動割り振り', 'MEMBERS · メンバー登録と管理者権限']

export function LoginPage() {
  const { signIn } = useAuth()
  const [mail, setMail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<{ mail?: string; pw?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const er: typeof err = {}
    if (!EMAIL_PATTERN.test(mail.trim())) er.mail = 'メールアドレスを入力してください'
    if (!pw) er.pw = 'パスワードを入力してください'
    setErr(er)
    if (Object.keys(er).length) return
    setBusy(true)
    try {
      await signIn(mail.trim(), pw)
    } catch (error) {
      setErr({ form: errorMessage(error) })
      setBusy(false)
    }
  }

  let n = 0
  return (
    <StageBackdrop beams={3} className="app-stage">
      <div className="lg">
        <section className="lg-poster">
          <Logo size={44} />
          <div>
            <div className="rb-eyebrow">Band management · Live &amp; Rehearsal</div>
            <h1 className="lg-head" aria-label={LINES.map(([t]) => t).join('')}>
              {LINES.map(([t, accent], li) => (
                <span key={li} className={accent ? 'lg-line lg-accent' : 'lg-line'} aria-hidden="true">
                  {Array.from(t).map((c) => (
                    <span key={n} className="rb-ch" style={{ '--i': n++ } as CSSVars}>
                      {c}
                    </span>
                  ))}
                </span>
              ))}
            </h1>
            <p className="lg-lead">イベント、メンバー、バンド、役割の割り振りまで。ライブ前の段取りを、ひとつのステージにまとめます。</p>
          </div>
          <StringDivider strings={6} autoPluck />
          <Ticker items={TICKER} />
        </section>

        <form className="lg-card" onSubmit={submit} noValidate>
          <div>
            <div className="rb-eyebrow">Sign in</div>
            <h2 className="lg-title">ログイン</h2>
          </div>
          {err.form && (
            <p className="app-error" role="alert">
              <Icon name="alert" size={16} />
              {err.form}
            </p>
          )}
          <TextField
            label="メールアドレス"
            icon="mail"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={mail}
            onChange={(e) => setMail(e.target.value)}
            error={err.mail}
          />
          <TextField
            label="パスワード"
            icon="key"
            type="password"
            placeholder="8文字以上"
            autoComplete="current-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            error={err.pw}
          />
          <Button type="submit" variant="primary" size="lg" block loading={busy} iconRight="chevron-right">
            ステージに上がる
          </Button>
          <p className="lg-note">
            <Icon name="mail" size={14} />
            メンバー登録は管理者が行います。受け取ったメールアドレスと初期パスワードでログインし、最初に初期登録（パスワードとパートの設定）を行ってください。パスワードを忘れたときは管理者に再設定を依頼してください。
          </p>

          {repository.mode === 'demo' && (
            <div className="app-demo-accounts">
              <span className="rb-eyebrow">
                <Icon name="info" size={12} />
                Demo accounts
              </span>
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  className="app-demo-account"
                  onClick={() => {
                    setMail(a.email)
                    setPw(a.password)
                    setErr({})
                  }}
                >
                  <b>{a.label}</b>
                  <span className="rb-mono">
                    {a.email} / {a.password}
                  </span>
                </button>
              ))}
            </div>
          )}
        </form>
      </div>
    </StageBackdrop>
  )
}
