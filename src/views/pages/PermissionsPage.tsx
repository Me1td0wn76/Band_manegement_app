import { useData } from '../../controllers/DataController'
import type { Member } from '../../models/types'
import { Page } from '../AppShell'
import { useAction } from '../feedback'
import { Avatar, Card, RoleBadge, StatusBadge, Toggle, type CSSVars } from '../rb/core'
import { PermissionTable } from './permissions'

/** 管理者権限の付与・解除と、権限でできることの一覧 */
export function PermissionsPage() {
  const { snapshot, me, actions } = useData()
  const { run, pending } = useAction()
  const members = snapshot.members.filter((m) => m.active)
  const admins = members.filter((m) => m.appRole === 'admin').length

  const setAdmin = (m: Member, on: boolean) =>
    run(
      () =>
        actions.updateMember(m.id, {
          name: m.name,
          kana: m.kana,
          email: m.email,
          parts: m.parts,
          appRole: on ? 'admin' : 'member',
          active: m.active,
          note: m.note,
        }),
      { title: on ? '管理者権限を付与しました' : '管理者権限を外しました', message: m.name },
    )

  return (
    <Page eyebrow="Admin · Permissions" title="権限設定" subtitle="管理者はイベント・バンド・メンバーの登録と、役割の割り振りができます。">
      <div className="pm-grid">
        <Card eyebrow="Admins" title={`管理者権限（${admins}人）`} style={{ '--i': 1 } as CSSVars}>
          <ul className="pm-list">
            {members.map((m, i) => {
              const self = m.id === me.id
              return (
                <li key={m.id} style={{ '--i': i } as CSSVars}>
                  <Avatar name={m.name} size={36} role={m.parts[0]} />
                  <div className="pm-who">
                    <b>{m.name}</b>
                    <span className="pm-roles">
                      {m.parts.map((p) => (
                        <RoleBadge key={p} role={p} size="sm" />
                      ))}
                      {m.mustChangePassword && <StatusBadge status="invited" size="sm" />}
                    </span>
                  </div>
                  <Toggle
                    checked={m.appRole === 'admin'}
                    disabled={self || pending}
                    onChange={(v) => void setAdmin(m, v)}
                    label="管理者"
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
            管理者が1人もいなくならないよう、自分自身の権限はここでは外せません。外すときは別の管理者に依頼してください。
          </p>
        </Card>
      </div>
    </Page>
  )
}
