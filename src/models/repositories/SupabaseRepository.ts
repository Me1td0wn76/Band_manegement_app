import { FunctionsHttpError, createClient, type SupabaseClient } from '@supabase/supabase-js'
import type {
  ActivityInput,
  ActivityKind,
  AppSnapshot,
  BandInput,
  EventInput,
  EventStatus,
  MemberCreateInput,
  MemberUpdateInput,
  OnboardingInput,
  Part,
  ProfileUpdateInput,
  SlotAssignment,
} from '../types'
import type { Repository } from './Repository'

// ---- DB 行の型（snake_case） ----
interface ProfileRow {
  id: string
  email: string
  name: string
  kana: string | null
  parts: Part[] | null
  note: string | null
  app_role: 'admin' | 'member'
  active: boolean
  must_change_password: boolean
  created_at: string
}
interface BandRow { id: string; name: string; genre: string | null; active: boolean; created_at: string }
interface BandMemberRow { band_id: string; member_id: string; part: Part }
interface EventRow {
  id: string
  title: string
  event_date: string
  open_time: string | null
  start_time: string | null
  venue: string | null
  capacity: number | null
  sold: number
  description: string | null
  status: EventStatus
  created_at: string
}
interface EventBandRow { event_id: string; band_id: string; performance_order: number; confirmed_at: string | null }
interface SlotRow {
  id: string
  event_id: string
  band_id: string
  part: Part
  label: string
  sort_order: number
  member_id: string | null
  locked: boolean
}
interface ActivityRow {
  id: string
  actor_id: string | null
  kind: ActivityKind
  text: string
  event_id: string | null
  band_id: string | null
  created_at: string
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
        error.message === 'Invalid login credentials'
          ? 'メールアドレスかパスワードが違います。入力を確かめてください'
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
    check(await this.client.from('profiles').update({ must_change_password: false }).eq('id', data.user.id))
  }

  async completeOnboarding(input: OnboardingInput): Promise<void> {
    const { data, error } = await this.client.auth.updateUser({ password: input.password })
    if (error) throw new Error(error.message)
    check(
      await this.client
        .from('profiles')
        .update({ parts: input.parts, must_change_password: false })
        .eq('id', data.user.id),
    )
  }

  // ---------------- 読み込み ----------------

  async loadAll(): Promise<AppSnapshot> {
    const c = this.client
    const [profiles, bands, bandMembers, events, eventBands, slots, activities] = await Promise.all([
      c.from('profiles').select('*').order('name'),
      c.from('bands').select('*').order('name'),
      c.from('band_members').select('*'),
      c.from('events').select('*').order('event_date'),
      c.from('event_bands').select('*').order('performance_order'),
      c.from('event_slots').select('*').order('sort_order'),
      c.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(200),
    ])

    return {
      members: unwrap(profiles as Result<ProfileRow[]>).map((r) => ({
        id: r.id,
        name: r.name,
        kana: r.kana,
        email: r.email,
        parts: r.parts ?? [],
        note: r.note,
        appRole: r.app_role,
        active: r.active,
        mustChangePassword: r.must_change_password,
        createdAt: r.created_at,
      })),
      bands: unwrap(bands as Result<BandRow[]>).map((r) => ({
        id: r.id,
        name: r.name,
        genre: r.genre,
        active: r.active,
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
        openTime: trimTime(r.open_time),
        startTime: trimTime(r.start_time),
        venue: r.venue,
        capacity: r.capacity,
        sold: r.sold,
        description: r.description,
        status: r.status,
        createdAt: r.created_at,
      })),
      eventBands: unwrap(eventBands as Result<EventBandRow[]>).map((r) => ({
        eventId: r.event_id,
        bandId: r.band_id,
        order: r.performance_order,
        confirmedAt: r.confirmed_at,
      })),
      slots: unwrap(slots as Result<SlotRow[]>).map((r) => ({
        id: r.id,
        eventId: r.event_id,
        bandId: r.band_id,
        part: r.part,
        label: r.label,
        sortOrder: r.sort_order,
        memberId: r.member_id,
        locked: r.locked,
      })),
      activities: unwrap(activities as Result<ActivityRow[]>).map((r) => ({
        id: r.id,
        actorId: r.actor_id,
        kind: r.kind,
        text: r.text,
        eventId: r.event_id,
        bandId: r.band_id,
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
    const { bandIds, ...rest } = input
    const { id } = await this.invokeAdmin<{ id: string }>({ action: 'create', ...rest })
    if (bandIds.length > 0) {
      check(
        await this.client
          .from('band_members')
          .insert(bandIds.map((bandId) => ({ band_id: bandId, member_id: id, part: input.parts[0] ?? 'gt' }))),
      )
    }
    return id
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
          kana: input.kana,
          parts: input.parts,
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
    const userId = await this.requireUserId()
    check(
      await this.client.from('profiles').update({ name: input.name, kana: input.kana, parts: input.parts }).eq('id', userId),
    )
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

  async createBand(input: BandInput): Promise<string> {
    const row = unwrap(
      (await this.client
        .from('bands')
        .insert({ name: input.name, genre: input.genre, active: input.active })
        .select('id')
        .single()) as Result<{ id: string }>,
    )
    await this.replaceBandMembers(row.id, input.members)
    return row.id
  }

  async updateBand(id: string, input: BandInput): Promise<void> {
    check(await this.client.from('bands').update({ name: input.name, genre: input.genre, active: input.active }).eq('id', id))
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
      open_time: input.openTime,
      start_time: input.startTime,
      venue: input.venue,
      capacity: input.capacity,
      sold: input.sold,
      description: input.description,
      status: input.status,
    }
  }

  /** 出演バンドを入力に合わせる。外したバンドの枠は消え、新しいバンドには枠を作る */
  private async syncEventBands(eventId: string, input: EventInput): Promise<void> {
    const current = unwrap(
      (await this.client.from('event_bands').select('band_id').eq('event_id', eventId)) as Result<{ band_id: string }[]>,
    ).map((r) => r.band_id)
    const wanted = input.bands.map((b) => b.bandId)
    const removed = current.filter((id) => !wanted.includes(id))
    if (removed.length > 0) {
      check(await this.client.from('event_bands').delete().eq('event_id', eventId).in('band_id', removed))
    }
    if (input.bands.length > 0) {
      check(
        await this.client.from('event_bands').upsert(
          input.bands.map((b, i) => ({ event_id: eventId, band_id: b.bandId, performance_order: i + 1 })),
          { onConflict: 'event_id,band_id' },
        ),
      )
    }
    const added = input.bands.filter((b) => !current.includes(b.bandId))
    const slotRows = added.flatMap((b) =>
      b.slots.map((t, k) => ({ event_id: eventId, band_id: b.bandId, part: t.part, label: t.label, sort_order: k })),
    )
    if (slotRows.length > 0) check(await this.client.from('event_slots').insert(slotRows))
  }

  async createEvent(input: EventInput): Promise<string> {
    const row = unwrap(
      (await this.client.from('events').insert(this.eventRow(input)).select('id').single()) as Result<{ id: string }>,
    )
    await this.syncEventBands(row.id, input)
    return row.id
  }

  async updateEvent(id: string, input: EventInput): Promise<void> {
    check(await this.client.from('events').update(this.eventRow(input)).eq('id', id))
    await this.syncEventBands(id, input)
  }

  async deleteEvent(id: string): Promise<void> {
    check(await this.client.from('events').delete().eq('id', id))
  }

  // ---------------- 役割の割り振り ----------------

  async saveAssignment(eventId: string, bandId: string, slots: SlotAssignment[]): Promise<void> {
    const { error } = await this.client.rpc('save_assignment', {
      p_event_id: eventId,
      p_band_id: bandId,
      p_slots: slots.map((s) => ({ id: s.id, member_id: s.memberId, locked: s.locked })),
    })
    if (error) throw new Error(error.message)
  }

  async addSlot(eventId: string, bandId: string, part: Part, label: string): Promise<void> {
    const rows = unwrap(
      (await this.client
        .from('event_slots')
        .select('sort_order')
        .eq('event_id', eventId)
        .eq('band_id', bandId)) as Result<{ sort_order: number }[]>,
    )
    const order = Math.max(-1, ...rows.map((r) => r.sort_order)) + 1
    check(await this.client.from('event_slots').insert({ event_id: eventId, band_id: bandId, part, label, sort_order: order }))
    check(
      await this.client.from('event_bands').update({ confirmed_at: null }).eq('event_id', eventId).eq('band_id', bandId),
    )
  }

  async removeSlot(slotId: string): Promise<void> {
    const slot = unwrap(
      (await this.client.from('event_slots').select('event_id, band_id').eq('id', slotId).single()) as Result<{
        event_id: string
        band_id: string
      }>,
    )
    check(await this.client.from('event_slots').delete().eq('id', slotId))
    check(
      await this.client
        .from('event_bands')
        .update({ confirmed_at: null })
        .eq('event_id', slot.event_id)
        .eq('band_id', slot.band_id),
    )
  }

  async confirmAssignment(eventId: string, bandId: string): Promise<void> {
    check(
      await this.client
        .from('event_bands')
        .update({ confirmed_at: new Date().toISOString() })
        .eq('event_id', eventId)
        .eq('band_id', bandId),
    )
  }

  // ---------------- 活動ログ ----------------

  async logActivity(input: ActivityInput): Promise<void> {
    const actorId = await this.requireUserId()
    check(
      await this.client.from('activity_logs').insert({
        actor_id: actorId,
        kind: input.kind,
        text: input.text,
        event_id: input.eventId ?? null,
        band_id: input.bandId ?? null,
      }),
    )
  }
}
