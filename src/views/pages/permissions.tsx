import { Icon } from '../rb/core'
import type { CSSVars } from '../rb/core'

/** 操作ごとの権限（メンバー / 管理者） */
export const PERMISSIONS: [action: string, member: boolean, admin: boolean][] = [
  ['イベント・出演予定の閲覧', true, true],
  ['メンバー・バンドの閲覧', true, true],
  ['自分のプロフィール・パートの変更', true, true],
  ['イベントの登録・編集・削除', false, true],
  ['バンドの登録・編集・削除', false, true],
  ['メンバーの登録・パスワード再設定・削除', false, true],
  ['役割の自動割り振り・手動編集・確定', false, true],
  ['管理者権限の付与・解除', false, true],
]

function Mark({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="mv-ok">
      <Icon name="check" size={14} strokeWidth={2.4} />
      できる
    </span>
  ) : (
    <span className="mv-no">
      <Icon name="lock" size={14} />
      できない
    </span>
  )
}

export function PermissionTable({ youAreAdmin }: { youAreAdmin: boolean }) {
  return (
    <div className="rb-table-wrap app-plain-table">
      <table className="mv-perm">
        <thead>
          <tr>
            <th scope="col">操作</th>
            <th scope="col">メンバー{youAreAdmin ? '' : '（あなた）'}</th>
            <th scope="col">
              <span className="mv-admin">
                <Icon name="crown" size={14} />
                管理者{youAreAdmin ? '（あなた）' : ''}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {PERMISSIONS.map(([t, m, a], i) => (
            <tr key={t} style={{ '--i': i } as CSSVars}>
              <td>{t}</td>
              <td>
                <Mark ok={m} />
              </td>
              <td>
                <Mark ok={a} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
