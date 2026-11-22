import { useState, type FormEvent } from 'react'
import { useData } from '../../controllers/DataController'
import { PARTS, type Part } from '../../models/types'
import { Page } from '../AppShell'
import { useAction } from '../feedback'
import { Button, Card, ChipSelect, Icon, StatusBadge, TextField, VuMeter, type CSSVars } from '../rb/core'
import { MIN_PASSWORD_LENGTH, PASSWORD_RULES } from '../format'
import { navigate } from '../router'

export function AccountPage() {
  const { me, isAdmin, actions } = useData()
  const { run, pending } = useAction()
  const [name, setName] = useState(me.name)
  const [kana, setKana] = useState(me.kana ?? '')
  const [parts, setParts] = useState<Part[]>(me.parts)
  const [pErr, setPErr] = useState<Partial<Record<'name' | 'parts', string>>>({})
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [pwErr, setPwErr] = useState<string | null>(null)

  const score = PASSWORD_RULES.filter(([, f]) => f(pw)).length + (pw.length >= 12 ? 1 : 0)

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault()
    const er: typeof pErr = {}
    if (!name.trim()) er.name = '名前を入力してください'
    if (!parts.length) er.parts = 'パートを1つ以上選んでください'
    setPErr(er)
    if (Object.keys(er).length) return
    await run(() => actions.updateMyProfile({ name: name.trim(), kana: kana.trim() || null, parts }), 'プロフィールを更新しました')
  }

  const savePassword = async (e: FormEvent) => {
    e.preventDefault()
    if (pw.length < MIN_PASSWORD_LENGTH) {
      setPwErr(`パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください`)
      return
    }
    if (pw !== pw2) {
      setPwErr('パスワードが一致しません')
      return
    }
    setPwErr(null)
    if (await run(() => actions.changePassword(pw), 'パスワードを変更しました')) {
      setPw('')
      setPw2('')
    }
  }

  return (
    <Page
      eyebrow={`${isAdmin ? 'Admin' : 'Member'} · Account`}
      title="アカウント"
      subtitle="名前・担当パート・パスワードを変更できます。"
      actions={
        <Button variant="ghost" icon="calendar" onClick={() => navigate('/me')}>
          自分の出演予定
        </Button>
      }
    >
      <div className="ac-grid">
        <Card eyebrow="Profile" title="プロフィール" style={{ '--i': 1 } as CSSVars}>
          <form className="mb-form" onSubmit={saveProfile} noValidate>
            <div className="ac-who">
              <span className="rb-mono">{me.email}</span>
              <StatusBadge status={isAdmin ? 'admin' : 'member'} size="sm" />
            </div>
            <div className="app-two">
              <TextField label="名前" required icon="users" value={name} onChange={(e) => setName(e.target.value)} error={pErr.name} />
              <TextField label="ローマ字" value={kana} onChange={(e) => setKana(e.target.value)} />
            </div>
            <ChipSelect label="担当パート" value={parts} onChange={(v) => setParts(v as Part[])} options={PARTS.map((p) => ({ value: p, role: p }))} />
            {pErr.parts && (
              <p className="mb-err">
                <Icon name="alert" size={14} />
                {pErr.parts}
              </p>
            )}
            <p className="rb-muted rb-small">メールアドレスと権限の変更は管理者に依頼してください。</p>
            <div>
              <Button type="submit" variant="primary" icon="check" loading={pending}>
                プロフィールを保存
              </Button>
            </div>
          </form>
        </Card>
        <Card eyebrow="Password" title="パスワード変更" style={{ '--i': 2 } as CSSVars}>
          <form className="mb-form" onSubmit={savePassword} noValidate>
            <TextField
              label="新しいパスワード"
              required
              icon="key"
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete="new-password"
            />
            <div className="ob-strength">
              <VuMeter level={Math.max(0.05, score / 5)} segments={10} size="sm" ariaLabel="パスワードの強さ" />
              <span className="rb-small rb-muted">{PASSWORD_RULES.filter(([, f]) => !f(pw)).map(([t]) => t).join('・') || '十分な強さです'}</span>
            </div>
            <TextField
              label="新しいパスワード（確認）"
              required
              icon="lock"
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              error={pwErr}
              autoComplete="new-password"
            />
            <div>
              <Button type="submit" variant="primary" icon="key" loading={pending}>
                パスワードを変更
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </Page>
  )
}
