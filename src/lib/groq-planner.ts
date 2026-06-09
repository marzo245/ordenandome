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
  | { action: 'propose'; message: string; draft: TaskDraft };

const SYSTEM = (today: string, tasksJson: string) => `Eres un asistente que ayuda a planear tareas. Hablas en español, directo y breve.

CONTEXTO
Hoy es ${today}.
Tareas existentes del usuario (formato JSON: title, status, priority, due_date, deadline):
${tasksJson}

TU TRABAJO
Conversas con el usuario para crear UNA tarea nueva. Debes:
1. Si la descripción del usuario es ambigua (no entiendes qué hacer, falta contexto crítico), pide UNA aclaración con action="clarify".
2. Si entiendes la tarea, genera un borrador con action="propose":
   - title: corto, imperativo, máx 60 chars.
   - description: opcional, detalles relevantes.
   - priority: "alta" si vence ≤2 días o el usuario muestra urgencia, "baja" si es flexible, "media" por defecto.
   - due_date: formato YYYY-MM-DD. Fecha en la que el usuario planea hacerla.
     * Si el usuario dio fecha explícita o relativa ("viernes", "en 3 días"), úsala.
     * Si el usuario pide que tú decidas, mira las tareas existentes pendientes y sus due_date, estima carga, y propone una fecha realista (NO el mismo día que otras tareas alta prioridad).
     * Debe ser <= deadline.
     * Si no es claro, déjalo en null.
   - deadline: formato YYYY-MM-DD. Fecha LÍMITE inmovible (entrega real). Sólo úsalo si el usuario menciona explícitamente una fecha de entrega/cierre/vencimiento real ("entrego el 20", "para el viernes sí o sí", "vence el…"). Si no, déjalo en null.
   - estimated_hours: tu mejor estimación en horas (puede ser fraccional, ej. 0.5, 1, 3).
3. Si el usuario responde "sí", "confirma", "créala", etc. a un borrador previo, repítelo en action="propose" exactamente igual — el frontend lo crea cuando el usuario hace clic en "Crear".
4. Si el usuario pide cambiar algo del borrador, genera un nuevo "propose" con los cambios.

FORMATO DE SALIDA — SIEMPRE JSON VÁLIDO, sin texto adicional:
{"action":"clarify","message":"..."}
o
{"action":"propose","message":"resumen humano de qué entendiste","draft":{"title":"...","description":"...","priority":"media","due_date":"2026-06-15","deadline":null,"estimated_hours":2}}

NUNCA inventes URL, datos personales o fechas fuera del calendario coherente con "hoy".`;

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
  if (parsed.action !== 'clarify' && parsed.action !== 'propose') {
    throw new Error(`Invalid action from LLM: ${(parsed as { action: string }).action}`);
  }
  return parsed;
}
