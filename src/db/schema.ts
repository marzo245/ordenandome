/**
 * Schema Drizzle de la base de datos (Neon Postgres).
 *
 * Cada `pgTable` define una tabla y, debajo, se exporta su tipo inferido
 * (`$inferSelect` para filas leídas, `$inferInsert` para inserciones).
 *
 * IMPORTANTE: este schema NO se aplica solo. Tras editarlo hay que sincronizar
 * el DDL contra Neon (`npm run db:push` o el `ALTER/CREATE` manual). El DDL
 * equivalente se mantiene a mano en `supabase/schema.sql`.
 *
 * Dominios:
 * - tareas: `tasks`, `task_messages`
 * - notas Obsidian: `notes_cache`, `note_links`
 * - sistemas (doc operativa): `sistemas`, `sistema_secciones`
 * - KO (errores conocidos): `ko_entries`, `ko_subprocesos`
 * - varios: `github_activity`, `daily_summaries`, `reading_list`
 */
import { pgTable, uuid, text, date, timestamp, index, uniqueIndex, integer, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/** Tareas del tablero "Hoy". Pueden originarse a mano o derivarse de una nota
 *  (campos `source_*`) y sincronizarse a Google Calendar (`google_event_id`). */
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

/** Actividad de GitHub (commits y PRs) sincronizada por día, para el feed y el resumen diario. */
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

/** Historial del chat de IA asociado a una tarea (se borra en cascada con la tarea). */
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

/** Lista de lectura (libros): estado, nicho y metadatos de Open Library (`olid`). */
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

/** Resumen diario generado por IA (uno por día, clave `day` única). */
export const daily_summaries = pgTable('daily_summaries', {
  id: uuid().primaryKey().default(sql`gen_random_uuid()`),
  day: date().notNull().unique(),
  content: text().notNull(),
  generated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Cache local de las notas del vault Obsidian (sincronizado desde GitHub).
 *  Guarda metadatos + excerpt para búsqueda rápida; el cuerpo completo se baja
 *  de GitHub bajo demanda. `sha` permite detectar cambios. */
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

/** Grafo de enlaces entre notas (wikilinks `[[..]]` y embeds), para el panel de backlinks. */
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

// Un paso de una acción que atraviesa varios sistemas: empiezas en un sistema,
// obtienes un dato y lo llevas al siguiente.
export type AccionPaso = {
  sistema_id: string; // sistema donde ocurre el paso
  accion: string; // qué haces en ese sistema
  dato: string; // dato que obtienes para llevar al siguiente paso
};

// Acciones de cada sistema: qué se puede hacer. Una acción puede ser de un solo
// sistema (pasos vacío) o un flujo multi-sistema (pasos ordenados); `sistema_id`
// es el sistema donde "empieza" la acción.
export const sistema_secciones = pgTable(
  'sistema_secciones',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    sistema_id: uuid()
      .notNull()
      .references(() => sistemas.id, { onDelete: 'cascade' }),
    titulo: text().notNull(),
    tipo: text().notNull().default('general'),
    contenido: text(),
    pasos: jsonb().$type<AccionPaso[]>().notNull().default(sql`'[]'::jsonb`),
    orden: integer().notNull().default(0),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_sistema_secciones_sistema').on(t.sistema_id),
    index('idx_sistema_secciones_orden').on(t.orden),
  ]
);

export type SistemaSeccion = typeof sistema_secciones.$inferSelect;
export type NewSistemaSeccion = typeof sistema_secciones.$inferInsert;

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

// Importación de Excel de "KO altas": cada subida es un lote y cada fila un caso.
// Los casos se cruzan por código contra `ko_entries` y se gestionan como worklist.
export const ko_import_lotes = pgTable('ko_import_lotes', {
  id: uuid().primaryKey().default(sql`gen_random_uuid()`),
  nombre_archivo: text().notNull(),
  total: integer().notNull().default(0),
  conocidas: integer().notNull().default(0),
  desconocidas: integer().notNull().default(0),
  columna_codigo: text(),                 // cabecera del Excel usada como código
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// Un caso = una fila del Excel ya cruzada con el catálogo.
export const ko_import_casos = pgTable(
  'ko_import_casos',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    lote_id: uuid()
      .notNull()
      .references(() => ko_import_lotes.id, { onDelete: 'cascade' }),
    fila: jsonb()
      .$type<Record<string, string | number | null>>()
      .notNull()
      .default(sql`'{}'::jsonb`),          // fila cruda del Excel
    error_texto: text(),                   // valor de la columna de error usada para cruzar
    codigo: text(),                        // código del KO que cruzó (null si pendiente)
    tipo: text({ enum: ['conocida', 'desconocida'] }).notNull(),
    ko_entry_id: uuid().references(() => ko_entries.id, { onDelete: 'set null' }),
    // Estado de gestión interno de la cuenta (distinto de tipo/normalización).
    estado: text({ enum: ['pendiente', 'en_revision', 'resuelto'] })
      .notNull()
      .default('pendiente'),
    // Incidencia (solo si el caso lo requiere por sus subprocesos).
    incidencia_numero: text(),
    incidencia_estado: text({ enum: ['pendiente', 'enviado', 'ok'] }),
    // Histórico de cambios: [{ at: ISO, texto }]. Más reciente al final.
    historial: jsonb()
      .$type<{ at: string; texto: string }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    notas: text(),
    resolved_at: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_ko_casos_lote').on(t.lote_id),
    index('idx_ko_casos_tipo_estado').on(t.tipo, t.estado),
    index('idx_ko_casos_codigo').on(t.codigo),
    index('idx_ko_casos_ko').on(t.ko_entry_id),
    index('idx_ko_casos_error').on(t.error_texto),
  ]
);

export type KoImportLote = typeof ko_import_lotes.$inferSelect;
export type NewKoImportLote = typeof ko_import_lotes.$inferInsert;
export type KoImportCaso = typeof ko_import_casos.$inferSelect;
export type NewKoImportCaso = typeof ko_import_casos.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type GithubActivityRow = typeof github_activity.$inferSelect;
export type NewGithubActivity = typeof github_activity.$inferInsert;
export type DailySummary = typeof daily_summaries.$inferSelect;
export type NoteCache = typeof notes_cache.$inferSelect;
export type NewNoteCache = typeof notes_cache.$inferInsert;
export type NoteLink = typeof note_links.$inferSelect;
