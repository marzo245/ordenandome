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

-- Subsecciones de cada sistema: capacidades, procedimientos, accesos, reglas, etc.
create table if not exists sistema_secciones (
  id          uuid primary key default gen_random_uuid(),
  sistema_id  uuid not null references sistemas(id) on delete cascade,
  titulo      text not null,
  tipo        text not null default 'general',
  contenido   text,
  pasos       jsonb not null default '[]'::jsonb,
  orden       integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- Pasos de un flujo multi-sistema: [{ sistema_id, accion, dato }]. Vacío = acción de un solo sistema.
alter table sistema_secciones add column if not exists pasos jsonb not null default '[]'::jsonb;

create index if not exists idx_sistema_secciones_sistema on sistema_secciones(sistema_id);
create index if not exists idx_sistema_secciones_orden on sistema_secciones(orden);

-- Importación de Excel de "KO altas": un lote por subida, un caso por fila.
create table if not exists ko_import_lotes (
  id             uuid primary key default gen_random_uuid(),
  nombre_archivo text not null,
  total          integer not null default 0,
  conocidas      integer not null default 0,
  desconocidas   integer not null default 0,
  columna_codigo text,
  created_at     timestamptz not null default now()
);

create table if not exists ko_import_casos (
  id          uuid primary key default gen_random_uuid(),
  lote_id     uuid not null references ko_import_lotes(id) on delete cascade,
  fila        jsonb not null default '{}'::jsonb,
  error_texto text,
  codigo      text,
  tipo        text not null check (tipo in ('conocida','desconocida')),
  ko_entry_id uuid references ko_entries(id) on delete set null,
  estado      text not null default 'pendiente' check (estado in ('pendiente','resuelto')),
  notas       text,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table ko_import_casos add column if not exists error_texto text;

create index if not exists idx_ko_casos_lote on ko_import_casos(lote_id);
create index if not exists idx_ko_casos_tipo_estado on ko_import_casos(tipo, estado);
create index if not exists idx_ko_casos_codigo on ko_import_casos(codigo);
create index if not exists idx_ko_casos_ko on ko_import_casos(ko_entry_id);
create index if not exists idx_ko_casos_error on ko_import_casos(error_texto);
