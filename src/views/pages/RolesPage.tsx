import { useState, type FormEvent } from 'react'
import { useData } from '../../controllers/DataController'
import { ROLE_ICONS, type RoleIcon, type RoleScope, type StaffRole } from '../../models/types'
import { Page } from '../AppShell'
import { useAction, useConfirm } from '../feedback'
import { Button, Card, ChipSelect, EmptyState, Icon, IconButton, RoleBadge, TextField, Toggle, cx, type CSSVars } from '../rb/core'
import { ROLE_ICON_LABEL, SCOPE_LABEL, roleColor } from '../roleStyle'

interface Form {
  name: string
  description: string
  icon: RoleIcon
  scope: RoleScope
  defaultSlots: string
  adminOnly: boolean
  sortOrder: string
}

/** 裏方の役割マスタ（撮影・照明・SNS・タイムキーパー・PA など）。幹部のみ */
export function RolesPage() {
  const { snapshot, actions } = useData()
  const { run, pending } = useAction()
  const confirm = useConfirm()
  const roles = snapshot.roles

  const blank = (): Form => ({
    name: '',
    description: '',
    icon: 'users',
    scope: 'event',
    defaultSlots: '1',
    adminOnly: false,
    sortOrder: String(Math.max(0, ...roles.map((r) => r.sortOrder)) + 1),
  })
  const [editing, setEditing] = useState<StaffRole | null>(null)
  const [f, setF] = useState<Form>(blank)
  const [err, setErr] = useState<string | null>(null)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }))

  const startEdit = (r: StaffRole) => {
    setEditing(r)
    setF({
      name: r.name,
      description: r.description ?? '',
      icon: r.icon,
      scope: r.scope,
      defaultSlots: String(r.defaultSlots),
      adminOnly: r.adminOnly,
      sortOrder: String(r.sortOrder),
    })
    setErr(null)
  }
  const reset = () => {
    setEditing(null)
    setF(blank())
    setErr(null)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!f.name.trim()) {
      setErr('役割名を入力してください')
      return
    }
    if (roles.some((r) => r.name === f.name.trim() && r.id !== editing?.id)) {
      setErr('同じ名前の役割が登録済みです')
      return
    }
    if (editing && editing.scope !== f.scope) {
      const ok = await confirm({
        title: '割り振りの単位を変更',
        message: `「${editing.name}」を「${SCOPE_LABEL[f.scope].long}」に変えると、この役割の割り当てはすべてのイベントで外れます。あとで割り振り直してください。`,
        confirmLabel: '変更する',
        danger: true,
      })
      if (!ok) return
    }
    setErr(null)
    const input = {
      name: f.name.trim(),
      description: f.description.trim() || null,
      icon: f.icon,
      scope: f.scope,
      defaultSlots: Math.max(0, Math.min(20, Math.floor(Number(f.defaultSlots) || 0))),
      adminOnly: f.adminOnly,
      sortOrder: Math.floor(Number(f.sortOrder) || 0),
    }
    const ok = await run(() => (editing ? actions.updateRole(editing.id, input) : actions.createRole(input)), {
      title: editing ? '役割を更新しました' : '役割を追加しました',
      message: input.name,
    })
    if (ok) reset()
  }

  const remove = async (r: StaffRole) => {
    const used = snapshot.assignments.filter((a) => a.roleId === r.id).length
    const ok = await confirm({
      eyebrow: 'Delete role',
      title: '役割を削除',
      message: `『${r.name}』を削除します。${used ? `この役割の割り当て ${used}件も削除されます。` : ''}この操作は元に戻せません。`,
      confirmLabel: '削除する',
      danger: true,
    })
    if (ok && (await run(() => actions.deleteRole(r), { title: '役割を削除しました', message: r.name })) && editing?.id === r.id) reset()
  }

  return (
    <Page
      eyebrow="Admin · Roles"
      title="役割の設定"
      subtitle="裏方の役割と、ライブ全体で固定するか出演ごとに交代するか、必要な人数を決めます。PA のように幹部だけが担当できる役割も設定できます。"
    >
      <div className="bd-layout">
        <div className="bd-main">
          {roles.length === 0 ? (
            <Card className="app-full">
              <EmptyState icon="knob" title="役割がありません" message="右のフォームから役割を追加してください。" />
            </Card>
          ) : (
            <ul className="rl-list">
              {roles.map((r, i) => {
                const used = snapshot.assignments.filter((a) => a.roleId === r.id).length
                return (
                  <li key={r.id} className={cx('rl-item', editing?.id === r.id && 'is-editing')} style={{ '--i': i } as CSSVars}>
                    <span className="rl-icon" style={{ '--rb-role': roleColor(roles, r.id) } as CSSVars}>
                      <Icon name={r.icon} size={24} />
                    </span>
                    <div className="rl-main">
                      <div className="rl-title">
                        <RoleBadge name={r.name} icon={r.icon} color={roleColor(roles, r.id)} />
                        <span className="rb-chip-mini">{SCOPE_LABEL[r.scope].long}</span>
                        {r.adminOnly && (
                          <span className="sb-adminonly">
                            <Icon name="crown" size={12} />
                            幹部のみ
                          </span>
                        )}
                      </div>
                      {r.description && <p className="rb-muted rb-small">{r.description}</p>}
                      <div className="rb-mono rb-muted rl-meta">
                        既定 {r.defaultSlots}人{r.scope === 'act' ? '／1出演' : ''}・表示順 {r.sortOrder}・割り当て {used}件
                      </div>
                    </div>
                    <div className="rl-actions">
                      <IconButton icon="edit" size="sm" label={`${r.name}を編集`} onClick={() => startEdit(r)} />
                      <IconButton icon="trash" size="sm" variant="danger" label={`${r.name}を削除`} onClick={() => void remove(r)} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <aside className="bd-side">
          <Card eyebrow={editing ? 'Edit role' : 'New role'} title={editing ? '役割を編集' : '役割を追加'} glow>
            <form className="bd-form" onSubmit={submit} noValidate>
              <TextField label="役割名" required icon="knob" value={f.name} onChange={(e) => set('name', e.target.value)} error={err} placeholder="例：受付" />
              <TextField label="説明" value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="例：チケットの確認と物販" />
              <ChipSelect
                label="アイコン"
                multiple={false}
                value={[f.icon]}
                onChange={(v) => v[0] && set('icon', v[0] as RoleIcon)}
                options={ROLE_ICONS.map((ic) => ({ value: ic, label: ROLE_ICON_LABEL[ic], icon: ic }))}
              />
              <fieldset className="rl-scope">
                <legend className="rb-field__label">割り振りの単位</legend>
                {(['event', 'act'] as RoleScope[]).map((s) => (
                  <label key={s} className={cx('rl-radio', f.scope === s && 'is-selected')}>
                    <input type="radio" name="scope" value={s} checked={f.scope === s} onChange={() => set('scope', s)} />
                    <span>
                      <b>{SCOPE_LABEL[s].long}</b>
                      <span className="rb-muted rb-small">
                        {s === 'event' ? '例：PA・タイムキーパー・SNS。その日はずっと同じ人が担当します' : '例：照明・撮影。出演（バンド）ごとに担当を交代します'}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <div className="app-two">
                <TextField
                  label={f.scope === 'act' ? '既定の人数（1出演あたり）' : '既定の人数'}
                  type="number"
                  min={0}
                  max={20}
                  icon="users"
                  value={f.defaultSlots}
                  onChange={(e) => set('defaultSlots', e.target.value)}
                />
                <TextField label="表示順" type="number" icon="table" value={f.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
              </div>
              <div className="mb-admin">
                <Toggle checked={f.adminOnly} onChange={(v) => set('adminOnly', v)} label="幹部のみ" description="幹部（管理者）だけが担当できます。PA など" />
              </div>
              <p className="rb-muted rb-small">既定の人数は新しいイベントに使われます。各イベントの人数は「裏方の割り振り」で変えられます。</p>
              <Button type="submit" variant="primary" icon="check" block size="lg" loading={pending}>
                {editing ? '役割を更新' : '役割を追加'}
              </Button>
              {editing && (
                <Button variant="ghost" block onClick={reset}>
                  編集をやめる
                </Button>
              )}
            </form>
          </Card>
        </aside>
      </div>
    </Page>
  )
}
