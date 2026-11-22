import { slotTemplates } from '../slots'
import type { Activity, AppSnapshot, BandEvent, EventBand, Part, Slot } from '../types'

/** デモモードの初期データ。日付は「今日」からの相対で作るので、いつ開いても今後のイベントがある */

export const DEMO_ACCOUNTS = [
  { label: '管理者', email: 'admin@example.com', password: 'admin1234' },
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

  type Def = [id: string, name: string, kana: string, email: string, parts: Part[], opts?: { admin?: boolean; active?: boolean; invited?: boolean }]
  const defs: Def[] = [
    ['m01', '佐藤 健太', 'Sato Kenta', 'admin@example.com', ['gt', 'vo'], { admin: true }],
    ['m02', '鈴木 美咲', 'Suzuki Misaki', 'member@example.com', ['vo']],
    ['m03', '高橋 翔', 'Takahashi Sho', 'takahashi@example.com', ['dr']],
    ['m04', '田中 結衣', 'Tanaka Yui', 'tanaka@example.com', ['key', 'vo']],
    ['m05', '伊藤 大輝', 'Ito Daiki', 'ito@example.com', ['ba']],
    ['m06', '渡辺 さくら', 'Watanabe Sakura', 'watanabe@example.com', ['vo', 'key']],
    ['m07', '中村 蓮', 'Nakamura Ren', 'nakamura@example.com', ['gt']],
    ['m08', '小林 陽菜', 'Kobayashi Hina', 'kobayashi@example.com', ['ba', 'gt']],
    ['m09', '加藤 悠真', 'Kato Yuma', 'kato@example.com', ['dr', 'ba']],
    ['m10', '吉田 葵', 'Yoshida Aoi', 'yoshida@example.com', ['gt', 'ba'], { invited: true }],
    ['m11', '山本 湊', 'Yamamoto Minato', 'yamamoto@example.com', ['key', 'dr'], { admin: true }],
    ['m12', '松本 凛', 'Matsumoto Rin', 'matsumoto@example.com', ['vo']],
    ['m13', '木村 楓', 'Kimura Kaede', 'kimura@example.com', ['ba'], { active: false }],
  ]

  const members = defs.map(([id, name, kana, email, parts, opts = {}]) => ({
    id,
    name,
    kana,
    email,
    parts,
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

  const bands = [
    { id: 'b01', name: 'Midnight Echo', genre: 'Garage Rock', active: true, createdAt: now },
    { id: 'b02', name: 'Blue Tram', genre: 'City Pop', active: true, createdAt: now },
    { id: 'b03', name: 'Paper Sky', genre: 'Post Rock', active: true, createdAt: now },
    { id: 'b04', name: 'Velvet Amp', genre: 'Shoegaze', active: false, createdAt: now },
  ]

  const bandMembers: { bandId: string; memberId: string; part: Part }[] = [
    { bandId: 'b01', memberId: 'm02', part: 'vo' },
    { bandId: 'b01', memberId: 'm01', part: 'gt' },
    { bandId: 'b01', memberId: 'm05', part: 'ba' },
    { bandId: 'b01', memberId: 'm03', part: 'dr' },
    { bandId: 'b02', memberId: 'm06', part: 'vo' },
    { bandId: 'b02', memberId: 'm07', part: 'gt' },
    { bandId: 'b02', memberId: 'm08', part: 'ba' },
    { bandId: 'b02', memberId: 'm09', part: 'dr' },
    { bandId: 'b02', memberId: 'm04', part: 'key' },
    { bandId: 'b03', memberId: 'm12', part: 'vo' },
    { bandId: 'b03', memberId: 'm10', part: 'gt' },
    { bandId: 'b03', memberId: 'm07', part: 'gt' },
    { bandId: 'b03', memberId: 'm11', part: 'key' },
    { bandId: 'b03', memberId: 'm03', part: 'dr' },
    { bandId: 'b04', memberId: 'm12', part: 'vo' },
    { bandId: 'b04', memberId: 'm08', part: 'gt' },
  ]

  const ev = (
    id: string,
    title: string,
    offset: number,
    status: BandEvent['status'],
    venue: string,
    openTime: string,
    startTime: string,
    capacity: number,
    sold: number,
  ): BandEvent => ({
    id,
    title,
    date: isoDate(offset),
    openTime,
    startTime,
    venue,
    capacity,
    sold,
    description: null,
    status,
    createdAt: now,
  })

  const events: BandEvent[] = [
    ev('e01', '新歓ライブ', -30, 'done', '学生会館ホール', '16:30', '17:00', 150, 132),
    ev('e02', '野外フェス出演', -9, 'cancelled', '中央公園 特設ステージ', '12:30', '13:00', 400, 40),
    ev('e00', 'スタジオライブ配信', 0, 'confirmed', 'スタジオ ペンタ 3st', '18:30', '19:00', 30, 24),
    ev('e03', '定期ライブ vol.12', 10, 'open', 'ライブハウス SOUND BOX', '17:30', '18:00', 120, 64),
    ev('e04', '学園祭ステージ', 24, 'open', '中庭メインステージ', '11:30', '12:00', 300, 0),
    ev('e05', 'アコースティックナイト', 45, 'draft', 'カフェ Lumen', '18:30', '19:00', 40, 0),
  ]

  const lineup: [eventId: string, bandIds: string[], confirmed?: boolean][] = [
    ['e01', ['b01', 'b02', 'b03'], true],
    ['e02', ['b02']],
    ['e00', ['b03'], true],
    ['e03', ['b01', 'b02']],
    ['e04', ['b01', 'b02', 'b03']],
    ['e05', ['b03']],
  ]

  const eventBands: EventBand[] = []
  const slots: Slot[] = []
  let slotSeq = 0
  for (const [eventId, bandIds, confirmed] of lineup) {
    bandIds.forEach((bandId, i) => {
      eventBands.push({ eventId, bandId, order: i + 1, confirmedAt: confirmed ? ago(60 * 24) : null })
      const regulars = bandMembers.filter((bm) => bm.bandId === bandId)
      slotTemplates(regulars.map((r) => r.part)).forEach((t, k) => {
        slots.push({
          id: `s${String(++slotSeq).padStart(3, '0')}`,
          eventId,
          bandId,
          part: t.part,
          label: t.label,
          sortOrder: k,
          memberId: null,
          locked: false,
        })
      })
    })
  }

  // 確定済みのイベントは編成メンバーで埋める
  const fillWithRegulars = (eventId: string, bandId: string) => {
    const used = new Set<string>()
    for (const s of slots.filter((x) => x.eventId === eventId && x.bandId === bandId)) {
      const r = bandMembers.find((bm) => bm.bandId === bandId && bm.part === s.part && !used.has(bm.memberId))
      if (r) {
        s.memberId = r.memberId
        used.add(r.memberId)
      }
    }
  }
  fillWithRegulars('e01', 'b01')
  fillWithRegulars('e01', 'b02')
  fillWithRegulars('e01', 'b03')
  fillWithRegulars('e00', 'b03')

  // 定期ライブ：Midnight Echo は途中まで、Blue Tram は重複ありの状態
  const set = (eventId: string, bandId: string, label: string, memberId: string, locked = false) => {
    const s = slots.find((x) => x.eventId === eventId && x.bandId === bandId && x.label === label)
    if (s) {
      s.memberId = memberId
      s.locked = locked
    }
  }
  set('e03', 'b01', 'Vo', 'm02', true)
  set('e03', 'b01', 'Dr', 'm03')
  set('e03', 'b02', 'Vo', 'm06')
  set('e03', 'b02', 'Gt', 'm07')
  set('e03', 'b02', 'Ba', 'm08')
  set('e03', 'b02', 'Dr', 'm08')

  const activities: Activity[] = [
    { id: 'a1', actorId: 'm01', kind: 'member', text: '吉田 葵 をメンバーに登録', eventId: null, bandId: null, createdAt: ago(60 * 26) },
    { id: 'a2', actorId: 'm11', kind: 'assign', text: '新歓ライブ・Paper Sky の割り振りを確定', eventId: 'e01', bandId: 'b03', createdAt: ago(60 * 24 * 31) },
    { id: 'a3', actorId: 'm01', kind: 'event', text: 'イベント「アコースティックナイト」を登録', eventId: 'e05', bandId: null, createdAt: ago(60 * 5) },
    { id: 'a4', actorId: 'm01', kind: 'assign', text: '手動: Vo 空き → 鈴木 美咲', eventId: 'e03', bandId: 'b01', createdAt: ago(42) },
    { id: 'a5', actorId: 'm01', kind: 'assign', text: 'Vo をロック', eventId: 'e03', bandId: 'b01', createdAt: ago(40) },
    { id: 'a6', actorId: 'm08', kind: 'profile', text: 'プロフィールのパートを更新', eventId: null, bandId: null, createdAt: ago(18) },
  ]

  return {
    snapshot: { members, bands, bandMembers, events, eventBands, slots, activities },
    passwords,
  }
}
