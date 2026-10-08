-- Accounts' stories and pictures (applied to the story-builder project).

-- Each account's stories, saved whole (the app's StoryData) and synced from
-- the browser. `version` goes up by one with every change, so a device can
-- tell whether the story changed elsewhere since it last saw it.
create table public.stories (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '',
  data jsonb not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index stories_owner_updated_idx on public.stories (owner, updated_at desc);

alter table public.stories enable row level security;

create policy "Owners read their stories" on public.stories
  for select to authenticated using ((select auth.uid()) = owner);
create policy "Owners add stories" on public.stories
  for insert to authenticated with check ((select auth.uid()) = owner);
create policy "Owners change their stories" on public.stories
  for update to authenticated using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
create policy "Owners delete their stories" on public.stories
  for delete to authenticated using ((select auth.uid()) = owner);

-- On every change: the next version, the time, and the owner and creation time kept as they were.
create function public.stories_touch() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  new.owner := old.owner;
  new.created_at := old.created_at;
  return new;
end;
$$;

create trigger stories_touch before update on public.stories
  for each row execute function public.stories_touch();

-- New stories start at version 1 whatever the browser sends.
create function public.stories_start() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := 1;
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create trigger stories_start before insert on public.stories
  for each row execute function public.stories_start();

-- Pictures: private, one folder per account (<user id>/<picture id>).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pictures', 'pictures', false, 26214400, array['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/svg+xml', 'image/bmp']);

create policy "Owners read their pictures" on storage.objects
  for select to authenticated
  using (bucket_id = 'pictures' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Owners add pictures" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'pictures' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Owners replace pictures" on storage.objects
  for update to authenticated
  using (bucket_id = 'pictures' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'pictures' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Owners delete pictures" on storage.objects
  for delete to authenticated
  using (bucket_id = 'pictures' and (storage.foldername(name))[1] = (select auth.uid())::text);
