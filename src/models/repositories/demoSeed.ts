import type { Activity, AppSnapshot, Assignment, EventRoleSlot, LiveEvent, StaffRole, TimetableItem } from '../types'

/** デモモードの初期データ。日付は「今日」からの相対で作るので、いつ開いても今後のイベントがある */

export const DEMO_ACCOUNTS = [
  { label: '幹部', email: 'admin@example.com', password: 'admin1234' },
  { label: 'メンバー', email: 'member@example.com', password: 'member1234' },
] as const

const DEFAULT_PASSWORD = 'password123'

function isoDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

export function createDemoSeed(): { snapshot: AppSnapshot; passwords: Record<string, string> } {
  const now = new Date().toISOString()

  type Def = [id: string, name: string, kana: string, email: string, opts?: { admin?: boolean; active?: boolean; invited?: boolean }]
  const defs: Def[] = [
    ['m01', '佐藤 健太', 'Sato Kenta', 'admin@example.com', { admin: true }],
    ['m02', '鈴木 美咲', 'Suzuki Misaki', 'member@example.com'],
    ['m03', '高橋 翔', 'Takahashi Sho', 'takahashi@example.com'],
    ['m04', '田中 結衣', 'Tanaka Yui', 'tanaka@example.com'],
    ['m05', '伊藤 大輝', 'Ito Daiki', 'ito@example.com', { admin: true }],
    ['m06', '渡辺 さくら', 'Watanabe Sakura', 'watanabe@example.com'],
    ['m07', '中村 蓮', 'Nakamura Ren', 'nakamura@example.com'],
    ['m08', '小林 陽菜', 'Kobayashi Hina', 'kobayashi@example.com'],
    ['m09', '加藤 悠真', 'Kato Yuma', 'kato@example.com'],
    ['m10', '吉田 葵', 'Yoshida Aoi', 'yoshida@example.com', { invited: true }],
    ['m11', '山本 湊', 'Yamamoto Minato', 'yamamoto@example.com', { admin: true }],
    ['m12', '松本 凛', 'Matsumoto Rin', 'matsumoto@example.com'],
    ['m13', '井上 颯', 'Inoue Hayate', 'inoue@example.com'],
    ['m14', '木村 楓', 'Kimura Kaede', 'kimura@example.com', { active: false }],
  ]

  const members = defs.map(([id, name, kana, email, opts = {}]) => ({
    id,
    name,
    kana,
    email,
    note: null,
    appRole: opts.admin ? ('admin' as const) : ('member' as const),
    active: opts.active ?? true,
    mustChangePassword: opts.invited ?? false,
    createdAt: opts.invited ? ago(60 * 24 * 2) : ago(60 * 24 * 90),
  }))

  const passwords: Record<string, string> = {}
  for (const m of members) {
    passwords[m.id] = DEMO_ACCOUNTS.find((a) => a.email === m.email)?.password ?? DEFAULT_PASSWORD
  }

  const roles: StaffRole[] = [
    { id: 'r-pa', name: 'PA', description: '音響卓の操作。幹部のみ担当できます', icon: 'sliders', scope: 'event', defaultSlots: 1, adminOnly: true, sortOrder: 1 },
    { id: 'r-tk', name: 'タイムキーパー', description: '進行と転換の時間を管理します', icon: 'stopwatch', scope: 'event', defaultSlots: 1, adminOnly: false, sortOrder: 2 },
    { id: 'r-sns', name: 'SNS', description: '告知と当日の実況投稿', icon: 'megaphone', scope: 'event', defaultSlots: 1, adminOnly: false, sortOrder: 3 },
    { id: 'r-light', name: '照明', description: '出演ごとに照明卓を操作します', icon: 'spotlight', scope: 'act', defaultSlots: 1, adminOnly: false, sortOrder: 4 },
    { id: 'r-photo', name: '撮影', description: '出演ごとに写真・動画を記録します', icon: 'camera', scope: 'act', defaultSlots: 1, adminOnly: false, sortOrder: 5 },
  ]

  const ev = (
    id: string,
    title: string,
    offset: number,
    status: LiveEvent['status'],
    venue: string,
    openTime: string,
    startTime: string,
    targetEndTime: string | null,
    changeoverMinutes: number,
    capacity: number,
    sold: number,
    confirmed = false,
  ): LiveEvent => ({
    id,
    title,
    date: isoDate(offset),
    openTime,
    startTime,
    targetEndTime,
    changeoverMinutes,
    venue,
    capacity,
    sold,
    description: null,
    status,
    staffConfirmedAt: confirmed ? ago(60 * 24) : null,
    createdAt: now,
  })

  const events: LiveEvent[] = [
    ev('e01', '新歓ライブ', -30, 'done', '学生会館ホール', '16:30', '17:00', '20:00', 10, 150, 132, true),
    ev('e02', '野外フェス出演', -9, 'cancelled', '中央公園 特設ステージ', '12:30', '13:00', null, 10, 400, 40),
    ev('e00', 'スタジオライブ配信', 0, 'confirmed', 'スタジオ ペンタ 3st', '18:30', '19:00', '20:30', 10, 30, 24, true),
    ev('e03', '定期ライブ vol.12', 10, 'open', 'ライブハウス SOUND BOX', '17:30', '18:00', '21:00', 15, 120, 64),
    ev('e04', '学園祭ステージ', 24, 'open', '中庭メインステージ', '11:30', '12:00', '16:00', 10, 300, 0),
    ev('e05', 'アコースティックナイト', 45, 'draft', 'カフェ Lumen', '18:30', '19:00', '21:00', 10, 40, 0),
  ]

  const lineups: [eventId: string, acts: [name: string, minutes: number, kind?: 'break'][]][] = [
    ['e01', [['Midnight Echo', 25], ['Blue Tram', 25], ['Paper Sky', 25], ['休憩', 15, 'break'], ['春雷', 25], ['Neon Static', 30]]],
    ['e02', [['Blue Tram', 30], ['Velvet Amp', 30]]],
    ['e00', [['Paper Sky', 25], ['春雷', 25], ['Low Frequency', 20]]],
    ['e03', [['Midnight Echo', 30], ['Blue Tram', 30], ['春雷', 30], ['休憩', 15, 'break'], ['Paper Sky', 30], ['Neon Static', 30], ['Velvet Amp', 35]]],
    ['e04', [['夜明けのスキップ', 20], ['Low Frequency', 20], ['Midnight Echo', 25], ['Blue Tram', 25], ['休憩', 20, 'break'], ['Paper Sky', 25], ['春雷', 25], ['Neon Static', 25], ['Velvet Amp', 30]]],
    ['e05', [['Paper Sky（弾き語り）', 20], ['春雷 アコースティック', 20], ['Low Frequency', 25], ['夜明けのスキップ', 20]]],
  ]

  const items: TimetableItem[] = []
  for (const [eventId, acts] of lineups) {
    acts.forEach(([name, minutes, kind], i) => {
      items.push({
        id: `${eventId}-i${i + 1}`,
        eventId,
        kind: kind ?? 'act',
        name,
        minutes,
        sortOrder: i,
        // 定期ライブはトリを固定しておく
        locked: eventId === 'e03' && i === acts.length - 1,
        note: null,
      })
    })
  }

  const roleSlots: EventRoleSlot[] = events.flatMap((e) => roles.map((r) => ({ eventId: e.id, roleId: r.id, slots: r.defaultSlots })))
  // 学園祭は撮影を2人にする
  roleSlots.find((s) => s.eventId === 'e04' && s.roleId === 'r-photo')!.slots = 2

  let seq = 0
  const assignments: Assignment[] = []
  const assign = (eventId: string, roleId: string, itemId: string | null, memberId: string, locked = false) =>
    assignments.push({ id: `a${++seq}`, eventId, roleId, itemId, memberId, locked, createdAt: now })

  // 終わったイベント・今日のイベントは埋まっている
  const fill = (eventId: string, pa: string, tk: string, sns: string, rotation: string[]) => {
    assign(eventId, 'r-pa', null, pa)
    assign(eventId, 'r-tk', null, tk)
    assign(eventId, 'r-sns', null, sns)
    const acts = items.filter((i) => i.eventId === eventId && i.kind === 'act')
    acts.forEach((a, k) => {
      assign(eventId, 'r-light', a.id, rotation[(k * 2) % rotation.length])
      assign(eventId, 'r-photo', a.id, rotation[(k * 2 + 1) % rotation.length])
    })
  }
  fill('e01', 'm05', 'm03', 'm06', ['m02', 'm04', 'm07', 'm08', 'm09', 'm12', 'm13'])
  fill('e00', 'm11', 'm08', 'm04', ['m07', 'm09', 'm12', 'm13'])

  // 定期ライブは途中まで。PA はロック済み、1か所は同じ出演で兼任（重複）
  assign('e03', 'r-pa', null, 'm01', true)
  assign('e03', 'r-tk', null, 'm06')
  assign('e03', 'r-light', 'e03-i1', 'm07')
  assign('e03', 'r-photo', 'e03-i1', 'm12')
  assign('e03', 'r-light', 'e03-i2', 'm09')
  assign('e03', 'r-photo', 'e03-i2', 'm09')

  const exclusions = [
    { eventId: 'e03', memberId: 'm13', reason: 'アルバイト' },
    { eventId: 'e04', memberId: 'm02', reason: '帰省' },
    { eventId: 'e04', memberId: 'm08', reason: null },
  ]

  const activities: Activity[] = [
    { id: 'l1', actorId: 'm01', kind: 'member', text: '吉田 葵 をメンバーに登録', eventId: null, createdAt: ago(60 * 26) },
    { id: 'l2', actorId: 'm11', kind: 'assign', text: '裏方の割り振りを確定', eventId: 'e01', createdAt: ago(60 * 24 * 31) },
    { id: 'l3', actorId: 'm01', kind: 'event', text: 'イベント「アコースティックナイト」を登録', eventId: 'e05', createdAt: ago(60 * 5) },
    { id: 'l4', actorId: 'm01', kind: 'timetable', text: 'タイムテーブルを保存（7項目・終演 21:30）', eventId: 'e03', createdAt: ago(60 * 3) },
    { id: 'l5', actorId: 'm01', kind: 'assign', text: '手動: PA 空き → 佐藤 健太', eventId: 'e03', createdAt: ago(42) },
    { id: 'l6', actorId: 'm13', kind: 'availability', text: '定期ライブ vol.12 を参加不可に登録', eventId: 'e03', createdAt: ago(18) },
  ]

  return {
    snapshot: { members, roles, events, items, roleSlots, assignments, exclusions, activities },
    passwords,
  }
}
