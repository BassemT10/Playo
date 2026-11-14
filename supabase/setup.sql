-- Playo: everything the server needs, in one file.
-- Supabase > SQL Editor > New query > paste this whole file > Run. Safe to run again after updates.
-- Then run owner.sql (it holds the admin email and is not published to GitHub).
-- Also turn on: Authentication > Sign In / Providers > "Allow anonymous sign-ins"
-- (every player gets a silent account, so the admin dashboard counts everyone).

------------------------------------------------------------------ admins
create table if not exists public.admins (email text primary key);
alter table public.admins enable row level security;   -- no policies: only SQL / service role can see it

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
grant execute on function public.is_admin() to anon, authenticated;

------------------------------------------------------------------ questions
create table if not exists public.questions (
  id          text primary key,
  kind        text not null check (kind in ('quiz', 'deceit')),
  cat         text not null default 'عام',
  data        jsonb not null,          -- quiz: {q, a:[correct, wrong...], img, x2}; deceit: {q, a, alt:[], f:[], img}
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);
alter table public.questions enable row level security;
drop policy if exists "players read active questions" on public.questions;
create policy "players read active questions" on public.questions for select using (active = true);
drop policy if exists "owner manages questions" on public.questions;
create policy "owner manages questions" on public.questions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

------------------------------------------------------------------ categories (premium-only ones)
create table if not exists public.categories (
  name        text primary key,
  premium     boolean not null default false,
  updated_at  timestamptz not null default now()
);
alter table public.categories enable row level security;
drop policy if exists "everyone reads categories" on public.categories;
create policy "everyone reads categories" on public.categories for select using (true);
drop policy if exists "owner manages categories" on public.categories;
create policy "owner manages categories" on public.categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

------------------------------------------------------------------ app settings (games on/off, free/premium)
create table if not exists public.app_config (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);
alter table public.app_config enable row level security;
drop policy if exists "everyone reads config" on public.app_config;
create policy "everyone reads config" on public.app_config for select using (true);
drop policy if exists "owner writes config" on public.app_config;
create policy "owner writes config" on public.app_config for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

------------------------------------------------------------------ players
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  username       text not null default '',
  avatar         text not null default '🙂',
  country        text not null default '',
  xp             integer not null default 0,
  points         integer not null default 0,
  matches        integer not null default 0,
  wins           integer not null default 0,
  created_at     timestamptz not null default now(),
  last_seen      timestamptz not null default now(),
  -- set only by the server (webhook, admin, codes):
  premium_until  timestamptz,
  premium_since  timestamptz,
  premium_plan   text,
  games          text[] not null default '{}',     -- games the admin unlocked for this player
  discount       integer not null default 0,       -- personal discount % shown on the subscription screen
  banned         boolean not null default false,
  game_counts    jsonb not null default '{}',      -- matches per game, kept by the match log
  updated_at     timestamptz not null default now()
);
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists last_seen timestamptz not null default now();
alter table public.profiles add column if not exists premium_since timestamptz;
alter table public.profiles add column if not exists games text[] not null default '{}';
alter table public.profiles add column if not exists discount integer not null default 0;
alter table public.profiles add column if not exists banned boolean not null default false;
alter table public.profiles add column if not exists game_counts jsonb not null default '{}';

alter table public.profiles enable row level security;
drop policy if exists "players read own profile" on public.profiles;
create policy "players read own profile" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
drop policy if exists "players create own profile" on public.profiles;
create policy "players create own profile" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "players update own profile" on public.profiles;
create policy "players update own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- players may write their game fields only, never subscription / admin fields
revoke insert, update on public.profiles from authenticated, anon;
grant select on public.profiles to authenticated;
grant insert (id, username, avatar, country, xp, points, matches, wins, last_seen) on public.profiles to authenticated;
grant update (id, username, avatar, country, xp, points, matches, wins, last_seen) on public.profiles to authenticated;

create or replace function public.touch_row() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_row();
drop trigger if exists questions_touch on public.questions;
create trigger questions_touch before update on public.questions for each row execute function public.touch_row();

-- premium_since: when a subscription starts (or restarts after it ran out)
create or replace function public.premium_start() returns trigger language plpgsql as $$
begin
  if new.premium_until is not null and new.premium_until > now()
     and (old.premium_until is null or old.premium_until < now()) then
    new.premium_since = now();
  end if;
  return new;
end $$;
drop trigger if exists profiles_premium_start on public.profiles;
create trigger profiles_premium_start before update of premium_until on public.profiles
  for each row execute function public.premium_start();

------------------------------------------------------------------ match log
create table if not exists public.matches (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  game        text not null,
  mode        text not null default 'solo',
  place       integer,
  players     integer not null default 1,
  pts         integer not null default 0,
  win         boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists matches_created on public.matches (created_at desc);
create index if not exists matches_user on public.matches (user_id, created_at desc);
alter table public.matches enable row level security;
drop policy if exists "players log own matches" on public.matches;
create policy "players log own matches" on public.matches for insert to authenticated
  with check (user_id = auth.uid() and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.banned));
drop policy if exists "players read own matches" on public.matches;
create policy "players read own matches" on public.matches for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create or replace function public.count_match() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
     set game_counts = jsonb_set(game_counts, array[new.game], to_jsonb(coalesce((game_counts ->> new.game)::int, 0) + 1)),
         last_seen = now()
   where id = new.user_id;
  return new;
end $$;
drop trigger if exists matches_count on public.matches;
create trigger matches_count after insert on public.matches for each row execute function public.count_match();

------------------------------------------------------------------ players' own question sets (Premium)
create table if not exists public.user_sets (
  id          text primary key,
  owner       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name        text not null,
  kind        text not null check (kind in ('quiz', 'deceit')),
  questions   jsonb not null default '[]',
  updated_at  timestamptz not null default now()
);
alter table public.user_sets enable row level security;
drop policy if exists "owners manage their sets" on public.user_sets;
create policy "owners manage their sets" on public.user_sets for all to authenticated
  using (owner = auth.uid() or public.is_admin()) with check (owner = auth.uid());
drop trigger if exists user_sets_touch on public.user_sets;
create trigger user_sets_touch before update on public.user_sets for each row execute function public.touch_row();

------------------------------------------------------------------ gift / discount codes
create table if not exists public.promo_codes (
  code        text primary key,
  kind        text not null check (kind in ('days', 'games', 'percent')),
  days        integer not null default 0,
  games       text[] not null default '{}',
  percent     integer not null default 0,
  max_uses    integer not null default 1,
  uses        integer not null default 0,
  expires_at  timestamptz,
  note        text not null default '',
  created_at  timestamptz not null default now()
);
create table if not exists public.redemptions (
  code     text not null references public.promo_codes(code) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  at       timestamptz not null default now(),
  primary key (code, user_id)
);
alter table public.promo_codes enable row level security;
alter table public.redemptions enable row level security;
drop policy if exists "owner manages codes" on public.promo_codes;
create policy "owner manages codes" on public.promo_codes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "owner reads redemptions" on public.redemptions;
create policy "owner reads redemptions" on public.redemptions for select to authenticated using (public.is_admin());

-- a player types a code in the app
create or replace function public.redeem_code(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.promo_codes; uid uuid := auth.uid();
begin
  if uid is null then return jsonb_build_object('ok', false, 'err', 'login'); end if;
  select * into c from public.promo_codes where code = upper(trim(p_code)) for update;
  if not found then return jsonb_build_object('ok', false, 'err', 'bad'); end if;
  if c.expires_at is not null and c.expires_at < now() then return jsonb_build_object('ok', false, 'err', 'expired'); end if;
  if c.uses >= c.max_uses then return jsonb_build_object('ok', false, 'err', 'used'); end if;
  if exists (select 1 from public.redemptions where code = c.code and user_id = uid) then return jsonb_build_object('ok', false, 'err', 'again'); end if;
  insert into public.redemptions (code, user_id) values (c.code, uid);
  update public.promo_codes set uses = uses + 1 where code = c.code;
  if c.kind = 'days' then
    update public.profiles set premium_until = greatest(coalesce(premium_until, now()), now()) + make_interval(days => c.days),
           premium_plan = coalesce(nullif(premium_plan, ''), 'gift') where id = uid;
  elsif c.kind = 'games' then
    update public.profiles set games = (select array(select distinct unnest(games || c.games))) where id = uid;
  else
    update public.profiles set discount = greatest(discount, c.percent) where id = uid;
  end if;
  return jsonb_build_object('ok', true, 'kind', c.kind, 'days', c.days, 'games', to_jsonb(c.games), 'percent', c.percent);
end $$;
grant execute on function public.redeem_code(text) to authenticated;

------------------------------------------------------------------ admin actions on one player
create or replace function public.admin_player(p_id uuid, p_days integer default null, p_clear boolean default false,
  p_games text[] default null, p_discount integer default null, p_banned boolean default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_clear then update public.profiles set premium_until = null, premium_plan = null where id = p_id; end if;
  if p_days is not null and p_days > 0 then
    update public.profiles set premium_until = greatest(coalesce(premium_until, now()), now()) + make_interval(days => p_days),
           premium_plan = coalesce(nullif(premium_plan, ''), 'gift') where id = p_id;
  end if;
  if p_games is not null then update public.profiles set games = p_games where id = p_id; end if;
  if p_discount is not null then update public.profiles set discount = greatest(0, least(100, p_discount)) where id = p_id; end if;
  if p_banned is not null then update public.profiles set banned = p_banned where id = p_id; end if;
end $$;
grant execute on function public.admin_player(uuid, integer, boolean, text[], integer, boolean) to authenticated;

------------------------------------------------------------------ dashboard numbers
create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  select jsonb_build_object(
    'players',      (select count(*) from profiles),
    'new7',         (select count(*) from profiles where created_at > now() - interval '7 days'),
    'active1',      (select count(*) from profiles where last_seen > now() - interval '1 day'),
    'active7',      (select count(*) from profiles where last_seen > now() - interval '7 days'),
    'premium',      (select count(*) from profiles where premium_until > now()),
    'plans',        (select coalesce(jsonb_object_agg(pl, n), '{}') from (select coalesce(premium_plan, '?') pl, count(*) n from profiles where premium_until > now() group by 1) x),
    'matches1',     (select count(*) from matches where created_at > now() - interval '1 day'),
    'matches7',     (select count(*) from matches where created_at > now() - interval '7 days'),
    'games30',      (select coalesce(jsonb_object_agg(game, n), '{}') from (select game, count(*) n from matches where created_at > now() - interval '30 days' group by game) x),
    'days14',       (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'n', n) order by d), '[]') from
                      (select date_trunc('day', created_at)::date d, count(*) n from matches where created_at > now() - interval '14 days' group by 1) x)
  ) into r;
  return r;
end $$;
grant execute on function public.admin_stats() to authenticated;

------------------------------------------------------------------ pictures
insert into storage.buckets (id, name, public) values ('qimg', 'qimg', true) on conflict (id) do update set public = true;
drop policy if exists "owner uploads question images" on storage.objects;
create policy "owner uploads question images" on storage.objects for insert to authenticated
  with check (bucket_id = 'qimg' and (public.is_admin() or (storage.foldername(name))[1] = 'u' and (storage.foldername(name))[2] = auth.uid()::text));
drop policy if exists "owner updates question images" on storage.objects;
create policy "owner updates question images" on storage.objects for update to authenticated
  using (bucket_id = 'qimg' and (public.is_admin() or (storage.foldername(name))[1] = 'u' and (storage.foldername(name))[2] = auth.uid()::text));
