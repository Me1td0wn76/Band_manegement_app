import { Button, Card, EmptyState } from '../rb/core'
import { navigate } from '../router'

export function NotFound() {
  return (
    <div className="app-center">
      <Card>
        <EmptyState
          icon="cable"
          title="ページが見つかりません"
          message="URLが変わったか、削除された可能性があります。"
          action={
            <Button variant="primary" icon="dashboard" onClick={() => navigate('/dashboard')}>
              ダッシュボードへ
            </Button>
          }
        />
      </Card>
    </div>
  )
}

export function Forbidden() {
  return (
    <div className="app-center">
      <Card>
        <EmptyState
          icon="lock"
          title="この画面は管理者のみ使えます"
          message="登録・割り振りは管理者のみです。必要なときは管理者に依頼してください。"
          action={
            <Button variant="primary" icon="dashboard" onClick={() => navigate('/dashboard')}>
              ダッシュボードへ
            </Button>
          }
        />
      </Card>
    </div>
  )
}
