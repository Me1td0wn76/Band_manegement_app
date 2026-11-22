# Riffboard — バンド管理アプリ

イベント・メンバー・バンドの管理と、役割（パート）の自動割り振りを行う、数十人規模のバンド／サークル向けアプリです。

- フロントエンド：React 19 + TypeScript + Vite（GitHub Pages で無料配信）
- バックエンド：Supabase 無料プラン（PostgreSQL・認証・Edge Function）
- Supabase を設定しなければ、ブラウザ内のデモデータで動きます（すぐ試せます）

## 機能

| 機能 | 画面 | 内容 |
| --- | --- | --- |
| ログイン | ログイン | メールアドレスとパスワードでログイン |
| メール・パスワードの初期登録 | メンバー管理 → 初期登録 | 管理者がメールアドレスと初期パスワードを登録 → 本人が初回ログインでパスワードを設定し直し、担当パートを登録 |
| 管理者ダッシュボード | ダッシュボード | 今月のイベント数・メンバー数・未割り当ての枠、次のライブまでのカウントダウン、割り振り状況、最近の活動 |
| イベントの登録・管理・表表示 | イベント管理 | 登録・編集・削除、状態タブと検索、並べ替えできる表、CSV 書き出し |
| メンバーの登録・管理・閲覧 | メンバー管理 | 登録（初期パスワードの自動生成）、編集、パスワード再設定、無効化、削除、CSV 書き出し |
| バンドの登録・管理 | バンド管理 | メンバーと担当パートの編成、活動中／休止中 |
| 役割の自動割り振り | 役割の割り振り | イベント × バンドごとのパートの枠（Vo/Gt/Ba/Dr/Key）へ自動で割り振り |
| 自動割り振り時の管理 | 役割の割り振り | ルール（編成優先・パート優先・出演回数の平準化・兼任）、枠のロック、重複・パート外の検出、履歴、元に戻す、確定 |
| 手動編集 | 役割の割り振り | 枠をクリックして選ぶ、控えのメンバーをドラッグ、枠どうしの入れ替え、枠の追加・削除 |
| admin 権限 | 権限設定ほか | 管理者だけの画面・操作。DB 側も RLS で管理者以外の書き込みを拒否 |

メンバー（一般）はダッシュボードの代わりに「マイページ」（自分の出演予定と担当パート）が表示され、イベント・バンド・メンバーは閲覧のみです。

## 試してみる（デモモード）

```bash
npm install
npm run dev
```

ログイン画面の「Demo accounts」から選ぶとログインできます。

| 権限 | メールアドレス | パスワード |
| --- | --- | --- |
| 管理者 | admin@example.com | admin1234 |
| メンバー | member@example.com | member1234 |

デモのデータはこのブラウザの localStorage にだけ保存されます（サイドバーの「デモデータを初期化」で元に戻せます）。

## 構成（MVC）

```
src/
├── models/            Model：ドメインの型とデータアクセス
│   ├── types.ts
│   ├── slots.ts       パートの枠のひな形
│   └── repositories/  Repository インターフェースと Supabase 実装・デモ実装
├── controllers/       Controller：画面と Model の仲立ち
│   ├── AuthController.tsx   ログイン状態
│   ├── DataController.tsx   データの読み込みと操作（保存 → 活動ログ → 再読込）
│   ├── selectors.ts         集計（出演数・空き枠・重複など）
│   └── autoAssign.ts        自動割り振りのアルゴリズム
└── views/             View：画面
    ├── pages/         各画面
    ├── rb/            Riffboard デザインシステムのコンポーネント
    └── styles/        tokens.css（デザイントークン）/ riffboard.css / app.css
supabase/
├── migrations/        テーブル・RLS・関数
└── functions/admin-members/  メンバー作成などの管理者用 Edge Function
```

### 自動割り振りのルール

ロックした枠は残したまま、ランダムな貪欲法を160回試して、いちばん良い案を採用します。

1. 埋まった枠が多い
2. （編成優先）バンドの編成メンバーが、自分のパートの枠に入っている
3. （パート優先）担当パートが合う人が入っている
4. （平準化）その月の出演数が少ない人が入っている

「兼任を許可」がオフのときは、1つのバンドで同じ人が2枠に入ると「重複」になり、確定できません。

## Supabase で本番運用する

すべて無料枠に収まります（数十人規模なら DB・認証・Edge Function の上限に余裕があります）。

1. [Supabase](https://supabase.com) でプロジェクトを作る
2. SQL Editor で `supabase/migrations/20261122000000_init.sql` を実行する
3. Authentication → Users → **Add user** で最初の管理者を作る（「Auto Confirm User」をオン）。最初に作ったユーザーは自動で管理者になります
4. Authentication → Sign In / Providers で **Allow new users to sign up をオフ**にする（メンバー登録は管理者だけが行うため）
5. Edge Function をデプロイする

   ```bash
   npx supabase login
   npx supabase link --project-ref <プロジェクトID>
   npx supabase functions deploy admin-members
   ```

6. `.env.example` を `.env.local` にコピーし、Project Settings → API の URL と anon（publishable）キーを入れる

   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=...
   ```

7. `npm run dev` で起動し、手順3の管理者でログインする

### セキュリティ

- テーブルはすべて RLS 有効。閲覧は有効なメンバーのみ、書き込みは管理者のみ（自分の参加パート・名前の変更と活動ログの記録を除く）
- 一般メンバーが自分の権限・状態・メールアドレスを書き換えようとすると、トリガーで拒否されます
- auth ユーザーの作成・削除・パスワード再設定は service_role キーが必要なため、呼び出し元が管理者かを確認する Edge Function で行います（service_role キーはブラウザに出しません）
- anon キーは公開前提のキーです。データの保護は RLS で行っています

## GitHub Pages へのデプロイ

`.github/workflows/deploy.yml` が `main` への push でビルドと公開を行います。

1. リポジトリの Settings → Pages → Source を **GitHub Actions** にする
2. Settings → Secrets and variables → Actions に `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を登録する（未登録ならデモモードで公開されます）
3. `main` に push する

`https://<ユーザー名>.github.io/<リポジトリ名>/` で公開されます。ルーティングはハッシュ（`#/events` など）なので、GitHub Pages でもページの再読み込みで 404 になりません。

## スクリプト

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー |
| `npm run build` | 型チェックと本番ビルド（`dist/`） |
| `npm run lint` | oxlint |
| `npm run preview` | ビルド結果の確認 |
