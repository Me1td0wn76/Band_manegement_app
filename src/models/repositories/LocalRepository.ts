import type {
  AppSnapshot,
  AssignmentDraft,
  AssignmentMode,
  BandInput,
  EventInput,
  Member,
  MemberCreateInput,
  MemberUpdateInput,
  ProfileUpdateInput,
  RoleInput,
} from '../types'
import { createDemoSeed } from './demoSeed'
import type { Repository } from './Repository'

const STORAGE_KEY = 'band-manager-demo-v1'
const SESSION_KEY = 'band-manager-demo-session'

interface DemoState {
  snapshot: AppSnapshot
  /** memberId → SHA-256(password) */
  passwordHashes: Record<string, string>
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

function newId(): string {
  return crypto.randomUUID()
}

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
      throw new Error('メールアドレスまたはパスワードが正しくありません')
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

  // ---------------- 読み込み ----------------

  async loadAll(): Promise<AppSnapshot> {
    const state = await this.getState()
    const s = structuredClone(state.snapshot)
    s.members.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    s.bands.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    s.events.sort((a, b) => a.date.localeCompare(b.date))
    s.roles.sort((a, b) => a.sortOrder - b.sortOrder)
    s.eventBands.sort((a, b) => a.order - b.order)
    s.runs.sort((a, b) => b.executedAt.localeCompare(a.executedAt))
    return s
  }

  // ---------------- メンバー ----------------

  private assertUniqueEmail(state: DemoState, email: string, exceptId?: string): void {
    const exists = state.snapshot.members.some(
      (m) => m.id !== exceptId && m.email.toLowerCase() === email.toLowerCase(),
    )
    if (exists) throw new Error('このメールアドレスは既に登録されています')
  }

  async createMember(input: MemberCreateInput): Promise<void> {
    const hash = await sha256(input.password)
    await this.mutate((state) => {
      this.requireAdmin(state)
      this.assertUniqueEmail(state, input.email)
      const id = newId()
      state.snapshot.members.push({
        id,
        name: input.name,
        email: input.email,
        part: input.part,
        note: input.note,
        appRole: input.appRole,
        active: true,
        mustChangePassword: true,
        createdAt: new Date().toISOString(),
      })
      state.passwordHashes[id] = hash
    })
  }

  async updateMember(id: string, input: MemberUpdateInput): Promise<void> {
    await this.mutate((state) => {
      this.requireAdmin(state)
      this.assertUniqueEmail(state, input.email, id)
      const m = state.snapshot.members.find((x) => x.id === id)
      if (!m) throw new Error('メンバーが見つかりません')
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
      s.assignments = s.assignments.filter((x) => x.memberId !== id)
      s.exclusions = s.exclusions.filter((x) => x.memberId !== id)
      for (const r of s.runs) if (r.executedBy === id) r.executedBy = null
      delete state.passwordHashes[id]
    })
  }

  async updateMyProfile(input: ProfileUpdateInput): Promise<void> {
    await this.mutate((state) => {
      const me = this.currentMember(state)
      me.name = input.name
      me.part = input.part
    })
  }

  // ---------------- バンド ----------------

  private assertUniqueBand(state: DemoState, name: string, exceptId?: string): void {
    if (state.snapshot.bands.some((b) => b.id !== exceptId && b.name === name)) {
      throw new Error('同じ名前のバンドが既に存在します')
    }
  }

  async createBand(input: BandInput): Promise<void> {
    await this.mutate((state) => {
      this.requireAdmin(state)
      this.assertUniqueBand(state, input.name)
      const id = newId()
      state.snapshot.bands.push({
        id,
        name: input.name,
        description: input.description,
        createdAt: new Date().toISOString(),
      })
      state.snapshot.bandMembers.push(...input.members.map((m) => ({ bandId: id, ...m })))
    })
  }

  async updateBand(id: string, input: BandInput): Promise<void> {
    await this.mutate((state) => {
      this.requireAdmin(state)
      this.assertUniqueBand(state, input.name, id)
      const band = state.snapshot.bands.find((b) => b.id === id)
      if (!band) throw new Error('バンドが見つかりません')
      band.name = input.name
      band.description = input.description
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
    })
  }

  // ---------------- イベント ----------------

  private writeEventRelations(state: DemoState, eventId: string, input: EventInput): void {
    const s = state.snapshot
    s.eventBands = [
      ...s.eventBands.filter((x) => x.eventId !== eventId),
      ...input.bandIds.map((bandId, i) => ({ eventId, bandId, order: i + 1 })),
    ]
    s.eventRoleSlots = [
      ...s.eventRoleSlots.filter((x) => x.eventId !== eventId),
      ...input.roleSlots.map((r) => ({ eventId, roleId: r.roleId, slots: r.slots })),
    ]
  }

  async createEvent(input: EventInput): Promise<string> {
    return this.mutate((state) => {
      this.requireAdmin(state)
      const id = newId()
      const { bandIds: _b, roleSlots: _r, ...fields } = input
      state.snapshot.events.push({ id, ...fields, createdAt: new Date().toISOString() })
      this.writeEventRelations(state, id, input)
      return id
    })
  }

  async updateEvent(id: string, input: EventInput): Promise<void> {
    await this.mutate((state) => {
      this.requireAdmin(state)
      const ev = state.snapshot.events.find((e) => e.id === id)
      if (!ev) throw new Error('イベントが見つかりません')
      const { bandIds: _b, roleSlots: _r, ...fields } = input
      Object.assign(ev, fields)
      this.writeEventRelations(state, id, input)
    })
  }

  async deleteEvent(id: string): Promise<void> {
    await this.mutate((state) => {
      this.requireAdmin(state)
      const s = state.snapshot
      s.events = s.events.filter((e) => e.id !== id)
      s.eventBands = s.eventBands.filter((x) => x.eventId !== id)
      s.eventRoleSlots = s.eventRoleSlots.filter((x) => x.eventId !== id)
      s.assignments = s.assignments.filter((x) => x.eventId !== id)
      s.exclusions = s.exclusions.filter((x) => x.eventId !== id)
    })
  }

  async setEventRoleSlot(eventId: string, roleId: string, slots: number): Promise<void> {
    await this.mutate((state) => {
      this.requireAdmin(state)
      const s = state.snapshot
      const existing = s.eventRoleSlots.find((x) => x.eventId === eventId && x.roleId === roleId)
      if (existing) existing.slots = slots
      else s.eventRoleSlots.push({ eventId, roleId, slots })
    })
  }

  // ---------------- 役割マスタ ----------------

  private assertUniqueRole(state: DemoState, name: string, exceptId?: string): void {
    if (state.snapshot.roles.some((r) => r.id !== exceptId && r.name === name)) {
      throw new Error('同じ名前の役割が既に存在します')
    }
  }

  async createRole(input: RoleInput): Promise<void> {
    await this.mutate((state) => {
      this.requireAdmin(state)
      this.assertUniqueRole(state, input.name)
      state.snapshot.roles.push({ id: newId(), ...input })
    })
  }

  async updateRole(id: string, input: RoleInput): Promise<void> {
    await this.mutate((state) => {
      this.requireAdmin(state)
      this.assertUniqueRole(state, input.name, id)
      const role = state.snapshot.roles.find((r) => r.id === id)
      if (!role) throw new Error('役割が見つかりません')
      Object.assign(role, input)
    })
  }

  async deleteRole(id: string): Promise<void> {
    await this.mutate((state) => {
      this.requireAdmin(state)
      const s = state.snapshot
      s.roles = s.roles.filter((r) => r.id !== id)
      s.eventRoleSlots = s.eventRoleSlots.filter((x) => x.roleId !== id)
      s.assignments = s.assignments.filter((x) => x.roleId !== id)
    })
  }

  // ---------------- 割り当て ----------------

  async addAssignment(draft: AssignmentDraft): Promise<void> {
    await this.mutate((state) => {
      this.requireAdmin(state)
      const s = state.snapshot
      const dup = s.assignments.some(
        (a) => a.eventId === draft.eventId && a.roleId === draft.roleId && a.memberId === draft.memberId,
      )
      if (dup) throw new Error('既に割り当て済みです')
      s.assignments.push({
        id: newId(),
        ...draft,
        source: 'manual',
        locked: true,
        createdAt: new Date().toISOString(),
      })
    })
  }

  async removeAssignment(id: string): Promise<void> {
    await this.mutate((state) => {
      this.requireAdmin(state)
      state.snapshot.assignments = state.snapshot.assignments.filter((a) => a.id !== id)
    })
  }

  async setAssignmentLocked(id: string, locked: boolean): Promise<void> {
    await this.mutate((state) => {
      this.requireAdmin(state)
      const a = state.snapshot.assignments.find((x) => x.id === id)
      if (!a) throw new Error('割り当てが見つかりません')
      a.locked = locked
    })
  }

  async applyAutoAssignments(eventIds: string[], drafts: AssignmentDraft[], mode: AssignmentMode): Promise<number> {
    return this.mutate((state) => {
      const me = this.requireAdmin(state)
      const s = state.snapshot
      const targets = new Set(eventIds)
      if (mode === 'regenerate') {
        s.assignments = s.assignments.filter((a) => !targets.has(a.eventId) || a.locked)
      }
      let inserted = 0
      const now = new Date().toISOString()
      for (const d of drafts) {
        if (!targets.has(d.eventId)) continue
        const dup = s.assignments.some(
          (a) => a.eventId === d.eventId && a.roleId === d.roleId && a.memberId === d.memberId,
        )
        if (dup) continue
        s.assignments.push({ id: newId(), ...d, source: 'auto', locked: false, createdAt: now })
        inserted++
      }
      s.runs.unshift({
        id: newId(),
        executedBy: me.id,
        executedAt: now,
        eventIds,
        assignedCount: inserted,
        mode,
      })
      return inserted
    })
  }

  // ---------------- 参加不可 ----------------

  async setExclusion(eventId: string, memberId: string, excluded: boolean, reason?: string | null): Promise<void> {
    await this.mutate((state) => {
      const me = this.currentMember(state)
      if (me.appRole !== 'admin' && me.id !== memberId) throw new Error('他のメンバーの参加可否は変更できません')
      const s = state.snapshot
      s.exclusions = s.exclusions.filter((x) => !(x.eventId === eventId && x.memberId === memberId))
      if (excluded) s.exclusions.push({ eventId, memberId, reason: reason ?? null })
    })
  }
}
