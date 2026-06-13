import { NextResponse } from 'next/server';
import { db, tasks } from '@/db';
import { eq, isNotNull } from 'drizzle-orm';
import { deleteCalendarEvent } from '@/lib/google-calendar';

type TaskStatus = 'todo' | 'doing' | 'done';
const RANK: Record<TaskStatus, number> = { todo: 0, doing: 1, done: 2 };

export async function POST() {
  const allTasks = await db.select().from(tasks);
  const childrenByParent = new Map<string, typeof allTasks>();
  for (const t of allTasks) {
    if (!t.parent_id) continue;
    const arr = childrenByParent.get(t.parent_id) ?? [];
    arr.push(t);
    childrenByParent.set(t.parent_id, arr);
  }

  const parents = allTasks.filter((t) => childrenByParent.has(t.id));
  const updates: { id: string; title: string; from: string; to: string }[] = [];
  const eventErrors: { id: string; error: string }[] = [];

  for (const p of parents) {
    const kids = childrenByParent.get(p.id)!;
    const target = kids.reduce<TaskStatus>(
      (acc, k) => (RANK[k.status as TaskStatus] < RANK[acc] ? (k.status as TaskStatus) : acc),
      'done'
    );
    if (target === p.status) continue;

    const completedAt = target === 'done' ? new Date() : null;
    const [updated] = await db
      .update(tasks)
      .set({ status: target, completed_at: completedAt })
      .where(eq(tasks.id, p.id))
      .returning();
    updates.push({ id: p.id, title: p.title, from: p.status, to: target });

    if (updated?.status === 'done' && updated.google_event_id) {
      try {
        await deleteCalendarEvent(updated.google_event_id);
        await db
          .update(tasks)
          .set({ google_event_id: null })
          .where(eq(tasks.id, p.id));
      } catch (e) {
        eventErrors.push({ id: p.id, error: (e as Error).message });
      }
    }
  }

  const doneWithEvents = await db
    .select()
    .from(tasks)
    .where(isNotNull(tasks.google_event_id));
  let orphansCleared = 0;
  for (const t of doneWithEvents) {
    if (t.status !== 'done') continue;
    try {
      await deleteCalendarEvent(t.google_event_id!);
      await db
        .update(tasks)
        .set({ google_event_id: null })
        .where(eq(tasks.id, t.id));
      orphansCleared++;
    } catch (e) {
      eventErrors.push({ id: t.id, error: (e as Error).message });
    }
  }

  return NextResponse.json({
    parents_checked: parents.length,
    parents_updated: updates.length,
    updates,
    done_events_cleared: orphansCleared,
    event_errors: eventErrors,
  });
}
