// =========================================================
// 管理者用メンバー操作（Supabase Edge Function / Deno）
//
// auth ユーザーの作成・メール/パスワード変更・削除には service_role キーが必要なため、
// ブラウザではなくこの関数で行う。呼び出し元が有効な管理者であることを必ず確認する。
//
// デプロイ: supabase functions deploy admin-members
// =========================================================
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return json({ error: 'サーバーの設定が不足しています' }, 500)

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // ---- 呼び出し元の確認 ----
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'ログインが必要です' }, 401)
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData.user) return json({ error: 'ログインが必要です' }, 401)
  const callerId = userData.user.id

  const { data: caller } = await admin
    .from('profiles')
    .select('app_role, active')
    .eq('id', callerId)
    .maybeSingle()
  if (!caller || caller.app_role !== 'admin' || !caller.active) {
    return json({ error: 'この操作は管理者のみ実行できます' }, 403)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'リクエストの形式が正しくありません' }, 400)
  }

  switch (body.action) {
    // ---- メンバー登録（メール・初期パスワード） ----
    case 'create': {
      const email = str(body.email)
      const password = typeof body.password === 'string' ? body.password : ''
      const name = str(body.name)
      const appRole = body.appRole === 'admin' ? 'admin' : 'member'
      if (!name) return json({ error: '名前を入力してください' }, 400)
      if (!email || !EMAIL_PATTERN.test(email)) return json({ error: 'メールアドレスの形式が正しくありません' }, 400)
      if (password.length < MIN_PASSWORD_LENGTH) {
        return json({ error: `パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください` }, 400)
      }

      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, part: str(body.part), must_change_password: true },
      })
      if (error || !data.user) {
        const message = /already|registered|exists/i.test(error?.message ?? '')
          ? 'このメールアドレスは既に登録されています'
          : (error?.message ?? 'ユーザーを作成できませんでした')
        return json({ error: message }, 400)
      }

      // トリガーで作られたプロフィールに残りの項目を反映
      const { error: profileError } = await admin
        .from('profiles')
        .update({
          name,
          part: str(body.part),
          note: str(body.note),
          app_role: appRole,
          must_change_password: true,
        })
        .eq('id', data.user.id)
      if (profileError) {
        await admin.auth.admin.deleteUser(data.user.id)
        return json({ error: profileError.message }, 400)
      }
      return json({ id: data.user.id })
    }

    // ---- メールアドレス変更・パスワード再設定 ----
    case 'update_auth': {
      const memberId = str(body.memberId)
      if (!memberId) return json({ error: 'memberId が必要です' }, 400)
      const email = str(body.email)
      const password = typeof body.password === 'string' ? body.password : null
      if (email && !EMAIL_PATTERN.test(email)) return json({ error: 'メールアドレスの形式が正しくありません' }, 400)
      if (password !== null && password.length < MIN_PASSWORD_LENGTH) {
        return json({ error: `パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください` }, 400)
      }
      if (!email && password === null) return json({ error: '変更内容がありません' }, 400)

      const attrs: { email?: string; email_confirm?: boolean; password?: string } = {}
      if (email) {
        attrs.email = email
        attrs.email_confirm = true
      }
      if (password !== null) attrs.password = password
      const { error } = await admin.auth.admin.updateUserById(memberId, attrs)
      if (error) return json({ error: error.message }, 400)

      const patch: Record<string, unknown> = {}
      if (email) patch.email = email
      if (password !== null) patch.must_change_password = true
      const { error: profileError } = await admin.from('profiles').update(patch).eq('id', memberId)
      if (profileError) return json({ error: profileError.message }, 400)
      return json({ ok: true })
    }

    // ---- メンバー削除（auth ユーザーごと削除。プロフィール等は cascade で消える） ----
    case 'delete': {
      const memberId = str(body.memberId)
      if (!memberId) return json({ error: 'memberId が必要です' }, 400)
      if (memberId === callerId) return json({ error: '自分自身は削除できません' }, 400)
      const { error } = await admin.auth.admin.deleteUser(memberId)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    default:
      return json({ error: '不明な操作です' }, 400)
  }
})
