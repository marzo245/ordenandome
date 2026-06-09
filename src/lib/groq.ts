import type { Task, GithubActivityRow as GitHubActivity } from '@/db';

const MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';

interface SummaryInput {
  day: string;
  tasksDue: Task[];      // tareas con vencimiento hoy o atrasadas y sin terminar
  tasksDone: Task[];     // tareas completadas hoy
  activity: GitHubActivity[];
}

const SYSTEM = `Eres un asistente de productividad para un ingeniero de software.
Generas un resumen diario breve, directo y accionable en español.
Estructura: 1) Qué hice hoy (basado en tareas completadas + actividad GitHub),
2) Qué quedó pendiente o vence, 3) Prioridad sugerida para mañana.
Sin relleno. Máximo ~150 palabras. Usa viñetas cortas.`;

export async function generateSummary(input: SummaryInput): Promise<string> {
  const userPrompt = JSON.stringify({
    fecha: input.day,
    tareas_completadas: input.tasksDone.map((t) => t.title),
    tareas_pendientes_o_vencen: input.tasksDue.map((t) => ({
      titulo: t.title,
      prioridad: t.priority,
      vence: t.due_date,
    })),
    actividad_github: input.activity.map((a) => `[${a.kind}] ${a.repo}: ${a.title}`),
  });

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.4,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Groq error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content as string;
}
