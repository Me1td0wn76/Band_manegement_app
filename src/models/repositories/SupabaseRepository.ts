import { FunctionsHttpError, createClient, type SupabaseClient } from '@supabase/supabase-js'
import type {
  AppSnapshot,
  AssignmentDraft,
  AssignmentMode,
  BandInput,
  EventInput,
  MemberCreateInput,
  MemberUpdateInput,
  ProfileUpdateInput,
  RoleInput,
} from '../types'
import type { Repository } from './Repository'

// ---- DB 行の型（snake_case） ----
interface ProfileRow {
  id: string
  email: string
  name: string
  part: string | null
  note: string | null
  app_role: 'admin' | 'member'
  active: boolean
  must_change_password: boolean
  created_at: string
}
interface BandRow { id: string; name: string; description: string | null; created_at: string }
interface BandMemberRow { band_id: string; member_id: string; part: string }
interface EventRow {
  id: string
  title: string
  event_date: string
  start_time: string | null
  end_time: string | null
  venue: string | null
  description: string | null
  status: 'scheduled' | 'completed' | 'cancelled'
  created_at: string
}
interface EventBandRow { event_id: string; band_id: string; performance_order: number }
interface RoleRow { id: string; name: string; description: string | null; default_slots: number; sort_order: number }
interface EventRoleSlotRow { event_id: string; role_id: string; slots: number }
interface AssignmentRow {
  id: string
  event_id: string
  role_id: string
  member_id: string
  source: 'auto' | 'manual'
  locked: boolean
  created_at: string
}
interface ExclusionRow { event_id: string; member_id: string; reason: string | null }
interface RunRow {
  id: string
  executed_by: string | null
  executed_at: string
  event_ids: string[]
  assigned_count: number
  mode: AssignmentMode
}

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

  // ---------------- 認証 ----------------

  async getCurrentUserId(): Promise<string | null> {
    const { data } = await this.client.auth.getSession()
    return data.session?.user.id ?? null
  }

  onAuthStateChange(listener: (userId: string | null) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      listener(session?.user.id ?? null)
    })
    return () => data.subscription.unsubscribe()
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.client.auth.signInWithPassword({ email, password })
    if (error) {
      throw new Error(
        error.message === 'Invalid login credentials'
          ? 'メールアドレスまたはパスワードが正しくありません'
          : error.message,
      )
    }
  }

  async signOut(): Promise<void> {
    check(await this.client.auth.signOut())
  }

  async changePassword(newPassword: string): Promise<void> {
    const { data, error } = await this.client.auth.updateUser({ password: newPassword })
    if (error) throw new Error(error.message)
    check(
      await this.client
        .from('profiles')
        .update({ must_change_password: false })
        .eq('id', data.user.id),
    )
  }

  // ---------------- 読み込み ----------------

  async loadAll(): Promise<AppSnapshot> {
    const c = this.client
    const [profiles, bands, bandMembers, events, eventBands, roles, slots, assignments, exclusions, runs] =
      await Promise.all([
        c.from('profiles').select('*').order('name'),
        c.from('bands').select('*').order('name'),
        c.from('band_members').select('*'),
        c.from('events').select('*').order('event_date'),
        c.from('event_bands').select('*').order('performance_order'),
        c.from('roles').select('*').order('sort_order'),
        c.from('event_role_slots').select('*'),
        c.from('assignments').select('*'),
        c.from('event_exclusions').select('event_id, member_id, reason'),
        c.from('assignment_runs').select('*').order('executed_at', { ascending: false }).limit(50),
      ])

    return {
      members: unwrap(profiles as Result<ProfileRow[]>).map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        part: r.part,
        note: r.note,
        appRole: r.app_role,
        active: r.active,
        mustChangePassword: r.must_change_password,
        createdAt: r.created_at,
      })),
      bands: unwrap(bands as Result<BandRow[]>).map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        createdAt: r.created_at,
      })),
      bandMembers: unwrap(bandMembers as Result<BandMemberRow[]>).map((r) => ({
        bandId: r.band_id,
        memberId: r.member_id,
        part: r.part,
      })),
      events: unwrap(events as Result<EventRow[]>).map((r) => ({
        id: r.id,
        title: r.title,
        date: r.event_date,
        startTime: trimTime(r.start_time),
        endTime: trimTime(r.end_time),
        venue: r.venue,
        description: r.description,
        status: r.status,
        createdAt: r.created_at,
      })),
      eventBands: unwrap(eventBands as Result<EventBandRow[]>).map((r) => ({
        eventId: r.event_id,
        bandId: r.band_id,
        order: r.performance_order,
      })),
      roles: unwrap(roles as Result<RoleRow[]>).map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        defaultSlots: r.default_slots,
        sortOrder: r.sort_order,
      })),
      eventRoleSlots: unwrap(slots as Result<EventRoleSlotRow[]>).map((r) => ({
        eventId: r.event_id,
        roleId: r.role_id,
        slots: r.slots,
      })),
      assignments: unwrap(assignments as Result<AssignmentRow[]>).map((r) => ({
        id: r.id,
        eventId: r.event_id,
        roleId: r.role_id,
        memberId: r.member_id,
        source: r.source,
        locked: r.locked,
        createdAt: r.created_at,
      })),
      exclusions: unwrap(exclusions as Result<ExclusionRow[]>).map((r) => ({
        eventId: r.event_id,
        memberId: r.member_id,
        reason: r.reason,
      })),
      runs: unwrap(runs as Result<RunRow[]>).map((r) => ({
        id: r.id,
        executedBy: r.executed_by,
        executedAt: r.executed_at,
        eventIds: r.event_ids,
        assignedCount: r.assigned_count,
        mode: r.mode,
      })),
    }
  }

  // ---------------- メンバー（auth ユーザー操作は Edge Function 経由） ----------------

  private async invokeAdmin(body: Record<string, unknown>): Promise<void> {
    const { error } = await this.client.functions.invoke('admin-members', { body })
    if (!error) return
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

  async createMember(input: MemberCreateInput): Promise<void> {
    await this.invokeAdmin({ action: 'create', ...input })
  }

  async updateMember(id: string, input: MemberUpdateInput): Promise<void> {
    const current = unwrap(
      (await this.client.from('profiles').select('email').eq('id', id).single()) as Result<{ email: string }>,
    )
    if (current.email !== input.email) {
      await this.invokeAdmin({ action: 'update_auth', memberId: id, email: input.email })
    }
    check(
      await this.client
        .from('profiles')
        .update({
          name: input.name,
          part: input.part,
          note: input.note,
          app_role: input.appRole,
          active: input.active,
        })
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
    const userId = await this.getCurrentUserId()
    if (!userId) throw new Error('ログインしていません')
    check(await this.client.from('profiles').update({ name: input.name, part: input.part }).eq('id', userId))
  }

  // ---------------- バンド ----------------

  private async replaceBandMembers(bandId: string, members: BandInput['members']): Promise<void> {
    check(await this.client.from('band_members').delete().eq('band_id', bandId))
    if (members.length === 0) return
    check(
      await this.client
        .from('band_members')
        .insert(members.map((m) => ({ band_id: bandId, member_id: m.memberId, part: m.part }))),
    )
  }

  async createBand(input: BandInput): Promise<void> {
    const row = unwrap(
      (await this.client
        .from('bands')
        .insert({ name: input.name, description: input.description })
        .select('id')
        .single()) as Result<{ id: string }>,
    )
    await this.replaceBandMembers(row.id, input.members)
  }

  async updateBand(id: string, input: BandInput): Promise<void> {
    check(await this.client.from('bands').update({ name: input.name, description: input.description }).eq('id', id))
    await this.replaceBandMembers(id, input.members)
  }

  async deleteBand(id: string): Promise<void> {
    check(await this.client.from('bands').delete().eq('id', id))
  }

  // ---------------- イベント ----------------

  private eventRow(input: EventInput) {
    return {
      title: input.title,
      event_date: input.date,
      start_time: input.startTime,
      end_time: input.endTime,
      venue: input.venue,
      description: input.description,
      status: input.status,
    }
  }

  private async replaceEventRelations(eventId: string, input: EventInput): Promise<void> {
    check(await this.client.from('event_bands').delete().eq('event_id', eventId))
    if (input.bandIds.length > 0) {
      check(
        await this.client.from('event_bands').insert(
          input.bandIds.map((bandId, i) => ({ event_id: eventId, band_id: bandId, performance_order: i + 1 })),
        ),
      )
    }
    check(await this.client.from('event_role_slots').delete().eq('event_id', eventId))
    if (input.roleSlots.length > 0) {
      check(
        await this.client
          .from('event_role_slots')
          .insert(input.roleSlots.map((s) => ({ event_id: eventId, role_id: s.roleId, slots: s.slots }))),
      )
    }
  }

  async createEvent(input: EventInput): Promise<string> {
    const row = unwrap(
      (await this.client.from('events').insert(this.eventRow(input)).select('id').single()) as Result<{
        id: string
      }>,
    )
    await this.replaceEventRelations(row.id, input)
    return row.id
  }

  async updateEvent(id: string, input: EventInput): Promise<void> {
    check(await this.client.from('events').update(this.eventRow(input)).eq('id', id))
    await this.replaceEventRelations(id, input)
  }

  async deleteEvent(id: string): Promise<void> {
    check(await this.client.from('events').delete().eq('id', id))
  }

  async setEventRoleSlot(eventId: string, roleId: string, slots: number): Promise<void> {
    check(
      await this.client
        .from('event_role_slots')
        .upsert({ event_id: eventId, role_id: roleId, slots }, { onConflict: 'event_id,role_id' }),
    )
  }

  // ---------------- 役割マスタ ----------------

  private roleRow(input: RoleInput) {
    return {
      name: input.name,
      description: input.description,
      default_slots: input.defaultSlots,
      sort_order: input.sortOrder,
    }
  }

  async createRole(input: RoleInput): Promise<void> {
    check(await this.client.from('roles').insert(this.roleRow(input)))
  }

  async updateRole(id: string, input: RoleInput): Promise<void> {
    check(await this.client.from('roles').update(this.roleRow(input)).eq('id', id))
  }

  async deleteRole(id: string): Promise<void> {
    check(await this.client.from('roles').delete().eq('id', id))
  }

  // ---------------- 割り当て ----------------

  async addAssignment(draft: AssignmentDraft): Promise<void> {
    check(
      await this.client.from('assignments').insert({
        event_id: draft.eventId,
        role_id: draft.roleId,
        member_id: draft.memberId,
        source: 'manual',
        locked: true,
      }),
    )
  }

  async removeAssignment(id: string): Promise<void> {
    check(await this.client.from('assignments').delete().eq('id', id))
  }

  async setAssignmentLocked(id: string, locked: boolean): Promise<void> {
    check(await this.client.from('assignments').update({ locked }).eq('id', id))
  }

  async applyAutoAssignments(eventIds: string[], drafts: AssignmentDraft[], mode: AssignmentMode): Promise<number> {
    const { data, error } = await this.client.rpc('apply_auto_assignments', {
      p_event_ids: eventIds,
      p_rows: drafts.map((d) => ({ event_id: d.eventId, role_id: d.roleId, member_id: d.memberId })),
      p_mode: mode,
    })
    if (error) throw new Error(error.message)
    return Number(data ?? 0)
  }

  // ---------------- 参加不可 ----------------

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
}
