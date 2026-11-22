import { useData } from '../../controllers/DataController'
import type { Member } from '../../models/types'
import { Page } from '../AppShell'
import { useAction } from '../feedback'
import { Avatar, Card, StatusBadge, Toggle, type CSSVars } from '../rb/core'
import { PermissionTable } from './permissions'

/** 幹部（管理者）権限の付与・解除と、権限でできることの一覧 */
export function PermissionsPage() {
  const { snapshot, me, actions } = useData()
  const { run, pending } = useAction()
  const members = snapshot.members.filter((m) => m.active)
  const leads = members.filter((m) => m.appRole === 'admin').length
  const paRoles = snapshot.roles.filter((r) => r.adminOnly).map((r) => r.name)

  const setLead = (m: Member, on: boolean) =>
    run(
      () =>
        actions.updateMember(m.id, {
          name: m.name,
          kana: m.kana,
          email: m.email,
          appRole: on ? 'admin' : 'member',
          active: m.active,
          note: m.note,
        }),
      { title: on ? '幹部にしました' : '幹部から外しました', message: m.name },
    )

  return (
    <Page
      eyebrow="Admin · Permissions"
      title="権限設定"
      subtitle={`幹部（管理者）は${paRoles.length ? ` ${paRoles.join('・')} の担当と、` : ''}イベント・タイムテーブル・メンバーの登録、裏方の割り振りができます。`}
    >
      <div className="pm-grid">
        <Card eyebrow="Leads" title={`幹部（${leads}人）`} style={{ '--i': 1 } as CSSVars}>
          <ul className="pm-list">
            {members.map((m, i) => {
              const self = m.id === me.id
              return (
                <li key={m.id} style={{ '--i': i } as CSSVars}>
                  <Avatar name={m.name} size={36} badge={m.appRole === 'admin' ? { icon: 'crown', color: 'var(--amber)' } : undefined} />
                  <div className="pm-who">
                    <b>{m.name}</b>
                    <span className="pm-roles">
                      <StatusBadge status={m.appRole === 'admin' ? 'admin' : 'member'} size="sm" />
                      {m.mustChangePassword && <StatusBadge status="invited" size="sm" />}
                    </span>
                  </div>
                  <Toggle
                    checked={m.appRole === 'admin'}
                    disabled={self || pending}
                    onChange={(v) => void setLead(m, v)}
                    label="幹部"
                    description={self ? '自分自身は変更できません' : undefined}
                  />
                </li>
              )
            })}
          </ul>
        </Card>
        <Card eyebrow="Permissions" title="できること" style={{ '--i': 2 } as CSSVars}>
          <PermissionTable youAreAdmin />
          <p className="rb-muted rb-small app-gap-top">
            幹部が1人もいなくならないよう、自分自身の権限はここでは外せません。外すときは別の幹部に依頼してください。幹部でなくなったメンバーの「幹部のみ」の担当は、割り振り画面で確認が必要になります。
          </p>
        </Card>
      </div>
    </Page>
  )
}
