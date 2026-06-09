-- Ejecuta esto en el SQL Editor de Supabase.

create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  status      text not null default 'todo' check (status in ('todo','doing','done')),
  priority    text not null default 'media' check (priority in ('baja','media','alta')),
  due_date    date,
  tags        text[] default '{}',
  created_at  timestamptz not null default now(),
  completed_at timestamptz
);

-- Cache de actividad de GitHub por día (evita rate limits y permite resúmenes históricos).
create table if not exists github_activity (
  id         uuid primary key default gen_random_uuid(),
  day        date not null,
  repo       text not null,
  kind       text not null,            -- 'commit' | 'pr'
  title      text not null,
  url        text,
  sha        text,
  created_at timestamptz not null default now(),
  unique (kind, sha, repo)
);

-- Resumen diario generado por el LLM.
create table if not exists daily_summaries (
  id           uuid primary key default gen_random_uuid(),
  day          date not null unique,
  content      text not null,
  generated_at timestamptz not null default now()
);

create index if not exists idx_tasks_due on tasks(due_date);
create index if not exists idx_activity_day on github_activity(day);
