import { useState } from 'react'
import { useData } from '../../controllers/DataController'
import { useAction } from '../components/Feedback'
import { Alert, Badge, Button, Card, Field, Input, PageHeader } from '../components/ui'
import { APP_ROLE, MIN_PASSWORD_LENGTH, PART_SUGGESTIONS } from '../format'

/** パスワード変更フォーム（初回ログイン時の強制変更でも使う） */
export function PasswordForm({ onDone, submitLabel = 'パスワードを変更' }: { onDone?: () => void; submitLabel?: string }) {
  const { actions } = useData()
  const { run, pending } = useAction()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください`)
      return
    }
    if (password !== confirm) {
      setError('確認用のパスワードが一致しません')
      return
    }
    setError(null)
    const ok = await run(() => actions.changePassword(password), 'パスワードを変更しました')
    if (ok) {
      setPassword('')
      setConfirm('')
      onDone?.()
    }
  }

  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      noValidate
    >
      <Field label="新しいパスワード" hint={`${MIN_PASSWORD_LENGTH}文字以上`} required>
        {(id) => (
          <Input id={id} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        )}
      </Field>
      <Field label="新しいパスワード（確認）" error={error} required>
        {(id) => (
          <Input id={id} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        )}
      </Field>
      <div>
        <Button type="submit" variant="primary" loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

export function AccountPage() {
  const { me, actions } = useData()
  const { run, pending } = useAction()
  const [name, setName] = useState(me.name)
  const [part, setPart] = useState(me.part ?? '')
  const [nameError, setNameError] = useState<string | null>(null)

  const saveProfile = async () => {
    if (!name.trim()) {
      setNameError('名前を入力してください')
      return
    }
    setNameError(null)
    await run(() => actions.updateMyProfile({ name: name.trim(), part: part.trim() || null }), 'プロフィールを更新しました')
  }

  return (
    <>
      <PageHeader title="アカウント" description="プロフィールとパスワードを変更できます。" />
      <div className="grid-2">
        <Card title="プロフィール">
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault()
              void saveProfile()
            }}
            noValidate
          >
            <dl className="kv">
              <dt>メールアドレス</dt>
              <dd>{me.email}</dd>
              <dt>権限</dt>
              <dd>
                <Badge tone={APP_ROLE[me.appRole].tone}>{APP_ROLE[me.appRole].label}</Badge>
              </dd>
            </dl>
            <Field label="名前" error={nameError} required>
              {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}
            </Field>
            <Field label="パート" hint="例: Vo / Gt / Ba / Dr / Key">
              {(id) => (
                <>
                  <Input id={id} value={part} list="part-suggestions" onChange={(e) => setPart(e.target.value)} />
                  <datalist id="part-suggestions">
                    {PART_SUGGESTIONS.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
            <div>
              <Button type="submit" variant="primary" loading={pending}>
                保存
              </Button>
            </div>
          </form>
        </Card>
        <Card title="パスワード変更">
          {me.mustChangePassword && <Alert tone="warn">初期パスワードのままです。新しいパスワードに変更してください。</Alert>}
          <PasswordForm />
        </Card>
      </div>
    </>
  )
}
