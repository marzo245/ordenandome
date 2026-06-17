/**
 * Tipos de dominio del lado del cliente (forma serializada de las filas).
 *
 * Espejan las tablas de `src/db/schema.ts` pero con fechas como `string`
 * (tras pasar por JSON) y sin los helpers de Drizzle, para usarse en los
 * componentes React y en las respuestas de las rutas API.
 */
export type TaskStatus = 'todo' | 'doing' | 'done';
export type TaskPriority = 'baja' | 'media' | 'alta';
export type TaskType = 'trabajo' | 'personal' | 'estudio' | 'otro';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  type: TaskType;
  due_date: string | null;
  deadline: string | null;
  tags: string[] | null;
  parent_id: string | null;
  source_note_path: string | null;
  source_line: number | null;
  source_fingerprint: string | null;
  google_event_id: string | null;
  created_at: string | Date;
  completed_at: string | Date | null;
}

export interface GitHubActivity {
  id: string;
  day: string;
  repo: string;
  kind: 'commit' | 'pr';
  title: string;
  url: string | null;
  sha: string | null;
}

export interface DailySummary {
  id: string;
  day: string;
  content: string;
  generated_at: string | Date;
}
