import type { Task } from '@/db';
import { runAgent } from './ai-agent';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface TaskDraft {
  title: string;
  description: string | null;
  priority: 'baja' | 'media' | 'alta';
  due_date: string | null;
  deadline: string | null;
  estimated_hours: number | null;
}

export type PlannerResult =
  | { action: 'clarify'; message: string }
  | { action: 'propose'; message: string; draft: TaskDraft }
  | { action: 'propose_multi'; message: string; parent: TaskDraft; subtasks: TaskDraft[] };

const SYSTEM = (today: string, tasksJson: string, vaultMap: string) => `Eres un asistente que ayuda a planear tareas. Hablas en español, directo y breve.

CONTEXTO

Hoy es ${today}.

## Mapa general del vault Obsidian del usuario (grounding)

${vaultMap}

## Tareas existentes
${tasksJson}

## Herramientas disponibles

Tienes herramientas para consultar el vault SOLO cuando lo necesites (evita gastarlas si la tarea es trivial):
- search_vault(query) — busca notas por palabras clave
- read_note(path) — lee una nota completa
- list_active_projects() — proyectos en 01-Proyectos/
- list_tasks() — tareas activas detalladas

Usa estas herramientas si:
- La tarea menciona algo que podría ser un proyecto, área o tema documentado.
- Necesitas decidir si encaja en un proyecto existente o crear uno nuevo.
- Quieres validar si duplica algo del vault.

NO las uses si la tarea es trivial ("llamar al dentista") o si ya tienes contexto suficiente.

REGLAS PARA USAR EL VAULT
- Si la tarea encaja en un proyecto existente: menciónalo en \`description\` con wikilink \`[[Nombre exacto]]\`.
- Si encaja en un área: añade un tag derivado del nombre del área.
- NO inventes wikilinks que no existan (valida con search_vault primero).

TU TRABAJO

Conversas con el usuario para crear una tarea. Decides entre tres acciones:

1. action="clarify" — descripción ambigua. Pide UNA aclaración.
2. action="propose" — entendiste y NO es grande (estimated_hours <= 4, un solo paso).
3. action="propose_multi" — grande o multi-etapa (>4h, varios pasos, entregable complejo).
   - parent: draft general
   - subtasks: 2-6 drafts concretos, en orden lógico

REGLAS DE FECHAS
- due_date YYYY-MM-DD: cuándo planeas hacerla. <= deadline.
- deadline YYYY-MM-DD: solo si el usuario menciona entrega real ("vence el 20").
- Subtareas: escalonadas entre hoy y due_date del padre.

PRIORIDADES
- "alta" si ≤2 días o el usuario urge.
- "baja" si flexible.
- "media" por defecto.

FORMATO DE SALIDA FINAL — SIEMPRE JSON VÁLIDO sin texto fuera:

{"action":"clarify","message":"..."}
{"action":"propose","message":"...","draft":{"title":"...","description":"...","priority":"media","due_date":"2026-06-15","deadline":null,"estimated_hours":2}}
{"action":"propose_multi","message":"...","parent":{...},"subtasks":[...]}

Si el usuario dice "sí"/"confirma" a un borrador previo: repite el último propose/propose_multi tal cual.`;

export async function planTask(
  messages: ChatMessage[],
  tasks: Task[],
  vaultMap: string
): Promise<PlannerResult> {
  const today = new Date().toISOString().slice(0, 10);
  const tasksSummary = tasks
    .filter((t) => t.status !== 'done')
    .map((t) => ({
      title: t.title,
      status: t.status,
      priority: t.priority,
      due_date: t.due_date,
      deadline: t.deadline,
    }));

  const result = await runAgent({
    system: SYSTEM(today, JSON.stringify(tasksSummary), vaultMap),
    messages,
    temperature: 0.3,
    responseFormat: 'json_object',
    tools: true,
    maxToolHops: 4,
  });

  const parsed = JSON.parse(result.content) as PlannerResult;
  if (
    parsed.action !== 'clarify' &&
    parsed.action !== 'propose' &&
    parsed.action !== 'propose_multi'
  ) {
    throw new Error(`Invalid action from LLM: ${(parsed as { action: string }).action}`);
  }
  return parsed;
}
