import type { Task } from '@/db';

const MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';

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

const SYSTEM = (today: string, tasksJson: string) => `Eres un asistente que ayuda a planear tareas. Hablas en español, directo y breve.

CONTEXTO
Hoy es ${today}.
Tareas existentes del usuario (formato JSON: title, status, priority, due_date, deadline):
${tasksJson}

TU TRABAJO
Conversas con el usuario para crear una tarea. Debes decidir entre tres acciones:

1. action="clarify" — si la descripción es ambigua y falta contexto crítico. Pide UNA aclaración.

2. action="propose" — si entiendes la tarea y NO es demasiado grande (estimated_hours <= 4 y un solo paso lógico).
   Devuelves un solo draft con: title (corto, imperativo, máx 60 chars), description, priority, due_date, deadline, estimated_hours.

3. action="propose_multi" — SI la tarea es claramente grande o multi-etapa:
     - estimated_hours total > 4, O
     - el usuario describe varios pasos distintos ("hacer X, luego Y, luego Z"), O
     - es un entregable complejo (proyecto, informe largo, refactor, etc.).
   Devuelves:
     - parent: el draft general (la "tarea grande") con descripción + due_date + deadline + estimated_hours total.
     - subtasks: array de 2 a 6 drafts concretos y accionables, en orden lógico. Cada uno con su title, description, priority, due_date (escalonadas dentro de la ventana), deadline (puede heredar del padre o null), estimated_hours.

REGLAS DE FECHAS
- due_date: formato YYYY-MM-DD. Cuándo planeas hacerla.
  * Si usuario dio fecha, úsala.
  * Si pide que tú decidas, mira tareas existentes y escalona realistamente.
  * Debe ser <= deadline.
- deadline: formato YYYY-MM-DD. Fecha límite INMOVIBLE. Solo cuando el usuario menciona explícitamente una entrega real ("vence el 20", "examen el viernes").
- Para subtareas: distribuye los due_date en la ventana entre hoy y la fecha del padre.

PRIORIDADES
- "alta" si vence ≤2 días o el usuario muestra urgencia.
- "baja" si es flexible.
- "media" por defecto.
- Subtareas: heredan la prioridad del padre salvo que sean claramente menos críticas.

FORMATO DE SALIDA — SIEMPRE JSON VÁLIDO, sin texto fuera:

  {"action":"clarify","message":"..."}

  {"action":"propose","message":"resumen humano","draft":{"title":"...","description":"...","priority":"media","due_date":"2026-06-15","deadline":null,"estimated_hours":2}}

  {"action":"propose_multi","message":"explica por qué la divides y resume el plan","parent":{"title":"...","description":"resumen general","priority":"alta","due_date":"2026-06-30","deadline":"2026-06-30","estimated_hours":12},"subtasks":[{"title":"...","description":"...","priority":"alta","due_date":"2026-06-15","deadline":null,"estimated_hours":3},...]}

NUNCA inventes datos. Si el usuario responde "sí", "confirma" a un borrador previo, repite el último propose/propose_multi tal cual — el frontend crea cuando el usuario hace clic.`;

export async function planTask(
  messages: ChatMessage[],
  tasks: Task[]
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

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM(today, JSON.stringify(tasksSummary)) },
        ...messages,
      ],
    }),
  });

  if (!res.ok) throw new Error(`Groq error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const raw = data.choices[0].message.content as string;

  const parsed = JSON.parse(raw) as PlannerResult;
  if (
    parsed.action !== 'clarify' &&
    parsed.action !== 'propose' &&
    parsed.action !== 'propose_multi'
  ) {
    throw new Error(`Invalid action from LLM: ${(parsed as { action: string }).action}`);
  }
  return parsed;
}
