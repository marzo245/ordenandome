/**
 * API REST de tareas (colección).
 * - GET  /api/tasks → lista tareas.
 * - POST /api/tasks → crea una tarea (e intenta sincronizarla a Google Calendar).
 */
import { NextRequest, NextResponse } from 'next/server';
import { db, tasks } from '@/db';
import { desc, eq, sql } from 'drizzle-orm';
import { createCalendarEventFromTask } from '@/lib/google-calendar';

export async function GET() {
  try {
    const data = await db
      .select()
      .from(tasks)
      .orderBy(sql`${tasks.due_date} ASC NULLS LAST`, desc(tasks.created_at));
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, description, priority, type, due_date, deadline, tags, parent_id } = body;

  if (!title?.trim()) {
    return NextResponse.json({ error: 'title requerido' }, { status: 400 });
  }

  try {
    const [row] = await db
      .insert(tasks)
      .values({ title, description, priority, type, due_date, deadline, tags, parent_id })
      .returning();

    if (row.due_date) {
      try {
        const event = await createCalendarEventFromTask({
          ...row,
          tags: row.tags ?? null,
        });
        const [updated] = await db
          .update(tasks)
          .set({ google_event_id: event.id })
          .where(eq(tasks.id, row.id))
          .returning();
        return NextResponse.json(updated, { status: 201 });
      } catch (calErr) {
        console.error('[calendar sync] failed:', (calErr as Error).message);
      }
    }
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
