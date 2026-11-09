-- Shared trips: membership, invites, profiles, and one generic table holding every entity.
-- Run once in the Supabase SQL editor (see README). Safe to re-run.

-- Tables ---------------------------------------------------------------------------------------

create table if not exists public.trips (
  id uuid primary key,
  owner_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.trip_members (
  trip_id uuid not null references public.trips on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor')),
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create index if not exists trip_members_user_idx on public.trip_members (user_id);

create table if not exists public.invites (
  token uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips on delete cascade,
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days'
);

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  color text not null default '#e8590c',
  updated_at timestamptz not null default now()
);

-- `data` holds the entity minus the columns below. Rows are never deleted (soft delete).
create table if not exists public.entities (
  id uuid primary key,
  trip_id uuid not null references public.trips on delete cascade,
  type text not null,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users on delete set null
);
create index if not exists entities_trip_updated_idx on public.entities (trip_id, updated_at);

-- Server clock and identity for last-write-wins, whatever the client sends.
create or replace function public.stamp_entity() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists entities_stamp on public.entities;
create trigger entities_stamp before insert or update on public.entities
  for each row execute function public.stamp_entity();

-- Membership check used by every policy. `security definer` so that policies on trip_members
-- can call it without recursing into themselves.
create or replace function public.is_trip_member(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.trip_members where trip_id = t and user_id = auth.uid());
$$;

create or replace function public.is_trip_owner(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.trips where id = t and owner_id = auth.uid());
$$;

-- Access: signed-in users only, further limited by the policies below.
revoke all on public.trips, public.trip_members, public.invites, public.profiles, public.entities from anon;
grant select, delete on public.trips to authenticated;
grant select, delete on public.trip_members to authenticated;
grant select, insert, delete on public.invites to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.entities to authenticated;

-- Row level security ---------------------------------------------------------------------------

alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.invites enable row level security;
alter table public.profiles enable row level security;
alter table public.entities enable row level security;

drop policy if exists "members read trips" on public.trips;
create policy "members read trips" on public.trips
  for select to authenticated using (public.is_trip_member(id));

drop policy if exists "owner deletes trip" on public.trips;
create policy "owner deletes trip" on public.trips
  for delete to authenticated using (owner_id = auth.uid());

drop policy if exists "members read members" on public.trip_members;
create policy "members read members" on public.trip_members
  for select to authenticated using (public.is_trip_member(trip_id));

drop policy if exists "leave or remove members" on public.trip_members;
create policy "leave or remove members" on public.trip_members
  for delete to authenticated
  using ((user_id = auth.uid() and role <> 'owner') or (public.is_trip_owner(trip_id) and user_id <> auth.uid()));

drop policy if exists "owner manages invites" on public.invites;
create policy "owner manages invites" on public.invites
  for all to authenticated
  using (public.is_trip_owner(trip_id))
  with check (public.is_trip_owner(trip_id) and created_by = auth.uid());

drop policy if exists "read own or fellow profiles" on public.profiles;
create policy "read own or fellow profiles" on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.trip_members mine
      join public.trip_members theirs on theirs.trip_id = mine.trip_id
      where mine.user_id = auth.uid() and theirs.user_id = profiles.id
    )
  );

drop policy if exists "write own profile" on public.profiles;
create policy "write own profile" on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "members read entities" on public.entities;
create policy "members read entities" on public.entities
  for select to authenticated using (public.is_trip_member(trip_id));

drop policy if exists "members insert entities" on public.entities;
create policy "members insert entities" on public.entities
  for insert to authenticated with check (public.is_trip_member(trip_id));

drop policy if exists "members update entities" on public.entities;
create policy "members update entities" on public.entities
  for update to authenticated
  using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

-- Functions called by the app ------------------------------------------------------------------

-- Creates a shared trip owned by the caller. The id is the local trip's id, so local data can
-- be uploaded as-is.
create or replace function public.create_trip(trip_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.trips (id, owner_id) values (trip_id, auth.uid());
  insert into public.trip_members (trip_id, user_id, role) values (trip_id, auth.uid(), 'owner');
end $$;

-- Joins the trip behind an invite. Returns the trip id.
create or replace function public.accept_invite(invite_token uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare t uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select trip_id into t from public.invites where token = invite_token and expires_at > now();
  if t is null then raise exception 'invite not found or expired'; end if;
  insert into public.trip_members (trip_id, user_id) values (t, auth.uid())
    on conflict do nothing;
  return t;
end $$;

-- Cheap query for the keep-alive workflow, which runs without a user.
create or replace function public.ping() returns text
language sql stable set search_path = '' as $$ select 'ok'::text $$;

revoke all on function public.create_trip(uuid) from public, anon;
revoke all on function public.accept_invite(uuid) from public, anon;
grant execute on function public.create_trip(uuid) to authenticated;
grant execute on function public.accept_invite(uuid) to authenticated;
grant execute on function public.ping() to anon, authenticated;

-- Realtime -------------------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'entities'
  ) then
    alter publication supabase_realtime add table public.entities;
  end if;
end $$;
