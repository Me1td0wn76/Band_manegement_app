import type {
  ActivityInput,
  AppSnapshot,
  BandInput,
  EventInput,
  Member,
  MemberCreateInput,
  MemberUpdateInput,
  OnboardingInput,
  Part,
  ProfileUpdateInput,
  SlotAssignment,
} from '../types'
import { createDemoSeed } from './demoSeed'
import type { Repository } from './Repository'

const STORAGE_KEY = 'riffboard-demo-v2'
const SESSION_KEY = 'riffboard-demo-session'

interface DemoState {
  snapshot: AppSnapshot
  /** memberId → SHA-256(password) */
  passwordHashes: Record<string, string>
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

const newId = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // プライベートモードなどで保存できない場合はメモリ上のみで動作
  }
}

/**
 * デモ用リポジトリ。データはこのブラウザの localStorage にのみ保存される。
 * Supabase の RLS と同等の権限チェックをアプリ側で再現している。
 */
export class LocalRepository implements Repository {
  readonly mode = 'demo' as const
  private state: DemoState | null = null
  private sessionUserId: string | null = readStorage(SESSION_KEY)
  private readonly listeners = new Set<(userId: string | null) => void>()

  private async getState(): Promise<DemoState> {
    if (this.state) return this.state
    const raw = readStorage(STORAGE_KEY)
    if (raw) {
      try {
        this.state = JSON.parse(raw) as DemoState
        return this.state
      } catch {
        // 壊れていたら初期化し直す
      }
    }
    const seed = createDemoSeed()
    const passwordHashes: Record<string, string> = {}
    for (const [id, pw] of Object.entries(seed.passwords)) passwordHashes[id] = await sha256(pw)
    this.state = { snapshot: seed.snapshot, passwordHashes }
    this.persist()
    return this.state
  }

  private persist(): void {
    if (this.state) writeStorage(STORAGE_KEY, JSON.stringify(this.state))
  }

  private async mutate<T>(fn: (state: DemoState) => T | Promise<T>): Promise<T> {
    const state = await this.getState()
    const result = await fn(state)
    this.persist()
    return result
  }

  private currentMember(state: DemoState): Member {
    const me = state.snapshot.members.find((m) => m.id === this.sessionUserId)
    if (!me || !me.active) throw new Error('ログインしていません')
    return me
  }

  private requireAdmin(state: DemoState): Member {
    const me = this.currentMember(state)
    if (me.appRole !== 'admin') throw new Error('この操作は管理者のみ実行できます')
    return me
  }

  private emit(): void {
    for (const l of this.listeners) l(this.sessionUserId)
  }

  /** デモデータを初期状態に戻す */
  async resetDemo(): Promise<void> {
    writeStorage(STORAGE_KEY, null)
    this.state = null
    await this.getState()
  }

  // ---------------- 認証 ----------------

  async getCurrentUserId(): Promise<string | null> {
    const state = await this.getState()
    if (this.sessionUserId && !state.snapshot.members.some((m) => m.id === this.sessionUserId)) {
      this.sessionUserId = null
      writeStorage(SESSION_KEY, null)
    }
    return this.sessionUserId
  }

  onAuthStateChange(listener: (userId: string | null) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async signIn(email: string, password: string): Promise<void> {
    const state = await this.getState()
    const member = state.snapshot.members.find((m) => m.email.toLowerCase() === email.trim().toLowerCase())
    const hash = await sha256(password)
    if (!member || state.passwordHashes[member.id] !== hash) {
      throw new Error('メールアドレスかパスワードが違います。入力を確かめてください')
    }
    this.sessionUserId = member.id
    writeStorage(SESSION_KEY, member.id)
    this.emit()
  }

  async signOut(): Promise<void> {
    this.sessionUserId = null
    writeStorage(SESSION_KEY, null)
    this.emit()
  }

  async changePassword(newPassword: string): Promise<void> {
    const hash = await sha256(newPassword)
    await this.mutate((state) => {
      const me = this.currentMember(state)
      state.passwordHashes[me.id] = hash
      me.mustChangePassword = false
    })
  }

  async completeOnboarding(input: OnboardingInput): Promise<void> {
    const hash = await sha256(input.password)
    await this.mutate((state) => {
      const me = this.currentMember(state)
      state.passwordHashes[me.id] = hash
      me.parts = input.parts
      me.mustChangePassword = false
    })
  }

  // ---------------- 読み込み ----------------

  async loadAll(): Promise<AppSnapshot> {
    const state = await this.getState()
    const s = structuredClone(state.snapshot)
    s.members.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    s.bands.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    s.events.sort((a, b) => a.date.localeCompare(b.date))
    s.eventBands.sort((a, b) => a.order - b.order)
    s.slots.sort((a, b) => a.sortOrder - b.sortOrder)
    s.activities.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    s.activities = s.activities.slice(0, 200)
    return s
  }

  // ---------------- メンバー ----------------

  private assertUniqueEmail(state: DemoState, email: string, exceptId?: string): void {
    const exists = state.snapshot.members.some((m) => m.id !== exceptId && m.email.toLowerCase() === email.toLowerCase())
    if (exists) throw new Error('このメールアドレスは登録済みです')
  }

  async createMember(input: MemberCreateInput): Promise<string> {
    const hash = await sha256(input.password)
    return this.mutate((state) => {
      this.requireAdmin(state)
      this.assertUniqueEmail(state, input.email)
      const id = newId()
      state.snapshot.members.push({
        id,
        name: input.name,
        kana: input.kana,
        email: input.email,
        parts: input.parts,
        note: input.note,
        appRole: input.appRole,
        active: true,
        mustChangePassword: true,
        createdAt: nowIso(),
      })
      for (const bandId of input.bandIds) {
        state.snapshot.bandMembers.push({ bandId, memberId: id, part: input.parts[0] ?? 'gt' })
      }
      state.passwordHashes[id] = hash
      return id
    })
  }

  async updateMember(id: string, input: MemberUpdateInput): Promise<void> {
    await this.mutate((state) => {
      const me = this.requireAdmin(state)
      this.assertUniqueEmail(state, input.email, id)
      const m = state.snapshot.members.find((x) => x.id === id)
      if (!m) throw new Error('メンバーが見つかりません')
      if (me.id === id && (input.appRole !== m.appRole || !input.active)) {
        throw new Error('自分自身の権限と状態は変更できません')
      }
      Object.assign(m, input)
    })
  }

  async resetMemberPassword(id: string, password: string): Promise<void> {
    const hash = await sha256(password)
    await this.mutate((state) => {
      this.requireAdmin(state)
      const m = state.snapshot.members.find((x) => x.id === id)
      if (!m) throw new Error('メンバーが見つかりません')
      state.passwordHashes[id] = hash
      m.mustChangePassword = true
    })
  }

  async deleteMember(id: string): Promise<void> {
    await this.mutate((state) => {
      const me = this.requireAdmin(state)
      if (me.id === id) throw new Error('自分自身は削除できません')
      const s = state.snapshot
      s.members = s.members.filter((m) => m.id !== id)
      s.bandMembers = s.bandMembers.filter((x) => x.memberId !== id)
      for (const slot of s.slots) if (slot.memberId === id) slot.memberId = null
      for (const a of s.activities) if (a.actorId === id) a.actorId = null
      delete state.passwordHashes[id]
    })
  }

  async updateMyProfile(input: ProfileUpdateInput): Promise<void> {
    await this.mutate((state) => {
      const me = this.currentMember(state)
      Object.assign(me, input)
    })
  }

  // ---------------- バンド ----------------

  private assertUniqueBand(state: DemoState, name: string, exceptId?: string): void {
    if (state.snapshot.bands.some((b) => b.id !== exceptId && b.name === name)) {
      throw new Error('同じ名前のバンドが登録済みです')
    }
  }

  async createBand(input: BandInput): Promise<string> {
    return this.mutate((state) => {
      this.requireAdmin(state)
      this.assertUniqueBand(state, input.name)
      const id = newId()
      state.snapshot.bands.push({ id, name: input.name, genre: input.genre, active: input.active, createdAt: nowIso() })
      state.snapshot.bandMembers.push(...input.members.map((m) => ({ bandId: id, ...m })))
      return id
    })
  }

  async updateBand(id: string, input: BandInput): Promise<void> {
    await this.mutate((state) => {
      this.requireAdmin(state)
      this.assertUniqueBand(state, input.name, id)
      const band = state.snapshot.bands.find((b) => b.id === id)
      if (!band) throw new Error('バンドが見つかりません')
      band.name = input.name
      band.genre = input.genre
      band.active = input.active
      state.snapshot.bandMembers = [
        ...state.snapshot.bandMembers.filter((bm) => bm.bandId !== id),
        ...input.members.map((m) => ({ bandId: id, ...m })),
      ]
    })
  }

  async deleteBand(id: string): Promise<void> {
    await this.mutate((state) => {
      this.requireAdmin(state)
      const s = state.snapshot
      s.bands = s.bands.filter((b) => b.id !== id)
      s.bandMembers = s.bandMembers.filter((x) => x.bandId !== id)
      s.eventBands = s.eventBands.filter((x) => x.bandId !== id)
      s.slots = s.slots.filter((x) => x.bandId !== id)
      for (const a of s.activities) if (a.bandId === id) a.bandId = null
    })
  }

  // ---------------- イベント ----------------

  private writeEventBands(state: DemoState, eventId: string, input: EventInput): void {
    const s = state.snapshot
    const keep = new Set(input.bands.map((b) => b.bandId))
    s.eventBands = s.eventBands.filter((x) => x.eventId !== eventId || keep.has(x.bandId))
    s.slots = s.slots.filter((x) => x.eventId !== eventId || keep.has(x.bandId))
    input.bands.forEach(({ bandId, slots }, i) => {
      const existing = s.eventBands.find((x) => x.eventId === eventId && x.bandId === bandId)
      if (existing) {
        existing.order = i + 1
        return
      }
      s.eventBands.push({ eventId, bandId, order: i + 1, confirmedAt: null })
      slots.forEach((t, k) =>
        s.slots.push({ id: newId(), eventId, bandId, part: t.part, label: t.label, sortOrder: k, memberId: null, locked: false }),
      )
    })
  }

  private eventFields(input: EventInput) {
    return {
      title: input.title,
      date: input.date,
      openTime: input.openTime,
      startTime: input.startTime,
      venue: input.venue,
      capacity: input.capacity,
      sold: input.sold,
      description: input.description,
      status: input.status,
    }
  }

  async createEvent(input: EventInput): Promise<string> {
    return this.mutate((state) => {
      this.requireAdmin(state)
      const id = newId()
      state.snapshot.events.push({ id, ...this.eventFields(input), createdAt: nowIso() })
      this.writeEventBands(state, id, input)
      return id
    })
  }

  async updateEvent(id: string, input: EventInput): Promise<void> {
    await this.mutate((state) => {
      this.requireAdmin(state)
      const ev = state.snapshot.events.find((e) => e.id === id)
      if (!ev) throw new Error('イベントが見つかりません')
      Object.assign(ev, this.eventFields(input))
      this.writeEventBands(state, id, input)
    })
  }

  async deleteEvent(id: string): Promise<void> {
    await this.mutate((state) => {
      this.requireAdmin(state)
      const s = state.snapshot
      s.events = s.events.filter((e) => e.id !== id)
      s.eventBands = s.eventBands.filter((x) => x.eventId !== id)
      s.slots = s.slots.filter((x) => x.eventId !== id)
      for (const a of s.activities) if (a.eventId === id) a.eventId = null
    })
  }

  // ---------------- 役割の割り振り ----------------

  async saveAssignment(eventId: string, bandId: string, slots: SlotAssignment[]): Promise<void> {
    await this.mutate((state) => {
      this.requireAdmin(state)
      const s = state.snapshot
      for (const a of slots) {
        const slot = s.slots.find((x) => x.id === a.id && x.eventId === eventId && x.bandId === bandId)
        if (!slot) continue
        slot.memberId = a.memberId
        slot.locked = a.locked
      }
      const eb = s.eventBands.find((x) => x.eventId === eventId && x.bandId === bandId)
      if (eb) eb.confirmedAt = null
    })
  }

  async addSlot(eventId: string, bandId: string, part: Part, label: string): Promise<void> {
    await this.mutate((state) => {
      this.requireAdmin(state)
      const s = state.snapshot
      const order = Math.max(-1, ...s.slots.filter((x) => x.eventId === eventId && x.bandId === bandId).map((x) => x.sortOrder)) + 1
      s.slots.push({ id: newId(), eventId, bandId, part, label, sortOrder: order, memberId: null, locked: false })
      const eb = s.eventBands.find((x) => x.eventId === eventId && x.bandId === bandId)
      if (eb) eb.confirmedAt = null
    })
  }

  async removeSlot(slotId: string): Promise<void> {
    await this.mutate((state) => {
      this.requireAdmin(state)
      const s = state.snapshot
      const slot = s.slots.find((x) => x.id === slotId)
      s.slots = s.slots.filter((x) => x.id !== slotId)
      const eb = slot && s.eventBands.find((x) => x.eventId === slot.eventId && x.bandId === slot.bandId)
      if (eb) eb.confirmedAt = null
    })
  }

  async confirmAssignment(eventId: string, bandId: string): Promise<void> {
    await this.mutate((state) => {
      this.requireAdmin(state)
      const eb = state.snapshot.eventBands.find((x) => x.eventId === eventId && x.bandId === bandId)
      if (!eb) throw new Error('出演情報が見つかりません')
      eb.confirmedAt = nowIso()
    })
  }

  // ---------------- 活動ログ ----------------

  async logActivity(input: ActivityInput): Promise<void> {
    await this.mutate((state) => {
      const me = this.currentMember(state)
      state.snapshot.activities.unshift({
        id: newId(),
        actorId: me.id,
        kind: input.kind,
        text: input.text,
        eventId: input.eventId ?? null,
        bandId: input.bandId ?? null,
        createdAt: nowIso(),
      })
      state.snapshot.activities = state.snapshot.activities.slice(0, 300)
    })
  }
}
