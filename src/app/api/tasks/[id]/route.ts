import { NextRequest, NextResponse } from 'next/server';
import { db, tasks, type Task } from '@/db';
import { and, eq, ne } from 'drizzle-orm';
import { deleteCalendarEvent } from '@/lib/google-calendar';

type TaskStatus = 'todo' | 'doing' | 'done';
const STATUS_RANK: Record<TaskStatus, number> = { todo: 0, doing: 1, done: 2 };

function minStatus(statuses: TaskStatus[]): TaskStatus {
  return statuses.reduce<TaskStatus>(
    (acc, s) => (STATUS_RANK[s] < STATUS_RANK[acc] ? s : acc),
    'done'
  );
}

async function deleteEventsForDone(taskList: Task[]): Promise<Task[]> {
  const out: Task[] = [];
  for (const t of taskList) {
    if (t.status === 'done' && t.google_event_id) {
      try {
        await deleteCalendarEvent(t.google_event_id);
        const [cleared] = await db
          .update(tasks)
          .set({ google_event_id: null })
          .where(eq(tasks.id, t.id))
          .returning();
        if (cleared) {
          out.push(cleared);
          continue;
        }
      } catch (e) {
        console.error('[calendar] delete failed:', (e as Error).message);
      }
    }
    out.push(t);
  }
  return out;
}

async function cascadeStatusDown(parentId: string, status: TaskStatus): Promise<Task[]> {
  const completedAt = status === 'done' ? new Date() : null;
  const updated = await db
    .update(tasks)
    .set({ status, completed_at: completedAt })
    .where(and(eq(tasks.parent_id, parentId), ne(tasks.status, status)))
    .returning();
  return updated;
}

async function cascadeStatusUp(parentId: string): Promise<Task | null> {
  const [parent] = await db.select().from(tasks).where(eq(tasks.id, parentId)).limit(1);
  if (!parent) return null;
  const siblings = await db.select().from(tasks).where(eq(tasks.parent_id, parentId));
  if (siblings.length === 0) return null;
  const target = minStatus(siblings.map((s) => s.status as TaskStatus));
  if (target === parent.status) return null;
  const completedAt = target === 'done' ? new Date() : null;
  const [updated] = await db
    .update(tasks)
    .set({ status: target, completed_at: completedAt })
    .where(eq(tasks.id, parentId))
    .returning();
  return updated ?? null;
}

const DAY_MS = 86_400_000;

function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fromYmd(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

/**
 * Redistribuye las subtareas no terminadas dentro de [hoy, endDate].
 * Solo actúa si alguna subtarea queda fuera de ventana (sin due_date o > endDate).
 * Devuelve las subtareas actualizadas.
 */
async function rescheduleSubtasks(parentId: string, endDateStr: string): Promise<Task[]> {
  const subs = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.parent_id, parentId), ne(tasks.status, 'done')));

  if (subs.length === 0) return [];

  const end = fromYmd(endDateStr);
  const outOfWindow = subs.some((s) => !s.due_date || fromYmd(s.due_date) > end);
  if (!outOfWindow) return [];

  subs.sort((a, b) => {
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  });

  const today = fromYmd(toYmd(new Date()));
  const windowMs = Math.max(DAY_MS, end.getTime() - today.getTime());
  const updated: Task[] = [];

  for (let i = 0; i < subs.length; i++) {
    // Distribuye uniforme: la última cae en endDate, las anteriores escalonadas.
    const t = (i + 1) / subs.length;
    const date = new Date(today.getTime() + Math.round(t * windowMs));
    const newDue = toYmd(date);
    if (subs[i].due_date === newDue) continue;
    const [row] = await db
      .update(tasks)
      .set({ due_date: newDue })
      .where(eq(tasks.id, subs[i].id))
      .returning();
    if (row) updated.push(row);
  }
  return updated;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const patch = await req.json();

  if (patch.status === 'done') patch.completed_at = new Date();
  if (patch.status && patch.status !== 'done') patch.completed_at = null;

  try {
    let [row] = await db.update(tasks).set(patch).where(eq(tasks.id, id)).returning();
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const affectedById = new Map<string, Task>();

    if (patch.status) {
      const newStatus = patch.status as TaskStatus;

      const cascadedChildren = await cascadeStatusDown(id, newStatus);
      for (const c of cascadedChildren) affectedById.set(c.id, c);

      if (row.parent_id) {
        const updatedParent = await cascadeStatusUp(row.parent_id);
        if (updatedParent) affectedById.set(updatedParent.id, updatedParent);
      }
    }

    const allTouched = [row, ...affectedById.values()];
    const afterCal = await deleteEventsForDone(allTouched);
    row = afterCal[0];
    for (const t of afterCal.slice(1)) affectedById.set(t.id, t);

    const newWindowEnd = row.deadline ?? row.due_date;
    if (newWindowEnd && ('deadline' in patch || 'due_date' in patch)) {
      const rescheduled = await rescheduleSubtasks(id, newWindowEnd);
      for (const r of rescheduled) affectedById.set(r.id, r);
    }

    return NextResponse.json({ task: row, affected: Array.from(affectedById.values()) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const rows = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    const existing = rows[0];
    if (existing?.google_event_id) {
      try {
        await deleteCalendarEvent(existing.google_event_id);
      } catch (e) {
        console.error('[calendar] delete on task delete failed:', (e as Error).message);
      }
    }
    await db.delete(tasks).where(eq(tasks.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
