-- Smaller history. Run once in the Supabase SQL editor, after 002_history.sql. Safe to re-run.
--
-- 1. The app no longer stores a drawn segment's lines and distances in the history: they come
--    back from its points (routed again if needed). This removes them from what's already there.
--    Imported tracks keep their lines, which are the only copy of the track.
update public.changes c
set changes = (
  select coalesce(jsonb_agg(
    case
      when d->>'type' = 'segment'
        and coalesce(e.data->>'geomType', d->'after'->>'geomType', '') <> 'imported'
        and coalesce(d->'before'->>'geomType', '') <> 'imported'
      then jsonb_set(
        jsonb_set(d, '{after}', (d->'after') - 'legs' - 'stats'),
        '{before}',
        case when jsonb_typeof(d->'before') = 'object' then (d->'before') - 'legs' - 'stats' else d->'before' end
      )
      else d
    end
    order by x.ord
  ), '[]'::jsonb)
  from jsonb_array_elements(c.changes) with ordinality as x(d, ord)
  left join public.entities e on e.id::text = d->>'id'
)
where c.changes::text like '%"legs"%';

-- 2. Owners can delete a trip's history older than some number of days (the History window has a
--    button for it). Changes can't be restored past that point afterwards.
create or replace function public.prune_changes(p_trip uuid, p_keep_days int)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  removed int;
begin
  if not public.is_trip_owner(p_trip) then
    raise exception 'Only the trip owner can delete its history';
  end if;
  delete from public.changes
  where trip_id = p_trip and at < now() - make_interval(days => greatest(p_keep_days, 1));
  get diagnostics removed = row_count;
  return removed;
end $$;

revoke all on function public.prune_changes(uuid, int) from public, anon;
grant execute on function public.prune_changes(uuid, int) to authenticated;

-- 3. Give the freed space back to the database. Run this line on its own (select it, then Run),
--    as it can't run together with other statements:
-- vacuum full public.changes;
