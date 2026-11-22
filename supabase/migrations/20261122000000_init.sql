-- =========================================================
-- Riffboard（ライブの裏方管理）初期スキーマ
-- Supabase の SQL Editor に貼り付けて実行するか、`supabase db push` で適用する
-- =========================================================

-- ---------- 型 ----------
-- admin = 幹部（管理者）。PA など「幹部のみ」の役割を担当できる
create type public.app_role as enum ('admin', 'member');

-- ---------- テーブル ----------

-- 裏方メンバー（auth.users と 1:1）
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null check (char_length(name) between 1 and 100),
  kana text,
  note text,
  app_role public.app_role not null default 'member',
  active boolean not null default true,
  -- true の間は「招待中」。初回ログインでパスワードを再設定すると false になる
  must_change_password boolean not null default false,
  created_at timestamptz not null default now()
);

-- 裏方の役割（撮影・照明・SNS・タイムキーパー・PA など）
create table public.staff_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 40),
  description text,
  icon text not null default 'users',
  -- event: ライブ全体で固定 / act: 出演ごとに交代
  scope text not null default 'event' check (scope in ('event', 'act')),
  default_slots int not null default 1 check (default_slots between 0 and 20),
  -- 幹部（管理者）のみ担当できる
  admin_only boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  event_date date not null,
  open_time time,
  start_time time,
  target_end_time time,
  changeover_minutes int not null default 10 check (changeover_minutes between 0 and 120),
  venue text,
  capacity int check (capacity >= 0),
  sold int not null default 0 check (sold >= 0),
  description text,
  status text not null default 'draft' check (status in ('draft', 'open', 'confirmed', 'done', 'cancelled')),
  staff_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  check (open_time is null or start_time is null or open_time <= start_time)
);
create index events_event_date_idx on public.events (event_date);

-- タイムテーブル（出演者は名前と演奏時間だけ。バンドとしては管理しない）
create table public.timetable_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  kind text not null default 'act' check (kind in ('act', 'break')),
  name text not null check (char_length(name) between 1 and 100),
  minutes int not null check (minutes between 1 and 600),
  sort_order int not null default 0,
  -- true の項目は並べ替え・自動調整で位置と時間を変えない
  locked boolean not null default false,
  note text
);
create index timetable_items_event_idx on public.timetable_items (event_id, sort_order);

-- イベントごとの役割の必要人数（出演ごとの役割は1出演あたり）
create table public.event_role_slots (
  event_id uuid not null references public.events (id) on delete cascade,
  role_id uuid not null references public.staff_roles (id) on delete cascade,
  slots int not null check (slots between 0 and 20),
  primary key (event_id, role_id)
);

-- 裏方の割り当て。item_id は「出演ごと」の役割のときの出演項目
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  role_id uuid not null references public.staff_roles (id) on delete cascade,
  item_id uuid references public.timetable_items (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  locked boolean not null default false,
  created_at timestamptz not null default now()
);
create index assignments_event_idx on public.assignments (event_id);
create index assignments_member_idx on public.assignments (member_id);

-- 参加できない日（自動割り振りの対象外）
create table public.event_exclusions (
  event_id uuid not null references public.events (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key (event_id, member_id)
);

-- 活動ログ（ダッシュボードの「最近の活動」と割り振りの履歴）
create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('event', 'timetable', 'member', 'role', 'assign', 'onboarding', 'profile', 'availability')),
  text text not null check (char_length(text) between 1 and 300),
  event_id uuid references public.events (id) on delete set null,
  created_at timestamptz not null default now()
);
create index activity_logs_created_idx on public.activity_logs (created_at desc);

-- ---------- 権限ヘルパー ----------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and app_role = 'admin' and active
  );
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and active
  );
$$;

-- ---------- auth ユーザー作成時にプロフィールを作る ----------
-- 最初のユーザーは自動的に幹部（管理者）になる（初期セットアップ用）

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name, kana, app_role, must_change_password)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(coalesce(new.email, 'member'), '@', 1)),
    nullif(new.raw_user_meta_data ->> 'kana', ''),
    case
      when exists (select 1 from public.profiles where app_role = 'admin') then 'member'::public.app_role
      else 'admin'::public.app_role
    end,
    coalesce((new.raw_user_meta_data ->> 'must_change_password')::boolean, false)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 一般メンバーによる権限・状態の書き換えを防ぐ ----------

create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- service_role（Edge Function）や SQL Editor からの更新、幹部の更新は許可
  if (select auth.uid()) is null or public.is_admin() then
    return new;
  end if;
  if new.id is distinct from old.id
     or new.email is distinct from old.email
     or new.app_role is distinct from old.app_role
     or new.active is distinct from old.active
     or new.note is distinct from old.note then
    raise exception 'この項目は幹部のみ変更できます';
  end if;
  return new;
end;
$$;

create trigger protect_profile_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- 「幹部のみ」の役割は幹部にしか割り当てられない
create or replace function public.check_admin_only_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.staff_roles where id = new.role_id and admin_only)
     and not exists (select 1 from public.profiles where id = new.member_id and app_role = 'admin') then
    raise exception 'この役割は幹部のみ担当できます';
  end if;
  return new;
end;
$$;

create trigger check_admin_only_role
  before insert or update on public.assignments
  for each row execute function public.check_admin_only_role();

-- ---------- Row Level Security ----------

alter table public.profiles enable row level security;
alter table public.staff_roles enable row level security;
alter table public.events enable row level security;
alter table public.timetable_items enable row level security;
alter table public.event_role_slots enable row level security;
alter table public.assignments enable row level security;
alter table public.event_exclusions enable row level security;
alter table public.activity_logs enable row level security;

-- profiles: 有効なメンバーは全員を閲覧可。無効化されたユーザーは自分だけ見える
create policy "profiles_select" on public.profiles
  for select to authenticated
  using (public.is_active_user() or id = (select auth.uid()));

create policy "profiles_insert_admin" on public.profiles
  for insert to authenticated
  with check (public.is_admin());

create policy "profiles_update_self_or_admin" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

create policy "profiles_delete_admin" on public.profiles
  for delete to authenticated
  using (public.is_admin());

-- 幹部のみ書き込みできるテーブル（閲覧は有効なメンバー全員）
do $$
declare
  t text;
begin
  foreach t in array array['staff_roles', 'events', 'timetable_items', 'event_role_slots', 'assignments'] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_active_user())',
      t || '_select', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_admin())',
      t || '_insert_admin', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())',
      t || '_update_admin', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_admin())',
      t || '_delete_admin', t
    );
  end loop;
end;
$$;

-- event_exclusions: 本人は自分の参加可否を登録・取消できる。幹部は全員分
create policy "event_exclusions_select" on public.event_exclusions
  for select to authenticated
  using (public.is_active_user());

create policy "event_exclusions_insert" on public.event_exclusions
  for insert to authenticated
  with check (public.is_admin() or (member_id = (select auth.uid()) and public.is_active_user()));

create policy "event_exclusions_update" on public.event_exclusions
  for update to authenticated
  using (public.is_admin() or member_id = (select auth.uid()))
  with check (public.is_admin() or (member_id = (select auth.uid()) and public.is_active_user()));

create policy "event_exclusions_delete" on public.event_exclusions
  for delete to authenticated
  using (public.is_admin() or (member_id = (select auth.uid()) and public.is_active_user()));

-- activity_logs: 有効なメンバーは閲覧と自分名義の記録ができる。削除は幹部のみ
create policy "activity_logs_select" on public.activity_logs
  for select to authenticated
  using (public.is_active_user());

create policy "activity_logs_insert_self" on public.activity_logs
  for insert to authenticated
  with check (actor_id = (select auth.uid()) and public.is_active_user());

create policy "activity_logs_delete_admin" on public.activity_logs
  for delete to authenticated
  using (public.is_admin());

-- ---------- タイムテーブルの保存（1トランザクションで実行） ----------
-- p_items: [{ id: uuid|null, kind, name, minutes, locked, note }]（配列の順が出演順）

create or replace function public.save_timetable(
  p_event_id uuid,
  p_start_time time,
  p_target_end_time time,
  p_changeover_minutes int,
  p_items jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r jsonb;
  k int := 0;
  kept uuid[] := '{}';
  item_id uuid;
begin
  if not public.is_admin() then
    raise exception 'タイムテーブルの編集は幹部のみ実行できます';
  end if;

  update public.events
  set start_time = p_start_time,
      target_end_time = p_target_end_time,
      changeover_minutes = p_changeover_minutes
  where id = p_event_id;

  for r in select * from jsonb_array_elements(p_items) loop
    item_id := nullif(r ->> 'id', '')::uuid;
    if item_id is not null and exists (select 1 from public.timetable_items where id = item_id and event_id = p_event_id) then
      update public.timetable_items
      set kind = r ->> 'kind',
          name = r ->> 'name',
          minutes = (r ->> 'minutes')::int,
          sort_order = k,
          locked = coalesce((r ->> 'locked')::boolean, false),
          note = nullif(r ->> 'note', '')
      where id = item_id;
    else
      insert into public.timetable_items (event_id, kind, name, minutes, sort_order, locked, note)
      values (p_event_id, r ->> 'kind', r ->> 'name', (r ->> 'minutes')::int, k,
              coalesce((r ->> 'locked')::boolean, false), nullif(r ->> 'note', ''))
      returning id into item_id;
    end if;
    kept := kept || item_id;
    k := k + 1;
  end loop;

  -- 消した項目は削除（その出演の割り当ても消える）
  delete from public.timetable_items where event_id = p_event_id and not (id = any (kept));
  -- 休憩に変えた項目の割り当ては外す
  delete from public.assignments a
  using public.timetable_items i
  where a.item_id = i.id and i.event_id = p_event_id and i.kind = 'break';
end;
$$;

revoke execute on function public.save_timetable(uuid, time, time, int, jsonb) from public, anon;
grant execute on function public.save_timetable(uuid, time, time, int, jsonb) to authenticated;

-- ---------- 裏方の割り振りの保存（イベント単位で置き換え） ----------
-- p_rows: [{ role_id, item_id|null, member_id, locked }]

create or replace function public.save_assignments(p_event_id uuid, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '割り振りの変更は幹部のみ実行できます';
  end if;

  delete from public.assignments where event_id = p_event_id;

  insert into public.assignments (event_id, role_id, item_id, member_id, locked)
  select p_event_id,
         (r ->> 'role_id')::uuid,
         nullif(r ->> 'item_id', '')::uuid,
         (r ->> 'member_id')::uuid,
         coalesce((r ->> 'locked')::boolean, false)
  from jsonb_array_elements(p_rows) as r;

  -- 変更したら確定を解除する
  update public.events set staff_confirmed_at = null where id = p_event_id;
end;
$$;

revoke execute on function public.save_assignments(uuid, jsonb) from public, anon;
grant execute on function public.save_assignments(uuid, jsonb) to authenticated;

-- ---------- 初期データ：役割マスタ ----------
insert into public.staff_roles (name, description, icon, scope, default_slots, admin_only, sort_order) values
  ('PA', '音響卓の操作。幹部のみ担当できます', 'sliders', 'event', 1, true, 1),
  ('タイムキーパー', '進行と転換の時間を管理します', 'stopwatch', 'event', 1, false, 2),
  ('SNS', '告知と当日の実況投稿', 'megaphone', 'event', 1, false, 3),
  ('照明', '出演ごとに照明卓を操作します', 'spotlight', 'act', 1, false, 4),
  ('撮影', '出演ごとに写真・動画を記録します', 'camera', 'act', 1, false, 5);
