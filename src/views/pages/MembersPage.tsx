import { useState, type FormEvent } from 'react'
import { useData } from '../../controllers/DataController'
import { bandNamesOf, monthOf, monthlyLoad, todayISO } from '../../controllers/selectors'
import { PART_SHORT } from '../../models/slots'
import { PARTS, type Member, type Part } from '../../models/types'
import { Page } from '../AppShell'
import { useAction, useConfirm, useToast } from '../feedback'
import { Button, Card, ChipSelect, Icon, IconButton, Modal, Tabs, TextArea, TextField, Toggle, type CSSVars } from '../rb/core'
import { MemberCard, type MemberCardData } from '../rb/data'
import { EMAIL_PATTERN, MIN_PASSWORD_LENGTH, downloadCsv, generatePassword } from '../format'

type Tab = 'all' | 'admin' | 'invited' | 'inactive'

const ROLE_OPTS = PARTS.map((p) => ({ value: p, role: p }))

/** 登録・再設定後に、本人へ伝えるログイン情報 */
function CredentialsModal({ name, email, password, onClose }: { name: string; email: string; password: string; onClose: () => void }) {
  const toast = useToast()
  const text = `${name}さん\nRiffboard のアカウントを作成しました。\nログインURL: ${window.location.origin}${window.location.pathname}\nメールアドレス: ${email}\n初期パスワード: ${password}\n初回ログイン時に、パスワードと担当パートの登録をお願いします。`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('案内文をコピーしました')
    } catch {
      toast.error('コピーできませんでした', '表示されている内容を選んでコピーしてください')
    }
  }
  return (
    <Modal
      eyebrow="Login · 初期登録"
      title="ログイン情報を本人に伝えてください"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            閉じる
          </Button>
          <Button variant="primary" icon="check" onClick={() => void copy()}>
            案内文をコピー
          </Button>
        </>
      }
    >
      <div className="app-stack">
        <p className="rb-muted">{name}さんは、初回ログイン時に初期登録（パスワードの再設定とパートの登録）を行います。</p>
        <dl className="app-credentials">
          <dt>メールアドレス</dt>
          <dd className="rb-mono">{email}</dd>
          <dt>初期パスワード</dt>
          <dd className="rb-mono">{password}</dd>
        </dl>
      </div>
    </Modal>
  )
}

function ResetPasswordModal({ member, onClose }: { member: Member; onClose: () => void }) {
  const { actions } = useData()
  const { run, pending } = useAction()
  const [pw, setPw] = useState(() => generatePassword())
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (done) return <CredentialsModal name={member.name} email={member.email} password={pw} onClose={onClose} />

  const submit = async () => {
    if (pw.length < MIN_PASSWORD_LENGTH) {
      setErr(`初期パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください`)
      return
    }
    setErr(null)
    if (await run(() => actions.resetMemberPassword(member, pw), 'パスワードを再設定しました')) setDone(true)
  }

  return (
    <Modal
      eyebrow="Reset password"
      title={`${member.name}さんのパスワードを再設定`}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            キャンセル
          </Button>
          <Button variant="primary" icon="key" loading={pending} onClick={() => void submit()}>
            再設定する
          </Button>
        </>
      }
    >
      <TextField
        label="新しい初期パスワード"
        required
        icon="lock"
        type="password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        error={err}
        help="次回ログイン時に、本人が初期登録をやり直します"
        trailing={<IconButton icon="shuffle" label="パスワードを自動生成" size="sm" onClick={() => setPw(generatePassword())} />}
      />
    </Modal>
  )
}

function MemberEditModal({ member, onClose }: { member: Member; onClose: () => void }) {
  const { actions, me } = useData()
  const { run, pending } = useAction()
  const confirm = useConfirm()
  const isSelf = member.id === me.id
  const [name, setName] = useState(member.name)
  const [kana, setKana] = useState(member.kana ?? '')
  const [email, setEmail] = useState(member.email)
  const [parts, setParts] = useState<Part[]>(member.parts)
  const [admin, setAdmin] = useState(member.appRole === 'admin')
  const [active, setActive] = useState(member.active)
  const [note, setNote] = useState(member.note ?? '')
  const [err, setErr] = useState<Partial<Record<'name' | 'email' | 'parts', string>>>({})
  const [resetting, setResetting] = useState(false)

  if (resetting) return <ResetPasswordModal member={member} onClose={onClose} />

  const save = async () => {
    const er: typeof err = {}
    if (!name.trim()) er.name = '名前を入力してください'
    if (!EMAIL_PATTERN.test(email.trim())) er.email = 'メールアドレスの形式が正しくありません'
    if (!parts.length) er.parts = 'パートを1つ以上選んでください'
    setErr(er)
    if (Object.keys(er).length) return
    const ok = await run(
      () =>
        actions.updateMember(member.id, {
          name: name.trim(),
          kana: kana.trim() || null,
          email: email.trim(),
          parts,
          appRole: admin ? 'admin' : 'member',
          active,
          note: note.trim() || null,
        }),
      { title: 'メンバー情報を更新しました', message: name.trim() },
    )
    if (ok) onClose()
  }

  const remove = async () => {
    const ok = await confirm({
      eyebrow: 'Delete member',
      title: 'メンバーを削除',
      message: `『${member.name}』のアカウントと、バンドの所属が削除されます。割り振られていた枠は空きになります。この操作は元に戻せません。一時的に外すだけなら「有効」をオフにしてください。`,
      confirmLabel: '削除する',
      danger: true,
    })
    if (!ok) return
    if (await run(() => actions.deleteMember(member), { title: 'メンバーを削除しました', message: member.name })) onClose()
  }

  return (
    <Modal
      eyebrow={`Edit · ${member.email}`}
      title="メンバーを編集"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" icon="trash" className="app-danger-text" disabled={isSelf} onClick={() => void remove()}>
            削除
          </Button>
          <Button variant="ghost" icon="key" onClick={() => setResetting(true)}>
            パスワード再設定
          </Button>
          <span className="app-spacer" />
          <Button variant="ghost" onClick={onClose}>
            キャンセル
          </Button>
          <Button variant="primary" icon="check" loading={pending} onClick={() => void save()}>
            保存する
          </Button>
        </>
      }
    >
      <form
        className="mb-form"
        noValidate
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          void save()
        }}
      >
        <div className="app-two">
          <TextField label="名前" required icon="users" value={name} onChange={(e) => setName(e.target.value)} error={err.name} />
          <TextField label="ローマ字" value={kana} onChange={(e) => setKana(e.target.value)} placeholder="Yamada Taro" />
        </div>
        <TextField
          label="ログイン用メールアドレス"
          required
          icon="mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={err.email}
        />
        <ChipSelect label="担当パート" value={parts} onChange={(v) => setParts(v as Part[])} options={ROLE_OPTS} />
        {err.parts && (
          <p className="mb-err">
            <Icon name="alert" size={14} />
            {err.parts}
          </p>
        )}
        <div className="mb-admin">
          <Toggle
            checked={admin}
            onChange={setAdmin}
            disabled={isSelf}
            label="管理者権限"
            description={isSelf ? '自分自身の権限は変更できません' : 'できること：イベント・バンド・メンバーの登録と、役割の割り振り'}
          />
        </div>
        <Toggle
          checked={active}
          onChange={setActive}
          disabled={isSelf}
          label="有効"
          description="オフにするとログインしても利用できなくなり、割り振りの候補から外れます"
        />
        <TextArea label="メモ（管理者のみ閲覧）" value={note} onChange={setNote} rows={2} />
      </form>
    </Modal>
  )
}

export function MembersPage() {
  const { snapshot, me, isAdmin, actions } = useData()
  const { run, pending } = useAction()
  const [tab, setTab] = useState<Tab>('all')
  const [q, setQ] = useState('')
  const blank = () => ({ name: '', kana: '', email: '', pw: generatePassword(), parts: [] as Part[], bands: [] as string[], admin: false })
  const [f, setF] = useState(blank)
  const [err, setErr] = useState<Partial<Record<'name' | 'email' | 'pw' | 'parts', string>>>({})
  const [editing, setEditing] = useState<Member | null>(null)
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(null)

  const set = <K extends keyof ReturnType<typeof blank>>(k: K, v: ReturnType<typeof blank>[K]) => setF((x) => ({ ...x, [k]: v }))
  const load = monthlyLoad(snapshot, monthOf(todayISO()))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const er: typeof err = {}
    if (!f.name.trim()) er.name = '名前を入力してください'
    if (!EMAIL_PATTERN.test(f.email.trim())) er.email = 'メールアドレスの形式が正しくありません'
    else if (snapshot.members.some((m) => m.email.toLowerCase() === f.email.trim().toLowerCase())) er.email = 'このメールアドレスは登録済みです'
    if (f.pw.length < MIN_PASSWORD_LENGTH) er.pw = `初期パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください`
    if (!f.parts.length) er.parts = 'パートを1つ以上選んでください'
    setErr(er)
    if (Object.keys(er).length) return
    const input = {
      name: f.name.trim(),
      kana: f.kana.trim() || null,
      email: f.email.trim(),
      password: f.pw,
      parts: f.parts,
      appRole: f.admin ? ('admin' as const) : ('member' as const),
      note: null,
      bandIds: f.bands,
    }
    const ok = await run(() => actions.createMember(input), {
      title: 'メンバーを登録しました',
      message: `${input.email} は初回ログイン時にパスワードを再設定します`,
    })
    if (ok) {
      setCreated({ name: input.name, email: input.email, password: input.password })
      setF(blank())
    }
  }

  const cards: (MemberCardData & { member: Member })[] = snapshot.members.map((m) => ({
    member: m,
    id: m.id,
    name: m.name,
    kana: m.kana,
    email: m.email,
    parts: m.parts,
    bands: bandNamesOf(snapshot, m.id),
    isAdmin: m.appRole === 'admin',
    invited: m.mustChangePassword,
    inactive: !m.active,
    load: load.get(m.id) ?? 0,
    isMe: m.id === me.id,
  }))
  const inTab = (c: MemberCardData, t: Tab) =>
    t === 'inactive' ? c.inactive : !c.inactive && (t === 'all' || (t === 'admin' ? c.isAdmin : c.invited))
  const counts = {
    all: cards.filter((c) => inTab(c, 'all')).length,
    admin: cards.filter((c) => inTab(c, 'admin')).length,
    invited: cards.filter((c) => inTab(c, 'invited')).length,
    inactive: cards.filter((c) => inTab(c, 'inactive')).length,
  }
  const keyword = q.trim().toLowerCase()
  const shown = cards.filter(
    (c) => inTab(c, tab) && (!keyword || [c.name, c.kana ?? '', c.email, ...c.bands].join(' ').toLowerCase().includes(keyword)),
  )

  const exportCsv = () =>
    downloadCsv(`members-${todayISO()}.csv`, [
      ['名前', 'ローマ字', 'メールアドレス', 'パート', '所属バンド', '権限', '状態', '今月の出演'],
      ...shown.map((c) => [
        c.name,
        c.kana ?? '',
        c.email,
        c.parts.map((p) => PART_SHORT[p]).join(' / '),
        c.bands.join(' / '),
        c.isAdmin ? '管理者' : 'メンバー',
        c.inactive ? '無効' : c.invited ? '招待中' : '有効',
        c.load,
      ]),
    ])

  const bandOpts = snapshot.bands.filter((b) => b.active).map((b) => ({ value: b.id, label: b.name, icon: 'amp' as const }))

  return (
    <Page
      eyebrow={isAdmin ? 'Admin · Members' : 'Member · Members'}
      title={isAdmin ? 'メンバー管理' : 'メンバー'}
      subtitle={isAdmin ? 'メンバーの登録と、パート・所属バンド・権限の管理を行います。' : 'メンバーの担当パートと所属バンドを確認できます。'}
      actions={
        <Button icon="table" onClick={exportCsv} disabled={!shown.length}>
          CSV書き出し
        </Button>
      }
    >
      <div className={isAdmin ? 'mb-layout' : 'mb-layout mb-layout--full'}>
        <div className="mb-main">
          <div className="mb-toolbar">
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'all', label: 'すべて', count: counts.all },
                { id: 'admin', label: '管理者', icon: 'crown', count: counts.admin },
                { id: 'invited', label: '招待中', count: counts.invited },
                ...(counts.inactive ? [{ id: 'inactive' as const, label: '無効', count: counts.inactive }] : []),
              ]}
            />
            <TextField
              className="mb-search"
              icon="search"
              placeholder="名前・メール・バンドで検索"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="メンバーを検索"
            />
          </div>
          {shown.length === 0 ? (
            <Card>
              <p className="rb-muted">条件に合うメンバーはいません。</p>
            </Card>
          ) : (
            <div className="mb-grid" key={tab + keyword}>
              {shown.map((c, i) => (
                <MemberCard
                  key={c.id}
                  member={c}
                  onEdit={isAdmin ? () => setEditing(c.member) : undefined}
                  style={{ '--i': i } as CSSVars}
                />
              ))}
            </div>
          )}
        </div>

        {isAdmin && (
          <aside className="mb-side">
            <Card eyebrow="New member" title="メンバーを登録" glow>
              <form className="mb-form" onSubmit={submit} noValidate>
                <TextField
                  label="名前"
                  required
                  icon="users"
                  value={f.name}
                  onChange={(e) => set('name', e.target.value)}
                  error={err.name}
                  placeholder="例：山田 太郎"
                />
                <TextField label="ローマ字" value={f.kana} onChange={(e) => set('kana', e.target.value)} placeholder="Yamada Taro" />
                <div className="mb-sep">
                  <span className="rb-eyebrow">
                    <Icon name="key" size={12} />
                    Login · 初期登録
                  </span>
                </div>
                <TextField
                  label="ログイン用メールアドレス"
                  required
                  icon="mail"
                  type="email"
                  value={f.email}
                  onChange={(e) => set('email', e.target.value)}
                  error={err.email}
                  placeholder="name@example.com"
                />
                <TextField
                  label="初期パスワード"
                  required
                  icon="lock"
                  type="password"
                  value={f.pw}
                  onChange={(e) => set('pw', e.target.value)}
                  error={err.pw}
                  help="初回ログイン時に本人が変更します"
                  autoComplete="new-password"
                  trailing={<IconButton icon="shuffle" label="パスワードを自動生成" size="sm" onClick={() => set('pw', generatePassword())} />}
                />
                <div className="mb-sep">
                  <span className="rb-eyebrow">
                    <Icon name="note" size={12} />
                    Part &amp; band
                  </span>
                </div>
                <ChipSelect label="担当パート" value={f.parts} onChange={(v) => set('parts', v as Part[])} options={ROLE_OPTS} />
                {err.parts && (
                  <p className="mb-err">
                    <Icon name="alert" size={14} />
                    {err.parts}
                  </p>
                )}
                {bandOpts.length > 0 && (
                  <ChipSelect label="所属バンド" value={f.bands} onChange={(v) => set('bands', v)} options={bandOpts} />
                )}
                <div className="mb-admin">
                  <Toggle
                    checked={f.admin}
                    onChange={(v) => set('admin', v)}
                    label="管理者権限"
                    description="できること：イベント・バンド・メンバーの登録と、役割の割り振り"
                  />
                </div>
                <Button type="submit" variant="primary" icon="user-plus" block size="lg" loading={pending}>
                  メンバーを登録
                </Button>
              </form>
            </Card>
          </aside>
        )}
      </div>

      {editing && <MemberEditModal key={editing.id} member={editing} onClose={() => setEditing(null)} />}
      {created && <CredentialsModal {...created} onClose={() => setCreated(null)} />}
    </Page>
  )
}
