-- History of changes: one row per action (a "commit"), with the fields it changed.
-- Run once in the Supabase SQL editor, after 001_init.sql. Safe to re-run.
-- Without it, the app still works and shows each person only their own changes.

create table if not exists public.changes (
  id uuid primary key,
  trip_id uuid not null references public.trips on delete cascade,
  user_id uuid references auth.users on delete set null,
  at timestamptz not null default now(),
  label text not null default '',
  kind text not null default 'edit' check (kind in ('edit', 'undo', 'redo', 'restore')),
  restored_to uuid,
  changes jsonb not null
);
create index if not exists changes_trip_at_idx on public.changes (trip_id, at desc);

-- Server clock and identity, whatever the client sends.
create or replace function public.stamp_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.at := clock_timestamp();
  new.user_id := auth.uid();
  return new;
end $$;

drop trigger if exists changes_stamp on public.changes;
create trigger changes_stamp before insert on public.changes
  for each row execute function public.stamp_change();

-- Members read and add; nobody edits or deletes history (it goes when the trip is deleted).
revoke all on public.changes from anon;
grant select, insert on public.changes to authenticated;
alter table public.changes enable row level security;

drop policy if exists "members read changes" on public.changes;
create policy "members read changes" on public.changes
  for select to authenticated using (public.is_trip_member(trip_id));

drop policy if exists "members add changes" on public.changes;
create policy "members add changes" on public.changes
  for insert to authenticated with check (public.is_trip_member(trip_id));
