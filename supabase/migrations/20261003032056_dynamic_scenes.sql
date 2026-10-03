-- Private, account-owned presentation state. Shared Vivian memories are unchanged.
create table public.vivian_scenes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 50 and label = btrim(label)),
  image_key text not null unique,
  source_type text not null check (source_type in ('upload', 'url')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);
create index vivian_scenes_owner_created on public.vivian_scenes(user_id, created_at);
create table public.vivian_scene_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  auto_scene boolean not null default false,
  active_scene_id uuid,
  preset text check (preset in ('day', 'night')),
  revision uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, active_scene_id) references public.vivian_scenes(user_id, id) on delete set null (active_scene_id)
);
-- Durable cleanup queue: staging uploads and replaced/deleted objects can be
-- retried after storage outages. No binaries are stored in application tables.
create table public.vivian_scene_image_gc (
  image_key text primary key,
  user_id uuid not null,
  created_at timestamptz not null default now()
);
alter table public.vivian_scenes enable row level security;
alter table public.vivian_scene_preferences enable row level security;
alter table public.vivian_scene_image_gc enable row level security;
revoke all on public.vivian_scenes, public.vivian_scene_preferences, public.vivian_scene_image_gc from anon, authenticated;
grant select on public.vivian_scenes, public.vivian_scene_preferences to authenticated;
grant all on public.vivian_scenes, public.vivian_scene_preferences, public.vivian_scene_image_gc to service_role;
create policy "Read own scenes" on public.vivian_scenes for select to authenticated using ((select auth.uid()) = user_id);
create policy "Read own scene preferences" on public.vivian_scene_preferences for select to authenticated using ((select auth.uid()) = user_id);
-- Mutations and object reads go through authenticated Vivian routes; no direct
-- client Storage policies can bypass image validation or the app allowlist.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vivian-scenes', 'vivian-scenes', false, 8388608, array['image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create function public.vivian_scene_limit() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if (select count(*) from public.vivian_scenes where user_id = new.user_id) >= 50 then
    raise exception 'Scene library is full' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger vivian_scene_limit before insert on public.vivian_scenes for each row execute function public.vivian_scene_limit();
create function public.vivian_scene_queue_image() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' or old.image_key <> new.image_key then
    insert into public.vivian_scene_image_gc(image_key, user_id) values(old.image_key, old.user_id) on conflict do nothing;
  end if;
  return old;
end;
$$;
create trigger vivian_scene_queue_image after delete or update of image_key on public.vivian_scenes for each row execute function public.vivian_scene_queue_image();
revoke execute on function public.vivian_scene_limit(), public.vivian_scene_queue_image() from public, anon, authenticated;
