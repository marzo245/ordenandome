/**
 * Chat de IA asociado a una tarea (`/api/tasks/[id]/chat`).
 * - GET  → historial de mensajes de la tarea.
 * - POST → guarda el mensaje del usuario, llama al LLM con el contexto de la
 *   tarea y persiste + devuelve la respuesta del asistente.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db, tasks, task_messages } from '@/db';
import { asc, eq } from 'drizzle-orm';

const MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';

const SYSTEM = (taskCtx: string) => `Eres un asistente de productividad que ayuda a destrabar tareas concretas.

CONTEXTO DE LA TAREA (formato JSON):
${taskCtx}

TU TRABAJO
- Ayudas al usuario a dar rumbo a esta tarea específica: propones enfoques, pasos, posibles bloqueadores, herramientas, decisiones a tomar.
- Pides aclaración sólo cuando es imprescindible.
- Eres directo, conciso. Sin relleno. Usa viñetas cuando ayuden.
- Responde en español, máximo ~150 palabras por turno salvo que el usuario pida profundizar.
- NO inventes datos del usuario fuera del contexto. NO prometas hacer cosas por él.
- Si el usuario pregunta algo no relacionado con esta tarea, redirígelo amablemente.`;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rows = await db
    .select()
    .from(task_messages)
    .where(eq(task_messages.task_id, id))
    .orderBy(asc(task_messages.created_at));
  return NextResponse.json(rows);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { content } = (await req.json()) as { content: string };
  if (!content?.trim()) {
    return NextResponse.json({ error: 'content requerido' }, { status: 400 });
  }

  try {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    if (!task) return NextResponse.json({ error: 'task no existe' }, { status: 404 });

    const history = await db
      .select()
      .from(task_messages)
      .where(eq(task_messages.task_id, id))
      .orderBy(asc(task_messages.created_at));

    const taskCtx = JSON.stringify({
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      due_date: task.due_date,
      tags: task.tags,
    });

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.6,
        messages: [
          { role: 'system', content: SYSTEM(taskCtx) },
          ...history.map((m) => ({ role: m.role, content: m.content })),
          { role: 'user', content },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `Groq: ${res.status} ${errText}` },
        { status: 502 }
      );
    }
    const data = await res.json();
    const reply = data.choices[0].message.content as string;

    const [userMsg, assistantMsg] = await db
      .insert(task_messages)
      .values([
        { task_id: id, role: 'user', content },
        { task_id: id, role: 'assistant', content: reply },
      ])
      .returning();

    return NextResponse.json({ userMsg, assistantMsg });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
