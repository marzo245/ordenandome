import { pgTable, uuid, text, date, timestamp, index, uniqueIndex, integer, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const tasks = pgTable(
  'tasks',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    title: text().notNull(),
    description: text(),
    status: text({ enum: ['todo', 'doing', 'done'] }).notNull().default('todo'),
    priority: text({ enum: ['baja', 'media', 'alta'] }).notNull().default('media'),
    type: text({ enum: ['trabajo', 'personal', 'estudio', 'otro'] }).notNull().default('otro'),
    due_date: date(),
    deadline: date(),
    tags: text().array().default(sql`'{}'`),
    parent_id: uuid(),
    source_note_path: text(),
    source_line: integer(),
    source_fingerprint: text(),
    google_event_id: text(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    completed_at: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('idx_tasks_due').on(t.due_date),
    index('idx_tasks_parent').on(t.parent_id),
    uniqueIndex('tasks_source_fingerprint_key').on(t.source_fingerprint),
  ]
);

export const github_activity = pgTable(
  'github_activity',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    day: date().notNull(),
    repo: text().notNull(),
    kind: text({ enum: ['commit', 'pr'] }).notNull(),
    title: text().notNull(),
    url: text(),
    sha: text(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_activity_day').on(t.day),
    uniqueIndex('github_activity_kind_sha_repo_key').on(t.kind, t.sha, t.repo),
  ]
);

export const task_messages = pgTable(
  'task_messages',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    task_id: uuid().notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    role: text({ enum: ['user', 'assistant'] }).notNull(),
    content: text().notNull(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_task_messages_task').on(t.task_id, t.created_at)]
);

export type TaskMessage = typeof task_messages.$inferSelect;

export const reading_list = pgTable(
  'reading_list',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    title: text().notNull(),
    author: text(),
    cover_url: text(),
    status: text({ enum: ['reading', 'want', 'read'] }).notNull().default('reading'),
    niche: text({ enum: ['dev', 'ai', 'sec', 'startup', 'other'] }).notNull().default('other'),
    olid: text(),
    started_at: date(),
    finished_at: date(),
    notes: text(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_reading_status').on(t.status)]
);

export type ReadingItem = typeof reading_list.$inferSelect;
export type NewReadingItem = typeof reading_list.$inferInsert;

export const daily_summaries = pgTable('daily_summaries', {
  id: uuid().primaryKey().default(sql`gen_random_uuid()`),
  day: date().notNull().unique(),
  content: text().notNull(),
  generated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const notes_cache = pgTable(
  'notes_cache',
  {
    path: text().primaryKey(),
    title: text().notNull(),
    scope: text({ enum: ['work', 'personal', 'study', 'unknown'] }).notNull().default('unknown'),
    folder: text().notNull().default(''),
    frontmatter: jsonb().notNull().default(sql`'{}'::jsonb`),
    tags: text().array().notNull().default(sql`'{}'`),
    sha: text().notNull(),
    size: integer().notNull().default(0),
    body_excerpt: text().notNull().default(''),
    links_to: text().array().notNull().default(sql`'{}'`),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_notes_scope').on(t.scope),
    index('idx_notes_folder').on(t.folder),
    index('idx_notes_updated').on(t.updated_at),
  ]
);

export const note_links = pgTable(
  'note_links',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    from_path: text().notNull(),
    to_path: text().notNull(),
    kind: text({ enum: ['wiki', 'embed'] }).notNull().default('wiki'),
  },
  (t) => [
    uniqueIndex('note_links_from_to_kind_key').on(t.from_path, t.to_path, t.kind),
    index('idx_note_links_to').on(t.to_path),
  ]
);

// Sistemas: documentación de cada sistema del flujo (OPERA, eCO, Salesforce, ForceBeat, Beats, SAP).
export const sistemas = pgTable('sistemas', {
  id: uuid().primaryKey().default(sql`gen_random_uuid()`),
  nombre: text().notNull().unique(),      // OPERA, eCO, Salesforce, ForceBeat, Beats, SAP
  descripcion: text(),                     // qué es (resumen)
  rol: text(),                             // su rol en el flujo de creación
  url: text(),                             // acceso
  contenido: text(),                       // documentación libre (markdown)
  orden: integer().notNull().default(0),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export type Sistema = typeof sistemas.$inferSelect;
export type NewSistema = typeof sistemas.$inferInsert;

// KO: base de conocimiento operativa (Gestión de KO — Enel).
// Subprocesos: procedimientos de resolución (SP-xxx).
export const ko_subprocesos = pgTable('ko_subprocesos', {
  id: uuid().primaryKey().default(sql`gen_random_uuid()`),
  codigo: text().notNull().unique(),      // SP-001
  nombre: text().notNull(),               // "Relanzar Novedad"
  responsable: text(),
  cuando_aplicar: text(),                 // markdown
  pasos: text(),                          // markdown
  documentacion: text(),                  // markdown
  flujograma_url: text(),                 // PNG subido a hosting
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// Catálogo de KOs: errores que atascan cuentas en el flujo de creación.
export const ko_entries = pgTable(
  'ko_entries',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    codigo: text(),                       // SAP-005 · null si aún no está formalizado
    error: text().notNull(),              // error normalizado
    eco_notes: text(),                    // mensaje crudo del sistema (ECO_Notes__c)
    sistema: text(),                      // Salesforce | Opera | SAP | eCO
    flujo: integer(),                     // 9..13
    clasificacion: text(),                // Validación | Sistemas | Null | Relanzamiento
    causa_raiz: text(),
    sistema_solucion: text(),             // dónde se resuelve
    responsable: text(),
    subprocesos: text().array().default(sql`'{}'`), // ['SP-001','SP-003']
    resolucion: text(),                   // pasos (markdown)
    documentacion: text(),                // markdown (links a guías)
    flujograma_url: text(),               // PNG subido a hosting
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_ko_sistema').on(t.sistema),
    index('idx_ko_clasificacion').on(t.clasificacion),
    uniqueIndex('ko_entries_codigo_uniq').on(t.codigo).where(sql`${t.codigo} IS NOT NULL`),
  ]
);

export type KoEntry = typeof ko_entries.$inferSelect;
export type NewKoEntry = typeof ko_entries.$inferInsert;
export type KoSubproceso = typeof ko_subprocesos.$inferSelect;
export type NewKoSubproceso = typeof ko_subprocesos.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type GithubActivityRow = typeof github_activity.$inferSelect;
export type NewGithubActivity = typeof github_activity.$inferInsert;
export type DailySummary = typeof daily_summaries.$inferSelect;
export type NoteCache = typeof notes_cache.$inferSelect;
export type NewNoteCache = typeof notes_cache.$inferInsert;
export type NoteLink = typeof note_links.$inferSelect;
