import { EmptyState } from '../components/ui'
import { Link } from '../router'

export function NotFound({ message = 'ページが見つかりません。' }: { message?: string }) {
  return (
    <div className="center-page">
      <EmptyState icon="alert" title={message}>
        <Link to="/" className="btn btn-secondary">
          トップへ戻る
        </Link>
      </EmptyState>
    </div>
  )
}

export function Forbidden() {
  return (
    <div className="center-page">
      <EmptyState icon="lock" title="このページは管理者のみ閲覧できます">
        <Link to="/" className="btn btn-secondary">
          トップへ戻る
        </Link>
      </EmptyState>
    </div>
  )
}
