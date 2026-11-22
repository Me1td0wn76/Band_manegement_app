-- =========================================================
-- Riffboard（バンド管理）初期スキーマ
-- Supabase の SQL Editor に貼り付けて実行するか、`supabase db push` で適用する
-- =========================================================

-- ---------- 型 ----------
create type public.app_role as enum ('admin', 'member');

-- ---------- テーブル ----------

-- メンバー（auth.users と 1:1）
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null check (char_length(name) between 1 and 100),
  kana text,
  -- 担当パート（vo / gt / ba / dr / key）
  parts text[] not null default '{}' check (parts <@ array['vo', 'gt', 'ba', 'dr', 'key']),
  note text,
  app_role public.app_role not null default 'member',
  active boolean not null default true,
  -- true の間は「招待中」。初回ログインでパスワードとパートを登録すると false になる
  must_change_password boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.bands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 100),
  genre text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.band_members (
  band_id uuid not null references public.bands (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  part text not null check (part in ('vo', 'gt', 'ba', 'dr', 'key')),
  primary key (band_id, member_id)
);
create index band_members_member_idx on public.band_members (member_id);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  event_date date not null,
  open_time time,
  start_time time,
  venue text,
  capacity int check (capacity >= 0),
  sold int not null default 0 check (sold >= 0),
  description text,
  status text not null default 'draft' check (status in ('draft', 'open', 'confirmed', 'done', 'cancelled')),
  created_at timestamptz not null default now(),
  check (open_time is null or start_time is null or open_time <= start_time)
);
create index events_event_date_idx on public.events (event_date);

-- 出演バンド。割り振りの確定状態を持つ
create table public.event_bands (
  event_id uuid not null references public.events (id) on delete cascade,
  band_id uuid not null references public.bands (id) on delete cascade,
  performance_order int not null default 0,
  confirmed_at timestamptz,
  primary key (event_id, band_id)
);

-- 役割の枠（イベント × バンド × パート）と割り当て
create table public.event_slots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  band_id uuid not null,
  part text not null check (part in ('vo', 'gt', 'ba', 'dr', 'key')),
  label text not null check (char_length(label) between 1 and 20),
  sort_order int not null default 0,
  member_id uuid references public.profiles (id) on delete set null,
  -- true の枠は自動割り振りで変更しない
  locked boolean not null default false,
  foreign key (event_id, band_id) references public.event_bands (event_id, band_id) on delete cascade
);
create index event_slots_event_band_idx on public.event_slots (event_id, band_id);
create index event_slots_member_idx on public.event_slots (member_id);

-- 活動ログ（ダッシュボードの「最近の活動」と割り振りの履歴）
create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('event', 'member', 'band', 'assign', 'onboarding', 'profile')),
  text text not null check (char_length(text) between 1 and 300),
  event_id uuid references public.events (id) on delete set null,
  band_id uuid references public.bands (id) on delete set null,
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
-- 最初のユーザーは自動的に管理者になる（初期セットアップ用）

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
alter table public.event_slots enable row level security;
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

-- 管理者のみ書き込みできるテーブル（閲覧は有効なメンバー全員）
do $$
declare
  t text;
begin
  foreach t in array array['bands', 'band_members', 'events', 'event_bands', 'event_slots'] loop
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

-- activity_logs: 有効なメンバーは閲覧と自分名義の記録ができる。削除は管理者のみ
create policy "activity_logs_select" on public.activity_logs
  for select to authenticated
  using (public.is_active_user());

create policy "activity_logs_insert_self" on public.activity_logs
  for insert to authenticated
  with check (actor_id = (select auth.uid()) and public.is_active_user());

create policy "activity_logs_delete_admin" on public.activity_logs
  for delete to authenticated
  using (public.is_admin());

-- ---------- 割り振りの保存（1トランザクションで実行） ----------

create or replace function public.save_assignment(
  p_event_id uuid,
  p_band_id uuid,
  p_slots jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '割り振りの変更は管理者のみ実行できます';
  end if;

  update public.event_slots as s
  set member_id = nullif(r ->> 'member_id', '')::uuid,
      locked = coalesce((r ->> 'locked')::boolean, false)
  from jsonb_array_elements(p_slots) as r
  where s.id = (r ->> 'id')::uuid
    and s.event_id = p_event_id
    and s.band_id = p_band_id;

  -- 変更したら確定を解除する
  update public.event_bands
  set confirmed_at = null
  where event_id = p_event_id and band_id = p_band_id;
end;
$$;

revoke execute on function public.save_assignment(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_assignment(uuid, uuid, jsonb) to authenticated;
