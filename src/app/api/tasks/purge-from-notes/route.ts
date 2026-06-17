/**
 * Mantenimiento: borra todas las tareas que se importaron desde notas.
 * - POST /api/tasks/purge-from-notes → elimina las tareas con `source_note_path`
 *   y devuelve cuántas se borraron.
 */
import { NextResponse } from 'next/server';
import { db, tasks } from '@/db';
import { isNotNull } from 'drizzle-orm';

export async function POST() {
  try {
    const deleted = await db
      .delete(tasks)
      .where(isNotNull(tasks.source_note_path))
      .returning({ id: tasks.id });
    return NextResponse.json({ deleted: deleted.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
