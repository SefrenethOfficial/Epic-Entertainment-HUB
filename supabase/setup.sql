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

-- These helpers are only for the database's own use, not for calling from the web.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.protect_rank() from public, anon, authenticated;
revoke execute on function public.my_rank() from public, anon;
grant execute on function public.my_rank() to authenticated;

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

-- ------------------------------------------------------------- leaderboard
-- XP is the number the leaderboard ranks on. Diamonds are a spendable currency
-- for the future shop. Only signed-in players earn or appear on the board.
alter table public.profiles
  add column if not exists xp int not null default 0,
  add column if not exists weekly_xp int not null default 0,
  add column if not exists week_key int not null default 0,
  add column if not exists diamonds int not null default 0,
  add column if not exists streak int not null default 0,
  add column if not exists last_reward date,
  add column if not exists time_seconds bigint not null default 0;

create index if not exists profiles_xp_idx on public.profiles (xp desc) where xp > 0;
create index if not exists profiles_weekly_idx on public.profiles (week_key, weekly_xp desc) where weekly_xp > 0;

create or replace function public.hub_week_key()
returns int language sql stable set search_path = public as $$
  select (extract(isoyear from (now() at time zone 'UTC'))::int * 100
        + extract(week    from (now() at time zone 'UTC'))::int);
$$;

create table if not exists public.game_plays (
  user_id   uuid not null references public.profiles (id) on delete cascade,
  game_key  text not null,
  play_date date not null,
  primary key (user_id, game_key, play_date)
);
alter table public.game_plays enable row level security;

create or replace function public.hub_add_xp(p_amount int)
returns void language plpgsql security definer set search_path = public as $$
declare wk int := public.hub_week_key();
begin
  update public.profiles
     set xp = xp + p_amount,
         weekly_xp = (case when week_key = wk then weekly_xp else 0 end) + p_amount,
         week_key = wk
   where id = auth.uid();
end; $$;

create or replace function public.hub_award_active(p_seconds int)
returns table(xp int, weekly_xp int, diamonds int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare s int := greatest(0, least(coalesce(p_seconds, 0), 120));
        wk int := public.hub_week_key();
        t0 bigint; t1 bigint; xp_gain int; dia_gain int;
begin
  select time_seconds into t0 from public.profiles where id = auth.uid();
  if t0 is null then return; end if;
  t1 := t0 + s;
  xp_gain  := (t1 / 60)::int  - (t0 / 60)::int;
  dia_gain := (t1 / 600)::int - (t0 / 600)::int;
  update public.profiles
     set time_seconds = t1,
         diamonds = diamonds + dia_gain,
         xp = xp + xp_gain,
         weekly_xp = (case when week_key = wk then weekly_xp else 0 end) + xp_gain,
         week_key = wk
   where id = auth.uid();
  return query select p.xp, p.weekly_xp, p.diamonds from public.profiles p where p.id = auth.uid();
end; $$;

create or replace function public.hub_award_variety(p_game_key text)
returns table(awarded boolean, xp int, weekly_xp int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare did boolean := false; k text := left(coalesce(p_game_key, ''), 64);
begin
  if auth.uid() is null or k = '' then return query select false, 0, 0; return; end if;
  insert into public.game_plays (user_id, game_key, play_date)
  values (auth.uid(), k, (now() at time zone 'UTC')::date)
  on conflict do nothing;
  if found then perform public.hub_add_xp(20); did := true; end if;
  return query select did, p.xp, p.weekly_xp from public.profiles p where p.id = auth.uid();
end; $$;

create or replace function public.hub_claim_daily()
returns table(claimed boolean, reward int, streak int, diamonds int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare today date := (now() at time zone 'UTC')::date;
        v_last date; v_streak int; v_reward int;
begin
  select last_reward, streak into v_last, v_streak from public.profiles where id = auth.uid();
  if v_last = today then
    return query select false, 0, p.streak, p.diamonds from public.profiles p where p.id = auth.uid();
    return;
  end if;
  if v_last = today - 1 then v_streak := coalesce(v_streak, 0) + 1; else v_streak := 1; end if;
  v_reward := least(10 + (v_streak - 1) * 5, 100);
  update public.profiles
     set diamonds = diamonds + v_reward, streak = v_streak, last_reward = today
   where id = auth.uid();
  return query select true, v_reward, p.streak, p.diamonds from public.profiles p where p.id = auth.uid();
end; $$;

revoke execute on function public.hub_add_xp(int)        from public, anon, authenticated;
revoke execute on function public.hub_award_active(int)   from public, anon;
revoke execute on function public.hub_award_variety(text) from public, anon;
revoke execute on function public.hub_claim_daily()       from public, anon;
grant  execute on function public.hub_award_active(int)   to authenticated;
grant  execute on function public.hub_award_variety(text) to authenticated;
grant  execute on function public.hub_claim_daily()       to authenticated;

create or replace view public.hub_board_weekly with (security_invoker = true) as
  select username, rank, weekly_xp as score from public.profiles
  where week_key = public.hub_week_key() and weekly_xp > 0
  order by weekly_xp desc, username limit 100;

create or replace view public.hub_board_alltime with (security_invoker = true) as
  select username, rank, xp as score from public.profiles
  where xp > 0 order by xp desc, username limit 100;

grant select on public.hub_board_weekly, public.hub_board_alltime to anon, authenticated;

-- ------------------------------------------------------- play counts + edit
-- Play counts for every game (built-in and HUB-added), keyed by its id string.
create table if not exists public.play_counts (
  game_key text primary key,
  plays int not null default 0
);
alter table public.play_counts enable row level security;
drop policy if exists "play counts public" on public.play_counts;
create policy "play counts public" on public.play_counts for select using (true);
grant select on public.play_counts to anon, authenticated;

create or replace function public.hub_play(p_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_key is null or length(p_key) = 0 or length(p_key) > 64 then return; end if;
  insert into public.play_counts (game_key, plays) values (p_key, 1)
  on conflict (game_key) do update set plays = play_counts.plays + 1;
end; $$;
revoke execute on function public.hub_play(text) from public;
grant execute on function public.hub_play(text) to anon, authenticated;

-- Owners and Admins can edit a game's details after it's made.
drop policy if exists "staff edit games" on public.games;
create policy "staff edit games" on public.games
  for update to authenticated
  using (public.my_rank() in ('owner', 'admin'))
  with check (public.my_rank() in ('owner', 'admin'));
grant update (title, description, tags, url, image_path) on public.games to authenticated;

-- ------------------------------------------------- email-optional accounts
-- Accounts can be made with just a username + password. A real email in
-- contact_email is what puts a player on the leaderboards. Username-only
-- accounts get a synthetic @noemail.epichub.invalid auth address behind the
-- scenes (so turn OFF "Confirm email" in Auth settings, or those can't sign in).
alter table public.profiles add column if not exists contact_email text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_contact_email_format') then
    alter table public.profiles
      add constraint profiles_contact_email_format
      check (contact_email is null or contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
  end if;
end $$;

grant update (contact_email) on public.profiles to authenticated;

-- New accounts: copy a real signup email into contact_email; leave synthetic ones null.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  wanted text := new.raw_user_meta_data ->> 'username';
begin
  if wanted is null or wanted !~ '^[A-Za-z0-9_]{3,20}$' then
    wanted := 'player_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  insert into public.profiles (id, username, rank, contact_email)
  values (
    new.id,
    wanted,
    case when exists (select 1 from public.profiles where rank = 'owner') then 'player' else 'owner' end,
    case when new.email is null or new.email like '%@noemail.epichub.invalid' then null else new.email end
  );
  return new;
end; $$;

-- Keep contact_email in step if a player's auth email later changes or verifies.
create or replace function public.sync_contact_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is not null and new.email not like '%@noemail.epichub.invalid' then
    update public.profiles set contact_email = new.email where id = new.id;
  end if;
  return new;
end; $$;
revoke execute on function public.sync_contact_email() from public, anon, authenticated;

drop trigger if exists on_auth_user_email on auth.users;
create trigger on_auth_user_email
  after update of email on auth.users
  for each row execute function public.sync_contact_email();

-- Backfill existing accounts that signed up with a real email.
update public.profiles p
   set contact_email = u.email
  from auth.users u
 where u.id = p.id
   and p.contact_email is null
   and u.email is not null
   and u.email not like '%@noemail.epichub.invalid';

-- Leaderboards only list players who added an email.
create or replace view public.hub_board_weekly with (security_invoker = true) as
  select username, rank, weekly_xp as score from public.profiles
  where week_key = public.hub_week_key() and weekly_xp > 0
  order by weekly_xp desc, username limit 100;

create or replace view public.hub_board_alltime with (security_invoker = true) as
  select username, rank, xp as score from public.profiles
  where xp > 0
  order by xp desc, username limit 100;

grant select on public.hub_board_weekly, public.hub_board_alltime to anon, authenticated;

-- ---------------------------------------------------------------- comments
-- Per-game comments: each comment is tagged with game_key (a game's id). Everyone
-- can read; signed-in players post; authors and staff (Owner/Admin) can delete.
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  game_key   text,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
alter table public.comments add column if not exists game_key text;
create index if not exists comments_game_idx on public.comments (game_key, created_at desc);

alter table public.comments enable row level security;

drop policy if exists "comments are public" on public.comments;
create policy "comments are public" on public.comments for select using (true);

drop policy if exists "post as yourself" on public.comments;
create policy "post as yourself" on public.comments
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "delete own or staff" on public.comments;
create policy "delete own or staff" on public.comments
  for delete to authenticated
  using (user_id = auth.uid() or public.my_rank() in ('owner', 'admin'));

grant select on public.comments to anon, authenticated;
grant insert (user_id, body, game_key) on public.comments to authenticated;
grant delete on public.comments to authenticated;

drop view if exists public.hub_comments;
create view public.hub_comments with (security_invoker = true) as
  select c.id, c.body, c.game_key, c.created_at, c.user_id, p.username, p.rank
    from public.comments c
    join public.profiles p on p.id = c.user_id;
grant select on public.hub_comments to anon, authenticated;

-- How many comments each game has, for the count shown on the game cards.
create or replace view public.hub_comment_counts with (security_invoker = true) as
  select game_key, count(*)::int as n
    from public.comments
   where game_key is not null
   group by game_key;
grant select on public.hub_comment_counts to anon, authenticated;
