import { NextRequest, NextResponse } from 'next/server';
import { db, tasks, type Task } from '@/db';
import { and, eq, ne } from 'drizzle-orm';

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
    const [row] = await db.update(tasks).set(patch).where(eq(tasks.id, id)).returning();
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

    let affected: Task[] = [];
    const newWindowEnd = row.deadline ?? row.due_date;
    if (newWindowEnd && ('deadline' in patch || 'due_date' in patch)) {
      affected = await rescheduleSubtasks(id, newWindowEnd);
    }

    return NextResponse.json({ task: row, affected });
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
    await db.delete(tasks).where(eq(tasks.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
