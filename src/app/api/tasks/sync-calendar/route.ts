import { NextResponse } from 'next/server';
import { db, tasks } from '@/db';
import { and, eq, isNull, isNotNull, ne } from 'drizzle-orm';
import { createCalendarEventFromTask } from '@/lib/google-calendar';

export async function POST() {
  const pending = await db
    .select()
    .from(tasks)
    .where(
      and(
        isNotNull(tasks.due_date),
        isNull(tasks.google_event_id),
        ne(tasks.status, 'done')
      )
    );

  let created = 0;
  const errors: { id: string; title: string; error: string }[] = [];

  for (const task of pending) {
    try {
      const event = await createCalendarEventFromTask({
        ...task,
        tags: task.tags ?? null,
      });
      await db
        .update(tasks)
        .set({ google_event_id: event.id })
        .where(eq(tasks.id, task.id));
      created++;
    } catch (e) {
      errors.push({
        id: task.id,
        title: task.title,
        error: (e as Error).message,
      });
    }
  }

  return NextResponse.json({
    total: pending.length,
    created,
    errors,
  });
}
