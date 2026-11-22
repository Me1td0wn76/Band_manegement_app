import type { AppSnapshot, Assignment, BandEvent } from '../types'

/** デモモードの初期データ。日付は「今日」からの相対で作るので、いつ開いても今後のイベントがある */

export const DEMO_ACCOUNTS = [
  { label: '管理者', email: 'admin@example.com', password: 'admin1234' },
  { label: 'メンバー', email: 'member@example.com', password: 'member1234' },
] as const

const DEFAULT_PASSWORD = 'password123'

function isoDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function createDemoSeed(): { snapshot: AppSnapshot; passwords: Record<string, string> } {
  const now = new Date().toISOString()

  const memberDefs: [id: string, name: string, email: string, part: string, admin?: boolean, active?: boolean][] = [
    ['m01', '佐藤 健太', 'admin@example.com', 'Gt', true],
    ['m02', '鈴木 美咲', 'member@example.com', 'Vo'],
    ['m03', '高橋 翔', 'takahashi@example.com', 'Dr'],
    ['m04', '田中 結衣', 'tanaka@example.com', 'Key'],
    ['m05', '伊藤 大輝', 'ito@example.com', 'Ba'],
    ['m06', '渡辺 さくら', 'watanabe@example.com', 'Vo'],
    ['m07', '中村 蓮', 'nakamura@example.com', 'Gt'],
    ['m08', '小林 陽菜', 'kobayashi@example.com', 'Ba'],
    ['m09', '加藤 悠真', 'kato@example.com', 'Dr'],
    ['m10', '吉田 葵', 'yoshida@example.com', 'Gt'],
    ['m11', '山本 湊', 'yamamoto@example.com', 'Key'],
    ['m12', '松本 凛', 'matsumoto@example.com', 'Vo'],
    ['m13', '井上 颯', 'inoue@example.com', 'Gt'],
    ['m14', '木村 楓', 'kimura@example.com', 'Ba', false, false],
  ]

  const members = memberDefs.map(([id, name, email, part, admin, active]) => ({
    id,
    name,
    email,
    part,
    note: null,
    appRole: admin ? ('admin' as const) : ('member' as const),
    active: active ?? true,
    mustChangePassword: false,
    createdAt: now,
  }))

  const passwords: Record<string, string> = {}
  for (const m of members) {
    const demo = DEMO_ACCOUNTS.find((a) => a.email === m.email)
    passwords[m.id] = demo ? demo.password : DEFAULT_PASSWORD
  }

  const bands = [
    { id: 'b01', name: 'Midnight Echo', description: 'オルタナ系の4ピース', createdAt: now },
    { id: 'b02', name: 'Blue Tram', description: 'シティポップ寄りの5人編成', createdAt: now },
    { id: 'b03', name: 'Paper Sky', description: 'ギター2本のエモ・ポストロック', createdAt: now },
  ]

  const bandMembers = [
    { bandId: 'b01', memberId: 'm01', part: 'Gt' },
    { bandId: 'b01', memberId: 'm02', part: 'Vo' },
    { bandId: 'b01', memberId: 'm03', part: 'Dr' },
    { bandId: 'b01', memberId: 'm05', part: 'Ba' },
    { bandId: 'b02', memberId: 'm06', part: 'Vo' },
    { bandId: 'b02', memberId: 'm07', part: 'Gt' },
    { bandId: 'b02', memberId: 'm08', part: 'Ba' },
    { bandId: 'b02', memberId: 'm09', part: 'Dr' },
    { bandId: 'b02', memberId: 'm04', part: 'Key' },
    { bandId: 'b03', memberId: 'm12', part: 'Vo' },
    { bandId: 'b03', memberId: 'm10', part: 'Gt' },
    { bandId: 'b03', memberId: 'm13', part: 'Gt' },
    { bandId: 'b03', memberId: 'm11', part: 'Key' },
    { bandId: 'b03', memberId: 'm03', part: 'Dr' },
  ]

  const roles = [
    { id: 'r01', name: 'PA', description: '音響卓の操作・サウンドチェック', defaultSlots: 2, sortOrder: 1 },
    { id: 'r02', name: '照明', description: '照明卓の操作', defaultSlots: 1, sortOrder: 2 },
    { id: 'r03', name: '受付', description: 'チケット確認・物販', defaultSlots: 2, sortOrder: 3 },
    { id: 'r04', name: '撮影', description: '写真・動画の記録', defaultSlots: 1, sortOrder: 4 },
    { id: 'r05', name: '転換', description: 'セットチェンジの補助', defaultSlots: 2, sortOrder: 5 },
  ]

  const event = (
    id: string,
    title: string,
    offset: number,
    status: BandEvent['status'],
    venue: string,
    startTime: string,
    endTime: string,
    description: string,
  ): BandEvent => ({
    id,
    title,
    date: isoDate(offset),
    startTime,
    endTime,
    venue,
    description,
    status,
    createdAt: now,
  })

  const events: BandEvent[] = [
    event('e01', '新歓ライブ', -30, 'completed', '学生会館ホール', '17:00', '20:30', '新入生向けのお披露目ライブ'),
    event('e02', '野外フェス出演', -9, 'cancelled', '中央公園 特設ステージ', '13:00', '17:00', '雨天のため中止'),
    event('e03', '定期ライブ vol.12', 10, 'scheduled', 'ライブハウス SOUND BOX', '18:00', '21:00', '月例の定期ライブ'),
    event('e04', '学園祭ステージ', 24, 'scheduled', '中庭メインステージ', '12:00', '16:00', '全バンド出演'),
    event('e05', 'アコースティックナイト', 45, 'scheduled', 'カフェ Lumen', '19:00', '21:00', '少人数のアコースティック編成'),
  ]

  const eventBands = [
    { eventId: 'e01', bandId: 'b01', order: 1 },
    { eventId: 'e01', bandId: 'b02', order: 2 },
    { eventId: 'e01', bandId: 'b03', order: 3 },
    { eventId: 'e02', bandId: 'b02', order: 1 },
    { eventId: 'e03', bandId: 'b01', order: 1 },
    { eventId: 'e03', bandId: 'b02', order: 2 },
    { eventId: 'e04', bandId: 'b01', order: 1 },
    { eventId: 'e04', bandId: 'b02', order: 2 },
    { eventId: 'e04', bandId: 'b03', order: 3 },
    { eventId: 'e05', bandId: 'b03', order: 1 },
  ]

  const eventRoleSlots = [
    ...['e01', 'e02', 'e03', 'e04'].flatMap((eventId) =>
      roles.map((r) => ({ eventId, roleId: r.id, slots: r.defaultSlots })),
    ),
    { eventId: 'e04', roleId: 'r03', slots: 3 },
    { eventId: 'e05', roleId: 'r01', slots: 1 },
    { eventId: 'e05', roleId: 'r03', slots: 1 },
  ].filter(
    // 同じ event/role が重複した場合は後勝ち
    (slot, index, all) => all.findLastIndex((s) => s.eventId === slot.eventId && s.roleId === slot.roleId) === index,
  )

  const assignment = (id: string, eventId: string, roleId: string, memberId: string, locked = false): Assignment => ({
    id,
    eventId,
    roleId,
    memberId,
    source: locked ? 'manual' : 'auto',
    locked,
    createdAt: now,
  })

  const assignments: Assignment[] = [
    assignment('a01', 'e01', 'r01', 'm04'),
    assignment('a02', 'e01', 'r01', 'm11'),
    assignment('a03', 'e01', 'r02', 'm07'),
    assignment('a04', 'e01', 'r03', 'm08'),
    assignment('a05', 'e01', 'r03', 'm10'),
    assignment('a06', 'e01', 'r04', 'm13'),
    assignment('a07', 'e01', 'r05', 'm06'),
    assignment('a08', 'e01', 'r05', 'm09'),
    assignment('a09', 'e03', 'r01', 'm11', true),
  ]

  const exclusions = [
    { eventId: 'e03', memberId: 'm10', reason: 'アルバイト' },
    { eventId: 'e04', memberId: 'm13', reason: '帰省' },
  ]

  const runs = [
    {
      id: 'run01',
      executedBy: 'm01',
      executedAt: new Date(Date.now() - 35 * 86_400_000).toISOString(),
      eventIds: ['e01'],
      assignedCount: 8,
      mode: 'regenerate' as const,
    },
  ]

  return {
    snapshot: {
      members,
      bands,
      bandMembers,
      events,
      eventBands,
      roles,
      eventRoleSlots,
      assignments,
      exclusions,
      runs,
    },
    passwords,
  }
}
