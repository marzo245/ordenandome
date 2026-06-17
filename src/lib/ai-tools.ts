/**
 * Definiciones y ejecutores de las "tools" que el LLM puede invocar.
 *
 * Cada entrada de {@link VAULT_TOOLS} junta la `def` (esquema que ve el modelo,
 * formato OpenAI function-calling) con su `exec` (la implementación real que se
 * ejecuta en el servidor). De ahí se derivan {@link TOOL_DEFS} (lo que se manda
 * al LLM) y {@link TOOL_EXECUTORS} (el mapa nombre→ejecutor que usa runAgent).
 *
 * Las tools actuales dan al agente acceso de lectura al vault Obsidian y a las
 * tareas, para que pueda "fundamentar" sus respuestas en datos reales.
 */
import { db, notes_cache, tasks } from '@/db';
import { sql, or, eq } from 'drizzle-orm';
import { searchVault, buildVaultMap } from './vault-context';
import { getNoteContent } from './obsidian';

/** Esquema de una tool en formato OpenAI function-calling (lo que ve el modelo). */
export interface ToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

/** Implementación de una tool: recibe los args parseados y devuelve texto para el modelo. */
export type ToolExecutor = (args: Record<string, unknown>) => Promise<string>;

/** Catálogo de tools disponibles para el agente (definición + implementación juntas). */
export const VAULT_TOOLS: { def: ToolDef; exec: ToolExecutor }[] = [
  {
    def: {
      type: 'function',
      function: {
        name: 'search_vault',
        description:
          'Busca notas en el vault Obsidian del usuario por palabras clave. Devuelve las más relevantes con título, carpeta, tags y excerpt. ÚSALO si necesitas saber qué tiene documentado el usuario sobre un tema, o validar si una tarea/nota encaja en un proyecto existente.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Palabras clave separadas por espacio' },
            limit: { type: 'number', description: 'Máximo de resultados (default 8, máx 20)' },
          },
          required: ['query'],
        },
      },
    },
    exec: async (args) => {
      const query = String(args.query ?? '');
      const limit = Math.min(Number(args.limit ?? 8), 20);
      const matches = await searchVault(query, limit);
      if (!matches.length) return 'Sin resultados.';
      return matches
        .map(
          (m) =>
            `- [[${m.title}]] (${m.folder})${m.tags.length ? ' [' + m.tags.map((t) => '#' + t).join(' ') + ']' : ''}${m.excerpt ? ' — ' + m.excerpt : ''}`
        )
        .join('\n');
    },
  },
  {
    def: {
      type: 'function',
      function: {
        name: 'read_note',
        description:
          'Lee el contenido completo de una nota del vault dado su path (ej. "01-Proyectos/Personales/OpenClaw Discord Bot.md"). Útil cuando search_vault ya identificó una nota relevante y necesitas el detalle.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path relativo dentro del vault' },
          },
          required: ['path'],
        },
      },
    },
    exec: async (args) => {
      const path = String(args.path ?? '');
      try {
        const [cached] = await db
          .select({ body_excerpt: notes_cache.body_excerpt })
          .from(notes_cache)
          .where(eq(notes_cache.path, path));
        if (!cached) return `Nota no encontrada en cache: ${path}`;
        // El excerpt es solo 280 chars; para el detalle bajamos de GitHub.
        const { content } = await getNoteContent(path);
        return content.slice(0, 6000); // tope defensivo
      } catch (e) {
        return `Error leyendo nota: ${(e as Error).message}`;
      }
    },
  },
  {
    def: {
      type: 'function',
      function: {
        name: 'list_active_projects',
        description:
          'Lista los proyectos activos del vault (carpeta 01-Proyectos). Devuelve nombre + path. ÚSALO al inicio si la tarea/nota podría pertenecer a un proyecto.',
        parameters: { type: 'object', properties: {} },
      },
    },
    exec: async () => {
      const rows = await db
        .select({ path: notes_cache.path, title: notes_cache.title, folder: notes_cache.folder })
        .from(notes_cache)
        .where(sql`${notes_cache.folder} LIKE '01-Proyectos%'`)
        .limit(40);
      if (!rows.length) return 'Sin proyectos cacheados.';
      return rows.map((r) => `- [[${r.title}]] (${r.folder})`).join('\n');
    },
  },
  {
    def: {
      type: 'function',
      function: {
        name: 'list_tasks',
        description:
          'Lista tareas activas del usuario (status != done). Útil para evitar duplicar tareas o entender carga actual.',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Máx tareas (default 30)' },
          },
        },
      },
    },
    exec: async (args) => {
      const limit = Math.min(Number(args.limit ?? 30), 60);
      const rows = await db.select().from(tasks).limit(limit);
      const active = rows.filter((t) => t.status !== 'done');
      if (!active.length) return 'Sin tareas activas.';
      return active
        .map((t) => `- ${t.title} [${t.priority}, ${t.status}${t.due_date ? ', vence ' + t.due_date : ''}]`)
        .join('\n');
    },
  },
];

/** Solo los esquemas, para mandar al LLM en `body.tools`. */
export const TOOL_DEFS = VAULT_TOOLS.map((t) => t.def);
/** Mapa nombre→ejecutor que usa runAgent para resolver cada tool_call. */
export const TOOL_EXECUTORS: Record<string, ToolExecutor> = Object.fromEntries(
  VAULT_TOOLS.map((t) => [t.def.function.name, t.exec])
);

/** Mapa compacto del vault (siempre en system) — da grounding sin gastar mucho. */
export async function getVaultMapForSystem(): Promise<string> {
  return buildVaultMap();
}
