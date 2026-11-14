-- Epic Entertainment HUB: database setup for Supabase.
--
-- Run this ONCE: Supabase dashboard -> SQL Editor -> paste everything -> Run.
-- It is safe to run again later (it will not delete accounts or games).
--
-- What it makes:
--   profiles      one row per account: username + rank (owner / admin / player)
--   games         games added from inside the HUB
--   game-files    storage for uploaded .html games
--   game-images   storage for game pictures
--
-- Ranks:
--   The FIRST account that signs up becomes the Owner. Everyone after is a Player.
--   The Owner can make Players into Admins (and back) from the Members window.
--   Owners and Admins can add and remove games. Everyone can play.

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  rank       text not null default 'player' check (rank in ('owner', 'admin', 'player')),
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_username_key on public.profiles (lower(username));

-- The signed-in visitor's rank (null when signed out).
create or replace function public.my_rank()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select rank from public.profiles where id = auth.uid();
$$;

-- Every new account gets a profile. First one in is the Owner.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  wanted text := new.raw_user_meta_data ->> 'username';
begin
  if wanted is null or wanted !~ '^[A-Za-z0-9_]{3,20}$' then
    wanted := 'player_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  insert into public.profiles (id, username, rank)
  values (
    new.id,
    wanted,
    case when exists (select 1 from public.profiles where rank = 'owner') then 'player' else 'owner' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only the Owner can change ranks, only between admin and player.
-- (To hand over ownership, edit the profiles table here in the dashboard.)
create or replace function public.protect_rank()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.rank is distinct from old.rank and auth.uid() is not null then
    if public.my_rank() is distinct from 'owner' then
      raise exception 'Only the Owner can change ranks';
    end if;
    if old.rank = 'owner' or new.rank = 'owner' then
      raise exception 'The Owner rank can only be changed from the Supabase dashboard';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_rank on public.profiles;
create trigger protect_rank
  before update on public.profiles
  for each row execute function public.protect_rank();

alter table public.profiles enable row level security;

drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles
  for select using (true);

drop policy if exists "edit own profile or owner edits any" on public.profiles;
create policy "edit own profile or owner edits any" on public.profiles
  for update to authenticated
  using (auth.uid() = id or public.my_rank() = 'owner')
  with check (auth.uid() = id or public.my_rank() = 'owner');

grant select on public.profiles to anon, authenticated;
grant update (username, rank) on public.profiles to authenticated;

-- ------------------------------------------------------------------- games
create table if not exists public.games (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 40),
  description text not null default '' check (char_length(description) <= 200),
  tags        text[] not null default '{}' check (cardinality(tags) <= 3),
  url         text check (url ~ '^https://'),      -- a game hosted somewhere else
  file_path   text,                                -- or an .html file in game-files
  image_path  text,                                -- optional picture in game-images
  added_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  check ((url is null) <> (file_path is null))     -- exactly one of link / upload
);

alter table public.games enable row level security;

drop policy if exists "games are public" on public.games;
create policy "games are public" on public.games
  for select using (true);

drop policy if exists "staff add games" on public.games;
create policy "staff add games" on public.games
  for insert to authenticated
  with check (public.my_rank() in ('owner', 'admin'));

drop policy if exists "staff remove games" on public.games;
create policy "staff remove games" on public.games
  for delete to authenticated
  using (public.my_rank() in ('owner', 'admin'));

grant select on public.games to anon, authenticated;
grant insert, delete on public.games to authenticated;

-- ----------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('game-files',  'game-files',  true, 20971520, array['text/html']),
  ('game-images', 'game-images', true, 2097152,  array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "hub staff see uploads" on storage.objects;
create policy "hub staff see uploads" on storage.objects
  for select to authenticated
  using (bucket_id in ('game-files', 'game-images') and public.my_rank() in ('owner', 'admin'));

drop policy if exists "hub staff upload" on storage.objects;
create policy "hub staff upload" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('game-files', 'game-images') and public.my_rank() in ('owner', 'admin'));

drop policy if exists "hub staff delete uploads" on storage.objects;
create policy "hub staff delete uploads" on storage.objects
  for delete to authenticated
  using (bucket_id in ('game-files', 'game-images') and public.my_rank() in ('owner', 'admin'));
