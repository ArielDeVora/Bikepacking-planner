-- Read-only follow links: anyone with the link sees the trip without an account (family and
-- friends). Run once in the Supabase SQL editor, after 001_init.sql. Safe to re-run.
-- Deleting a link stops it working.

create table if not exists public.follow_links (
  token uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips on delete cascade,
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists follow_links_trip_idx on public.follow_links (trip_id);

revoke all on public.follow_links from anon;
grant select, insert, delete on public.follow_links to authenticated;
alter table public.follow_links enable row level security;

drop policy if exists "owner manages follow links" on public.follow_links;
create policy "owner manages follow links" on public.follow_links
  for all to authenticated
  using (public.is_trip_owner(trip_id))
  with check (public.is_trip_owner(trip_id) and created_by = auth.uid());

-- The items of the trip behind a link, changed at or after `since` (all of them when null).
-- Read only: the tables stay closed to visitors, this function is their only way in.
create or replace function public.follow_trip(link uuid, since timestamptz default null)
returns setof public.entities
language sql stable security definer set search_path = '' as $$
  select e.* from public.entities e
  join public.follow_links f on f.trip_id = e.trip_id
  where f.token = link and (since is null or e.updated_at >= since)
  order by e.updated_at, e.id;
$$;

-- Names and colours of the trip's members, for a link.
create or replace function public.follow_members(link uuid)
returns table (id uuid, name text, color text, role text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.name, p.color, m.role
  from public.follow_links f
  join public.trip_members m on m.trip_id = f.trip_id
  join public.profiles p on p.id = m.user_id
  where f.token = link;
$$;

revoke all on function public.follow_trip(uuid, timestamptz) from public;
revoke all on function public.follow_members(uuid) from public;
grant execute on function public.follow_trip(uuid, timestamptz) to anon, authenticated;
grant execute on function public.follow_members(uuid) to anon, authenticated;
