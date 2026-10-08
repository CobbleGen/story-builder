-- Links that let an AI assistant read an account's stories (see server/mcp.ts).
-- The app makes a random key for each link and keeps only its SHA-256 here,
-- so a key can't be read back or recovered from the database; `hint` is its
-- last few characters, to tell links apart. The server reads stories with a
-- key through the two functions below, which find the key's account and
-- return only that account's stories: a key reaches nothing else, and can't
-- change anything.
--
-- The two readers are SECURITY DEFINER and callable without signing in (the
-- database linter warns about that, lints 0028 and 0029): that is the point,
-- as the key (32 random bytes) is the permission, checked inside them.
create table public.assistant_keys (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null default '' check (char_length(label) <= 80),
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  hint text not null default '' check (char_length(hint) <= 8),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index assistant_keys_owner_idx on public.assistant_keys (owner, created_at desc);

alter table public.assistant_keys enable row level security;

create policy "Owners see their keys" on public.assistant_keys
  for select to authenticated using ((select auth.uid()) = owner);
create policy "Owners add keys" on public.assistant_keys
  for insert to authenticated with check ((select auth.uid()) = owner);
create policy "Owners revoke keys" on public.assistant_keys
  for delete to authenticated using ((select auth.uid()) = owner);

-- The account a key belongs to (noting when it was last used, at most once a
-- minute), or "invalid authorization" (SQLSTATE 28000, which the API answers
-- with 403). For the two functions below only.
create function public.assistant_owner(p_key text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  hashed text := encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex');
  found uuid;
begin
  select k.owner into found from public.assistant_keys k where k.key_hash = hashed;
  if found is null then
    raise exception 'That key doesn''t open an account.' using errcode = '28000';
  end if;
  update public.assistant_keys
     set last_used_at = now()
   where key_hash = hashed and (last_used_at is null or last_used_at < now() - interval '1 minute');
  return found;
end;
$$;

-- The stories in a key's account, most recently saved first (without their contents).
create function public.assistant_stories(p_key text)
returns table (id uuid, title text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.assistant_owner(p_key);
begin
  return query
    select s.id, s.title, s.updated_at from public.stories s where s.owner = me order by s.updated_at desc;
end;
$$;

-- One story's contents, if it's in the key's account (null otherwise).
create function public.assistant_story(p_key text, p_story uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.assistant_owner(p_key);
begin
  return (select s.data from public.stories s where s.owner = me and s.id = p_story);
end;
$$;

-- Anyone may call the two readers (the key is the permission); nobody calls the key lookup directly.
revoke all on function public.assistant_owner(text) from public, anon, authenticated;
revoke all on function public.assistant_stories(text) from public;
revoke all on function public.assistant_story(text, uuid) from public;
grant execute on function public.assistant_stories(text) to anon, authenticated;
grant execute on function public.assistant_story(text, uuid) to anon, authenticated;
