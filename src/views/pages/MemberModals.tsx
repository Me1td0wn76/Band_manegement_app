import { useState } from 'react'
import { useData } from '../../controllers/DataController'
import type { AppRole, Member } from '../../models/types'
import { Icon } from '../components/Icon'
import { useAction, useToast } from '../components/Feedback'
import { Alert, Button, Checkbox, Field, Input, Modal, Select, Textarea } from '../components/ui'
import { APP_ROLE, EMAIL_PATTERN, MIN_PASSWORD_LENGTH, PART_SUGGESTIONS, generatePassword } from '../format'

function PasswordInput({
  id,
  value,
  onChange,
}: {
  id: string
  value: string
  onChange: (v: string) => void
}) {
  const [visible, setVisible] = useState(true)
  return (
    <div className="input-row">
      <div className="input-with-action">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete="new-password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mono"
        />
        <button
          type="button"
          className="input-action"
          aria-label={visible ? 'パスワードを隠す' : 'パスワードを表示'}
          onClick={() => setVisible((v) => !v)}
        >
          <Icon name={visible ? 'eyeOff' : 'eye'} size={16} />
        </button>
      </div>
      <Button icon="refresh" onClick={() => onChange(generatePassword())}>
        自動生成
      </Button>
    </div>
  )
}

/** 登録後に、本人へ伝えるログイン情報を表示する */
function CredentialsPanel({ name, email, password }: { name: string; email: string; password: string }) {
  const toast = useToast()
  const text = `${name}さん\nBand Manager のアカウントを作成しました。\nログインURL: ${window.location.origin}${window.location.pathname}\nメールアドレス: ${email}\n初期パスワード: ${password}\n※初回ログイン時にパスワードの変更をお願いします。`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('コピーしました')
    } catch {
      toast.error('コピーできませんでした。手動で選択してコピーしてください')
    }
  }
  return (
    <div className="form-stack">
      <Alert tone="good" icon="check">
        ログイン情報を本人に伝えてください。初回ログイン時にパスワードの変更が求められます。
      </Alert>
      <dl className="kv credentials">
        <dt>メールアドレス</dt>
        <dd className="mono">{email}</dd>
        <dt>初期パスワード</dt>
        <dd className="mono">{password}</dd>
      </dl>
      <div>
        <Button icon="check" onClick={copy}>
          案内文をコピー
        </Button>
      </div>
    </div>
  )
}

type Errors = Partial<Record<'name' | 'email' | 'password', string>>

export function MemberCreateModal({ onClose }: { onClose: () => void }) {
  const { actions } = useData()
  const { run, pending } = useAction()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState(() => generatePassword())
  const [part, setPart] = useState('')
  const [appRole, setAppRole] = useState<AppRole>('member')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [created, setCreated] = useState(false)

  const submit = async () => {
    const errs: Errors = {}
    if (!name.trim()) errs.name = '名前を入力してください'
    if (!EMAIL_PATTERN.test(email.trim())) errs.email = 'メールアドレスの形式が正しくありません'
    if (password.length < MIN_PASSWORD_LENGTH) errs.password = `${MIN_PASSWORD_LENGTH}文字以上にしてください`
    setErrors(errs)
    if (Object.keys(errs).length) return
    const ok = await run(
      () =>
        actions.createMember({
          name: name.trim(),
          email: email.trim(),
          password,
          part: part.trim() || null,
          note: note.trim() || null,
          appRole,
        }),
      'メンバーを登録しました',
    )
    if (ok) setCreated(true)
  }

  if (created) {
    return (
      <Modal title="メンバーを登録しました" onClose={onClose} footer={<Button variant="primary" onClick={onClose}>閉じる</Button>}>
        <CredentialsPanel name={name.trim()} email={email.trim()} password={password} />
      </Modal>
    )
  }

  return (
    <Modal
      title="メンバーを登録"
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>キャンセル</Button>
          <Button type="submit" variant="primary" loading={pending}>
            登録
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="名前" error={errors.name} required>
          {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} autoFocus />}
        </Field>
        <Field label="パート">
          {(id) => (
            <>
              <Input id={id} value={part} list="member-part-suggestions" onChange={(e) => setPart(e.target.value)} placeholder="Gt" />
              <datalist id="member-part-suggestions">
                {PART_SUGGESTIONS.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="メールアドレス（ログインID）" error={errors.email} required className="span-2">
          {(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />}
        </Field>
        <Field
          label="初期パスワード"
          error={errors.password}
          hint={`${MIN_PASSWORD_LENGTH}文字以上。初回ログイン時に本人が変更します。`}
          required
          className="span-2"
        >
          {(id) => <PasswordInput id={id} value={password} onChange={setPassword} />}
        </Field>
        <Field label="権限" className="span-2">
          {(id) => (
            <Select id={id} value={appRole} onChange={(e) => setAppRole(e.target.value as AppRole)}>
              <option value="member">{APP_ROLE.member.label}（閲覧・自分の参加可否の登録）</option>
              <option value="admin">{APP_ROLE.admin.label}（すべての登録・編集・割り振り）</option>
            </Select>
          )}
        </Field>
        <Field label="メモ（管理者のみ閲覧）" className="span-2">
          {(id) => <Textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} rows={2} />}
        </Field>
      </div>
    </Modal>
  )
}

export function MemberEditModal({ member, onClose }: { member: Member; onClose: () => void }) {
  const { actions, me } = useData()
  const { run, pending } = useAction()
  const isSelf = member.id === me.id
  const [name, setName] = useState(member.name)
  const [email, setEmail] = useState(member.email)
  const [part, setPart] = useState(member.part ?? '')
  const [appRole, setAppRole] = useState<AppRole>(member.appRole)
  const [active, setActive] = useState(member.active)
  const [note, setNote] = useState(member.note ?? '')
  const [errors, setErrors] = useState<Errors>({})

  const submit = async () => {
    const errs: Errors = {}
    if (!name.trim()) errs.name = '名前を入力してください'
    if (!EMAIL_PATTERN.test(email.trim())) errs.email = 'メールアドレスの形式が正しくありません'
    setErrors(errs)
    if (Object.keys(errs).length) return
    const ok = await run(
      () =>
        actions.updateMember(member.id, {
          name: name.trim(),
          email: email.trim(),
          part: part.trim() || null,
          note: note.trim() || null,
          appRole,
          active,
        }),
      'メンバー情報を更新しました',
    )
    if (ok) onClose()
  }

  return (
    <Modal
      title="メンバーを編集"
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>キャンセル</Button>
          <Button type="submit" variant="primary" loading={pending}>
            保存
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="名前" error={errors.name} required>
          {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="パート">
          {(id) => (
            <>
              <Input id={id} value={part} list="member-part-suggestions-edit" onChange={(e) => setPart(e.target.value)} />
              <datalist id="member-part-suggestions-edit">
                {PART_SUGGESTIONS.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="メールアドレス（ログインID）" error={errors.email} required className="span-2">
          {(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label="権限" hint={isSelf ? '自分自身の権限は変更できません' : undefined} className="span-2">
          {(id) => (
            <Select id={id} value={appRole} disabled={isSelf} onChange={(e) => setAppRole(e.target.value as AppRole)}>
              <option value="member">{APP_ROLE.member.label}</option>
              <option value="admin">{APP_ROLE.admin.label}</option>
            </Select>
          )}
        </Field>
        <div className="span-2">
          <Checkbox checked={active} disabled={isSelf} onChange={setActive}>
            有効（無効にするとログイン後に利用できなくなり、自動割り振りの対象外になります）
          </Checkbox>
        </div>
        <Field label="メモ（管理者のみ閲覧）" className="span-2">
          {(id) => <Textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} rows={2} />}
        </Field>
      </div>
    </Modal>
  )
}

export function ResetPasswordModal({ member, onClose }: { member: Member; onClose: () => void }) {
  const { actions } = useData()
  const { run, pending } = useAction()
  const [password, setPassword] = useState(() => generatePassword())
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const submit = async () => {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`${MIN_PASSWORD_LENGTH}文字以上にしてください`)
      return
    }
    setError(null)
    if (await run(() => actions.resetMemberPassword(member.id, password), 'パスワードを再設定しました')) setDone(true)
  }

  if (done) {
    return (
      <Modal title="パスワードを再設定しました" onClose={onClose} footer={<Button variant="primary" onClick={onClose}>閉じる</Button>}>
        <CredentialsPanel name={member.name} email={member.email} password={password} />
      </Modal>
    )
  }

  return (
    <Modal
      title={`${member.name}さんのパスワードを再設定`}
      onClose={onClose}
      onSubmit={submit}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>キャンセル</Button>
          <Button type="submit" variant="primary" loading={pending}>
            再設定
          </Button>
        </>
      }
    >
      <p className="muted small bottom-gap">新しい初期パスワードを設定します。次回ログイン時に本人へ変更を求めます。</p>
      <Field label="新しい初期パスワード" error={error} required>
        {(id) => <PasswordInput id={id} value={password} onChange={setPassword} />}
      </Field>
    </Modal>
  )
}
