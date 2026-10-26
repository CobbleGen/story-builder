-- Limits on what one account keeps, so no one account can fill the
-- project's space: how big a story can be, how many stories, and how much
-- room its pictures take. Generous for writing a book (a novel with its
-- drafts is a few MB; pictures are shrunk before they're kept).

create function public.stories_within_limits() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_column_size(new.data) > 20 * 1024 * 1024 then
    raise exception 'This story is too big to keep in your account (over 20 MB). It''s still saved in this browser; export it to keep a copy.'
      using errcode = '54000';
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.stories s where s.owner = new.owner) >= 200 then
    raise exception 'Your account already holds 200 stories, as many as it can: remove one to add another.'
      using errcode = '54000';
  end if;
  return new;
end;
$$;

create trigger stories_within_limits before insert or update of data on public.stories
  for each row execute function public.stories_within_limits();

-- Whether the signed-in account has room for another picture: up to 1,000
-- of them, in up to 100 MB.
create function public.pictures_have_room() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) < 1000 and coalesce(sum((o.metadata ->> 'size')::bigint), 0) < 100 * 1024 * 1024
  from storage.objects o
  where o.bucket_id = 'pictures' and (storage.foldername(o.name))[1] = (select auth.uid())::text
$$;

revoke execute on function public.pictures_have_room() from public, anon;
grant execute on function public.pictures_have_room() to authenticated;

alter policy "Owners add pictures" on storage.objects
  with check (bucket_id = 'pictures' and (storage.foldername(name))[1] = (select auth.uid())::text and public.pictures_have_room());
