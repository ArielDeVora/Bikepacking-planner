-- Follow links, part 3. Run once in the Supabase SQL editor, after 005_follow_suggestions.sql.
-- Safe to re-run.
--
-- A link can let its followers comment, without an account, on everything members can comment
-- on (routes, stages, groups, segments, places, zones, border crossings). They can only add
-- comments: never change or delete anything. Members can delete their comments like any other.

alter table public.follow_links add column if not exists can_comment boolean not null default false;

grant update (can_comment) on public.follow_links to authenticated;

-- What a link allows.
drop function if exists public.follow_link_info(uuid);
create function public.follow_link_info(link uuid)
returns table (can_suggest boolean, can_comment boolean)
language sql stable security definer set search_path = '' as $$
  select f.can_suggest, f.can_comment from public.follow_links f where f.token = link;
$$;

-- Adds one comment through a link. @mentions are kept only for the trip's members.
-- Limits, so a link that leaks can't flood the trip: 500 comments per follower, 5,000 from all
-- followers on a trip, and 200 per hour from all followers on a trip.
create or replace function public.follow_comment(
  link uuid,
  follower uuid,
  follower_name text,
  comment_id uuid,
  target uuid,
  comment_body text,
  mention_ids uuid[] default '{}'
) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  t uuid;
  who text := left(btrim(coalesce(follower_name, '')), 60);
  body text := left(btrim(coalesce(comment_body, '')), 2000);
  mentioned jsonb;
  author text := 'follower:' || follower::text;
begin
  select f.trip_id into t from public.follow_links f where f.token = link and f.can_comment;
  if t is null then raise exception 'this link does not allow comments'; end if;
  if who = '' then raise exception 'a name is needed'; end if;
  if body = '' then raise exception 'the comment is empty'; end if;
  if not exists (
    select 1 from public.entities e
    where e.id = target and e.trip_id = t and not e.deleted
      and e.type in ('route', 'stage', 'group', 'segment', 'poi', 'zone', 'borderCrossing')
  ) then
    raise exception 'nothing to comment on';
  end if;
  if (select count(*) from public.entities e
      where e.trip_id = t and e.type = 'comment' and e.data->>'authorId' = author) >= 500 then
    raise exception 'limit reached: 500 comments per person';
  end if;
  if (select count(*) from public.entities e
      where e.trip_id = t and e.type = 'comment' and e.data ? 'followerId') >= 5000 then
    raise exception 'limit reached: 5000 comments from followers on this trip';
  end if;
  if (select count(*) from public.entities e
      where e.trip_id = t and e.type = 'comment' and e.data ? 'followerId'
        and e.updated_at > now() - interval '1 hour') >= 200 then
    raise exception 'too many comments right now, try again later';
  end if;

  select coalesce(jsonb_agg(m.user_id::text), '[]'::jsonb) into mentioned
  from public.trip_members m
  where m.trip_id = t and m.user_id = any(coalesce(mention_ids, '{}'));

  insert into public.entities (id, trip_id, type, data, deleted)
  values (comment_id, t, 'comment', jsonb_build_object(
    'targetId', target::text,
    'body', body,
    'authorId', author,
    'authorName', who,
    'followerId', follower::text,
    'createdBy', author,
    'createdAt', (extract(epoch from clock_timestamp()) * 1000)::bigint
  ) || case when jsonb_array_length(mentioned) > 0 then jsonb_build_object('mentions', mentioned) else '{}'::jsonb end, false);
end $$;

revoke all on function public.follow_link_info(uuid) from public;
revoke all on function public.follow_comment(uuid, uuid, text, uuid, uuid, text, uuid[]) from public;
grant execute on function public.follow_link_info(uuid) to anon, authenticated;
grant execute on function public.follow_comment(uuid, uuid, text, uuid, uuid, text, uuid[]) to anon, authenticated;
