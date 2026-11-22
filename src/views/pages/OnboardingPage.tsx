import { useState } from 'react'
import { useAuth } from '../../controllers/AuthController'
import { useData } from '../../controllers/DataController'
import { dutiesOf } from '../../controllers/selectors'
import { useAction } from '../feedback'
import { Avatar, Button, Icon, Logo, StageBackdrop, StatusBadge, TextField, VuMeter, type CSSVars } from '../rb/core'
import { PASSWORD_RULES, formatMd, formatYmd } from '../format'
import { navigate } from '../router'

const STEPS = ['ログイン情報', 'パスワード', 'はじめる']

/**
 * 招待されたメンバーの初期登録。初回ログイン時に、幹部が設定した初期パスワードを
 * 自分のパスワードに変える。
 */
export function OnboardingPage({ onFinish }: { onFinish: () => void }) {
  const { snapshot, me, actions } = useData()
  const { signOut } = useAuth()
  const { run, pending } = useAction()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [done, setDone] = useState(false)

  const score = PASSWORD_RULES.filter(([, f]) => f(pw)).length + (pw.length >= 12 ? 1 : 0)
  const lvl = score / 5
  const word = lvl < 0.4 ? '弱い' : lvl < 0.8 ? 'ふつう' : '強い'
  const mismatch = pw2 && pw2 !== pw ? 'パスワードが一致しません' : ''
  const valid = PASSWORD_RULES[0][1](pw) && pw === pw2
  const step = valid ? 2 : 1

  const duties = dutiesOf(snapshot, me.id)
  // 招待した人：幹部のひとり
  const inviter = snapshot.members.find((m) => m.appRole === 'admin' && m.id !== me.id)

  const submit = async () => {
    if (!valid) return
    if (await run(() => actions.completeOnboarding(pw))) setDone(true)
  }

  return (
    <StageBackdrop beams={2} dust={14} className="app-stage">
      <div className="ob">
        <header className="ob-head">
          <Logo size={34} />
          <ol className="ob-steps" style={{ '--p': Math.min(step, STEPS.length - 1) / (STEPS.length - 1) } as CSSVars}>
            {STEPS.map((s, i) => (
              <li key={s} className={i < step ? 'is-done' : i === step ? 'is-now' : ''}>
                <span className="ob-dot">{i < step ? <Icon name="check" size={14} strokeWidth={2.6} /> : i + 1}</span>
                <span className="ob-steplabel">{s}</span>
              </li>
            ))}
          </ol>
        </header>

        <main className="ob-card">
          {done ? (
            <div className="ob-done">
              <span className="ob-done__mark">
                <Icon name="check" size={44} strokeWidth={2.4} />
              </span>
              <h1 className="ob-title">登録が完了しました</h1>
              <p className="rb-muted">
                ようこそ、{me.name.split(/\s+/)[0]}さん。
                {duties.length ? `さっそく ${formatMd(duties[0].event.date, false)}「${duties[0].event.title}」で ${duties[0].role.name} の担当があります。` : '裏方メンバーとして利用をはじめられます。'}
              </p>
              <Button
                variant="primary"
                size="lg"
                iconRight="chevron-right"
                onClick={() => {
                  navigate('/dashboard', { replace: true })
                  onFinish()
                }}
              >
                ダッシュボードへ
              </Button>
            </div>
          ) : (
            <form
              className="ob-form"
              noValidate
              onSubmit={(e) => {
                e.preventDefault()
                void submit()
              }}
            >
              <div>
                <div className="rb-eyebrow">Welcome · 初期登録</div>
                <h1 className="ob-title">アカウントを設定しましょう</h1>
              </div>
              <div className="ob-invite">
                <Avatar name={inviter?.name ?? '幹部'} size={44} badge={{ icon: 'crown', color: 'var(--amber)' }} />
                <div>
                  <div className="ob-invite__t">
                    <b>{inviter?.name ?? '幹部'}</b> さんから裏方チームへの招待が届いています
                  </div>
                  <div className="rb-mono rb-muted">登録日 {formatYmd(me.createdAt.slice(0, 10))}</div>
                </div>
                <StatusBadge status="invited" />
              </div>
              <TextField
                label="ログイン用メールアドレス"
                icon="mail"
                type="email"
                value={me.email}
                readOnly
                help="幹部が登録したアドレスです。変えたいときは幹部に依頼してください。"
              />
              <div className="ob-two">
                <div className="ob-pw">
                  <TextField
                    label="新しいパスワード"
                    icon="key"
                    type="password"
                    required
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    autoComplete="new-password"
                  />
                  <div className="ob-strength">
                    <VuMeter level={Math.max(0.05, lvl)} segments={10} size="sm" ariaLabel="パスワードの強さ" />
                    <span className={`ob-word ob-word--${lvl < 0.4 ? 'weak' : lvl < 0.8 ? 'ok' : 'strong'}`}>強さ：{word}</span>
                  </div>
                  <ul className="ob-rules">
                    {PASSWORD_RULES.map(([t, f]) => (
                      <li key={t} className={f(pw) ? 'is-ok' : ''}>
                        <span className="ob-rule__ic">
                          <Icon name={f(pw) ? 'check' : 'x'} size={12} strokeWidth={2.6} />
                        </span>
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
                <TextField
                  label="パスワード（確認）"
                  icon="lock"
                  type="password"
                  required
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  error={mismatch}
                  help={!mismatch ? 'もう一度同じパスワードを入力します' : undefined}
                  autoComplete="new-password"
                />
              </div>
              <div className="ob-foot">
                <Button variant="ghost" icon="logout" onClick={() => void signOut().then(() => navigate('/', { replace: true }))}>
                  ログアウト
                </Button>
                <Button type="submit" variant="primary" size="lg" disabled={!valid} loading={pending} iconRight="chevron-right">
                  登録してはじめる
                </Button>
              </div>
            </form>
          )}
        </main>
      </div>
    </StageBackdrop>
  )
}
