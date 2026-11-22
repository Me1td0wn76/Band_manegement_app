import { FunctionsHttpError, createClient, type SupabaseClient } from '@supabase/supabase-js'
import type {
  ActivityInput,
  ActivityKind,
  AppSnapshot,
  AssignmentRow,
  EventInput,
  EventStatus,
  ItemKind,
  MemberCreateInput,
  MemberUpdateInput,
  ProfileUpdateInput,
  RoleIcon,
  RoleInput,
  RoleScope,
  TimetableInput,
} from '../types'
import type { Repository } from './Repository'

// ---- DB 行の型（snake_case） ----
interface ProfileRow {
  id: string
  email: string
  name: string
  kana: string | null
  note: string | null
  app_role: 'admin' | 'member'
  active: boolean
  must_change_password: boolean
  created_at: string
}
interface RoleRow {
  id: string
  name: string
  description: string | null
  icon: RoleIcon
  scope: RoleScope
  default_slots: number
  admin_only: boolean
  sort_order: number
}
interface EventRow {
  id: string
  title: string
  event_date: string
  open_time: string | null
  start_time: string | null
  target_end_time: string | null
  changeover_minutes: number
  venue: string | null
  capacity: number | null
  sold: number
  description: string | null
  status: EventStatus
  staff_confirmed_at: string | null
  created_at: string
}
interface ItemRow {
  id: string
  event_id: string
  kind: ItemKind
  name: string
  minutes: number
  sort_order: number
  locked: boolean
  note: string | null
}
interface RoleSlotRow { event_id: string; role_id: string; slots: number }
interface AssignmentDbRow {
  id: string
  event_id: string
  role_id: string
  item_id: string | null
  member_id: string
  locked: boolean
  created_at: string
}
interface ExclusionRow { event_id: string; member_id: string; reason: string | null }
interface ActivityRow { id: string; actor_id: string | null; kind: ActivityKind; text: string; event_id: string | null; created_at: string }

interface Result<T> {
  data: T | null
  error: { message: string } | null
}

function unwrap<T>(res: Result<T>): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

function check(res: { error: { message: string } | null }): void {
  if (res.error) throw new Error(res.error.message)
}

/** time 型 "18:00:00" → "18:00" */
const trimTime = (t: string | null) => (t ? t.slice(0, 5) : null)

export class SupabaseRepository implements Repository {
  readonly mode = 'supabase' as const
  private readonly client: SupabaseClient

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  }

  private async requireUserId(): Promise<string> {
    const id = await this.getCurrentUserId()
    if (!id) throw new Error('ログインしていません')
    return id
  }

  // ---------------- 認証 ----------------

  async getCurrentUserId(): Promise<string | null> {
    const { data } = await this.client.auth.getSession()
    return data.session?.user.id ?? null
  }

  onAuthStateChange(listener: (userId: string | null) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => listener(session?.user.id ?? null))
    return () => data.subscription.unsubscribe()
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.client.auth.signInWithPassword({ email, password })
    if (error) {
      throw new Error(
        error.message === 'Invalid login credentials' ? 'メールアドレスかパスワードが違います。入力を確かめてください' : error.message,
      )
    }
  }

  async signOut(): Promise<void> {
    check(await this.client.auth.signOut())
  }

  async changePassword(newPassword: string): Promise<void> {
    const { data, error } = await this.client.auth.updateUser({ password: newPassword })
    if (error) throw new Error(error.message)
    check(await this.client.from('profiles').update({ must_change_password: false }).eq('id', data.user.id))
  }

  async completeOnboarding(newPassword: string): Promise<void> {
    await this.changePassword(newPassword)
  }

  // ---------------- 読み込み ----------------

  async loadAll(): Promise<AppSnapshot> {
    const c = this.client
    const [profiles, roles, events, items, roleSlots, assignments, exclusions, activities] = await Promise.all([
      c.from('profiles').select('*').order('name'),
      c.from('staff_roles').select('*').order('sort_order'),
      c.from('events').select('*').order('event_date'),
      c.from('timetable_items').select('*').order('sort_order'),
      c.from('event_role_slots').select('*'),
      c.from('assignments').select('*').order('created_at'),
      c.from('event_exclusions').select('event_id, member_id, reason'),
      c.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(200),
    ])

    return {
      members: unwrap(profiles as Result<ProfileRow[]>).map((r) => ({
        id: r.id,
        name: r.name,
        kana: r.kana,
        email: r.email,
        note: r.note,
        appRole: r.app_role,
        active: r.active,
        mustChangePassword: r.must_change_password,
        createdAt: r.created_at,
      })),
      roles: unwrap(roles as Result<RoleRow[]>).map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        icon: r.icon,
        scope: r.scope,
        defaultSlots: r.default_slots,
        adminOnly: r.admin_only,
        sortOrder: r.sort_order,
      })),
      events: unwrap(events as Result<EventRow[]>).map((r) => ({
        id: r.id,
        title: r.title,
        date: r.event_date,
        openTime: trimTime(r.open_time),
        startTime: trimTime(r.start_time),
        targetEndTime: trimTime(r.target_end_time),
        changeoverMinutes: r.changeover_minutes,
        venue: r.venue,
        capacity: r.capacity,
        sold: r.sold,
        description: r.description,
        status: r.status,
        staffConfirmedAt: r.staff_confirmed_at,
        createdAt: r.created_at,
      })),
      items: unwrap(items as Result<ItemRow[]>).map((r) => ({
        id: r.id,
        eventId: r.event_id,
        kind: r.kind,
        name: r.name,
        minutes: r.minutes,
        sortOrder: r.sort_order,
        locked: r.locked,
        note: r.note,
      })),
      roleSlots: unwrap(roleSlots as Result<RoleSlotRow[]>).map((r) => ({ eventId: r.event_id, roleId: r.role_id, slots: r.slots })),
      assignments: unwrap(assignments as Result<AssignmentDbRow[]>).map((r) => ({
        id: r.id,
        eventId: r.event_id,
        roleId: r.role_id,
        itemId: r.item_id,
        memberId: r.member_id,
        locked: r.locked,
        createdAt: r.created_at,
      })),
      exclusions: unwrap(exclusions as Result<ExclusionRow[]>).map((r) => ({ eventId: r.event_id, memberId: r.member_id, reason: r.reason })),
      activities: unwrap(activities as Result<ActivityRow[]>).map((r) => ({
        id: r.id,
        actorId: r.actor_id,
        kind: r.kind,
        text: r.text,
        eventId: r.event_id,
        createdAt: r.created_at,
      })),
    }
  }

  // ---------------- メンバー（auth ユーザー操作は Edge Function 経由） ----------------

  private async invokeAdmin<T = unknown>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.functions.invoke('admin-members', { body })
    if (!error) return data as T
    if (error instanceof FunctionsHttpError) {
      let message = error.message
      try {
        const payload = (await error.context.json()) as { error?: string }
        if (payload.error) message = payload.error
      } catch {
        // レスポンスが JSON でない場合はそのまま
      }
      throw new Error(message)
    }
    throw new Error(error.message)
  }

  async createMember(input: MemberCreateInput): Promise<string> {
    const { id } = await this.invokeAdmin<{ id: string }>({ action: 'create', ...input })
    return id
  }

  async updateMember(id: string, input: MemberUpdateInput): Promise<void> {
    const current = unwrap((await this.client.from('profiles').select('email').eq('id', id).single()) as Result<{ email: string }>)
    if (current.email !== input.email) {
      await this.invokeAdmin({ action: 'update_auth', memberId: id, email: input.email })
    }
    check(
      await this.client
        .from('profiles')
        .update({ name: input.name, kana: input.kana, note: input.note, app_role: input.appRole, active: input.active })
        .eq('id', id),
    )
  }

  async resetMemberPassword(id: string, password: string): Promise<void> {
    await this.invokeAdmin({ action: 'update_auth', memberId: id, password })
  }

  async deleteMember(id: string): Promise<void> {
    await this.invokeAdmin({ action: 'delete', memberId: id })
  }

  async updateMyProfile(input: ProfileUpdateInput): Promise<void> {
    const userId = await this.requireUserId()
    check(await this.client.from('profiles').update({ name: input.name, kana: input.kana }).eq('id', userId))
  }

  // ---------------- イベント・タイムテーブル ----------------

  private eventRow(input: EventInput) {
    return {
      title: input.title,
      event_date: input.date,
      open_time: input.openTime,
      start_time: input.startTime,
      target_end_time: input.targetEndTime,
      changeover_minutes: input.changeoverMinutes,
      venue: input.venue,
      capacity: input.capacity,
      sold: input.sold,
      description: input.description,
      status: input.status,
    }
  }

  private async writeRoleSlots(eventId: string, input: EventInput): Promise<void> {
    if (input.roleSlots.length === 0) return
    check(
      await this.client.from('event_role_slots').upsert(
        input.roleSlots.map((r) => ({ event_id: eventId, role_id: r.roleId, slots: r.slots })),
        { onConflict: 'event_id,role_id' },
      ),
    )
  }

  async createEvent(input: EventInput): Promise<string> {
    const row = unwrap((await this.client.from('events').insert(this.eventRow(input)).select('id').single()) as Result<{ id: string }>)
    await this.writeRoleSlots(row.id, input)
    return row.id
  }

  async updateEvent(id: string, input: EventInput): Promise<void> {
    check(await this.client.from('events').update(this.eventRow(input)).eq('id', id))
    await this.writeRoleSlots(id, input)
  }

  async deleteEvent(id: string): Promise<void> {
    check(await this.client.from('events').delete().eq('id', id))
  }

  async saveTimetable(eventId: string, input: TimetableInput): Promise<void> {
    const { error } = await this.client.rpc('save_timetable', {
      p_event_id: eventId,
      p_start_time: input.startTime,
      p_target_end_time: input.targetEndTime,
      p_changeover_minutes: input.changeoverMinutes,
      p_items: input.items.map((it) => ({
        id: it.id,
        kind: it.kind,
        name: it.name,
        minutes: it.minutes,
        locked: it.locked,
        note: it.note,
      })),
    })
    if (error) throw new Error(error.message)
  }

  // ---------------- 役割マスタ ----------------

  private roleRow(input: RoleInput) {
    return {
      name: input.name,
      description: input.description,
      icon: input.icon,
      scope: input.scope,
      default_slots: input.defaultSlots,
      admin_only: input.adminOnly,
      sort_order: input.sortOrder,
    }
  }

  async createRole(input: RoleInput): Promise<void> {
    const row = unwrap((await this.client.from('staff_roles').insert(this.roleRow(input)).select('id').single()) as Result<{ id: string }>)
    // 既存のイベントにも既定の人数で枠を作る
    const events = unwrap((await this.client.from('events').select('id')) as Result<{ id: string }[]>)
    if (events.length > 0) {
      check(
        await this.client
          .from('event_role_slots')
          .insert(events.map((e) => ({ event_id: e.id, role_id: row.id, slots: input.defaultSlots }))),
      )
    }
  }

  async updateRole(id: string, input: RoleInput): Promise<void> {
    const current = unwrap((await this.client.from('staff_roles').select('scope').eq('id', id).single()) as Result<{ scope: RoleScope }>)
    // 単位（全体／出演ごと）を変えたら、その役割の割り当ては作り直す
    if (current.scope !== input.scope) check(await this.client.from('assignments').delete().eq('role_id', id))
    check(await this.client.from('staff_roles').update(this.roleRow(input)).eq('id', id))
  }

  async deleteRole(id: string): Promise<void> {
    check(await this.client.from('staff_roles').delete().eq('id', id))
  }

  async setRoleSlots(eventId: string, roleId: string, slots: number): Promise<void> {
    check(
      await this.client
        .from('event_role_slots')
        .upsert({ event_id: eventId, role_id: roleId, slots }, { onConflict: 'event_id,role_id' }),
    )
  }

  // ---------------- 裏方の割り振り ----------------

  async saveAssignments(eventId: string, rows: AssignmentRow[]): Promise<void> {
    const { error } = await this.client.rpc('save_assignments', {
      p_event_id: eventId,
      p_rows: rows.map((r) => ({ role_id: r.roleId, item_id: r.itemId, member_id: r.memberId, locked: r.locked })),
    })
    if (error) throw new Error(error.message)
  }

  async confirmAssignments(eventId: string): Promise<void> {
    check(await this.client.from('events').update({ staff_confirmed_at: new Date().toISOString() }).eq('id', eventId))
  }

  // ---------------- 参加可否 ----------------

  async setExclusion(eventId: string, memberId: string, excluded: boolean, reason?: string | null): Promise<void> {
    if (excluded) {
      check(
        await this.client
          .from('event_exclusions')
          .upsert({ event_id: eventId, member_id: memberId, reason: reason ?? null }, { onConflict: 'event_id,member_id' }),
      )
    } else {
      check(await this.client.from('event_exclusions').delete().eq('event_id', eventId).eq('member_id', memberId))
    }
  }

  // ---------------- 活動ログ ----------------

  async logActivity(input: ActivityInput): Promise<void> {
    const actorId = await this.requireUserId()
    check(
      await this.client
        .from('activity_logs')
        .insert({ actor_id: actorId, kind: input.kind, text: input.text, event_id: input.eventId ?? null }),
    )
  }
}
