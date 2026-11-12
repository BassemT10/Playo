-- Playo: premium-only categories and question images.
-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Replace OWNER_EMAIL (four places) with the email of the admin account.

create table if not exists public.categories (
  name        text primary key,
  premium     boolean not null default false,
  updated_at  timestamptz not null default now()
);
alter table public.categories enable row level security;

drop policy if exists "everyone reads categories" on public.categories;
create policy "everyone reads categories" on public.categories for select using (true);

drop policy if exists "owner manages categories" on public.categories;
create policy "owner manages categories" on public.categories
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'OWNER_EMAIL')
  with check ((auth.jwt() ->> 'email') = 'OWNER_EMAIL');

-- public bucket for question pictures (anyone can view, only the owner uploads)
insert into storage.buckets (id, name, public) values ('qimg', 'qimg', true)
  on conflict (id) do update set public = true;

drop policy if exists "owner uploads question images" on storage.objects;
create policy "owner uploads question images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'qimg' and (auth.jwt() ->> 'email') = 'OWNER_EMAIL');

drop policy if exists "owner updates question images" on storage.objects;
create policy "owner updates question images" on storage.objects
  for update to authenticated
  using (bucket_id = 'qimg' and (auth.jwt() ->> 'email') = 'OWNER_EMAIL');
