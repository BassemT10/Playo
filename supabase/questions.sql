-- Playo: question bank for Quiz and Deception.
-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Replace OWNER_EMAIL (two places) with the email of the admin account you create in Authentication > Users.

create table if not exists public.questions (
  id          text primary key,
  kind        text not null check (kind in ('quiz', 'deceit')),
  cat         text not null default 'عام',
  data        jsonb not null,          -- quiz: {q, a:[correct, wrong...], t}; deceit: {q, a, alt:[], f:[]}
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);

alter table public.questions enable row level security;

-- every player can read active questions
drop policy if exists "players read active questions" on public.questions;
create policy "players read active questions" on public.questions
  for select using (active = true);

-- only the owner account can add, edit or hide questions
drop policy if exists "owner manages questions" on public.questions;
create policy "owner manages questions" on public.questions
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'OWNER_EMAIL')
  with check ((auth.jwt() ->> 'email') = 'OWNER_EMAIL');

create or replace function public.touch_questions() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists questions_touch on public.questions;
create trigger questions_touch before update on public.questions
  for each row execute function public.touch_questions();
