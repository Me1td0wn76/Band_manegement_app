import { Icon } from '../rb/core'
import type { CSSVars } from '../rb/core'

/** 操作ごとの権限（メンバー / 管理者） */
export const PERMISSIONS: [action: string, member: boolean, admin: boolean][] = [
  ['イベント・タイムテーブル・裏方の閲覧', true, true],
  ['自分の参加可否の登録', true, true],
  ['自分のプロフィール・パスワードの変更', true, true],
  ['撮影・照明・SNS・タイムキーパーの担当', true, true],
  ['PA の担当', false, true],
  ['イベントの登録・編集・削除', false, true],
  ['タイムテーブルの編集・自動調整', false, true],
  ['裏方の自動割り振り・手動編集・確定', false, true],
  ['メンバーの登録・役割の設定・幹部権限の付与', false, true],
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
                幹部{youAreAdmin ? '（あなた）' : ''}
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
