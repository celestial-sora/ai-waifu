alter table public.memories add column if not exists last_used_at timestamptz;
alter table public.memories add column if not exists use_count integer not null default 0;
create index if not exists memories_user_last_used_idx on public.memories(user_key, last_used_at desc nulls last);
