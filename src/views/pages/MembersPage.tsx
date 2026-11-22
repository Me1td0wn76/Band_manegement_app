import { useState } from 'react'
import { useData } from '../../controllers/DataController'
import { bandsOfMember, memberLoad, todayISO } from '../../controllers/selectors'
import type { AppRole, Member } from '../../models/types'
import { useAction, useConfirm } from '../components/Feedback'
import { Icon } from '../components/Icon'
import { Avatar, Badge, Button, Card, EmptyState, IconButton, Input, PageHeader, Select } from '../components/ui'
import { APP_ROLE, downloadCsv } from '../format'
import { Link, navigate } from '../router'
import { MemberCreateModal, MemberEditModal, ResetPasswordModal } from './MemberModals'

type ModalState = { kind: 'create' } | { kind: 'edit'; member: Member } | { kind: 'password'; member: Member } | null

export function MembersPage() {
  const { snapshot, me, isAdmin, actions } = useData()
  const confirm = useConfirm()
  const { run } = useAction()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<AppRole | 'all'>('all')
  const [activeFilter, setActiveFilter] = useState<'active' | 'inactive' | 'all'>('active')
  const [modal, setModal] = useState<ModalState>(null)

  const load = memberLoad(snapshot)
  const upcomingLoad = memberLoad(snapshot, { upcomingOnly: true })
  const keyword = search.trim().toLowerCase()

  const rows = snapshot.members
    .filter((m) => roleFilter === 'all' || m.appRole === roleFilter)
    .filter((m) => activeFilter === 'all' || (activeFilter === 'active' ? m.active : !m.active))
    .map((m) => ({ member: m, bands: bandsOfMember(snapshot, m.id) }))
    .filter(
      ({ member, bands }) =>
        !keyword ||
        [member.name, member.email, member.part ?? '', ...bands.map((b) => b.band.name)].some((s) =>
          s.toLowerCase().includes(keyword),
        ),
    )

  const remove = async (member: Member) => {
    const ok = await confirm({
      title: 'メンバーを削除',
      message: (
        <>
          <p>「{member.name}」のアカウントを完全に削除します。役割の割り当てやバンドの所属も削除されます。</p>
          <p className="muted small top-gap">一時的に外すだけなら「編集」から無効にするのがおすすめです。</p>
        </>
      ),
      confirmLabel: '削除する',
      danger: true,
    })
    if (ok) await run(() => actions.deleteMember(member.id), 'メンバーを削除しました')
  }

  const exportCsv = () =>
    downloadCsv(`members-${todayISO()}.csv`, [
      ['名前', 'メールアドレス', 'パート', '所属バンド', '権限', '状態', '担当回数'],
      ...rows.map(({ member, bands }) => [
        member.name,
        member.email,
        member.part ?? '',
        bands.map((b) => b.band.name).join(' / '),
        APP_ROLE[member.appRole].label,
        member.active ? '有効' : '無効',
        load.get(member.id) ?? 0,
      ]),
    ])

  return (
    <>
      <PageHeader
        title="メンバー"
        description={`${snapshot.members.filter((m) => m.active).length}人の有効メンバーが登録されています。`}
        actions={
          isAdmin && (
            <>
              <Button icon="download" onClick={exportCsv} disabled={rows.length === 0}>
                CSV出力
              </Button>
              <Button variant="primary" icon="plus" onClick={() => setModal({ kind: 'create' })}>
                メンバー登録
              </Button>
            </>
          )
        }
      />

      <Card padded={false}>
        <div className="toolbar">
          <label className="search">
            <Icon name="search" size={16} />
            <Input
              type="search"
              placeholder="名前・パート・バンドで検索"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="メンバーを検索"
            />
          </label>
          <div className="toolbar-filters">
            <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as AppRole | 'all')} aria-label="権限で絞り込み">
              <option value="all">すべての権限</option>
              <option value="admin">管理者</option>
              <option value="member">メンバー</option>
            </Select>
            <Select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value as 'active' | 'inactive' | 'all')}
              aria-label="状態で絞り込み"
            >
              <option value="active">有効のみ</option>
              <option value="inactive">無効のみ</option>
              <option value="all">すべての状態</option>
            </Select>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon="users" title="該当するメンバーはいません" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>名前</th>
                  <th>メールアドレス</th>
                  <th>パート</th>
                  <th>所属バンド</th>
                  <th>権限</th>
                  <th className="num">担当回数</th>
                  {isAdmin && <th className="th-actions">操作</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ member, bands }) => (
                  <tr
                    key={member.id}
                    className={`row-link${member.active ? '' : ' is-inactive'}`}
                    onClick={() => navigate(`/members/${member.id}`)}
                  >
                    <td>
                      <span className="name-cell">
                        <Avatar name={member.name} size={28} />
                        <Link to={`/members/${member.id}`} className="strong-link" onClick={(e) => e.stopPropagation()}>
                          {member.name}
                        </Link>
                        {member.id === me.id && <Badge tone="accent">あなた</Badge>}
                        {!member.active && <Badge tone="danger">無効</Badge>}
                        {isAdmin && member.active && member.mustChangePassword && <Badge tone="warn">初期PW</Badge>}
                      </span>
                    </td>
                    <td className="muted">{member.email}</td>
                    <td>{member.part ?? '—'}</td>
                    <td>
                      {bands.length === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        <span className="tag-list">
                          {bands.map((b) => (
                            <span key={b.band.id} className="tag">
                              {b.band.name}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td>
                      <Badge tone={APP_ROLE[member.appRole].tone}>{APP_ROLE[member.appRole].label}</Badge>
                    </td>
                    <td className="num" title={`今後の担当 ${upcomingLoad.get(member.id) ?? 0}件`}>
                      {load.get(member.id) ?? 0}
                    </td>
                    {isAdmin && (
                      <td className="td-actions" onClick={(e) => e.stopPropagation()}>
                        <IconButton icon="edit" label={`${member.name}を編集`} onClick={() => setModal({ kind: 'edit', member })} />
                        <IconButton
                          icon="key"
                          label={`${member.name}のパスワードを再設定`}
                          onClick={() => setModal({ kind: 'password', member })}
                        />
                        <IconButton
                          icon="trash"
                          tone="danger"
                          label={`${member.name}を削除`}
                          disabled={member.id === me.id}
                          onClick={() => remove(member)}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modal?.kind === 'create' && <MemberCreateModal onClose={() => setModal(null)} />}
      {modal?.kind === 'edit' && <MemberEditModal member={modal.member} onClose={() => setModal(null)} />}
      {modal?.kind === 'password' && <ResetPasswordModal member={modal.member} onClose={() => setModal(null)} />}
    </>
  )
}
