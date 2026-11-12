-- Follow links, part 2. Run once in the Supabase SQL editor, after 004_follow.sql. Safe to re-run.
--
-- 1. Every member of a trip (not only its owner) can make, list and stop its follow links.
-- 2. A link can let its followers suggest places: they can add places, and nothing else (no
--    changes, no deletions), without an account. Each follower's places go into their own
--    category ("From …"), made on their first suggestion.

alter table public.follow_links add column if not exists can_suggest boolean not null default false;

grant update (can_suggest) on public.follow_links to authenticated;

drop policy if exists "owner manages follow links" on public.follow_links;
drop policy if exists "members manage follow links" on public.follow_links;
create policy "members manage follow links" on public.follow_links
  for all to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id) and created_by = auth.uid());

-- Updates (turning suggestions on or off) only need membership, whoever made the link.
drop policy if exists "members update follow links" on public.follow_links;
create policy "members update follow links" on public.follow_links
  for update to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

-- What a link allows.
create or replace function public.follow_link_info(link uuid)
returns table (can_suggest boolean)
language sql stable security definer set search_path = '' as $$
  select f.can_suggest from public.follow_links f where f.token = link;
$$;

-- Adds one place suggested through a link. Limits: 500 places per follower and 5,000 per trip
-- (all followers together), so a link that leaks can't flood the trip.
create or replace function public.follow_suggest_place(
  link uuid,
  follower uuid,
  follower_name text,
  place_id uuid,
  lng double precision,
  lat double precision,
  place_name text,
  place_notes text default ''
) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  t uuid;
  who text := left(btrim(coalesce(follower_name, '')), 60);
  folder uuid;
begin
  select f.trip_id into t from public.follow_links f where f.token = link and f.can_suggest;
  if t is null then raise exception 'this link does not allow suggestions'; end if;
  if who = '' then raise exception 'a name is needed'; end if;
  if btrim(coalesce(place_name, '')) = '' then raise exception 'the place needs a name'; end if;
  if lng is null or lat is null or lng < -180 or lng > 180 or lat < -90 or lat > 90 then
    raise exception 'invalid position';
  end if;
  if (select count(*) from public.entities e
      where e.trip_id = t and e.type = 'poi' and e.data->>'followerId' = follower::text) >= 500 then
    raise exception 'limit reached: 500 places per person';
  end if;
  if (select count(*) from public.entities e
      where e.trip_id = t and e.type = 'poi' and e.data ? 'followerId') >= 5000 then
    raise exception 'limit reached: 5000 suggested places on this trip';
  end if;

  select e.id into folder from public.entities e
  where e.trip_id = t and e.type = 'poiFolder' and not e.deleted and e.data->>'followerId' = follower::text
  limit 1;
  if folder is null then
    folder := gen_random_uuid();
    insert into public.entities (id, trip_id, type, data, deleted)
    values (folder, t, 'poiFolder', jsonb_build_object(
      'name', 'From ' || who,
      'order', 'zzz' || substr(md5(follower::text), 1, 8) || 'V',
      'icon', 'heart',
      'color', '#ae3ec9',
      'createdBy', 'follower:' || follower::text,
      'followerId', follower::text
    ), false);
  end if;

  insert into public.entities (id, trip_id, type, data, deleted)
  values (place_id, t, 'poi', jsonb_build_object(
    'lngLat', jsonb_build_array(lng, lat),
    'category', folder::text,
    'name', left(btrim(place_name), 200),
    'notes', left(coalesce(place_notes, ''), 2000),
    'links', '[]'::jsonb,
    'status', 'idea',
    'createdBy', 'follower:' || follower::text,
    'followerId', follower::text,
    'suggestedBy', who
  ), false);
end $$;

revoke all on function public.follow_link_info(uuid) from public;
revoke all on function public.follow_suggest_place(uuid, uuid, text, uuid, double precision, double precision, text, text) from public;
grant execute on function public.follow_link_info(uuid) to anon, authenticated;
grant execute on function public.follow_suggest_place(uuid, uuid, text, uuid, double precision, double precision, text, text) to anon, authenticated;
