-- Playo: player accounts and subscription status.
-- Run once in Supabase: SQL Editor > New query > paste > Run (after questions.sql).

create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  username       text not null default '',
  avatar         text not null default '🙂',
  country        text not null default '',
  xp             integer not null default 0,
  points         integer not null default 0,
  matches        integer not null default 0,
  wins           integer not null default 0,
  premium_until  timestamptz,           -- set only by the subscription webhook
  premium_plan   text,
  updated_at     timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "players read own profile" on public.profiles;
create policy "players read own profile" on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists "players create own profile" on public.profiles;
create policy "players create own profile" on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists "players update own profile" on public.profiles;
create policy "players update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- players may write their game fields, never the subscription fields
revoke insert, update on public.profiles from authenticated, anon;
grant select on public.profiles to authenticated;
grant insert (id, username, avatar, country, xp, points, matches, wins) on public.profiles to authenticated;
grant update (username, avatar, country, xp, points, matches, wins) on public.profiles to authenticated;

create or replace function public.touch_profiles() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_profiles();
