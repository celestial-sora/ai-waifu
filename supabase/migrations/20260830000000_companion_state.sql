create table if not exists public.companion_state (
  user_key text primary key,
  affinity smallint not null default 22 check (affinity between 0 and 100),
  trust smallint not null default 18 check (trust between 0 and 100),
  familiarity smallint not null default 8 check (familiarity between 0 and 100),
  mood text not null default 'calm',
  mood_intensity smallint not null default 35 check (mood_intensity between 0 and 100),
  conversation_summary text not null default '',
  last_idle_at timestamptz,
  last_interaction_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.companion_state enable row level security;
