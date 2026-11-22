-- =========================================================
-- Band Manager 初期スキーマ
-- Supabase の SQL Editor に貼り付けて実行するか、`supabase db push` で適用する
-- =========================================================

-- ---------- 型 ----------
create type public.app_role as enum ('admin', 'member');
create type public.event_status as enum ('scheduled', 'completed', 'cancelled');
create type public.assignment_source as enum ('auto', 'manual');

-- ---------- テーブル ----------

-- メンバー（auth.users と 1:1）
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null check (char_length(name) between 1 and 100),
  part text,
  note text,
  app_role public.app_role not null default 'member',
  active boolean not null default true,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.bands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 100),
  description text,
  created_at timestamptz not null default now()
);

create table public.band_members (
  band_id uuid not null references public.bands (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  part text not null default '',
  primary key (band_id, member_id)
);
create index band_members_member_idx on public.band_members (member_id);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  event_date date not null,
  start_time time,
  end_time time,
  venue text,
  description text,
  status public.event_status not null default 'scheduled',
  created_at timestamptz not null default now()
);
create index events_event_date_idx on public.events (event_date);

create table public.event_bands (
  event_id uuid not null references public.events (id) on delete cascade,
  band_id uuid not null references public.bands (id) on delete cascade,
  performance_order int not null default 0,
  primary key (event_id, band_id)
);

-- 役割マスタ（PA・照明・受付など）
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 50),
  description text,
  default_slots int not null default 1 check (default_slots between 0 and 50),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- イベントごとの役割の必要人数
create table public.event_role_slots (
  event_id uuid not null references public.events (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  slots int not null check (slots between 0 and 50),
  primary key (event_id, role_id)
);

-- 役割の割り当て
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  source public.assignment_source not null default 'manual',
  -- true の割り当ては自動割り振りの「作り直し」でも保持される
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  unique (event_id, role_id, member_id)
);
create index assignments_member_idx on public.assignments (member_id);

-- 参加不可（自動割り振りの対象外）
create table public.event_exclusions (
  event_id uuid not null references public.events (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key (event_id, member_id)
);

-- 自動割り振りの実行履歴
create table public.assignment_runs (
  id uuid primary key default gen_random_uuid(),
  executed_by uuid references public.profiles (id) on delete set null,
  executed_at timestamptz not null default now(),
  event_ids uuid[] not null,
  assigned_count int not null,
  mode text not null default 'regenerate' check (mode in ('regenerate', 'fill'))
);

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
-- 最初のユーザーは自動的に管理者になる（初期セットアップ用）

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name, part, app_role, must_change_password)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(coalesce(new.email, 'member'), '@', 1)),
    nullif(new.raw_user_meta_data ->> 'part', ''),
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
  -- service_role（Edge Function）や SQL Editor からの更新、管理者の更新は許可
  if (select auth.uid()) is null or public.is_admin() then
    return new;
  end if;
  if new.id is distinct from old.id
     or new.email is distinct from old.email
     or new.app_role is distinct from old.app_role
     or new.active is distinct from old.active
     or new.note is distinct from old.note then
    raise exception 'この項目は管理者のみ変更できます';
  end if;
  return new;
end;
$$;

create trigger protect_profile_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ---------- Row Level Security ----------

alter table public.profiles enable row level security;
alter table public.bands enable row level security;
alter table public.band_members enable row level security;
alter table public.events enable row level security;
alter table public.event_bands enable row level security;
alter table public.roles enable row level security;
alter table public.event_role_slots enable row level security;
alter table public.assignments enable row level security;
alter table public.event_exclusions enable row level security;
alter table public.assignment_runs enable row level security;

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

-- 管理者のみ書き込みできるテーブル（閲覧は有効なメンバー全員）
do $$
declare
  t text;
begin
  foreach t in array array[
    'bands', 'band_members', 'events', 'event_bands', 'roles',
    'event_role_slots', 'assignments', 'assignment_runs'
  ] loop
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

-- event_exclusions: 本人は自分の参加不可を登録・取消できる。管理者は全員分
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

-- ---------- 自動割り振りの保存（1トランザクションで実行） ----------

create or replace function public.apply_auto_assignments(
  p_event_ids uuid[],
  p_rows jsonb,
  p_mode text default 'regenerate'
)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted int;
begin
  if not public.is_admin() then
    raise exception '管理者のみ実行できます';
  end if;
  if p_mode not in ('regenerate', 'fill') then
    raise exception 'mode が不正です: %', p_mode;
  end if;

  if p_mode = 'regenerate' then
    delete from public.assignments
    where event_id = any (p_event_ids) and not locked;
  end if;

  insert into public.assignments (event_id, role_id, member_id, source, locked)
  select (r ->> 'event_id')::uuid, (r ->> 'role_id')::uuid, (r ->> 'member_id')::uuid, 'auto', false
  from jsonb_array_elements(p_rows) as r
  where (r ->> 'event_id')::uuid = any (p_event_ids)
  on conflict (event_id, role_id, member_id) do nothing;
  get diagnostics inserted = row_count;

  insert into public.assignment_runs (executed_by, event_ids, assigned_count, mode)
  values ((select auth.uid()), p_event_ids, inserted, p_mode);

  return inserted;
end;
$$;

revoke execute on function public.apply_auto_assignments(uuid[], jsonb, text) from public, anon;
grant execute on function public.apply_auto_assignments(uuid[], jsonb, text) to authenticated;

-- ---------- 初期データ：役割マスタ ----------
insert into public.roles (name, description, default_slots, sort_order) values
  ('PA', '音響卓の操作・サウンドチェック', 2, 1),
  ('照明', '照明卓の操作', 1, 2),
  ('受付', 'チケット確認・物販', 2, 3),
  ('撮影', '写真・動画の記録', 1, 4),
  ('転換', 'セットチェンジの補助', 2, 5);
