/**
 * API REST de un caso importado (`/api/ko/casos/[id]`).
 * - PATCH  → actualiza estado (gestiona `resolved_at`), notas, vínculo o tipo.
 * - DELETE → borra el caso.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db, ko_import_casos } from '@/db';
import { eq } from 'drizzle-orm';
import type { NewKoImportCaso } from '@/db';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json();
    const patch: Partial<NewKoImportCaso> = { updated_at: new Date() };

    if (body.estado === 'pendiente' || body.estado === 'resuelto') {
      patch.estado = body.estado;
      // Sellamos/limpiamos la fecha de resolución según el estado.
      patch.resolved_at = body.estado === 'resuelto' ? new Date() : null;
    }
    if (typeof body.notas === 'string' || body.notas === null) {
      patch.notas = body.notas;
    }
    if (typeof body.ko_entry_id === 'string' || body.ko_entry_id === null) {
      patch.ko_entry_id = body.ko_entry_id;
    }
    if (body.tipo === 'conocida' || body.tipo === 'desconocida') {
      patch.tipo = body.tipo;
    }

    const [row] = await db
      .update(ko_import_casos)
      .set(patch)
      .where(eq(ko_import_casos.id, id))
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
    await db.delete(ko_import_casos).where(eq(ko_import_casos.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
