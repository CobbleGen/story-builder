-- Comments on a story, and the links that let an editor read a story and
-- comment on it (see src/comments). Comments are kept apart from the story
-- itself, so the writer, editors and AI assistants can all add to them while
-- the writer goes on writing: nobody's comment is a change to the story.
--
-- Who may comment:
-- - the writer, signed in, on their own stories (writer_* below);
-- - anyone with a review link, on the one story it opens (review_*): the
--   link's token is the permission, so these are callable without signing in;
-- - an AI assistant, with the key of one of the writer's assistant links
--   (assistant_*, as the readers in the assistant keys migration).
-- The tables are reached only through these functions, which check who's
-- asking and keep every comment to its story. (The database linter warns
-- that some are SECURITY DEFINER and callable without signing in, lints 0028
-- and 0029: that is the point, as the token or key is checked inside them.)

-- ---------- Review links ----------

-- A link to one story, for an editor: they can read it all (the open draft and
-- the others, but can't change anything) and comment on anything in it. The
-- token is kept as it is, so the writer can copy the link again later.
create table public.review_links (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  story_id uuid not null references public.stories (id) on delete cascade,
  label text not null default '' check (char_length(label) <= 80),
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{43}$'),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index review_links_owner_idx on public.review_links (owner);
create index review_links_story_idx on public.review_links (story_id, created_at desc);

alter table public.review_links enable row level security;

create policy "Owners see their review links" on public.review_links
  for select to authenticated using ((select auth.uid()) = owner);
create policy "Owners add review links to their stories" on public.review_links
  for insert to authenticated
  with check (
    (select auth.uid()) = owner
    and exists (select 1 from public.stories s where s.id = story_id and s.owner = (select auth.uid()))
  );
create policy "Owners revoke review links" on public.review_links
  for delete to authenticated using ((select auth.uid()) = owner);

-- ---------- Comments ----------

-- A comment starts a thread (`thread` null, with what it's on in `target`) or
-- replies to one. A thread is resolved, or not, as a whole. `author_key` is a
-- fingerprint of a secret kept in the editor's browser, so they can change and
-- delete their own comments (and nobody can pass as them); `via` is the review
-- link or assistant key it came through. A deleted comment is kept, marked
-- `deleted_at` with its words cleared, and no longer listed (nor its replies,
-- for a thread's first).
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories (id) on delete cascade,
  thread uuid references public.comments (id) on delete cascade,
  author_kind text not null check (author_kind in ('writer', 'editor', 'assistant')),
  author_name text not null default '' check (char_length(author_name) <= 80),
  author_key text check (author_key ~ '^[0-9a-f]{64}$'),
  via uuid,
  target jsonb,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  resolved_at timestamptz,
  resolved_by text check (char_length(resolved_by) <= 80),
  deleted_at timestamptz
);

create index comments_story_idx on public.comments (story_id, created_at);
create index comments_thread_idx on public.comments (thread);

-- No policies: only the functions below reach it.
alter table public.comments enable row level security;
revoke all on public.comments from anon, authenticated;

-- ---------- Shared by everyone who comments (called by the functions below only) ----------

-- A story's comments, oldest first; `mine`: written by whoever's asking.
create function public.comments_list(p_story uuid, p_kind text, p_key text, p_via uuid)
returns table (
  id uuid, thread uuid, author_kind text, author_name text, target jsonb, body text,
  created_at timestamptz, edited_at timestamptz, resolved_at timestamptz, resolved_by text, mine boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.thread, c.author_kind, c.author_name, c.target, c.body,
         c.created_at, c.edited_at, c.resolved_at, c.resolved_by,
         coalesce(case p_kind
           when 'writer' then c.author_kind = 'writer'
           when 'editor' then c.author_kind = 'editor' and c.author_key = p_key
           when 'assistant' then c.author_kind = 'assistant' and c.via = p_via
         end, false)
    from public.comments c
   where c.story_id = p_story
     and c.deleted_at is null
     and not exists (select 1 from public.comments t where t.id = c.thread and t.deleted_at is not null)
   order by c.created_at, c.id;
$$;

-- Adds a comment: a thread's first (on `p_target`) or a reply to `p_thread`
-- (which opens the thread again, if it was resolved). Its id.
create function public.comments_add(
  p_story uuid, p_thread uuid, p_kind text, p_name text, p_key text, p_via uuid, p_target jsonb, p_body text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
  v_target jsonb := p_target;
  v_id uuid;
begin
  if char_length(v_body) = 0 then
    raise exception 'A comment needs some words.' using errcode = '22023';
  end if;
  if char_length(v_body) > 5000 then
    raise exception 'A comment can be up to 5,000 characters long.' using errcode = '22023';
  end if;
  if p_thread is not null then
    if not exists (
      select 1 from public.comments c
       where c.id = p_thread and c.story_id = p_story and c.thread is null and c.deleted_at is null
    ) then
      raise exception 'There''s no such comment to reply to.' using errcode = 'P0002';
    end if;
    v_target := null;
  elsif v_target is null
     or jsonb_typeof(v_target) <> 'object'
     or coalesce(v_target ->> 'kind', '') not in ('story', 'chapter', 'text', 'beat', 'arc', 'character', 'element', 'map')
     or octet_length(v_target::text) > 8000 then
    raise exception 'What the comment is on isn''t clear.' using errcode = '22023';
  end if;
  if (select count(*) from public.comments c where c.story_id = p_story and c.deleted_at is null) >= 5000 then
    raise exception 'This story has as many comments as it can keep. Delete some resolved ones first.' using errcode = '54000';
  end if;
  insert into public.comments (story_id, thread, author_kind, author_name, author_key, via, target, body)
  values (p_story, p_thread, p_kind, left(btrim(coalesce(p_name, '')), 80), p_key, p_via, v_target, v_body)
  returning id into v_id;
  if p_thread is not null then
    update public.comments set resolved_at = null, resolved_by = null where id = p_thread and resolved_at is not null;
  end if;
  return v_id;
end;
$$;

-- Resolves a thread (or a reply's thread), or opens it again.
create function public.comments_resolve(p_story uuid, p_comment uuid, p_resolved boolean, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread uuid;
begin
  select coalesce(c.thread, c.id) into v_thread
    from public.comments c
   where c.id = p_comment and c.story_id = p_story and c.deleted_at is null;
  if v_thread is null then
    raise exception 'There''s no such comment.' using errcode = 'P0002';
  end if;
  update public.comments
     set resolved_at = case when p_resolved then now() end,
         resolved_by = case when p_resolved then left(btrim(coalesce(p_name, '')), 80) end
   where id = v_thread and deleted_at is null;
end;
$$;

-- Whether a comment is one its asker may change or delete: the writer may delete any in their story.
create function public.comments_own(p_story uuid, p_comment uuid, p_kind text, p_key text, p_via uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.comments c
     where c.id = p_comment and c.story_id = p_story and c.author_kind = p_kind and c.deleted_at is null
       and case p_kind
             when 'writer' then true
             when 'editor' then c.author_key = p_key
             when 'assistant' then c.via = p_via
             else false
           end
  );
$$;

-- Changes a comment's words.
create function public.comments_edit(p_story uuid, p_comment uuid, p_body text, p_kind text, p_key text, p_via uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
begin
  if char_length(v_body) = 0 or char_length(v_body) > 5000 then
    raise exception 'A comment needs some words (up to 5,000 characters).' using errcode = '22023';
  end if;
  if not public.comments_own(p_story, p_comment, p_kind, p_key, p_via) then
    raise exception 'Only whoever wrote a comment can change it.' using errcode = '42501';
  end if;
  update public.comments set body = v_body, edited_at = now() where id = p_comment;
end;
$$;

-- Takes a comment back: it's no longer listed (a thread's first takes its
-- replies with it), and its words are cleared.
create function public.comments_remove(p_story uuid, p_comment uuid, p_kind text, p_key text, p_via uuid, p_any boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (p_any and exists (select 1 from public.comments c where c.id = p_comment and c.story_id = p_story and c.deleted_at is null))
     and not public.comments_own(p_story, p_comment, p_kind, p_key, p_via) then
    raise exception 'Only whoever wrote a comment can delete it.' using errcode = '42501';
  end if;
  update public.comments
     set deleted_at = now(), body = '(deleted)', target = null
   where id = p_comment and story_id = p_story;
end;
$$;

-- ---------- The writer, signed in ----------

-- The story, if it's the signed-in writer's; "insufficient privilege" otherwise.
create function public.writer_story(p_story uuid) returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.stories s where s.id = p_story and s.owner = (select auth.uid())) then
    raise exception 'That story isn''t in your account.' using errcode = '42501';
  end if;
  return p_story;
end;
$$;

create function public.writer_comments(p_story uuid)
returns table (
  id uuid, thread uuid, author_kind text, author_name text, target jsonb, body text,
  created_at timestamptz, edited_at timestamptz, resolved_at timestamptz, resolved_by text, mine boolean
)
language sql
security definer
set search_path = ''
as $$
  select * from public.comments_list(public.writer_story(p_story), 'writer', null, null);
$$;

create function public.writer_add_comment(p_story uuid, p_thread uuid, p_target jsonb, p_body text, p_name text default '')
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.comments_add(public.writer_story(p_story), p_thread, 'writer', p_name, null, null, p_target, p_body);
$$;

create function public.writer_resolve_comment(p_story uuid, p_comment uuid, p_resolved boolean, p_name text default '')
returns void
language sql
security definer
set search_path = ''
as $$
  select public.comments_resolve(public.writer_story(p_story), p_comment, p_resolved, p_name);
$$;

create function public.writer_edit_comment(p_story uuid, p_comment uuid, p_body text)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.comments_edit(public.writer_story(p_story), p_comment, p_body, 'writer', null, null);
$$;

create function public.writer_remove_comment(p_story uuid, p_comment uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.comments_remove(public.writer_story(p_story), p_comment, 'writer', null, null, true);
$$;

-- ---------- An editor, with a review link ----------

-- The story a review link opens (noting when it was last used, at most once a
-- minute), or "invalid authorization" (SQLSTATE 28000, answered with 403).
create function public.review_story(p_token text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_story uuid;
begin
  select l.story_id into v_story from public.review_links l where l.token = coalesce(p_token, '');
  if v_story is null then
    raise exception 'That review link doesn''t open a story: it may have been turned off.' using errcode = '28000';
  end if;
  update public.review_links l
     set last_used_at = now()
   where l.token = p_token and (l.last_used_at is null or l.last_used_at < now() - interval '1 minute');
  return v_story;
end;
$$;

-- The editor's fingerprint, from the secret their browser keeps.
create function public.review_me(p_me text) returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_me is null or char_length(p_me) not between 20 and 100 then
    raise exception 'Missing who''s commenting.' using errcode = '22023';
  end if;
  return encode(sha256(convert_to(p_me, 'UTF8')), 'hex');
end;
$$;

-- The story a review link opens: its contents, its owner (whose folder its
-- pictures are in) and the link's label.
create function public.review_open(p_token text) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_story uuid := public.review_story(p_token);
begin
  return (
    select jsonb_build_object('id', s.id, 'owner', s.owner, 'title', s.title, 'updated_at', s.updated_at, 'label', l.label, 'data', s.data)
      from public.stories s join public.review_links l on l.story_id = s.id and l.token = p_token
     where s.id = v_story
  );
end;
$$;

create function public.review_comments(p_token text, p_me text)
returns table (
  id uuid, thread uuid, author_kind text, author_name text, target jsonb, body text,
  created_at timestamptz, edited_at timestamptz, resolved_at timestamptz, resolved_by text, mine boolean
)
language sql
security definer
set search_path = ''
as $$
  select * from public.comments_list(public.review_story(p_token), 'editor', public.review_me(p_me), null);
$$;

create function public.review_add_comment(p_token text, p_me text, p_name text, p_thread uuid, p_target jsonb, p_body text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.comments_add(
    public.review_story(p_token), p_thread, 'editor', coalesce(nullif(btrim(p_name), ''), 'Editor'), public.review_me(p_me),
    (select l.id from public.review_links l where l.token = p_token), p_target, p_body
  );
$$;

create function public.review_resolve_comment(p_token text, p_name text, p_comment uuid, p_resolved boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.comments_resolve(public.review_story(p_token), p_comment, p_resolved, coalesce(nullif(btrim(p_name), ''), 'Editor'));
$$;

create function public.review_edit_comment(p_token text, p_me text, p_comment uuid, p_body text)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.comments_edit(public.review_story(p_token), p_comment, p_body, 'editor', public.review_me(p_me), null);
$$;

create function public.review_remove_comment(p_token text, p_me text, p_comment uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.comments_remove(public.review_story(p_token), p_comment, 'editor', public.review_me(p_me), null, false);
$$;

-- Pictures: an editor's browser sends its review link's token in the
-- x-review-token header (which Storage passes on as request.headers), and
-- sees the pictures that story uses, from its owner's folder.
create function public.review_sees_picture(p_name text) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_picture text := storage.filename(p_name);
begin
  begin
    v_token := (nullif(current_setting('request.headers', true), '')::json) ->> 'x-review-token';
  exception when others then
    return false;
  end;
  if v_token is null or v_picture is null or v_picture !~ '^img_[a-z0-9]+$' then
    return false;
  end if;
  return exists (
    select 1
      from public.review_links l join public.stories s on s.id = l.story_id
     where l.token = v_token
       and (storage.foldername(p_name))[1] = s.owner::text
       and s.data::text ~ ('\y' || v_picture || '\y')
  );
end;
$$;

create policy "Editors see the pictures in a story shared with them" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'pictures' and public.review_sees_picture(name));

-- ---------- An AI assistant, with the key of one of the writer's assistant links ----------

-- The key's link (noting when it was last used), or "invalid authorization".
create function public.assistant_link(p_key text) returns public.assistant_keys
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.assistant_keys;
begin
  -- (assistant_owner checks the key, and notes the use.)
  perform public.assistant_owner(p_key);
  select * into v_link from public.assistant_keys k
   where k.key_hash = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex');
  return v_link;
end;
$$;

-- The story, if it's in the key's account.
create function public.assistant_story_id(p_link public.assistant_keys, p_story uuid) returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.stories s where s.id = p_story and s.owner = p_link.owner) then
    raise exception 'That story isn''t in this account.' using errcode = 'P0002';
  end if;
  return p_story;
end;
$$;

create function public.assistant_comments(p_key text, p_story uuid)
returns table (
  id uuid, thread uuid, author_kind text, author_name text, target jsonb, body text,
  created_at timestamptz, edited_at timestamptz, resolved_at timestamptz, resolved_by text, mine boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.assistant_keys := public.assistant_link(p_key);
begin
  return query select * from public.comments_list(public.assistant_story_id(v_link, p_story), 'assistant', null, v_link.id);
end;
$$;

create function public.assistant_add_comment(p_key text, p_story uuid, p_thread uuid, p_target jsonb, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.assistant_keys := public.assistant_link(p_key);
begin
  return public.comments_add(
    public.assistant_story_id(v_link, p_story), p_thread, 'assistant', coalesce(nullif(btrim(v_link.label), ''), 'AI assistant'),
    null, v_link.id, p_target, p_body
  );
end;
$$;

create function public.assistant_resolve_comment(p_key text, p_story uuid, p_comment uuid, p_resolved boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.assistant_keys := public.assistant_link(p_key);
begin
  perform public.comments_resolve(
    public.assistant_story_id(v_link, p_story), p_comment, p_resolved, coalesce(nullif(btrim(v_link.label), ''), 'AI assistant')
  );
end;
$$;

-- ---------- Who may call what ----------

revoke all on function public.comments_list(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.comments_add(uuid, uuid, text, text, text, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.comments_resolve(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.comments_own(uuid, uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.comments_edit(uuid, uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.comments_remove(uuid, uuid, text, text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.writer_story(uuid) from public, anon, authenticated;
revoke all on function public.review_story(text) from public, anon, authenticated;
revoke all on function public.review_me(text) from public, anon, authenticated;
revoke all on function public.assistant_link(text) from public, anon, authenticated;
revoke all on function public.assistant_story_id(public.assistant_keys, uuid) from public, anon, authenticated;

revoke all on function public.writer_comments(uuid) from public, anon;
revoke all on function public.writer_add_comment(uuid, uuid, jsonb, text, text) from public, anon;
revoke all on function public.writer_resolve_comment(uuid, uuid, boolean, text) from public, anon;
revoke all on function public.writer_edit_comment(uuid, uuid, text) from public, anon;
revoke all on function public.writer_remove_comment(uuid, uuid) from public, anon;
grant execute on function public.writer_comments(uuid) to authenticated;
grant execute on function public.writer_add_comment(uuid, uuid, jsonb, text, text) to authenticated;
grant execute on function public.writer_resolve_comment(uuid, uuid, boolean, text) to authenticated;
grant execute on function public.writer_edit_comment(uuid, uuid, text) to authenticated;
grant execute on function public.writer_remove_comment(uuid, uuid) to authenticated;

revoke all on function public.review_open(text) from public;
revoke all on function public.review_comments(text, text) from public;
revoke all on function public.review_add_comment(text, text, text, uuid, jsonb, text) from public;
revoke all on function public.review_resolve_comment(text, text, uuid, boolean) from public;
revoke all on function public.review_edit_comment(text, text, uuid, text) from public;
revoke all on function public.review_remove_comment(text, text, uuid) from public;
revoke all on function public.review_sees_picture(text) from public;
grant execute on function public.review_open(text) to anon, authenticated;
grant execute on function public.review_comments(text, text) to anon, authenticated;
grant execute on function public.review_add_comment(text, text, text, uuid, jsonb, text) to anon, authenticated;
grant execute on function public.review_resolve_comment(text, text, uuid, boolean) to anon, authenticated;
grant execute on function public.review_edit_comment(text, text, uuid, text) to anon, authenticated;
grant execute on function public.review_remove_comment(text, text, uuid) to anon, authenticated;
grant execute on function public.review_sees_picture(text) to anon, authenticated;

revoke all on function public.assistant_comments(text, uuid) from public;
revoke all on function public.assistant_add_comment(text, uuid, uuid, jsonb, text) from public;
revoke all on function public.assistant_resolve_comment(text, uuid, uuid, boolean) from public;
grant execute on function public.assistant_comments(text, uuid) to anon, authenticated;
grant execute on function public.assistant_add_comment(text, uuid, uuid, jsonb, text) to anon, authenticated;
grant execute on function public.assistant_resolve_comment(text, uuid, uuid, boolean) to anon, authenticated;
