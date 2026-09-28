-- Run this once in Supabase: SQL Editor > New query > paste > Run
create extension if not exists btree_gist;

create table reservations (
  id          uuid primary key default gen_random_uuid(),
  slot        text not null,
  name        text not null,
  plate       text not null,
  phone       text,
  date        date not null,
  start_time  time not null,
  end_time    time not null,
  created_at  timestamptz default now(),
  check (end_time > start_time),
  -- the database itself refuses double bookings of the same slot
  exclude using gist (
    slot with =,
    tsrange(date + start_time, date + end_time) with &&
  )
);

alter table reservations enable row level security;

create policy "anyone can view"   on reservations for select using (true);
create policy "anyone can book"   on reservations for insert with check (true);
create policy "anyone can cancel" on reservations for delete using (true);

-- Already ran the first version? Add the new column with:
-- alter table reservations add column phone text;
