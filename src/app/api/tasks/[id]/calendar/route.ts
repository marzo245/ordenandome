/**
 * Sincroniza una tarea con Google Calendar bajo demanda.
 * - POST /api/tasks/[id]/calendar → crea el evento de la tarea (404 si no existe).
 */
import { NextRequest, NextResponse } from 'next/server';
import { db, tasks } from '@/db';
import { eq } from 'drizzle-orm';
import { createCalendarEventFromTask } from '@/lib/google-calendar';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rows = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  const task = rows[0];
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  try {
    const event = await createCalendarEventFromTask({
      ...task,
      tags: task.tags ?? null,
    });
    return NextResponse.json({ event });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
