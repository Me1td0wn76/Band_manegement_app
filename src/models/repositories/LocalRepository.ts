import type {
  ActivityInput,
  AppSnapshot,
  AssignmentRow,
  EventInput,
  Member,
  MemberCreateInput,
  MemberUpdateInput,
  ProfileUpdateInput,
  RoleInput,
  TimetableInput,
} from '../types'
import { createDemoSeed } from './demoSeed'
import type { Repository } from './Repository'

const STORAGE_KEY = 'riffboard-backstage-demo-v1'
const SESSION_KEY = 'riffboard-backstage-session'

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
    if (me.appRole !== 'admin') throw new Error('この操作は幹部（管理者）のみ実行できます')
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

  async completeOnboarding(newPassword: string): Promise<void> {
    await this.changePassword(newPassword)
  }

  // ---------------- 読み込み ----------------

  async loadAll(): Promise<AppSnapshot> {
    const state = await this.getState()
    const s = structuredClone(state.snapshot)
    s.members.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    s.roles.sort((a, b) => a.sortOrder - b.sortOrder)
    s.events.sort((a, b) => a.date.localeCompare(b.date))
    s.items.sort((a, b) => a.sortOrder - b.sortOrder)
    s.assignments.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
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
        note: input.note,
        appRole: input.appRole,
        active: true,
        mustChangePassword: true,
        createdAt: nowIso(),
      })
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
      s.assignments = s.assignments.filter((a) => a.memberId !== id)
      s.exclusions = s.exclusions.filter((x) => x.memberId !== id)
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

  // ---------------- イベント・タイムテーブル ----------------

  private eventFields(input: EventInput) {
    const { roleSlots, ...fields } = input
    void roleSlots
    return fields
  }

  private writeRoleSlots(state: DemoState, eventId: string, input: EventInput): void {
    const s = state.snapshot
    s.roleSlots = [
      ...s.roleSlots.filter((x) => x.eventId !== eventId),
      ...input.roleSlots.map((r) => ({ eventId, roleId: r.roleId, slots: r.slots })),
    ]
  }

  async createEvent(input: EventInput): Promise<string> {
    return this.mutate((state) => {
      this.requireAdmin(state)
      const id = newId()
      state.snapshot.events.push({ id, ...this.eventFields(input), staffConfirmedAt: null, createdAt: nowIso() })
      this.writeRoleSlots(state, id, input)
      return id
    })
  }

  async updateEvent(id: string, input: EventInput): Promise<void> {
    await this.mutate((state) => {
      this.requireAdmin(state)
      const ev = state.snapshot.events.find((e) => e.id === id)
      if (!ev) throw new Error('イベントが見つかりません')
      Object.assign(ev, this.eventFields(input))
      this.writeRoleSlots(state, id, input)
    })
  }

  async deleteEvent(id: string): Promise<void> {
    await this.mutate((state) => {
      this.requireAdmin(state)
      const s = state.snapshot
      s.events = s.events.filter((e) => e.id !== id)
      s.items = s.items.filter((x) => x.eventId !== id)
      s.roleSlots = s.roleSlots.filter((x) => x.eventId !== id)
      s.assignments = s.assignments.filter((x) => x.eventId !== id)
      s.exclusions = s.exclusions.filter((x) => x.eventId !== id)
      for (const a of s.activities) if (a.eventId === id) a.eventId = null
    })
  }

  async saveTimetable(eventId: string, input: TimetableInput): Promise<void> {
    await this.mutate((state) => {
      this.requireAdmin(state)
      const s = state.snapshot
      const ev = s.events.find((e) => e.id === eventId)
      if (!ev) throw new Error('イベントが見つかりません')
      ev.startTime = input.startTime
      ev.targetEndTime = input.targetEndTime
      ev.changeoverMinutes = input.changeoverMinutes
      const existing = new Set(s.items.filter((i) => i.eventId === eventId).map((i) => i.id))
      const next = input.items.map((it, k) => ({
        id: it.id && existing.has(it.id) ? it.id : newId(),
        eventId,
        kind: it.kind,
        name: it.name,
        minutes: it.minutes,
        sortOrder: k,
        locked: it.locked,
        note: it.note,
      }))
      const keep = new Set(next.map((i) => i.id))
      s.items = [...s.items.filter((i) => i.eventId !== eventId), ...next]
      // 消した出演・休憩に変わった項目の割り当ては外す
      const acts = new Set(next.filter((i) => i.kind === 'act').map((i) => i.id))
      s.assignments = s.assignments.filter((a) => a.eventId !== eventId || a.itemId === null || (keep.has(a.itemId) && acts.has(a.itemId)))
    })
  }

  // ---------------- 役割マスタ ----------------

  private assertUniqueRole(state: DemoState, name: string, exceptId?: string): void {
    if (state.snapshot.roles.some((r) => r.id !== exceptId && r.name === name)) throw new Error('同じ名前の役割が登録済みです')
  }

  async createRole(input: RoleInput): Promise<void> {
    await this.mutate((state) => {
      this.requireAdmin(state)
      this.assertUniqueRole(state, input.name)
      const id = newId()
      state.snapshot.roles.push({ id, ...input })
      // 今後のイベントにも既定の人数で枠を作る
      for (const e of state.snapshot.events) state.snapshot.roleSlots.push({ eventId: e.id, roleId: id, slots: input.defaultSlots })
    })
  }

  async updateRole(id: string, input: RoleInput): Promise<void> {
    await this.mutate((state) => {
      this.requireAdmin(state)
      this.assertUniqueRole(state, input.name, id)
      const role = state.snapshot.roles.find((r) => r.id === id)
      if (!role) throw new Error('役割が見つかりません')
      // 単位（全体／出演ごと）を変えたら、その役割の割り当ては作り直す
      if (role.scope !== input.scope) state.snapshot.assignments = state.snapshot.assignments.filter((a) => a.roleId !== id)
      Object.assign(role, input)
    })
  }

  async deleteRole(id: string): Promise<void> {
    await this.mutate((state) => {
      this.requireAdmin(state)
      const s = state.snapshot
      s.roles = s.roles.filter((r) => r.id !== id)
      s.roleSlots = s.roleSlots.filter((x) => x.roleId !== id)
      s.assignments = s.assignments.filter((x) => x.roleId !== id)
    })
  }

  async setRoleSlots(eventId: string, roleId: string, slots: number): Promise<void> {
    await this.mutate((state) => {
      this.requireAdmin(state)
      const s = state.snapshot
      const row = s.roleSlots.find((x) => x.eventId === eventId && x.roleId === roleId)
      if (row) row.slots = slots
      else s.roleSlots.push({ eventId, roleId, slots })
    })
  }

  // ---------------- 裏方の割り振り ----------------

  async saveAssignments(eventId: string, rows: AssignmentRow[]): Promise<void> {
    await this.mutate((state) => {
      this.requireAdmin(state)
      const s = state.snapshot
      const now = nowIso()
      s.assignments = [
        ...s.assignments.filter((a) => a.eventId !== eventId),
        ...rows.map((r) => ({ id: newId(), eventId, ...r, createdAt: now })),
      ]
      const ev = s.events.find((e) => e.id === eventId)
      if (ev) ev.staffConfirmedAt = null
    })
  }

  async confirmAssignments(eventId: string): Promise<void> {
    await this.mutate((state) => {
      this.requireAdmin(state)
      const ev = state.snapshot.events.find((e) => e.id === eventId)
      if (!ev) throw new Error('イベントが見つかりません')
      ev.staffConfirmedAt = nowIso()
    })
  }

  // ---------------- 参加可否 ----------------

  async setExclusion(eventId: string, memberId: string, excluded: boolean, reason?: string | null): Promise<void> {
    await this.mutate((state) => {
      const me = this.currentMember(state)
      if (me.appRole !== 'admin' && me.id !== memberId) throw new Error('他のメンバーの参加可否は変更できません')
      const s = state.snapshot
      s.exclusions = s.exclusions.filter((x) => !(x.eventId === eventId && x.memberId === memberId))
      if (excluded) s.exclusions.push({ eventId, memberId, reason: reason ?? null })
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
        createdAt: nowIso(),
      })
      state.snapshot.activities = state.snapshot.activities.slice(0, 300)
    })
  }
}
