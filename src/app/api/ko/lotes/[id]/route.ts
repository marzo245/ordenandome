/**
 * API REST de un lote de importación (`/api/ko/lotes/[id]`).
 * - DELETE → borra el lote y, en cascada, todos sus casos.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db, ko_import_lotes } from '@/db';
import { eq } from 'drizzle-orm';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await db.delete(ko_import_lotes).where(eq(ko_import_lotes.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
