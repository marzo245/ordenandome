import { NextRequest, NextResponse } from 'next/server';
import { db, reading_list } from '@/db';
import { eq } from 'drizzle-orm';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const patch = await req.json();
  const today = new Date().toISOString().slice(0, 10);

  if (patch.status === 'reading' && !patch.started_at) patch.started_at = today;
  if (patch.status === 'read' && !patch.finished_at) patch.finished_at = today;
  if (patch.status === 'want') {
    patch.started_at = null;
    patch.finished_at = null;
  }

  try {
    const [row] = await db
      .update(reading_list)
      .set(patch)
      .where(eq(reading_list.id, id))
      .returning();
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(row);
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
    await db.delete(reading_list).where(eq(reading_list.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
